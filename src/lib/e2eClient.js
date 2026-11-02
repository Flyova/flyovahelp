"use client";
import { useEffect, useState } from "react";
import { authFetch } from "@/lib/authFetch";
import { newDevice, seal } from "@/lib/e2e";

// This browser's end-to-end key for private chats (lib/e2e): one per signed-in
// account, kept in IndexedDB and never sent anywhere; only its public half is
// registered (/api/chat/keys). Clearing the browser's data makes it a new device,
// which can't read messages sent before.

const DB_NAME = "strawins-e2e";
const STORE = "devices";
const DEVICES_FRESH_MS = 60 * 1000; // how long a chat's device list is reused when sending

function openStore() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function storeOp(mode, run) {
  const idb = await openStore();
  try {
    return await new Promise((resolve, reject) => {
      const req = run(idb.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    idb.close();
  }
}

const devices = new Map(); // uid -> Promise<{ deviceId, pub, secret } | null>
const registered = new Map(); // uid -> Promise<void>, once the server has the public key

/** This browser's device for `uid`, made the first time; null where it can't keep a key. */
export function deviceFor(uid) {
  if (!uid || typeof indexedDB === "undefined") return Promise.resolve(null);
  if (!devices.has(uid)) {
    devices.set(uid, (async () => {
      const kept = await storeOp("readonly", (s) => s.get(uid)).catch(() => null);
      if (kept?.deviceId && kept.secret) return kept;
      const device = newDevice();
      // A key that can't be kept would leave messages sealed for it unreadable.
      return storeOp("readwrite", (s) => s.put(device, uid)).then(() => device, () => null);
    })());
  }
  return devices.get(uid);
}

/** Registers this browser's key (once per visit), so messages get sealed for it. */
export function registerDevice(uid) {
  if (!registered.has(uid)) {
    registered.set(uid, (async () => {
      const device = await deviceFor(uid);
      if (!device) return;
      const r = await authFetch("/api/chat/keys", { method: "POST", body: { action: "register", deviceId: device.deviceId, pub: device.pub, platform: "web" } });
      if (r?.error) throw new Error(r.error);
    })());
    registered.get(uid).catch(() => registered.delete(uid)); // try again next time
  }
  return registered.get(uid);
}

/** This browser's device: undefined while it loads, null where there's none. Registers it too. */
export function useE2EDevice(uid) {
  const [state, setState] = useState({ uid: null, device: undefined });
  useEffect(() => {
    if (!uid) return;
    let live = true;
    deviceFor(uid).then((device) => live && setState({ uid, device }), () => live && setState({ uid, device: null }));
    registerDevice(uid).catch(() => {});
    return () => {
      live = false;
    };
  }, [uid]);
  if (!uid) return null;
  return state.uid === uid ? state.device : undefined;
}

const convoDevices = new Map(); // convoId -> { at, promise }

/** { e2e, devices } for a private chat, reused for a minute unless `fresh`. */
export function chatDevices(uid, convoId, { fresh = false } = {}) {
  const hit = convoDevices.get(convoId);
  if (hit && !fresh && Date.now() - hit.at < DEVICES_FRESH_MS) return hit.promise;
  const promise = (async () => {
    await registerDevice(uid); // first, so this device is on the list
    const r = await authFetch("/api/chat/keys", { method: "POST", body: { action: "devices", convoId } });
    if (r?.error) throw new Error(r.error);
    return { e2e: r.e2e === true, devices: Array.isArray(r.devices) ? r.devices : [] };
  })();
  convoDevices.set(convoId, { at: Date.now(), promise });
  promise.catch(() => convoDevices.delete(convoId));
  return promise;
}

/**
 * The `enc` for a message (payload { t, r? }) in private chat `convoId`, or null
 * while the chat isn't encrypted yet.
 */
export async function sealForChat(uid, convoId, payload, opts) {
  const { e2e, devices: list } = await chatDevices(uid, convoId, opts);
  if (!e2e) return null;
  if (!list.length) throw new Error("No encryption keys for this chat yet. Try again in a moment.");
  return seal(payload, list);
}
