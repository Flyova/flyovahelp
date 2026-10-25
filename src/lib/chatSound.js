// New-message sound for chat, made with Web Audio so there's no file to load:
// two quick soft notes. Browsers only allow sound after the person has tapped or
// typed on the page, so before that it stays silent.
let ctx = null;
let lastPlayed = 0;
const MIN_GAP_MS = 600; // a burst of messages makes one sound, not a dozen

export function playChatSound() {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (now - lastPlayed < MIN_GAP_MS) return;
  lastPlayed = now;
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const start = ctx.currentTime + 0.01;
    [[880, 0], [1320, 0.09]].forEach(([freq, offset]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start + offset);
      gain.gain.exponentialRampToValueAtTime(0.18, start + offset + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start + offset);
      osc.stop(start + offset + 0.18);
    });
  } catch {
    // No audio support: stay silent.
  }
}
