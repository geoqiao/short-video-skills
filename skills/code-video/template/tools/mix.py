# /// script
# requires-python = ">=3.11"
# dependencies = ["numpy"]
# ///
"""配乐、音效和混音：读 build/ 下的 voice.wav、timeline.js 和 events.json，生成 build/audio.wav。

tools/render.mjs 渲染前会先导出 events.json（画面里每个元素出场的时刻）再调用本脚本，一般不用单独跑。
声音全部用 numpy 从零合成，没有外部素材：
- 配乐：120 BPM，四个和弦循环，长音铺底加八分音符拨弦、轻底鼓和反拍沙沙声。镜头切换由 voice.py 对齐到半拍。
- 音效：每种动作一种声音。出场"嗒"、弹出"啵"、画线"唰"、标题下划线"马克笔"、打字"哒哒"、换镜头"呼"。
- 开口第一句配一声轻重音；转折镜头（script.json 的 turns）开口前约 0.4 秒音乐收低 15 dB、音效不放（吸一口气，不全停：
  全停在手机上听着像断音），转折开口时一声重音加钟声。
- 人声出现时音乐压低，压低后比人声低约 12 dB。最后两遍响度归一到 -14 LUFS。
"""
import json
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

SR = 48000
BEAT = 0.5  # 120 BPM
CHORDS = [[174.61, 220.0, 261.63, 329.63], [130.81, 196.0, 261.63, 329.63], [146.83, 196.0, 246.94, 293.66], [110.0, 164.81, 220.0, 261.63]]
ROOT = Path(__file__).resolve().parent.parent
rng = np.random.default_rng(7)


def ts(dur: float) -> np.ndarray:
    return np.arange(int(dur * SR)) / SR


def band(x: np.ndarray, lo: float, hi: float) -> np.ndarray:
    """频域里只留 lo–hi 赫兹。"""
    f = np.fft.rfftfreq(len(x), 1 / SR)
    return np.fft.irfft(np.fft.rfft(x) * ((f >= lo) & (f <= hi)), len(x))


def noise(dur: float) -> np.ndarray:
    return rng.standard_normal(int(dur * SR))


def sweep(f0: float, f1: float, dur: float) -> np.ndarray:
    """频率从 f0 滑到 f1 的正弦。"""
    f = np.geomspace(f0, f1, int(dur * SR))
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def peak(x: np.ndarray, level: float) -> np.ndarray:
    return (x * level / max(1e-9, float(np.abs(x).max()))).astype(np.float32)


def bell(freq: float, dur: float) -> np.ndarray:
    t = ts(dur)
    return sum(a * np.sin(2 * np.pi * freq * r * t) * np.exp(-t / (dur * d)) for r, a, d in [(1, 1, 0.5), (2.76, 0.45, 0.25), (5.4, 0.25, 0.12)])


def boom(dur: float) -> np.ndarray:
    t = ts(dur)
    return sweep(95, 48, dur) * np.exp(-t / 0.3)


# 各种动作的音效。电平是相对人声峰值（0.7）的峰值
def sound(kind: str) -> np.ndarray:
    if kind == "rise":  # 轻"嗒"
        t = ts(0.06)
        return peak(band(noise(0.06), 2500, 8000) * np.exp(-t / 0.006) + 0.6 * np.sin(2 * np.pi * 2300 * t) * np.exp(-t / 0.015), 0.07)
    if kind == "pop":  # "啵"
        t = ts(0.12)
        return peak(sweep(620, 260, 0.12) * np.exp(-t / 0.04), 0.12)
    if kind == "line":  # 画线"唰"
        t = ts(0.28)
        return peak(band(noise(0.28), 1800, 7000) * np.minimum(t / 0.05, 1) * np.exp(-t / 0.09), 0.05)
    if kind == "stroke":  # 马克笔
        t = ts(0.3)
        return peak(band(noise(0.3), 900, 3500) * np.minimum(t / 0.03, 1) * np.exp(-t / 0.12) * (1 + 0.3 * np.sin(2 * np.pi * 23 * t)), 0.06)
    if kind == "key":  # 打字"哒"
        t = ts(0.03)
        return peak(band(noise(0.03), 3000, 9000) * np.exp(-t / 0.004), 0.035 * rng.uniform(0.7, 1.0))
    if kind == "whoosh":  # 换镜头"呼"：低频先起、高频后到
        t = ts(0.7)
        x = sum(band(noise(0.7), lo, lo * 2.5) * np.exp(-(((t - c) / 0.12) ** 2)) for lo, c in [(300, 0.25), (700, 0.33), (1600, 0.4)])
        return peak(x, 0.1)
    if kind == "push":
        return peak(sound("whoosh") + np.pad(boom(0.6), (0, int(0.1 * SR)))[: int(0.7 * SR)] * 0.5, 0.14)
    if kind == "cut":  # 转折：重音加钟声
        return peak(np.pad(boom(1.0), (0, int(0.8 * SR))) + 0.5 * bell(880, 1.8), 0.4)
    if kind == "hook":  # 开口第一句：轻一点的重音
        return peak(np.pad(boom(0.8), (0, int(0.4 * SR))) + 0.35 * bell(1318.5, 1.2), 0.22)
    if kind == "end":  # 最后一句念完：钟声
        return peak(bell(659.25, 2.0) + 0.6 * bell(987.77, 2.0), 0.12)
    raise ValueError(kind)


