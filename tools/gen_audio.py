#!/usr/bin/env python3
"""Crowd Battle 3D - procedural audio generator (TK Sadhan).

Synthesizes every music loop and sound effect used by the game as real
16-bit mono WAV files (22.05 kHz, small and fast to decode on low-end Android).
Run:  python3 tools/gen_audio.py      (needs numpy only)
Output: assets/audio/*.wav
"""
import os
import wave
import numpy as np

SR = 22050
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "audio")
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(7)


# ---------------------------------------------------------------- helpers
def t(dur):
    return np.arange(int(SR * dur)) / SR


def env(n, a=0.005, d=0.1, s=0.0, r=0.05):
    """Simple ADSR-ish envelope over n samples (times in seconds)."""
    e = np.ones(n)
    na, nd, nr = int(a * SR), int(d * SR), int(r * SR)
    na = max(na, 1)
    e[:na] = np.linspace(0, 1, na)
    if nd > 0 and na + nd < n:
        e[na:na + nd] = np.linspace(1, s, nd)
        e[na + nd:] = s
    if nr > 0 and nr < n:
        e[-nr:] *= np.linspace(1, 0, nr)
    return e


def expdecay(dur, k=8.0):
    x = t(dur)
    return np.exp(-k * x)


def sine(f, dur):
    x = t(dur)
    if np.isscalar(f):
        return np.sin(2 * np.pi * f * x)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph)


def square(f, dur, duty=0.5):
    x = t(dur)
    if np.isscalar(f):
        ph = (f * x) % 1.0
    else:
        ph = (np.cumsum(f) / SR) % 1.0
    return np.where(ph < duty, 1.0, -1.0)


def saw(f, dur):
    x = t(dur)
    ph = (f * x) % 1.0 if np.isscalar(f) else (np.cumsum(f) / SR) % 1.0
    return 2 * ph - 1


def noise(dur):
    return rng.uniform(-1, 1, int(SR * dur))


def lowpass(x, cutoff):
    """One-pole low-pass (cutoff Hz scalar or array)."""
    a = np.exp(-2 * np.pi * (cutoff if np.isscalar(cutoff) else np.asarray(cutoff)) / SR)
    y = np.zeros_like(x)
    prev = 0.0
    if np.isscalar(a):
        for i in range(len(x)):
            prev = (1 - a) * x[i] + a * prev
            y[i] = prev
    else:
        for i in range(len(x)):
            prev = (1 - a[i]) * x[i] + a[i] * prev
            y[i] = prev
    return y


def highpass(x, cutoff):
    return x - lowpass(x, cutoff)


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12.0)


def mix_at(buf, snd, start):
    i = int(start * SR)
    if i >= len(buf):
        return
    j = min(len(buf), i + len(snd))
    buf[i:j] += snd[: j - i]


def norm(x, peak=0.9):
    m = np.max(np.abs(x)) or 1.0
    return x / m * peak


def fade_edges(x, ms=4):
    n = int(SR * ms / 1000)
    x = x.copy()
    x[:n] *= np.linspace(0, 1, n)
    x[-n:] *= np.linspace(1, 0, n)
    return x


def save(name, x, peak=0.9, edges=True):
    x = norm(x, peak)
    if edges:
        x = fade_edges(x)
    pcm = (np.clip(x, -1, 1) * 32767).astype(np.int16)
    path = os.path.join(OUT, name + ".wav")
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print("%-18s %5.2fs %6.1f KB" % (name, len(x) / SR, os.path.getsize(path) / 1024.0))


# ---------------------------------------------------------------- UI sounds
def gen_click():
    d = 0.09
    x = sine(1400, d) * expdecay(d, 45) + 0.5 * sine(700, d) * expdecay(d, 35)
    x += 0.15 * highpass(noise(d), 2000) * expdecay(d, 80)
    save("click", x)


def gen_menu():
    # soft two-note "open" blip
    x = np.zeros(int(SR * 0.28))
    mix_at(x, sine(midi(76), 0.16) * expdecay(0.16, 14), 0.0)
    mix_at(x, sine(midi(83), 0.2) * expdecay(0.2, 12), 0.07)
    save("menu", x)


