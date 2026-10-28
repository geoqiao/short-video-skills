# /// script
# requires-python = ">=3.11"
# dependencies = ["faster-whisper", "opencc-python-reimplemented", "cn2an", "numpy", "pypinyin"]
# ///
"""配音核对：把每句配音用语音识别转回文字，和脚本逐字对比，列出可疑的句子和它在视频里的秒数。

用法：uv run tools/asr.py <slug> [--model large-v3-turbo] [--threshold 0.9]
先跑 tools/voice.py。识别模型第一次运行时从 Hugging Face 下载（turbo 约 1.6 GB；small 约 480 MB，中文误报多）。
识别工具自己也会听错同音字和英文词，所以这里只负责挑出可疑的地方，最后由人听。
差异分三类：同音字（识别选错了字，念法没错，不用听）；多音字（写出听到的读音，人判断对不对）；
其余（读音不同、英文词不同、多字少字）都要听。人听过确认没问题的英文念法，写进项目根目录的 asr-ok.json，以后不再报。
"""
import bisect
import difflib
import json
import re
import subprocess
import sys
from pathlib import Path

import cn2an
import numpy as np
import opencc
from faster_whisper import WhisperModel
from pypinyin import Style, lazy_pinyin, pinyin

ROOT = Path(__file__).resolve().parent.parent
T2S = opencc.OpenCC("t2s")
# 繁简转换后仍然并存的异体字，按同一个字比较
# 两 和 二：识别常把"两倍"写成"2倍"，换算回来是"二倍"
VARIANT = str.maketrans({"帐": "账", "於": "于", "着": "著", "两": "二"})


def norm(s: str) -> str:
    """统一繁简、大小写和数字读法：98 和九十八、8.14 和八点一四按同一个说法比较。"""
    s = T2S.convert(s).lower().translate(VARIANT).replace("%", "%")
    s = re.sub(r"(?<=\d),(?=\d{3})", "", s)
    s = re.sub(r"(?<=[a-z])-(?=\d)", " ", s)  # GPT-6 的横杠不是负号
    try:
        return cn2an.transform(s, "an2cn")
    except Exception:
        return s


def readings(ch: str) -> set[str]:
    return set(pinyin(ch, heteronym=True, style=Style.NORMAL)[0])


def judge(script: str, heard: str, ok: dict, context: str) -> tuple[str, str]:
    """返回 (类别, 说明)。类别是 same（同音，不用听）、poly（多音字）、listen（要听）。

    context 是脚本里这段差异连同前后几个字，用来取多音字在这句话里的常用读音。"""
    if heard in ok.get(script, []):
        return "same", "已确认"
    # 识别模型听中文里的英文词常差一两个字母（opus→opas），拼写接近就算念对了
    if re.match(r"^[a-z0-9 ]+$", script) and difflib.SequenceMatcher(None, script, heard).ratio() >= 0.75:
        return "same", "英文拼写接近"
    han = re.compile(r"^[\u4e00-\u9fff]+$")
    if script and heard and han.match(script) and han.match(heard) and len(script) == len(heard):
        at = context.find(script)
        usual = lazy_pinyin(context)[at : at + len(script)] if at >= 0 and han.match(context) else lazy_pinyin(script)
        kinds = []
        for a, b, u in zip(script, heard, usual):
            if a == b:
                continue
            rb = lazy_pinyin(b)[0]
            kinds.append("same" if rb == u else "poly" if rb in readings(a) else "listen")
        if all(k == "same" for k in kinds):
            return "same", "同音字"
        if "listen" not in kinds:
            return "poly", f"「{script}」听起来是 {' '.join(lazy_pinyin(heard))}（多音字，确认念得对不对）"
        return "listen", f"「{script}」听起来像「{heard}」（{' '.join(lazy_pinyin(heard))}）"
    if not heard:
        return "listen", f"「{script}」没听到"
    if not script:
        return "listen", f"多出「{heard}」"
    return "listen", f"「{script}」被听成「{heard}」"


def tokens(s: str) -> list[tuple[str, int]]:
    """切成 (字, 位置)：一个汉字或一个英文字母、数字算一个，空格和标点不算。"""
    return [(m.group(), m.start()) for m in re.finditer(r"[a-z0-9\u4e00-\u9fff]", s)]


def pcm(wav: Path) -> np.ndarray:
    """用 ffmpeg 解码成识别模型要的 16 kHz 单声道浮点数据。"""
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(wav), "-ar", "16000", "-ac", "1", "-f", "f32le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


