// 8-bit sound effects, synthesised live with the Web Audio API.
// No audio files and nothing fetched from anywhere: every sound is a few square/triangle waves.

let ctx = null;
let master = null;
let enabled = true;
try {
  enabled = localStorage.getItem("dq-sound") !== "off";
} catch { /* private mode: default on */ }

/** Browsers only allow audio after a user gesture, so the context is created on the first tap. */
function ready() {
  if (!enabled) return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.18;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

/** One note: frequency (Hz), start offset and length (s), wave type, volume, optional slide target. */
function note(freq, at = 0, len = 0.1, type = "square", vol = 0.6, slideTo = null) {
  const c = ready();
  if (!c) return;
  const t = c.currentTime + at;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + len);
  // Short attack and release so notes don't click.
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.setValueAtTime(vol, t + Math.max(0.01, len - 0.03));
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + len + 0.02);
}

// Note frequencies (equal temperament).
const N = {
  C4: 261.6, E4: 329.6, G4: 392.0, A4: 440.0, B4: 493.9,
  C5: 523.3, D5: 587.3, E5: 659.3, F5: 698.5, G5: 784.0, A5: 880.0, B5: 987.8,
  C6: 1046.5, E6: 1318.5, G6: 1568.0,
};

export const sfx = {
  get enabled() { return enabled; },
  setEnabled(on) {
    enabled = on;
    try { localStorage.setItem("dq-sound", on ? "on" : "off"); } catch { /* ignore */ }
    if (on) sfx.correct();
  },
  /** Called from the first user gesture so later sounds can play. */
  unlock() { ready(); },

  tap() { note(N.A5, 0, 0.03, "square", 0.25); },
  correct() { note(N.E5, 0, 0.08); note(N.A5, 0.08, 0.14); },
  wrong() { note(196, 0, 0.28, "sawtooth", 0.4, 98); },
  gem() { note(N.B5, 0, 0.07); note(N.E6, 0.07, 0.25); },
  coins(n = 4) { for (let i = 0; i < n; i++) { note(N.B5, i * 0.09, 0.05); note(N.E6, i * 0.09 + 0.05, 0.08); } },
  win() { [N.C5, N.E5, N.G5, N.C6].forEach((f, i) => note(f, i * 0.1, 0.1)); note(N.C6, 0.4, 0.35, "square", 0.5); note(N.G5, 0.4, 0.35, "triangle", 0.4); },
  lose() { [N.G4, N.E4, N.C4].forEach((f, i) => note(f, i * 0.16, 0.16, "triangle", 0.6)); note(130.8, 0.48, 0.4, "triangle", 0.5, 98); },
  levelUp() { [N.C5, N.E5, N.G5, N.C6, N.E6, N.G6].forEach((f, i) => note(f, i * 0.07, 0.09)); note(N.C6, 0.45, 0.5, "triangle", 0.5); },
  encounter() { for (let i = 0; i < 3; i++) { note(N.C5, i * 0.16, 0.08); note(N.E5, i * 0.16 + 0.08, 0.08); } },
  hint() { note(N.A4, 0, 0.18, "triangle", 0.5, N.A5); },
  teleport() { note(N.C6, 0, 0.35, "square", 0.35, 180); note(N.G5, 0.05, 0.3, "triangle", 0.3, 120); },
  howl() { note(300, 0, 0.5, "triangle", 0.55, 620); note(620, 0.5, 0.9, "triangle", 0.5, 380); },
  magic() { [N.E5, N.G5, N.B5, N.E6, N.B5, N.G6].forEach((f, i) => note(f, i * 0.06, 0.12, "triangle", 0.45)); },
  tick() { note(1200, 0, 0.025, "square", 0.25); },
};