def gen_back():
    x = np.zeros(int(SR * 0.22))
    mix_at(x, sine(midi(79), 0.12) * expdecay(0.12, 16), 0.0)
    mix_at(x, sine(midi(72), 0.16) * expdecay(0.16, 14), 0.06)
    save("back", x)


# ---------------------------------------------------------------- gameplay SFX
def gen_footstep():
    d = 0.16
    thump = sine(np.linspace(130, 55, int(SR * d)), d) * expdecay(d, 28)
    scuff = lowpass(noise(d), 2400) * expdecay(d, 38)
    save("footstep", thump * 0.9 + scuff * 0.5)


def gen_shoot():
    d = 0.14
    n = len(t(d))
    crack = highpass(noise(d), 1500) * expdecay(d, 55)
    body = sine(np.linspace(520, 90, n), d) * expdecay(d, 30)
    thump = lowpass(noise(d), 600) * expdecay(d, 38)
    save("shoot", crack * 0.7 + body * 0.8 + thump * 0.5)


def gen_shoot_heavy():
    d = 0.26
    n = len(t(d))
    crack = highpass(noise(d), 900) * expdecay(d, 28)
    body = sine(np.linspace(380, 55, n), d) * expdecay(d, 16)
    boom = lowpass(noise(d), 450) * expdecay(d, 14)
    save("shoot_heavy", crack * 0.6 + body * 0.9 + boom * 0.7)


def gen_hit():
    d = 0.12
    n = len(t(d))
    tick = highpass(noise(d), 900) * expdecay(d, 70)
    body = sine(np.linspace(300, 120, n), d) * expdecay(d, 40)
    save("hit", tick * 0.8 + body * 0.7)


def gen_enemy_attack():
    d = 0.32
    n = len(t(d))
    f = np.linspace(180, 90, n) * (1 + 0.06 * np.sin(2 * np.pi * 30 * t(d)))
    growl = lowpass(saw(f, d) + 0.6 * square(f * 0.5, d), 900) * env(n, 0.01, 0.1, 0.6, 0.12)
    swipe = bandpass_noise(d, 500, 2500) * np.sin(np.linspace(0, np.pi, n)) * 0.5
    save("enemy_attack", growl * 0.9 + swipe)


def bandpass_noise(d, lo, hi):
    return lowpass(highpass(noise(d), lo), hi)


def gen_enemy_hit():
    d = 0.2
    n = len(t(d))
    pop = sine(np.linspace(260, 70, n), d) * expdecay(d, 22)
    squish = lowpass(noise(d), 1800) * expdecay(d, 30)
    save("enemy_hit", pop * 0.9 + squish * 0.6)


def gen_crowd_join(count_bias=1.0):
    d = 0.3
    x = np.zeros(int(SR * d))
    for i, nn in enumerate([72, 76, 79]):
        mix_at(x, sine(midi(nn), 0.16) * expdecay(0.16, 16), i * 0.045)
    x += 0.2 * highpass(noise(d), 3000) * expdecay(d, 30)
    return x


def gen_join_sounds():
    save("join_small", gen_crowd_join())
    # +10: bigger, with low pop and wider arpeggio
    d = 0.5
    x = np.zeros(int(SR * d))
    for i, nn in enumerate([67, 72, 76, 79, 84]):
        mix_at(x, (sine(midi(nn), 0.22) + 0.3 * square(midi(nn), 0.22, 0.25)) * expdecay(0.22, 12) * 0.6, i * 0.05)
    mix_at(x, sine(np.linspace(200, 80, int(SR * 0.2)), 0.2) * expdecay(0.2, 14), 0.0)
    save("join_medium", x)
    # +99: huge cheer-like swell
    d = 1.1
    n = len(t(d))
    x = np.zeros(n)
    for i, nn in enumerate([60, 64, 67, 72, 76, 79, 84, 88]):
        mix_at(x, (sine(midi(nn), 0.5) + 0.25 * saw(midi(nn), 0.5)) * expdecay(0.5, 6) * 0.5, i * 0.055)
    crowd = bandpass_noise(d, 400, 3500) * np.sin(np.linspace(0, np.pi, n)) ** 0.8
    x += crowd * 0.5
    mix_at(x, sine(np.linspace(240, 60, int(SR * 0.35)), 0.35) * expdecay(0.35, 8), 0.0)
    save("join_large", x)


