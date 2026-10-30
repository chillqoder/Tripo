"""Procedural game audio for the orc scene.

Every sound is synthesised here (numpy + scipy) so the project ships original, license-free assets:
breathing, low growls, roars / grunts, chest thumps, axe whooshes, a heavy axe-on-stone impact, rock extraction
and a quiet forest ambience loop.  Deterministic (fixed seeds).

Run:  tools/.venv/bin/python tools/audio/synth_audio.py     (needs numpy, scipy, ffmpeg)
Output: public/assets/audio/*.mp3  (+ ambience_forest.wav, a gapless loop)
"""
import os
import subprocess
import sys
import wave

import numpy as np
from scipy import signal

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "public", "assets", "audio")
TMP = os.path.join(ROOT, "tools", "build", "audio_tmp")
os.makedirs(OUT, exist_ok=True)
os.makedirs(TMP, exist_ok=True)
SR = 44100
rng = np.random.default_rng(20261028)


# ------------------------------------------------------------------ helpers
def t_axis(dur, sr=SR):
    return np.arange(int(dur * sr)) / sr


def noise(dur, sr=SR):
    return rng.standard_normal(int(dur * sr))


def sos(kind, freq, order=4, sr=SR):
    return signal.butter(order, freq, btype=kind, fs=sr, output="sos")


def lp(x, f, order=4, sr=SR):
    return signal.sosfilt(sos("low", f, order, sr), x)


def hp(x, f, order=4, sr=SR):
    return signal.sosfilt(sos("high", f, order, sr), x)


def bp(x, lo, hi, order=2, sr=SR):
    return signal.sosfilt(sos("band", [lo, hi], order, sr), x)


def resonator(x, f, q, sr=SR):
    bw = f / q
    return bp(x, max(20, f - bw / 2), min(sr / 2 - 100, f + bw / 2), 2, sr)


def env(n, points, sr=SR):
    """piecewise-linear-in-time envelope: points = [(time, value), ...]"""
    ts = np.array([p[0] for p in points]) * sr
    vs = np.array([p[1] for p in points])
    return np.interp(np.arange(n), ts, vs)


def smooth_env(n, points, sr=SR):
    e = env(n, points, sr)
    k = int(0.004 * sr)
    return np.convolve(e, np.ones(k) / k, mode="same")


def expdecay(n, tau, sr=SR):
    return np.exp(-np.arange(n) / (tau * sr))


def normalize(x, peak=0.9):
    m = np.max(np.abs(x)) + 1e-9
    return x / m * peak


def fade(x, a=0.004, b=0.01, sr=SR):
    x = x.copy()
    na, nb = int(a * sr), int(b * sr)
    if na:
        x[:na] *= np.linspace(0, 1, na)
    if nb:
        x[-nb:] *= np.linspace(1, 0, nb)
    return x


def soft_clip(x, drive=2.0):
    return np.tanh(x * drive) / np.tanh(drive)


def glottal(f0, sr=SR, harmonics=40, jitter=0.012, shimmer=0.0):
    """Band-limited sawtooth-ish glottal source following the f0 contour (Hz array)."""
    n = len(f0)
    jit = 1 + jitter * lp(rng.standard_normal(n), 60, 2, sr) * 8
    phase = np.cumsum(f0 * jit) / sr
    out = np.zeros(n)
    for h in range(1, harmonics + 1):
        mask = (f0 * h) < sr / 2.2
        out += np.where(mask, np.sin(2 * np.pi * h * phase + h * 0.3) / (h ** 1.15), 0)
    return out


def formants(x, fs, qs, gains, sr=SR):
    y = np.zeros_like(x)
    for f, q, g in zip(fs, qs, gains):
        y += g * resonator(x, f, q, sr)
    return y


# ------------------------------------------------------------------ voices
def roar(dur, f_start, f_end, vowel=(650, 1100, 2400), rough=0.5, noise_amt=0.35, seed=0, attack=0.06, release=0.5, growl_rate=28):
    n = int(dur * SR)
    t = t_axis(dur)
    r = np.random.default_rng(seed)
    # pitch: quick rise then descending contour with vibrato-ish wobble
    contour = f_start * (f_end / f_start) ** (t / dur) * (1 + 0.04 * np.sin(2 * np.pi * 5.5 * t + r.random() * 6))
    contour *= 1 + 0.5 * np.exp(-t / 0.08) * 0.12
    src = glottal(contour, harmonics=48, jitter=0.03)
    # growl: amplitude modulation + subharmonic
    am = 1 - rough * (0.5 + 0.5 * np.sin(2 * np.pi * growl_rate * t + 0.8 * np.sin(2 * np.pi * 3 * t)))
    sub = glottal(contour * 0.5, harmonics=12)
    src = (src * am + 0.5 * sub * am)
    # jaw opening: formants rise as the mouth opens
    voiced = formants(src, vowel, (6, 8, 10), (1.0, 0.8, 0.45))
    voiced += 0.35 * lp(src, 400)
    breath = bp(noise(dur), 500, 4200) * noise_amt * (0.4 + 0.6 * am)
    x = voiced + breath
    e = smooth_env(n, [(0, 0), (attack, 1.0), (dur * 0.35, 0.9), (dur - release, 0.7), (dur, 0)])
    x = soft_clip(x * e * 0.9, 2.2)
    return fade(normalize(x))


