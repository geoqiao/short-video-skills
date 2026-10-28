# /// script
# requires-python = ">=3.11"
# dependencies = ["edge-tts @ git+https://github.com/jonata/edge-tts.git@8a5844c3a1d33e4e8f2f3e14535542c0d75d4248", "numpy"]
# ///
# edge-tts 7.2.8 从 2026-10 起合成返回 403（rany2/edge-tts #490：微软关了旧地址的合成）。
# 这里钉在修复 PR #491 的提交上，只改了合成地址和日期解析；官方发版后换回 "edge-tts==<新版本>"。
"""配音与时间线：读 episodes/<期号>-<slug>/script.json，在同一目录的 build/ 下生成 timeline.js 和 voice.wav。

每一行旁白是一个镜头，行内每个分句是一个画面节拍；分句起点取自 edge-tts 的逐词时间戳。
配乐和音效在渲染时由 tools/mix.py 混进来，因为音效要跟着画面里元素出场的时刻走。
script.json 里可选：
- "turns": [5, 6]：第 5、6 个镜头是转折。开口前音乐收低一下（不全停），转折开口时配一声重音，画面硬切。
- "holds": {"2": 1.5}：第 2 个镜头旁白念完后多停 1.5 秒，给最后出现的字留出阅读时间。
"""
import asyncio
import json
import math
import subprocess
import sys
import wave
from pathlib import Path

import edge_tts
import numpy as np

SR = 48000
# HEAD 是第一句旁白的起点。封面在 src/run.js 的 COVER 秒开始滑走，旁白在滑动中途开口，
# 前两秒能念 8–9 个字：第一句只放这一期最想告诉观众的那一点。开头两秒留不住人就没有后面
HEAD, GAP, TAIL = 0.5, 0.75, 1.6
# 镜头起点对齐配乐的半拍（120 BPM），切镜头落在拍子上
GRID, LEAD = 0.25, 0.6
ROOT = Path(__file__).resolve().parent.parent


async def speak(text: str, voice: str, rate: str, mp3: Path) -> list[tuple[int, float]]:
    """合成一行，返回 [(字符位置, 秒)]。"""
    marks, pos = [], 0
    com = edge_tts.Communicate(text, voice, rate=rate, boundary="WordBoundary")
    with mp3.open("wb") as f:
        async for chunk in com.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                idx = text.find(chunk["text"], pos)
                if idx >= 0:
                    marks.append((idx, chunk["offset"] / 1e7))
                    pos = idx + len(chunk["text"])
    return marks


def load(mp3: Path) -> np.ndarray:
    wav = mp3.with_suffix(".wav")
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(mp3), "-ar", str(SR), "-ac", "1", str(wav)], check=True)
    with wave.open(str(wav)) as w:
        x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
    loud = np.nonzero(np.abs(x) > 0.01)[0]
    return x[: min(len(x), loud[-1] + int(0.18 * SR))] if len(loud) else x


async def main(slug: str) -> None:
    found = [d for d in (ROOT / "episodes").iterdir() if d.name.split("-", 1)[-1] == slug]
    if len(found) != 1:
        sys.exit(f"episodes/ 下没有唯一的 <期号>-{slug} 目录")
    script = json.loads((found[0] / "script.json").read_text())
    build = found[0] / "build"
    build.mkdir(parents=True, exist_ok=True)
    turns = set(script.get("turns", []))
    holds = {int(k): float(v) for k, v in script.get("holds", {}).items()}
    cursor, lines, clips = HEAD, [], []
    for i, line in enumerate(script["lines"]):
        if i:
            # 镜头从旁白开口前 LEAD 秒开始平移（转折镜头硬切，开口前 0.05 秒），切的时刻对齐半拍
            lead = 0.05 if i + 1 in turns else LEAD
            cursor += GAP + holds.get(i, 0)
            cursor = math.ceil((cursor - lead) / GRID - 1e-6) * GRID + lead
        segs = [(s, s) if isinstance(s, str) else (s[0], s[1]) for s in line]
        text = "".join(say for say, _ in segs)
        mp3 = build / f"line-{i:02d}.mp3"
        # 合成偶尔会中途断流，只回来开头一小段：时长短于最后一个词的时间戳，或短得不像这么多字，就重试
        for attempt in range(3):
            marks = await speak(text, script["voice"], script.get("rate", "+0%"), mp3)
            audio = load(mp3)
            dur = len(audio) / SR
            if dur >= len(text) / 10 and (not marks or dur >= marks[-1][1]):
                break
        else:
            sys.exit(f"第 {i + 1} 行配音不完整：{dur:.2f} 秒 / {len(text)} 字，重试 3 次仍失败")
        out, at = [], 0
        for j, (say, sub) in enumerate(segs):
            hit = [sec for idx, sec in marks if idx >= at]
            # 没拿到时间戳时按字数比例估算
            local = 0.0 if j == 0 else (hit[0] - 0.04 if hit else dur * at / len(text))
            out.append({"start": round(cursor + local, 3), "sub": sub})
            at += len(say)
        lines.append({"start": round(cursor, 3), "end": round(cursor + dur, 3), "segs": out})
        clips.append((cursor, audio))
        cursor += dur
    total = round(cursor + TAIL + holds.get(len(lines), 0), 3)
    voice = np.zeros(int(total * SR), dtype=np.float32)
    for when, audio in clips:
        a = int(when * SR)
        voice[a : a + len(audio)] += audio
    voice *= 0.7 / max(1e-6, float(np.abs(voice).max()))
    with wave.open(str(build / "voice.wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(voice, -1, 1) * 32767).astype(np.int16).tobytes())
    tl = {"duration": total, "cover": script["cover"], "turns": sorted(turns), "lines": lines}
    (build / "timeline.js").write_text("window.TIMELINE = " + json.dumps(tl, ensure_ascii=False, indent=1) + ";\n")
    print(f"{slug}: {len(lines)} shots, {total:.1f}s")


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1]))