def gen_gate_pass():
    d = 0.35
    n = len(t(d))
    sweep = sine(np.linspace(300, 1500, n), d) * env(n, 0.01, 0.2, 0.3, 0.1)
    shimmer = highpass(noise(d), 4000) * np.sin(np.linspace(0, np.pi, n)) * 0.25
    save("gate", sweep * 0.7 + shimmer)


def gen_gate_bad():
    d = 0.35
    n = len(t(d))
    x = square(np.linspace(260, 90, n), d, 0.4) * env(n, 0.005, 0.2, 0.3, 0.1)
    save("gate_bad", lowpass(x, 1200))


def gen_explosion(name="explosion", d=0.9, big=False):
    n = len(t(d))
    k = 6 if not big else 4
    noise_body = lowpass(noise(d), np.linspace(5000, 200, n)) * expdecay(d, k)
    boom = sine(np.linspace(110, 28, n), d) * expdecay(d, k * 0.8)
    crack = highpass(noise(d), 1200) * expdecay(d, 45)
    rumble = lowpass(noise(d), 160) * expdecay(d, k * 0.5)
    save(name, noise_body * 0.9 + boom * 1.1 + crack * 0.5 + rumble * 0.6)


def gen_destroy():
    d = 0.6
    x = np.zeros(int(SR * d))
    for i in range(9):
        s = highpass(noise(0.1), 800 + 300 * i) * expdecay(0.1, 35) * rng.uniform(0.3, 0.9)
        mix_at(x, s, rng.uniform(0, 0.4))
    x += lowpass(noise(d), 500) * expdecay(d, 9) * 0.8
    save("destroy", x)


def gen_coin():
    d = 0.4
    x = np.zeros(int(SR * d))
    mix_at(x, (sine(midi(88), 0.1) + 0.3 * sine(midi(100), 0.1)) * expdecay(0.1, 14), 0.0)
    mix_at(x, (sine(midi(95), 0.3) + 0.3 * sine(midi(107), 0.3)) * expdecay(0.3, 9), 0.075)
    save("coin", x)


def gen_boss_roar():
    d = 1.1
    n = len(t(d))
    f = np.linspace(95, 55, n) * (1 + 0.05 * np.sin(2 * np.pi * 18 * t(d)))
    x = lowpass(saw(f, d) + 0.5 * square(f * 0.5, d), 700) * env(n, 0.06, 0.3, 0.7, 0.3)
    x += lowpass(noise(d), 500) * env(n, 0.05, 0.3, 0.5, 0.3) * 0.4
    save("boss_roar", x)


def gen_victory():
    d = 2.2
    x = np.zeros(int(SR * d))
    seq = [(72, 0.0, 0.18), (76, 0.16, 0.18), (79, 0.32, 0.18), (84, 0.48, 0.5),
           (79, 0.98, 0.16), (84, 1.14, 0.9)]
    for nn, st, ln in seq:
        tone = sine(midi(nn), ln + 0.3) + 0.4 * square(midi(nn), ln + 0.3, 0.3) + 0.3 * sine(midi(nn + 12), ln + 0.3)
        mix_at(x, tone * env(len(tone), 0.01, 0.15, 0.6, 0.25) * 0.55, st)
    for nn in (60, 64, 67):
        tone = sine(midi(nn), 1.1) * env(int(SR * 1.1), 0.02, 0.2, 0.6, 0.4)
        mix_at(x, tone * 0.35, 1.14)
    mix_at(x, highpass(noise(0.6), 5000) * expdecay(0.6, 6) * 0.2, 1.14)
    save("victory", x)


def gen_gameover():
    d = 1.9
    x = np.zeros(int(SR * d))
    seq = [(67, 0.0), (64, 0.3), (60, 0.6), (55, 0.95)]
    for nn, st in seq:
        ln = 0.35 if nn != 55 else 0.9
        tone = (saw(midi(nn), ln) * 0.6 + sine(midi(nn - 12), ln)) * env(int(SR * ln), 0.01, 0.15, 0.6, 0.2)
        mix_at(x, lowpass(tone, 1400), st)
    save("gameover", x)