def grunt(dur=0.3, f0=95, seed=0, vowel=(520, 900, 2300), rough=0.6):
    t = t_axis(dur)
    r = np.random.default_rng(seed)
    contour = f0 * (1 + 0.25 * np.exp(-t / 0.05)) * (0.8 + 0.2 * (1 - t / dur))
    src = glottal(contour, harmonics=36, jitter=0.04)
    src *= 1 - rough * (0.5 + 0.5 * np.sin(2 * np.pi * 38 * t))
    v = formants(src, vowel, (5, 7, 9), (1, 0.7, 0.4)) + 0.3 * lp(src, 300)
    v += 0.25 * bp(noise(dur), 300, 3000) * expdecay(len(t), 0.1)
    e = smooth_env(len(t), [(0, 0), (0.015, 1), (dur * 0.5, 0.75), (dur, 0)])
    return fade(normalize(soft_clip(v * e, 2.0)))


def growl_low(dur=1.8, f0=62, seed=0):
    n = int(dur * SR)
    t = t_axis(dur)
    contour = f0 * (1 + 0.06 * np.sin(2 * np.pi * 2.2 * t + seed) + 0.03 * np.sin(2 * np.pi * 7 * t))
    src = glottal(contour, harmonics=30, jitter=0.05)
    pulse = 0.5 + 0.5 * np.sin(2 * np.pi * (22 + 4 * np.sin(2 * np.pi * 0.7 * t)) * t)
    v = formants(src * (0.4 + 0.6 * pulse), (380, 800, 1900), (5, 6, 8), (1, 0.7, 0.3))
    v += 0.8 * lp(src, 220) * pulse
    v += 0.12 * bp(noise(dur), 200, 1200) * pulse
    e = smooth_env(n, [(0, 0), (0.35, 0.9), (dur * 0.6, 1.0), (dur, 0)])
    return fade(normalize(soft_clip(v * e, 1.6), 0.8), 0.02, 0.05)


