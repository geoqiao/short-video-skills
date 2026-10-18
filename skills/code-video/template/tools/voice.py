# /// script
# requires-python = ">=3.11"
# dependencies = ["edge-tts @ git+https://github.com/jonata/edge-tts.git@8a5844c3a1d33e4e8f2f3e14535542c0d75d4248", "numpy"]
# ///
# edge-tts 7.2.8 从 2026-10 起合成返回 403（rany2/edge-tts #490：微软关了旧地址的合成）。
# 这里钉在修复 PR #491 的提交上，只改了合成地址和日期解析；官方发版后换回 "edge-tts==<新版本>"。
"""配音与时间线：读 episodes/<期号>-<slug>/script.json，在同一目录的 build/ 下生成 timeline.js 和 audio.wav。

每一行旁白是一个镜头，行内每个分句是一个画面节拍；分句起点取自 edge-tts 的逐词时间戳。
"""
import asyncio
import json
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


def tone(freq: float, dur: float, decay: float, amp: float) -> np.ndarray:
    t = np.arange(int(dur * SR)) / SR
    return amp * np.sin(2 * np.pi * freq * t) * np.exp(-t / decay)


def music(total: float, shots: list[float], beats: list[float]) -> np.ndarray:
    """从零合成的铺底：四个和弦的慢速长音，加镜头切换和节拍的轻提示音。"""
    n = int(total * SR)
    out = np.zeros(n, dtype=np.float32)
    chords = [[174.61, 220.0, 261.63, 329.63], [130.81, 196.0, 261.63, 329.63], [146.83, 196.0, 246.94, 293.66], [110.0, 164.81, 220.0, 261.63]]
    bar = 6.0
    for i in range(int(total / bar) + 1):
        t = np.arange(int((bar + 2.0) * SR)) / SR
        env = np.clip(t / 2.0, 0, 1) * np.clip((bar + 2.0 - t) / 2.0, 0, 1)
        seg = sum(np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t + 0.5) for f in chords[i % 4])
        seg = (0.011 * seg * env).astype(np.float32)
        a = int(i * bar * SR)
        b = min(n, a + len(seg))
        if b > a:
            out[a:b] += seg[: b - a]
    for when, (freq, dur, decay, amp) in [(s, (392.0, 0.5, 0.12, 0.035)) for s in shots] + [(s, (1318.5, 0.12, 0.025, 0.012)) for s in beats]:
        x = tone(freq, dur, decay, amp).astype(np.float32)
        a = int(when * SR)
        b = min(n, a + len(x))
        if 0 <= a < b:
            out[a:b] += x[: b - a]
    fade = int(1.2 * SR)
    out[-fade:] *= np.linspace(1, 0, fade)
    return out


def normalize(src: Path, dst: Path) -> None:
    """两遍响度归一到 -14 LUFS：先测量，再按测量值处理。"""
    target = "loudnorm=I=-14:TP=-1.0:LRA=11"
    log = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(src), "-af", target + ":print_format=json", "-f", "null", "-"], capture_output=True, text=True, check=True).stderr
    m = json.loads(log[log.rindex("{") : log.rindex("}") + 1])
    measured = f":measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}"
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(src), "-af", target + measured, "-ar", str(SR), str(dst)], check=True)


async def main(slug: str) -> None:
    found = [d for d in (ROOT / "episodes").iterdir() if d.name.split("-", 1)[-1] == slug]
    if len(found) != 1:
        sys.exit(f"episodes/ 下没有唯一的 <期号>-{slug} 目录")
    script = json.loads((found[0] / "script.json").read_text())
    build = found[0] / "build"
    build.mkdir(parents=True, exist_ok=True)
    cursor, lines, clips = HEAD, [], []
    for i, line in enumerate(script["lines"]):
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
        cursor += dur + GAP
    total = round(cursor - GAP + TAIL, 3)
    voice = np.zeros(int(total * SR), dtype=np.float32)
    for when, audio in clips:
        a = int(when * SR)
        voice[a : a + len(audio)] += audio
    voice *= 0.7 / max(1e-6, float(np.abs(voice).max()))
    shots = [max(0.0, l["start"] - 0.6) for l in lines[1:]]
    beats = [s["start"] for l in lines for s in l["segs"][1:]]
    mix = voice + music(total, shots, beats)
    peak = float(np.abs(mix).max())
    raw = build / "mix.wav"
    with wave.open(str(raw), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(mix, -1, 1) * 32767).astype(np.int16).tobytes())
    normalize(raw, build / "audio.wav")
    (build / "timeline.js").write_text("window.TIMELINE = " + json.dumps({"duration": total, "cover": script["cover"], "lines": lines}, ensure_ascii=False, indent=1) + ";\n")
    print(f"{slug}: {len(lines)} shots, {total:.1f}s, mix peak {peak:.2f}")


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1]))
