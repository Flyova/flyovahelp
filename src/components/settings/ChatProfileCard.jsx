"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { collection, doc, getDoc, limit, onSnapshot, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { MessageSquare, MonitorSmartphone, CheckCircle, AlertCircle, Camera, Loader2, Trash2 } from "lucide-react";
import { db } from "@/lib/firebase";
import { authFetch } from "@/lib/authFetch";
import { setChatPhoto, useChatPhoto } from "@/lib/chatPhotos";
import Avatar from "@/components/Avatar";

const BIO_MAX = 160;
const STATUS_MAX = 80;
const PHOTO_SIZE = 240; // px, square
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const MAX_PHOTO_CHARS = 90000; // Firestore rules allow up to 100,000

// A centred square crop of an image file, as a small JPEG data URL (stored on the
// chat profile itself: the project has no Storage bucket).
async function squarePhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("That file isn't an image we can read."));
      i.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = PHOTO_SIZE;
    canvas.height = PHOTO_SIZE;
    canvas.getContext("2d").drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
    for (const quality of [0.82, 0.7, 0.55, 0.4]) {
      const data = canvas.toDataURL("image/jpeg", quality);
      if (data.startsWith("data:image/jpeg") && data.length <= MAX_PHOTO_CHARS) return data;
    }
    throw new Error("Could not make that photo small enough.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

// "MacIntel · Mozilla/5.0 (Macintosh; …" → "Mac". The stored string is cut at 60
// characters, so the browser name is usually lost; the platform is enough.
const deviceLabel = (device = "") => {
  if (/iPhone|iPad|iOS/i.test(device)) return "iPhone / iPad";
  if (/Android/i.test(device)) return "Android";
  if (/Mac/i.test(device)) return "Mac";
  if (/Win/i.test(device)) return "Windows";
  if (/Linux/i.test(device)) return "Linux";
  return "Browser";
};

const timeOf = (s) => s.lastActive?.toDate?.() ?? null;

/**
 * The chat identity's public profile: profile photo (or the avatar generated
 * from the username), bio and status, plus the devices that have used this
 * username in chat. One account can hold several chat usernames; each has its
 * own profile. A photo is stored on the profile as a small square JPEG.
 */
export default function ChatProfileCard({ uid }) {
  const [identities, setIdentities] = useState([]);
  const [selected, setSelected] = useState("");
  const [bio, setBio] = useState("");
  const [status, setStatus] = useState("");
  const [saved, setSaved] = useState({ bio: "", status: "" });
  const [sessions, setSessions] = useState([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: "", msg: "" });
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileRef = useRef(null);
  const photo = useChatPhoto(selected);

  useEffect(() => {
    if (!uid) return;
    authFetch("/api/chat/usernames").then((d) => {
      const items = d.items || [];
      setIdentities(items);
      setSelected((current) => current || items.find((x) => x.isDefault)?.usernameLower || items[0]?.usernameLower || "");
      // The chat page links here as /settings#chat-profile; this card renders
      // after the page has loaded, so the browser's own jump to the hash misses it.
      if (window.location.hash === "#chat-profile") {
        requestAnimationFrame(() => document.getElementById("chat-profile")?.scrollIntoView({ behavior: "smooth" }));
      }
    }).catch(() => {});
  }, [uid]);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    getDoc(doc(db, "chat_profiles", selected)).then((s) => {
      if (cancelled) return;
      const data = s.exists() ? s.data() : {};
      const next = { bio: data.bio || "", status: data.status || "" };
      setBio(next.bio);
      setStatus(next.status);
      setSaved(next);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [selected]);

  useEffect(() => {
    if (!uid || !selected) return;
    return onSnapshot(
      query(collection(db, "chat_sessions"), where("uid", "==", uid), where("usernameLower", "==", selected), limit(50)),
      (s) => setSessions(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => setSessions([])
    );
  }, [uid, selected]);

  // A new session is recorded each time chat opens, so show each device once, newest first.
  const devices = useMemo(() => {
    const latest = new Map();
    for (const s of sessions) {
      const prev = latest.get(s.device);
      if (!prev || (timeOf(s) ?? 0) > (timeOf(prev) ?? 0)) latest.set(s.device, s);
    }
    return [...latest.values()].sort((a, b) => (timeOf(b) ?? 0) - (timeOf(a) ?? 0));
  }, [sessions]);

  const changed = bio !== saved.bio || status !== saved.status;

  const flash = (type, msg) => {
    setMessage({ type, msg });
    setTimeout(() => setMessage({ type: "", msg: "" }), 4000);
  };

  // Profile photo: square-cropped and shrunk here, then saved on the chat profile.
  const uploadPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !selected) return;
    if (!file.type.startsWith("image/")) return flash("error", "Choose a photo (an image file).");
    if (file.size > MAX_UPLOAD_BYTES) return flash("error", "That photo is too big (15 MB max).");
    setPhotoBusy(true);
    try {
      const photoURL = await squarePhoto(file);
      await setDoc(doc(db, "chat_profiles", selected), { photoURL, updatedAt: serverTimestamp() }, { merge: true });
      setChatPhoto(selected, photoURL);
      flash("success", "Profile photo updated.");
    } catch (err) {
      flash("error", `Could not upload the photo: ${err.message}`);
    }
    setPhotoBusy(false);
  };

  const removePhoto = async () => {
    if (!selected || !confirm("Remove your profile photo?")) return;
    setPhotoBusy(true);
    try {
      await setDoc(doc(db, "chat_profiles", selected), { photoURL: "", updatedAt: serverTimestamp() }, { merge: true });
      setChatPhoto(selected, "");
    } catch (err) {
      flash("error", `Could not remove the photo: ${err.message}`);
    }
    setPhotoBusy(false);
  };

  const save = async (e) => {
    e.preventDefault();
    if (!selected || !changed) return;
    setSaving(true);
    try {
      await setDoc(doc(db, "chat_profiles", selected), {
        bio: bio.trim(), status: status.trim(), updatedAt: serverTimestamp(),
      }, { merge: true });
      setSaved({ bio: bio.trim(), status: status.trim() });
      setBio(bio.trim());
      setStatus(status.trim());
      setMessage({ type: "success", msg: "Chat profile saved." });
    } catch (err) {
      setMessage({ type: "error", msg: err.message });
    }
    setSaving(false);
    setTimeout(() => setMessage({ type: "", msg: "" }), 4000);
  };

  return (
    <div id="chat-profile" className="bg-[#142036] rounded-[2rem] p-6 border border-white/5 shadow-xl scroll-mt-6">
      <div className="flex items-center space-x-2 mb-4">
        <MessageSquare size={18} className="text-[#8B1E3F]" />
        <h3 className="font-black italic uppercase text-sm">Chat profile</h3>
      </div>

      {!identities.length ? (
        <p className="text-[10px] text-white/40 font-bold uppercase">Open Chats once to set up your username.</p>
      ) : (
        <>
          {identities.length > 1 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {identities.map((i) => (
                <button
                  key={i.usernameLower}
                  type="button"
                  onClick={() => setSelected(i.usernameLower)}
                  className={`flex items-center gap-1.5 pl-1.5 pr-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${selected === i.usernameLower ? "bg-[#8B1E3F] border-[#8B1E3F]" : "bg-black/30 border-white/10"}`}
                >
                  <Avatar username={i.usernameLower} size={22} rounded="rounded-lg" />@{i.username}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-4 bg-black/20 p-4 rounded-2xl border border-white/5 mb-4">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={photoBusy}
              aria-label="Change profile photo"
              className="relative shrink-0 rounded-2xl"
            >
              <Avatar username={selected} size={64} rounded="rounded-2xl" className="border-2 border-white/10" />
              <span className="absolute -right-1.5 -bottom-1.5 w-7 h-7 rounded-full bg-[#2457D6] ring-4 ring-[#0f1a2c] flex items-center justify-center">
                {photoBusy ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
              </span>
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={uploadPhoto} />
            <div className="min-w-0">
              <p className="font-black italic uppercase text-[#E0708C] truncate">@{identities.find((i) => i.usernameLower === selected)?.username || selected}</p>
              <p className="text-[10px] font-bold text-white/40 mt-1 leading-snug">
                {photo ? "Your profile photo for this username." : "Tap the picture to add a profile photo. Until then you get your own pixel character."}
              </p>
              {photo && (
                <button type="button" onClick={removePhoto} disabled={photoBusy} className="mt-1.5 flex items-center gap-1 text-[10px] font-black uppercase text-red-300/80 hover:text-red-300 disabled:opacity-50">
                  <Trash2 size={11} /> Remove photo
                </button>
              )}
            </div>
          </div>

          <form onSubmit={save} className="space-y-3">
            <div className="bg-black/20 p-4 rounded-2xl border border-white/5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[9px] font-black uppercase text-white/40">Bio</p>
                <span className="text-[9px] font-bold text-white/30">{bio.length}/{BIO_MAX}</span>
              </div>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
                rows={2}
                placeholder="A line about you"
                className="w-full resize-none bg-transparent font-bold text-sm outline-none text-white placeholder:text-white/20"
              />
            </div>
            <div className="bg-black/20 p-4 rounded-2xl border border-white/5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[9px] font-black uppercase text-white/40">Status</p>
                <span className="text-[9px] font-bold text-white/30">{status.length}/{STATUS_MAX}</span>
              </div>
              <input
                value={status}
                onChange={(e) => setStatus(e.target.value.slice(0, STATUS_MAX))}
                placeholder="What are you up to?"
                className="w-full bg-transparent font-bold text-sm outline-none text-white placeholder:text-white/20"
              />
            </div>
            {changed && (
              <button type="submit" disabled={saving} className="w-full bg-[#2457D6] py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-[#2457D6]/20 transition-all active:scale-95 disabled:opacity-50">
                {saving ? "Saving…" : "Save chat profile"}
              </button>
            )}
          </form>

          {message.msg && (
            <div className={`flex items-center p-3 mt-3 rounded-2xl text-[10px] font-black uppercase ${message.type === "success" ? "bg-green-500/10 text-green-500 border border-green-500/20" : "bg-red-500/10 text-red-500 border border-red-500/20"}`}>
              {message.type === "success" ? <CheckCircle size={14} className="mr-2 shrink-0" /> : <AlertCircle size={14} className="mr-2 shrink-0" />}
              {message.msg}
            </div>
          )}

          <div className="mt-5">
            <p className="text-[9px] font-black uppercase text-white/40 mb-2 flex items-center gap-1.5">
              <MonitorSmartphone size={12} /> Devices that used @{selected} in chat
            </p>
            {!devices.length ? (
              <p className="text-[11px] text-white/30 font-bold">None yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {devices.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 bg-black/20 px-3 py-2 rounded-xl border border-white/5" title={s.device}>
                    <span className="text-[11px] font-bold text-white/70 truncate">{deviceLabel(s.device)}</span>
                    <span className="text-[10px] font-bold text-white/30 shrink-0">
                      {timeOf(s) ? `Last active ${timeOf(s).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}` : "Active"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
