import nacl from "tweetnacl";

// End-to-end encryption for private chats. The app has a copy of this file
// (src/lib/e2e.ts); keep the two byte-for-byte compatible.
//
// Every browser or app install keeps its own X25519 key pair (the private half
// never leaves it) and registers the public half through /api/chat/keys. A message
// in an encrypted chat is sealed with a fresh random key (secretbox); that key is
// wrapped with `box` for every device of every account that can chat as either
// username, using a one-off key pair whose public half travels with the message.
//
// A message's `enc` = { v, ct, n, epk, keys: { <deviceId>: nonce+wrapped key } }
// and its `text` is ENCRYPTED_TEXT, which is what older apps show.

export const E2E_VERSION = 1;
export const ENCRYPTED_TEXT = "Encrypted message. Update StraWins to read it.";
export const NO_KEY_TEXT = "Sent before you signed in on this device";
export const E2E_NOTE = "Messages in this chat are end-to-end encrypted. Not even StraWins can read them.";
export const MAX_E2E_DEVICES = 60; // devices one message is wrapped for
export const DEVICE_ID = /^[A-Za-z0-9]{20}$/;
export const PUBLIC_KEY = /^[A-Za-z0-9+/]{43}=$/; // 32 bytes, base64

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64_INDEX = Object.fromEntries([...B64].map((c, i) => [c, i]));

export function toBase64(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63]
      + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : "=")
      + (i + 2 < bytes.length ? B64[n & 63] : "=");
  }
  return out;
}

export function fromBase64(text) {
  const s = String(text || "").replace(/=+$/, "");
  if (/[^A-Za-z0-9+/]/.test(s)) throw new Error("Not base64");
  const out = new Uint8Array(Math.floor((s.length * 3) / 4));
  let bits = 0;
  let value = 0;
  let j = 0;
  for (const c of s) {
    value = (value << 6) | B64_INDEX[c];
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[j++] = (value >> bits) & 255;
    }
  }
  return out;
}

// UTF-8 by hand: older Android JavaScript engines lack TextDecoder.
export function utf8Encode(text) {
  const out = [];
  for (const ch of String(text)) {
    const c = ch.codePointAt(0);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(out);
}

export function utf8Decode(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length;) {
    const b = bytes[i];
    const size = b < 0x80 ? 1 : b < 0xe0 ? 2 : b < 0xf0 ? 3 : 4;
    let c = size === 1 ? b : b & (0xff >> (size + 1));
    for (let k = 1; k < size; k++) c = (c << 6) | (bytes[i + k] & 63);
    out += String.fromCodePoint(c);
    i += size;
  }
  return out;
}

const ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** A new device: { deviceId, pub, secret } (base64 keys). */
export function newDevice() {
  const pair = nacl.box.keyPair();
  const deviceId = Array.from(nacl.randomBytes(20), (b) => ID_CHARS[b % ID_CHARS.length]).join("");
  return { deviceId, pub: toBase64(pair.publicKey), secret: toBase64(pair.secretKey) };
}

/**
 * Seals `payload` ({ t: text, r?: quoted text }) for `devices` ([{ id, pub }]).
 * Returns the message's `enc`.
 */
export function seal(payload, devices) {
  const key = nacl.randomBytes(nacl.secretbox.keyLength);
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const ct = nacl.secretbox(utf8Encode(JSON.stringify(payload)), nonce, key);
  const once = nacl.box.keyPair();
  const keys = {};
  for (const d of devices.slice(0, MAX_E2E_DEVICES)) {
    const wrapNonce = nacl.randomBytes(nacl.box.nonceLength);
    const wrapped = nacl.box(key, wrapNonce, fromBase64(d.pub), once.secretKey);
    const both = new Uint8Array(wrapNonce.length + wrapped.length);
    both.set(wrapNonce);
    both.set(wrapped, wrapNonce.length);
    keys[d.id] = toBase64(both);
  }
  return { v: E2E_VERSION, ct: toBase64(ct), n: toBase64(nonce), epk: toBase64(once.publicKey), keys };
}

/** Opens `enc` with this device ({ deviceId, secret }); null if it wasn't sealed for it. */
export function unseal(enc, device) {
  try {
    const wrapped = enc?.keys?.[device?.deviceId];
    if (!wrapped || enc.v !== E2E_VERSION) return null;
    const both = fromBase64(wrapped);
    const key = nacl.box.open(both.subarray(nacl.box.nonceLength), both.subarray(0, nacl.box.nonceLength), fromBase64(enc.epk), fromBase64(device.secret));
    if (!key) return null;
    const plain = nacl.secretbox.open(fromBase64(enc.ct), fromBase64(enc.n), key);
    if (!plain) return null;
    const payload = JSON.parse(utf8Decode(plain));
    return payload && typeof payload.t === "string" ? payload : null;
  } catch {
    return null;
  }
}

/**
 * A message as this device shows it: an encrypted one gets its text (and quoted
 * text) back, or NO_KEY_TEXT with `noKey` when it wasn't sealed for this device.
 * `device` is undefined while it's still loading.
 */
export function readable(m, device) {
  if (!m?.enc || m.deletedForEveryone) return m;
  if (device === undefined) return { ...m, text: "Decrypting…", noKey: true };
  const payload = device ? unseal(m.enc, device) : null;
  if (!payload) return { ...m, text: NO_KEY_TEXT, noKey: true };
  return {
    ...m,
    text: payload.t,
    ...(m.replyTo && { replyTo: { ...m.replyTo, text: typeof payload.r === "string" ? payload.r : "" } }),
  };
}

/** A chat list's preview line: an encrypted chat's last message, opened on this device. */
export function previewOf(convo, device) {
  if (convo?.lastMessage !== ENCRYPTED_TEXT || !convo.lastMessageEnc) return convo?.lastMessage || "";
  const payload = device ? unseal(convo.lastMessageEnc, device) : null;
  return payload ? payload.t.slice(0, 120) : "Encrypted message";
}
