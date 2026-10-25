// Chat sounds, made with Web Audio so there's no file to load. Browsers only allow
// sound after the person has tapped or typed on the page, so before that they stay
// silent.
let ctx = null;
const lastPlayed = { message: 0, coins: 0 };
const MIN_GAP_MS = 600; // a burst of messages makes one sound, not a dozen

function audio() {
  if (typeof window === "undefined") return null;
  ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

// Plays [frequency, start offset, length] notes softly.
function play(kind, notes, { type = "sine", peak = 0.18 } = {}) {
  const now = Date.now();
  if (now - lastPlayed[kind] < MIN_GAP_MS) return;
  lastPlayed[kind] = now;
  try {
    const ac = audio();
    if (!ac) return;
    const start = ac.currentTime + 0.01;
    for (const [freq, offset, length] of notes) {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start + offset);
      gain.gain.exponentialRampToValueAtTime(peak, start + offset + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + length);
      osc.connect(gain).connect(ac.destination);
      osc.start(start + offset);
      osc.stop(start + offset + length + 0.02);
    }
  } catch {
    // No audio support: stay silent.
  }
}

/** New message: two quick soft notes. */
export function playChatSound() {
  play("message", [[880, 0, 0.16], [1320, 0.09, 0.16]]);
}

/** Coins sent: a bright rising "cha-ching". */
export function playCoinSound() {
  play("coins", [[1318.5, 0, 0.14], [1568, 0.07, 0.14], [2093, 0.14, 0.16], [2637, 0.22, 0.32], [3136, 0.3, 0.3]], { type: "triangle", peak: 0.14 });
}