# 同一种音效相邻至少隔多少秒，免得元素成排出场时响成一片
MIN_GAP = {"rise": 0.12, "pop": 0.1, "line": 0.2, "stroke": 0.3, "key": 0.07}


def music(total: float, start: float, stop: float) -> np.ndarray:
    """铺底长音全程；拨弦、底鼓和沙沙声从第一句开口到最后一句念完。"""
    n = int(total * SR)
    out = np.zeros(n, dtype=np.float32)

    def add(x: np.ndarray, at: float) -> None:
        a = int(at * SR)
        b = min(n, a + len(x))
        if 0 <= a < b:
            out[a:b] += x[: b - a]

    bar = 8 * BEAT  # 一个和弦两小节
    for i in range(int(total / bar) + 1):
        t = ts(bar + 1.0)
        env = np.minimum(t / 0.8, 1) * np.clip((bar + 1.0 - t) / 1.0, 0, 1)
        add(0.012 * env * sum(np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t + 0.5) for f in CHORDS[i % 4]), i * bar)
    k = 0
    while k * BEAT / 2 < total:
        at = k * BEAT / 2
        if start <= at < stop:
            chord = CHORDS[int(at / bar) % 4]
            t = ts(0.4)
            f = chord[[0, 2, 1, 3, 2, 1, 3, 2][k % 8]] * 2
            add(0.022 * (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t)) * np.exp(-t / 0.16), at)
            if k % 4 == 0:  # 底鼓在第 1、3 拍
                add(0.06 * sweep(110, 45, 0.15) * np.exp(-ts(0.15) / 0.07), at)
            if k % 2 == 1:  # 反拍沙沙声
                add(0.012 * band(noise(0.05), 6000, 14000) * np.exp(-ts(0.05) / 0.012), at)
        k += 1
    fade = int(1.5 * SR)
    out[-fade:] *= np.linspace(1, 0, fade)
    return out


def envelope(x: np.ndarray, attack: float = 0.03, release: float = 0.35) -> np.ndarray:
    """人声的音量包络：10 毫秒一块，快起慢落。"""
    blk = int(0.01 * SR)
    rms = np.sqrt(np.mean(np.pad(x, (0, -len(x) % blk)).reshape(-1, blk) ** 2, axis=1))
    out, e = np.zeros_like(rms), 0.0
    for i, v in enumerate(rms):
        e += (v - e) * (0.01 / attack if v > e else 0.01 / release)
        out[i] = e
    return np.repeat(out, blk)[: len(x)]


def loudness(path: Path) -> float:
    log = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(path), "-af", "ebur128", "-f", "null", "-"], capture_output=True, text=True, check=True).stderr
    return float(log.rsplit("I:", 1)[1].split("LUFS")[0])