def gen_upgrade():
    d = 0.6
    x = np.zeros(int(SR * d))
    for i, nn in enumerate([69, 73, 76, 81]):
        mix_at(x, (sine(midi(nn), 0.2) + 0.25 * square(midi(nn), 0.2, 0.25)) * expdecay(0.2, 10), i * 0.07)
    save("upgrade", x)


def gen_error():
    d = 0.25
    x = square(150, d, 0.5) * env(len(t(d)), 0.005, 0.08, 0.5, 0.08)
    save("error", lowpass(x, 900))


def gen_countdown():
    d = 0.2
    save("countdown", sine(880, d) * env(len(t(d)), 0.005, 0.05, 0.6, 0.08))
    d = 0.5
    save("go", (sine(1320, d) + 0.3 * sine(2640, d)) * env(len(t(d)), 0.005, 0.1, 0.6, 0.25))


# ---------------------------------------------------------------- music
def drum_kick():
    d = 0.22
    n = len(t(d))
    return sine(np.linspace(160, 45, n), d) * expdecay(d, 14)


def drum_snare():
    d = 0.18
    return (highpass(noise(d), 1500) * 0.8 + sine(190, d) * 0.4) * expdecay(d, 22)


def drum_hat(open_=False):
    d = 0.18 if open_ else 0.05
    return highpass(noise(d), 6000) * expdecay(d, 10 if open_ else 60) * 0.5


def pluck(f, d, bright=1.0):
    x = (saw(f, d) * 0.5 + square(f, d, 0.3) * 0.3 + sine(f * 2, d) * 0.2)
    return lowpass(x, 1800 * bright) * expdecay(d, 9)


def bass_note(f, d):
    x = lowpass(saw(f, d) * 0.6 + sine(f, d) * 0.8, 520)
    return x * env(len(x), 0.005, 0.1, 0.7, 0.05)


def gen_bgm():
    """Upbeat 'run & gun' loop, 124 BPM, A minor, 8 bars."""
    bpm = 124
    beat = 60.0 / bpm
    bars = 8
    total = bars * 4 * beat
    buf = np.zeros(int(SR * total))
    prog = [57, 53, 48, 55]            # Am F C G  (bass roots, 2 bars each... one per bar then repeat)
    chords = {57: [57, 60, 64], 53: [53, 57, 60], 48: [48, 52, 55], 55: [55, 59, 62]}
    arp_pat = [0, 1, 2, 1, 2, 1, 0, 2]
    lead = {0: [81, 0, 84, 0, 83, 81, 0, 79], 1: [77, 0, 81, 0, 79, 77, 0, 74],
            2: [79, 0, 84, 0, 83, 79, 0, 76], 3: [78, 0, 83, 0, 81, 78, 0, 74]}
    kick, snare, hat, ohat = drum_kick(), drum_snare(), drum_hat(), drum_hat(True)
    for bar in range(bars):
        root = prog[bar % 4]
        bt0 = bar * 4 * beat
        for b in range(4):
            mix_at(buf, kick * 0.95, bt0 + b * beat)
            if b in (1, 3):
                mix_at(buf, snare * 0.6, bt0 + b * beat)
            mix_at(buf, ohat * 0.5, bt0 + b * beat + beat / 2)
            mix_at(buf, hat * 0.5, bt0 + b * beat)
        for e in range(8):
            st = bt0 + e * beat / 2
            mix_at(buf, bass_note(midi(root - 12), beat / 2 * 0.9) * 0.7, st)
            ch = chords[root]
            mix_at(buf, pluck(midi(ch[arp_pat[e]] + 12), beat / 2 * 1.2) * 0.32, st)
            if bar >= 2:
                ln = lead[bar % 4][e]
                if ln:
                    mix_at(buf, pluck(midi(ln), beat * 0.8, 1.4) * 0.28, st)
    save("bgm_game", buf, 0.8, edges=False)


