"use client";
import { useState } from "react";
import { Globe, Lock, Users } from "lucide-react";
import { GROUP_DESCRIPTION_MAX, GROUP_NAME_MAX } from "@/lib/chat";
import { groupPhotoUrl } from "@/lib/groupPhotos";
import ChatSheet from "@/components/chat/ChatSheet";

const VISIBILITY = [
  { key: "public", icon: Globe, title: "Public", text: "Anyone can find it in search and join." },
  { key: "private", icon: Lock, title: "Private", text: "Only people an admin adds can join." },
];

/**
 * A group's picture: its photo when it has one (`groupId` + `version`, the
 * group's photoVersion), else the blue group badge.
 */
export function GroupAvatar({ size = 40, rounded = "rounded-full", groupId = "", version = 0 }) {
  const [broken, setBroken] = useState("");
  const src = groupPhotoUrl(groupId, version);
  if (src && broken !== src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        onError={() => setBroken(src)}
        style={{ width: size, height: size }}
        className={`shrink-0 ${rounded} object-cover bg-[#142036]`}
      />
    );
  }
  return (
    <span style={{ width: size, height: size }} className={`shrink-0 ${rounded} bg-[#2457D6]/25 text-[#8FB0FF] flex items-center justify-center`}>
      <Users size={Math.round(size * 0.45)} />
    </span>
  );
}

/**
 * Group name, description and who can join. `onSubmit(values)` resolves to an
 * error message, or "" on success.
 */
export default function GroupForm({ initial = {}, submitLabel, onSubmit, onCancel }) {
  const [name, setName] = useState(initial.name || "");
  const [description, setDescription] = useState(initial.description || "");
  const [visibility, setVisibility] = useState(initial.visibility === "private" ? "private" : "public");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError("");
    const problem = await onSubmit({ name: name.trim(), description: description.trim(), visibility });
    setBusy(false);
    if (problem) setError(problem);
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block bg-black/20 p-3.5 rounded-2xl border border-white/5">
        <span className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-black uppercase text-white/40">Group name</span>
          <span className="text-[10px] font-bold text-white/30">{name.length}/{GROUP_NAME_MAX}</span>
        </span>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, GROUP_NAME_MAX))}
          placeholder="e.g. Mars Strategy Club"
          className="w-full bg-transparent font-bold text-base md:text-sm outline-none text-white placeholder:text-white/25"
        />
      </label>

      <label className="block bg-black/20 p-3.5 rounded-2xl border border-white/5">
        <span className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-black uppercase text-white/40">Description</span>
          <span className="text-[10px] font-bold text-white/30">{description.length}/{GROUP_DESCRIPTION_MAX}</span>
        </span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, GROUP_DESCRIPTION_MAX))}
          rows={2}
          placeholder="What's this group about? (optional)"
          className="w-full resize-none bg-transparent text-base md:text-sm outline-none text-white placeholder:text-white/25"
        />
      </label>

      <fieldset>
        <legend className="text-[10px] font-black uppercase text-white/40 mb-1.5 px-1">Who can join</legend>
        <div className="grid grid-cols-2 gap-2">
          {VISIBILITY.map(({ key, icon: Icon, title, text }) => (
            <label key={key} className={`cursor-pointer p-3 rounded-2xl border transition-colors ${visibility === key ? "bg-[#8B1E3F]/20 border-[#8B1E3F]" : "bg-black/20 border-white/5 hover:border-white/15"}`}>
              <input type="radio" name="visibility" value={key} checked={visibility === key} onChange={() => setVisibility(key)} className="sr-only" />
              <span className="flex items-center gap-1.5 text-[13px] font-black"><Icon size={14} /> {title}</span>
              <span className="block text-[11px] leading-snug text-white/50 mt-1">{text}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {error && <p className="text-xs text-red-300">{error}</p>}

      <div className="flex gap-2 pt-1">
        {onCancel && (
          <button type="button" onClick={onCancel} className="flex-1 h-11 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-black uppercase">
            Cancel
          </button>
        )}
        <button type="submit" disabled={busy || !name.trim()} className="flex-1 h-11 rounded-xl bg-[#8B1E3F] text-xs font-black uppercase disabled:opacity-50">
          {busy ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

/** "New group" popup. `onCreate(values)` resolves to an error message, or "" on success. */
export function CreateGroupSheet({ onCreate, onClose }) {
  return (
    <ChatSheet label="New group" onClose={onClose}>
      <div className="p-5 pt-6">
        <div className="flex items-center gap-3 mb-4 pr-10">
          <GroupAvatar size={44} rounded="rounded-2xl" />
          <div>
            <h2 className="text-lg font-black leading-tight">New group</h2>
            <p className="text-xs text-white/50">You&apos;ll own it and can make others admins.</p>
          </div>
        </div>
        <GroupForm submitLabel="Create group" onSubmit={onCreate} />
      </div>
    </ChatSheet>
  );
}