def normalize(src: Path, dst: Path) -> None:
    """响度归一到 -14 LUFS。TTS 人声峰值比平均音量高得多，先轻压缩；再加增益、用限幅器把峰值压在 -1 dBTP 以下，
    限幅会吃掉一点响度，所以按实测再补，最多三轮。loudnorm 碰到峰值上限会退回动态模式，只到 -15.5 左右，所以不用它。"""
    comp = src.with_name("mix-comp.wav")
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(src), "-af", "acompressor=threshold=-24dB:ratio=3:attack=5:release=120:makeup=1", str(comp)], check=True)
    gain = -14.0 - loudness(comp)
    for _ in range(3):
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(comp), "-af", f"volume={gain:.2f}dB,alimiter=limit=0.89:level=false", "-ar", str(SR), str(dst)], check=True)
        miss = -14.0 - loudness(dst)
        if abs(miss) < 0.3:
            break
        gain += miss
    comp.unlink()


def read(path: Path) -> np.ndarray:
    with wave.open(str(path)) as w:
        return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768


def main(slug: str) -> None:
    found = [d for d in (ROOT / "episodes").iterdir() if d.name.split("-", 1)[-1] == slug]
    if len(found) != 1:
        sys.exit(f"episodes/ 下没有唯一的 <期号>-{slug} 目录")
    build = found[0] / "build"
    tl = json.loads((build / "timeline.js").read_text().split("=", 1)[1].strip().rstrip(";"))
    events = json.loads((build / "events.json").read_text())
    lines, total = tl["lines"], tl["duration"]
    voice = read(build / "voice.wav")
    n = int(total * SR)
    voice = np.pad(voice, (0, max(0, n - len(voice))))[:n]

    # 转折前吸一口气：转折开口前最多 0.45 秒，音乐收低 15 dB（我们自己定的值），开口时回到原样
    quiet = [(max(lines[s - 2]["end"] + 0.1, lines[s - 1]["start"] - 0.45), lines[s - 1]["start"] - 0.06) for s in tl.get("turns", []) if s >= 2]
    gate = np.ones(n, dtype=np.float32)
    floor = 10 ** (-15 / 20)
    for a, b in quiet:
        i, j = int(a * SR), int(b * SR)
        r = min(int(0.15 * SR), j - i)
        gate[i:j] = floor
        gate[i : i + r] = np.linspace(1, floor, r)
    bed = music(total, lines[0]["start"], lines[-1]["end"]) * gate
    env = envelope(voice)
    talking = env > 0.02
    duck = 1 - 0.6 * np.clip(env / 0.08, 0, 1)
    bed *= duck
    # 音乐音量按人声算：说话时压低后的音乐比人声低 12 dB
    rms = lambda x: float(np.sqrt(np.mean(x[talking] ** 2))) if talking.any() else 1e-6
    bed *= rms(voice) / max(1e-9, rms(bed)) * 10 ** (-12 / 20)

    fx = np.zeros(n, dtype=np.float32)
    events = events + [{"t": lines[0]["start"] - 0.02, "type": "hook"}, {"t": lines[-1]["end"] + 0.2, "type": "end"}]
    last: dict[str, float] = {}
    placed = 0
    for e in sorted(events, key=lambda e: e["t"]):
        kind, at = e["type"], e["t"]
        if kind == "whoosh":
            at -= 0.15  # 呼声的最响处落在平移中段
        if kind not in ("cut",) and any(a <= at <= b + 0.05 for a, b in quiet):
            continue
        if at - last.get(kind, -9) < MIN_GAP.get(kind, 0):
            continue
        last[kind] = at
        x = sound(kind)
        i = int(max(0, at) * SR)
        j = min(n, i + len(x))
        fx[i:j] += x[: j - i]
        placed += 1

    mix = voice + bed + fx
    raw = build / "mix.wav"
    with wave.open(str(raw), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(mix, -1, 1) * 32767).astype(np.int16).tobytes())
    normalize(raw, build / "audio.wav")
    db = lambda x: 20 * np.log10(max(1e-9, float(np.sqrt(np.mean(x**2)))))
    print(f"{slug}: {placed} 个音效，{len(quiet)} 处转折前收低；人声 {db(voice[talking]):.1f} dB，说话时音乐 {db(bed[talking]):.1f} dB，空档音乐 {db(bed[~talking & (gate == 1)]):.1f} dB")


if __name__ == "__main__":
    main(sys.argv[1])
