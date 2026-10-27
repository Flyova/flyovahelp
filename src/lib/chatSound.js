// Chat sounds: the tone each kind of message plays (Chat settings → Notifications →
// Sounds), one small file per tone in public/sounds/tones, decoded once with Web
// Audio. Browsers only allow sound after the person has tapped or typed on the
// page, so before that they stay silent.
import { DEFAULT_TONES, isTone } from "@/lib/chatTones";

let ctx = null;
const buffers = new Map(); // tone id -> Promise<AudioBuffer | null>
const lastPlayed = { message: 0, coins: 0 };
const MIN_GAP_MS = 600; // a burst of messages makes one sound, not a dozen
const VOLUME = 0.41; // the files are loud enough for phone notifications; in Chats, as soft as before

function audio() {
  if (typeof window === "undefined") return null;
  ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function load(tone) {
  if (!buffers.has(tone)) {
    const ac = audio();
    const loading = !ac
      ? Promise.resolve(null)
      : fetch(`/sounds/tones/tone_${tone}.wav`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
        // The callback form: older Safari has no promise version.
        .then((data) => new Promise((resolve, reject) => ac.decodeAudioData(data, resolve, reject)))
        .catch(() => {
          buffers.delete(tone); // try again next time
          return null;
        });
    buffers.set(tone, loading);
  }
  return buffers.get(tone);
}

function play(kind, tone, fallback) {
  if (kind) {
    const now = Date.now();
    if (now - lastPlayed[kind] < MIN_GAP_MS) return;
    lastPlayed[kind] = now;
  }
  try {
    load(isTone(tone) ? tone : fallback).then((buffer) => {
      const ac = audio();
      if (!buffer || !ac) return;
      const source = ac.createBufferSource();
      const gain = ac.createGain();
      source.buffer = buffer;
      gain.gain.value = VOLUME;
      source.connect(gain).connect(ac.destination);
      source.start();
    });
  } catch {
    // No audio support: stay silent.
  }
}

/** Fetches tones ahead, so the first sound of each isn't late. */
export function preloadTones(tones) {
  if (typeof window === "undefined") return;
  tones.filter(isTone).forEach(load);
}

/** New message, in the tone picked for it (StraWins: two quick soft notes). */
export const playChatSound = (tone) => play("message", tone, DEFAULT_TONES.private);

/** Coins sent, in the tone picked for coins (Cha-ching: a bright rising "cha-ching"). */
export const playCoinSound = (tone) => play("coins", tone, DEFAULT_TONES.coins);

/** Plays a tone once, as the sound picker does when you tap one. */
export const previewTone = (tone) => play(null, tone, DEFAULT_TONES.private);