def gen_bgm_menu():
    """Calm, spacious menu loop, 90 BPM, C major pads + soft bell."""
    bpm = 90
    beat = 60.0 / bpm
    bars = 8
    buf = np.zeros(int(SR * bars * 4 * beat))
    prog = [(48, [60, 64, 67]), (45, [57, 60, 64]), (41, [53, 57, 60]), (43, [55, 59, 62])]
    mel = [76, 79, 77, 74, 72, 76, 74, 71]
    for bar in range(bars):
        root, ch = prog[bar % 4]
        st = bar * 4 * beat
        for nn in ch:
            pad = (sine(midi(nn), 4 * beat) + 0.3 * sine(midi(nn) * 2, 4 * beat))
            mix_at(buf, pad * env(len(pad), 0.4, 0.5, 0.7, 0.8) * 0.22, st)
        mix_at(buf, bass_note(midi(root - 12), 4 * beat) * 0.5, st)
        for b in range(4):
            if (bar + b) % 2 == 0:
                nn = mel[(bar * 4 + b) % len(mel)]
                bell = sine(midi(nn), 1.2) + 0.4 * sine(midi(nn) * 2.01, 1.2)
                mix_at(buf, bell * expdecay(1.2, 3.5) * 0.28, st + b * beat)
    save("bgm_menu", buf, 0.75, edges=False)


def gen_bgm_boss():
    """Aggressive boss loop, 148 BPM, D minor, driving 16ths bass + brass stabs."""
    bpm = 148
    beat = 60.0 / bpm
    bars = 8
    buf = np.zeros(int(SR * bars * 4 * beat))
    roots = [50, 50, 46, 48, 50, 50, 46, 45]  # D D Bb C D D Bb A
    kick, snare, hat = drum_kick(), drum_snare(), drum_hat()
    for bar in range(bars):
        r = roots[bar]
        bt0 = bar * 4 * beat
        for b in range(4):
            mix_at(buf, kick * 1.0, bt0 + b * beat)
            if b in (1, 3):
                mix_at(buf, snare * 0.8, bt0 + b * beat)
            for s in range(2):
                mix_at(buf, hat * 0.5, bt0 + b * beat + s * beat / 2)
        mix_at(buf, kick * 0.8, bt0 + 1.5 * beat)
        mix_at(buf, kick * 0.8, bt0 + 3.5 * beat)
        for e in range(16):
            st = bt0 + e * beat / 4
            octv = 0 if e % 4 != 3 else 12
            mix_at(buf, bass_note(midi(r - 12 + octv), beat / 4 * 0.95) * 0.75, st)
        # brass stabs on off-beats
        for st_beat in (0.0, 1.5, 2.5, 3.0):
            for iv in (0, 3, 7):
                f = midi(r + 12 + iv)
                stab = lowpass(saw(f, beat * 0.4) * 0.5 + square(f, beat * 0.4, 0.4) * 0.3, 2400)
                stab = stab * env(len(stab), 0.005, 0.12, 0.3, 0.1)
                mix_at(buf, stab * 0.22, bt0 + st_beat * beat)
        # eerie rising lead on the last bars
        if bar >= 4:
            for k, iv in enumerate([0, 3, 5, 7]):
                f = midi(r + 24 + iv)
                l = sine(f, beat) * env(int(SR * beat), 0.02, 0.2, 0.5, 0.2)
                mix_at(buf, l * 0.2, bt0 + k * beat)
    save("bgm_boss", buf, 0.8, edges=False)


# ---------------------------------------------------------------- main
if __name__ == "__main__":
    gen_click(); gen_menu(); gen_back()
    gen_footstep(); gen_shoot(); gen_shoot_heavy(); gen_hit()
    gen_enemy_attack(); gen_enemy_hit()
    gen_join_sounds(); gen_gate_pass(); gen_gate_bad()
    gen_explosion("explosion", 0.9); gen_explosion("explosion_big", 1.5, True)
    gen_destroy(); gen_coin(); gen_boss_roar()
    gen_victory(); gen_gameover(); gen_upgrade(); gen_error(); gen_countdown()
    gen_bgm(); gen_bgm_menu(); gen_bgm_boss()
    print("done ->", os.path.abspath(OUT))