def breath(dur, kind="in", intensity=1.0, seed=0):
    n = int(dur * SR)
    t = t_axis(dur)
    x = noise(dur)
    # throat / nose turbulence: swept band-pass noise
    if kind == "in":
        f0, f1 = 700, 1500
        e = smooth_env(n, [(0, 0), (dur * 0.18, 0.5), (dur * 0.7, 1.0), (dur * 0.92, 0.5), (dur, 0)])
    else:
        f0, f1 = 1100, 500
        e = smooth_env(n, [(0, 0), (dur * 0.12, 1.0), (dur * 0.45, 0.8), (dur * 0.85, 0.25), (dur, 0)])
    fc = np.linspace(f0, f1, n)
    y = np.zeros(n)
    blocks = 40
    edges = np.linspace(0, n, blocks + 1).astype(int)
    for i in range(blocks):
        a, b = edges[i], edges[i + 1]
        c = fc[(a + b) // 2]
        y[a:b] = bp(x[a:b + 1024 if b + 1024 < n else n], c * 0.5, c * 1.6, 2)[: b - a]
    y = 0.8 * y + 0.5 * lp(x, 250) * 0.5
    # rattle in the chest
    y *= 1 + 0.25 * np.sin(2 * np.pi * 17 * t) * (0.5 + 0.5 * np.sin(2 * np.pi * 0.9 * t))
    return fade(normalize(y * e * intensity, 0.55), 0.05, 0.1)


# ------------------------------------------------------------------ impacts / whooshes
def thump(f_lo=48, f_hi=110, dur=0.42, seed=0):
    n = int(dur * SR)
    t = t_axis(dur)
    sweep = f_lo + (f_hi - f_lo) * np.exp(-t / 0.045)
    body = np.sin(2 * np.pi * np.cumsum(sweep) / SR) * expdecay(n, 0.11)
    slap = lp(bp(noise(dur), 300, 1800), 1800) * expdecay(n, 0.018) * 0.9
    skin = lp(noise(dur), 250) * expdecay(n, 0.05) * 0.7
    x = body + slap + skin
    x = soft_clip(x * 1.3, 1.6)
    return fade(normalize(x, 0.9), 0.0015, 0.02)


def whoosh(dur=0.6, f0=500, f1=2600, peak=0.55, width=0.5, seed=0, gain=1.0):
    n = int(dur * SR)
    x = noise(dur)
    fc = np.exp(np.linspace(np.log(f0), np.log(f1), n))
    y = np.zeros(n)
    blocks = 60
    edges = np.linspace(0, n, blocks + 1).astype(int)
    for i in range(blocks):
        a, b = edges[i], edges[i + 1]
        c = fc[(a + b) // 2]
        seg = x[a:min(n, b + 1500)]
        y[a:b] = bp(seg, c * 0.55, c * 1.7, 2)[: b - a]
    t = np.linspace(0, 1, n)
    e = np.exp(-((t - peak) ** 2) / (2 * (width / 2.8) ** 2))
    y = y * e
    y += 0.25 * lp(x, 300) * e
    return fade(normalize(y * gain, 0.7), 0.03, 0.08)


def axe_impact(f_metal=760, dur=1.6, seed=0):
    n = int(dur * SR)
    t = t_axis(dur)
    r = np.random.default_rng(seed)
    boom = np.sin(2 * np.pi * np.cumsum(55 + 50 * np.exp(-t / 0.07)) / SR) * expdecay(n, 0.28)
    crack = bp(noise(dur), 600, 7000) * expdecay(n, 0.02) * 1.2
    crunch = hp(noise(dur), 1500) * expdecay(n, 0.07) * 0.5
    ring = np.zeros(n)
    for ratio, amp, tau in ((1.0, 1.0, 0.55), (2.76, 0.7, 0.35), (5.4, 0.45, 0.22), (8.93, 0.3, 0.14), (13.3, 0.18, 0.09)):
        ring += amp * np.sin(2 * np.pi * f_metal * ratio * t * (1 + 0.002 * r.standard_normal()) + r.random() * 6.28) * expdecay(n, tau)
    ring *= 0.28
    # rubble pattering after the hit
    rub = np.zeros(n)
    for k in range(18):
        t0 = 0.05 + r.random() * 0.5
        i0 = int(t0 * SR)
        L = int(0.03 * SR)
        if i0 + L < n:
            rub[i0:i0 + L] += r.random() * 0.25 * bp(noise(0.03), 900, 5000)[:L] * expdecay(L, 0.008)
    x = 1.1 * boom + crack + crunch + ring + rub
    x = soft_clip(x * 0.9, 1.8)
    return fade(normalize(x, 0.95), 0.0008, 0.15)


def extract_scrape(dur=0.7, seed=0):
    n = int(dur * SR)
    t = t_axis(dur)
    x = bp(noise(dur), 900, 4200)
    x *= 0.5 + 0.5 * np.abs(np.sin(2 * np.pi * 9 * t))
    ring = np.sin(2 * np.pi * 1400 * t) * 0.05 * expdecay(n, 0.3)
    e = smooth_env(n, [(0, 0), (0.08, 0.8), (0.3, 0.6), (dur, 0)])
    return fade(normalize((x + ring) * e, 0.5), 0.02, 0.1)


# ------------------------------------------------------------------ ambience
def ambience(dur=24.0, sr=22050):
    """Quiet forest bed: wind, leaf rustle, distant birds.  Built circularly so the loop is gapless."""
    n = int(dur * sr)
    t = np.arange(n) / sr
    r = np.random.default_rng(777)

    def circ_noise():
        return r.standard_normal(n)

    def smooth_circ(x, f):
        # circular low-pass via FFT (keeps the loop seamless)
        X = np.fft.rfft(x)
        fr = np.fft.rfftfreq(n, 1 / sr)
        X *= 1 / (1 + (fr / f) ** 4)
        return np.fft.irfft(X, n)

    wind = smooth_circ(circ_noise(), 380)
    gust = smooth_circ(circ_noise(), 0.25)
    gust = 0.55 + 0.45 * (gust - gust.min()) / (gust.max() - gust.min() + 1e-9)
    wind = wind / (np.abs(wind).max() + 1e-9) * gust * 0.6
    leaves = circ_noise()
    X = np.fft.rfft(leaves)
    fr = np.fft.rfftfreq(n, 1 / sr)
    X *= ((fr > 2500) & (fr < 7500)).astype(float)
    leaves = np.fft.irfft(X, n)
    lg = smooth_circ(circ_noise(), 0.4)
    lg = np.clip((lg - lg.mean()) / (lg.std() + 1e-9), 0, None)
    leaves = leaves / (np.abs(leaves).max() + 1e-9) * (0.08 + 0.16 * lg / (lg.max() + 1e-9))
    birds = np.zeros(n)
    for _ in range(9):
        start = r.random() * (dur - 2.0)
        base = r.uniform(2400, 4600)
        notes = r.integers(2, 6)
        cur = start
        for k in range(notes):
            L = r.uniform(0.07, 0.16)
            i0, L_i = int(cur * sr), int(L * sr)
            if i0 + L_i >= n:
                break
            tt = np.arange(L_i) / sr
            f = base * (1 + 0.25 * np.sin(2 * np.pi * 14 * tt) * 0 + r.uniform(-0.15, 0.25) * (tt / L))
            ph = 2 * np.pi * np.cumsum(f) / sr
            amp = np.sin(np.pi * tt / L) ** 2
            birds[i0:i0 + L_i] += 0.05 * amp * (np.sin(ph) + 0.25 * np.sin(2 * ph))
            cur += L + r.uniform(0.05, 0.12)
    out = wind + leaves + birds
    # crossfade ends for an extra-safe loop
    xf = int(1.5 * sr)
    w = np.linspace(0, 1, xf)
    out[:xf] = out[:xf] * w + out[-xf:] * (1 - w)
    out = out[:-xf]
    return normalize(out, 0.5), sr


# ------------------------------------------------------------------ io
def write_wav(path, x, sr=SR):
    pcm = np.clip(x, -1, 1)
    pcm = (pcm * 32767).astype(np.int16)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())


def save(name, x, mp3=True, sr=SR, gain=1.0):
    x = np.asarray(x, dtype=np.float64) * gain
    wav = os.path.join(TMP, name + ".wav")
    write_wav(wav, x, sr)
    if mp3:
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-ac", "1", "-b:a", "112k", os.path.join(OUT, name + ".mp3")], check=True)
    else:
        write_wav(os.path.join(OUT, name + ".wav"), x, sr)
    print("  %-22s %.2fs" % (name, len(x) / sr))


def main():
    print("synthesising audio ->", OUT)
    # breathing (heavy, slow)
    for i, (d, inten) in enumerate(((1.7, 1.0), (1.55, 0.9), (1.85, 1.0)), 1):
        save("breath_in_%d" % i, breath(d, "in", inten, i))
    for i, (d, inten) in enumerate(((2.3, 1.0), (2.1, 0.9), (2.5, 1.0)), 1):
        save("breath_out_%d" % i, breath(d, "out", inten, i))
    # growls
    save("growl_low_1", growl_low(1.7, 58, 1))
    save("growl_low_2", growl_low(2.0, 66, 2))
    # roars / kiai / grunts
    save("roar_long_1", roar(2.5, 150, 70, (700, 1150, 2500), rough=0.55, seed=1, growl_rate=26, release=0.7))
    save("roar_long_2", roar(2.3, 135, 62, (620, 1000, 2300), rough=0.6, seed=2, growl_rate=31, release=0.6))
    save("roar_short_1", roar(0.95, 170, 85, (720, 1200, 2600), rough=0.5, seed=3, growl_rate=33, release=0.35))
    save("roar_short_2", roar(0.85, 160, 78, (640, 1050, 2400), rough=0.55, seed=4, growl_rate=29, release=0.3))
    save("kiai_1", roar(0.8, 190, 95, (780, 1250, 2700), rough=0.4, seed=5, growl_rate=22, release=0.28, attack=0.03))
    save("kiai_2", roar(0.75, 175, 88, (740, 1180, 2550), rough=0.45, seed=6, growl_rate=24, release=0.26, attack=0.03))
    for i, (d, f0, v) in enumerate(((0.28, 98, (520, 900, 2300)), (0.34, 88, (560, 950, 2250)), (0.24, 108, (500, 880, 2350)), (0.4, 82, (540, 920, 2200))), 1):
        save("grunt_%d" % i, grunt(d, f0, seed=i, vowel=v))
    # chest thumps
    for i, (a, b) in enumerate(((46, 105), (52, 118), (42, 98)), 1):
        save("thump_%d" % i, thump(a, b, 0.45, i))
    # axe whooshes
    save("whoosh_lift", whoosh(1.1, 300, 1200, 0.55, 0.9, gain=0.8))
    save("whoosh_swing_1", whoosh(0.55, 700, 3600, 0.62, 0.5, gain=1.0))
    save("whoosh_swing_2", whoosh(0.5, 800, 4200, 0.6, 0.45, gain=1.0))
    save("whoosh_lower", whoosh(0.9, 400, 1500, 0.5, 0.8, gain=0.7))
    # heavy impact + extraction
    save("axe_impact_1", axe_impact(760, 1.6, 1))
    save("axe_impact_2", axe_impact(690, 1.5, 2))
    save("rock_extract", extract_scrape(0.7))
    # ambience loop (WAV: gapless)
    amb, sr = ambience()
    save("ambience_forest", amb, mp3=False, sr=sr)
    print("done")


if __name__ == "__main__":
    sys.exit(main())
