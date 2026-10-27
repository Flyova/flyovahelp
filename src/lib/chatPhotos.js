"use client";
import { useEffect, useSyncExternalStore } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

// Players' chat profile photos (chat_profiles/<username>.photoURL), fetched once per
// username per page load and shared by every Avatar of that player. Reading chat
// profiles needs a signed-in player, so lookups wait for sign-in. An open private
// chat also keeps the other player's status line live (useChatStatusLine).
const photos = new Map(); // usernameLower -> photo URL ("" = none)
const statusLines = new Map(); // usernameLower -> status ("" = none)
const requested = new Set();
const waiting = new Set(); // asked for before sign-in finished
const listeners = new Set();
let signedIn = false;

const emit = () => listeners.forEach((l) => l());

function fetchPhoto(name) {
  requested.add(name);
  getDoc(doc(db, "chat_profiles", name))
    .then((s) => {
      photos.set(name, s.data()?.photoURL || "");
      emit();
    })
    .catch(() => {});
}

if (typeof window !== "undefined") {
  onAuthStateChanged(auth, (u) => {
    signedIn = !!u;
    if (!u) return;
    waiting.forEach(fetchPhoto);
    waiting.clear();
  });
}

function want(name) {
  if (!name || requested.has(name)) return;
  if (signedIn) fetchPhoto(name);
  else waiting.add(name);
}

const subscribe = (l) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** The chat photo URL for `username`, or "" while loading or if they have none. */
export function useChatPhoto(username) {
  const name = String(username || "").trim().replace(/^@/, "").toLowerCase();
  useEffect(() => want(name), [name]);
  return useSyncExternalStore(subscribe, () => photos.get(name) || "", () => "");
}

/**
 * `username`'s status (Chat settings → Profile: their mood, what they're up to),
 * kept live while it's shown. Refreshes their photo too, from the same read.
 */
export function useChatStatusLine(username) {
  const name = String(username || "").trim().replace(/^@/, "").toLowerCase();
  useEffect(() => {
    if (!name) return;
    return onSnapshot(
      doc(db, "chat_profiles", name),
      (s) => {
        requested.add(name);
        photos.set(name, s.data()?.photoURL || "");
        statusLines.set(name, String(s.data()?.status || "").trim());
        emit();
      },
      () => {}
    );
  }, [name]);
  return useSyncExternalStore(subscribe, () => statusLines.get(name) || "", () => "");
}

/** Updates a player's photo everywhere on the page (after uploading or removing it). */
export function setChatPhoto(username, url) {
  const name = String(username || "").toLowerCase();
  requested.add(name);
  photos.set(name, url || "");
  emit();
}