def main() -> None:
    args = sys.argv[1:]
    opt = lambda name, default: args[args.index("--" + name) + 1] if "--" + name in args else default
    slug, model_name, threshold = args[0], opt("model", "large-v3-turbo"), float(opt("threshold", 0.9))
    found = [d for d in (ROOT / "episodes").iterdir() if d.name.split("-", 1)[-1] == slug]
    if len(found) != 1:
        sys.exit(f"episodes/ 下没有唯一的 <期号>-{slug} 目录")
    episode = found[0]
    script = json.loads((episode / "script.json").read_text())
    build = episode / "build"
    tl = json.loads((build / "timeline.js").read_text().split("=", 1)[1].strip().rstrip(";"))
    ok_file = ROOT / "asr-ok.json"
    accepted = {norm(k): [norm(v) for v in vs] for k, vs in json.loads(ok_file.read_text()).items()} if ok_file.exists() else {}
    model = WhisperModel(model_name, device="cpu", compute_type="int8")
    report, bad = [], 0
    for i, line in enumerate(script["lines"]):
        say = "".join(s if isinstance(s, str) else s[0] for s in line)
        # 提示词只要求简体中文，不放脚本原文：放了会把识别结果往脚本上拉，读错的地方就查不出来
        segs, _ = model.transcribe(pcm(build / f"line-{i:02d}.wav"), language="zh", initial_prompt="以下是普通话的句子，使用简体中文。", word_timestamps=True)
        words = [w for s in segs for w in s.words]
        heard = "".join(w.word for w in words)
        # 识别出的每个词在原文里的起点，用来把差异换算成视频里的秒数
        starts, pos = [], 0
        for w in words:
            starts.append(pos)
            pos += len(w.word)
        e_norm, h_norm = norm(say), norm(heard)
        e_tok, h_tok = tokens(e_norm), tokens(h_norm)
        sm = difflib.SequenceMatcher(None, [t for t, _ in e_tok], [t for t, _ in h_tok], autojunk=False)

        def span(norm_s, toks, a, b):
            if a >= b:
                return ""
            lo, hi = toks[a][1], toks[b - 1][1] + 1
            # 英文差异扩展到整个单词，"a→o" 显示成 "claude→cloud"
            word = lambda i: 0 <= i < len(norm_s) and re.match(r"[a-z0-9]", norm_s[i])
            while word(lo - 1) and word(lo):
                lo -= 1
            while word(hi) and word(hi - 1):
                hi += 1
            return norm_s[lo:hi].strip()

        def when(b):
            if not words or not h_tok:
                return 0.0
            raw = h_tok[min(b, len(h_tok) - 1)][1] * len(heard) / max(1, len(h_norm))
            return words[max(0, bisect.bisect_right(starts, raw) - 1)].start

        diffs, seen = [], set()
        for op, a0, a1, b0, b1 in sm.get_opcodes():
            if op == "equal":
                continue
            # 少了的字在英文单词里时，用前后的字母把听到的单词找回来
            ea, eb = span(e_norm, e_tok, a0, a1), span(h_norm, h_tok, b0, b1)
            if not eb and a0 < a1 and re.match(r"[a-z0-9]", ea[-1:] or " ") and b0 < len(h_tok):
                eb = span(h_norm, h_tok, max(0, b0 - 1), b0 + 1)
            t = round(tl["lines"][i]["start"] + when(b0), 1)
            # 一个英文词里差几个字母会拆成几段差异，扩展成整词后是同一处，只报一次
            if any(ea == x and abs(t - u) < 1.0 for x, u in seen):
                continue
            seen.add((ea, t))
            near = re.findall(r"[\u4e00-\u9fff]+", e_norm[max(0, e_tok[a0][1] - 4) : e_tok[a1 - 1][1] + 5] if a0 < a1 else "")
            kind, note = judge(ea, eb, accepted, next((x for x in near if ea in x), ea))
            diffs.append({"t": t, "script": ea, "heard": eb, "kind": kind, "note": note})
        ratio = round(sm.ratio(), 3)
        ok = ratio >= threshold and all(d["kind"] == "same" for d in diffs)
        bad += not ok
        report.append({"shot": i + 1, "ratio": ratio, "ok": ok, "say": say, "heard": heard, "diffs": diffs})
    (build / "asr.json").write_text(json.dumps({"model": model_name, "threshold": threshold, "lines": report}, ensure_ascii=False, indent=1))
    homophones = 0
    for r in report:
        todo = [d for d in r["diffs"] if d["kind"] != "same"]
        homophones += len(r["diffs"]) - len(todo)
        low = "，整句相似度只有 %.2f" % r["ratio"] if r["ratio"] < threshold else ""
        print(f"第 {r['shot']} 镜：{'没问题' if r['ok'] else '要听'}{low}")
        for d in todo:
            print(f"    {d['t']:.1f} 秒  {d['note']}")
    print(f"{slug}：{len(report)} 句，{bad} 句要听；另有 {homophones} 处同音字差异，不用听。明细在 {build / 'asr.json'}")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
