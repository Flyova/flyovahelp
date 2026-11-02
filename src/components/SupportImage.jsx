"use client";
import { useEffect, useState } from "react";
import { ImageOff, Loader2, X } from "lucide-react";
import { authFetch } from "@/lib/authFetch";

// A photo in a Live Support chat (lib/supportPhotos), read through /api/support once per
// page visit. Tap it to see it full size; tap again, the ✕ or Escape to close.
const loaded = new Map(); // "chat/id" -> Promise of the data URL ("" = couldn't load)

function loadPhoto(chatId, imageId) {
  const key = `${chatId || ""}/${imageId}`;
  if (!loaded.has(key)) {
    const query = new URLSearchParams({ id: imageId, ...(chatId ? { chat: chatId } : {}) });
    loaded.set(key, authFetch(`/api/support?${query}`).then((res) => {
      if (!res?.image) loaded.delete(key); // try again next time
      return res?.image || "";
    }, () => {
      loaded.delete(key);
      return "";
    }));
  }
  return loaded.get(key);
}

/** `chatId`: whose chat (admins); players leave it out for their own. */
export default function SupportImage({ chatId, imageId }) {
  const key = `${chatId || ""}/${imageId}`;
  const [photo, setPhoto] = useState({ key: "", src: "" });
  const [open, setOpen] = useState(false);
  const src = photo.key === key ? photo.src : null; // null while loading, "" if it couldn't load

  useEffect(() => {
    let live = true;
    loadPhoto(chatId, imageId).then((data) => live && setPhoto({ key, src: data }));
    return () => {
      live = false;
    };
  }, [chatId, imageId, key]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (src === null) {
    return (
      <div className="w-48 h-48 max-w-full rounded-2xl bg-black/20 flex items-center justify-center">
        <Loader2 className="animate-spin opacity-60" size={20} />
      </div>
    );
  }
  if (!src) {
    return (
      <div className="w-48 max-w-full rounded-2xl bg-black/20 px-4 py-6 flex flex-col items-center gap-2 opacity-70">
        <ImageOff size={20} />
        <span className="text-[10px] font-black uppercase tracking-widest">Photo unavailable</span>
      </div>
    );
  }
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="block" aria-label="View photo full size">
        {/* eslint-disable-next-line @next/next/no-img-element -- a data URL, nothing to optimise */}
        <img src={src} alt="Photo in the support chat" className="max-w-[240px] w-full max-h-[320px] rounded-2xl object-cover" />
      </button>
      {open && (
        <div role="dialog" aria-modal="true" aria-label="Photo" onClick={() => setOpen(false)}
          className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-4">
          <button type="button" onClick={() => setOpen(false)} aria-label="Close photo"
            className="absolute top-4 right-4 p-3 rounded-full bg-white/10 text-white hover:bg-white/20">
            <X size={22} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element -- a data URL, nothing to optimise */}
          <img src={src} alt="Photo in the support chat" className="max-w-full max-h-full object-contain rounded-lg" />
        </div>
      )}
    </>
  );
}
