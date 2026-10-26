"use client";
import { useRef, useState } from "react";
import { Camera, Copy, Crown, Loader2, Globe, Link2, Lock, LockKeyhole, LogOut, MoreHorizontal, Pencil, RefreshCw, Share2, Shield, ShieldOff, Trash2, UserMinus } from "lucide-react";
import Avatar from "@/components/Avatar";
import ChatSheet from "@/components/chat/ChatSheet";
import GroupForm, { GroupAvatar } from "@/components/chat/GroupForm";
import PlayerSearch from "@/components/chat/PlayerSearch";
import { SettingsSwitch } from "@/components/chat/SettingsList";
import { groupOwner, isGroupAdmin } from "@/lib/chat";
import { authFetch } from "@/lib/authFetch";
import { squareJpeg } from "@/lib/groupPhotos";
import { useChat } from "@/components/chat/ChatProvider";

const SITE = "https://strawins.com";

/**
 * The group's invite link: anyone with it can join, even a private group. Every
 * member can copy or share it; admins create it, swap it for a new one (the old
 * one stops working) or delete it.
 */
function GroupLink({ convo, amAdmin, act }) {
  const { confirmAction } = useChat();
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState({ type: "", msg: "" });
  const link = convo.inviteCode ? `${SITE}/chat/join/${convo.inviteCode}` : "";

  const run = async (op, done) => {
    setBusy(op);
    const problem = await act("inviteLink", { op });
    setBusy("");
    setNote(problem ? { type: "error", msg: problem } : { type: "success", msg: done });
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setNote({ type: "success", msg: "Link copied." });
    } catch {
      setNote({ type: "error", msg: "Couldn't copy on this device." });
    }
  };
  const share = () => {
    if (navigator.share) navigator.share({ title: convo.groupName, text: `Join ${convo.groupName} on StraWins`, url: link }).catch(() => {});
    else copy();
  };

  return (
    <div className="mt-4">
      <p className="text-[10px] font-black uppercase text-white/40 mb-1.5 px-1">Group link</p>
      <div className="rounded-2xl bg-black/20 p-3">
        {link ? (
          <>
            <p className="flex items-center gap-2 text-[13px] font-semibold text-[#8FB0FF] break-all"><Link2 size={14} className="shrink-0" /> {link}</p>
            <p className="text-[11px] text-white/45 mt-1">Anyone with this link can join{convo.visibility === "public" ? "" : ", even though the group is private"}.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={copy} className="h-9 rounded-xl bg-white/[0.07] hover:bg-white/[0.11] text-[12px] font-bold flex items-center justify-center gap-1.5"><Copy size={13} /> Copy</button>
              <button type="button" onClick={share} className="h-9 rounded-xl bg-white/[0.07] hover:bg-white/[0.11] text-[12px] font-bold flex items-center justify-center gap-1.5"><Share2 size={13} /> Share</button>
              {amAdmin && (
                <>
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={async () => (await confirmAction({ title: "Reset the group link?", message: "The current link stops working and a new one is made.", confirmLabel: "Reset link", danger: false })) && run("reset", "New link made. The old one no longer works.")}
                    className="h-9 rounded-xl bg-white/[0.07] hover:bg-white/[0.11] text-[12px] font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <RefreshCw size={13} className={busy === "reset" ? "animate-spin" : ""} /> Reset link
                  </button>
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={async () => (await confirmAction({ title: "Delete the group link?", message: "The link stops working. You can make a new one later.", confirmLabel: "Delete link" })) && run("delete", "Group link deleted.")}
                    className="h-9 rounded-xl bg-white/[0.07] hover:bg-white/[0.11] text-[12px] font-bold text-[#FF8A9B] flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <Trash2 size={13} /> Delete link
                  </button>
                </>
              )}
            </div>
          </>
        ) : amAdmin ? (
          <>
            <p className="text-[12px] text-white/55">Make a link people can open to join this group.</p>
            <button
              type="button"
              disabled={!!busy}
              onClick={() => run("create", "Group link created.")}
              className="mt-3 w-full h-10 rounded-xl bg-[#8B1E3F] hover:bg-[#A62A4D] text-[12px] font-black uppercase flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Link2 size={14} /> Create group link
            </button>
          </>
        ) : (
          <p className="text-[12px] text-white/50">This group has no link yet. Ask an admin to make one.</p>
        )}
        {note.msg && <p className={`mt-2 text-xs font-bold ${note.type === "error" ? "text-red-300" : "text-emerald-300"}`}>{note.msg}</p>}
      </div>
    </div>
  );
}

/** The group's picture; admins tap it to change it, or remove it. */
function GroupPhoto({ convo, me, amAdmin, onNote }) {
  const { confirmAction } = useChat();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const save = async (photoURL, done) => {
    setBusy(true);
    const r = await authFetch("/api/chat/group-photo", { method: "POST", body: { convoId: convo.id, as: me, photoURL } }).catch((e) => ({ error: e.message }));
    setBusy(false);
    onNote(r.error ? { type: "error", msg: r.error } : { type: "success", msg: done });
  };
  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return onNote({ type: "error", msg: "Choose a photo (an image file)." });
    try {
      await save(await squareJpeg(file), "Group photo updated.");
    } catch (err) {
      setBusy(false);
      onNote({ type: "error", msg: err.message });
    }
  };
  const remove = async () => {
    if (await confirmAction({ title: "Remove the group photo?", confirmLabel: "Remove" })) save("", "Group photo removed.");
  };

  if (!amAdmin) return <GroupAvatar size={88} groupId={convo.id} version={convo.photoVersion} />;
  return (
    <>
      <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} aria-label="Change group photo" className="relative rounded-full">
        <GroupAvatar size={88} groupId={convo.id} version={convo.photoVersion} />
        <span className="absolute -right-1 -bottom-1 w-8 h-8 rounded-full bg-[#2457D6] ring-4 ring-[#142036] flex items-center justify-center">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
        </span>
      </button>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pick} />
      {convo.photoVersion ? (
        <button type="button" onClick={remove} disabled={busy} className="mt-2 text-[11px] font-bold text-red-300/80 hover:text-red-300">Remove photo</button>
      ) : (
        <p className="mt-2 text-[11px] text-white/45">Tap to add a group photo</p>
      )}
    </>
  );
}

const roleRank = (convo, p) => (groupOwner(convo) === p ? 0 : (convo.admins || []).includes(p) ? 1 : 2);

function Badge({ children, tone = "neutral" }) {
  const tones = {
    owner: "bg-amber-400/15 text-amber-300",
    admin: "bg-[#2457D6]/25 text-[#8FB0FF]",
    neutral: "bg-white/10 text-white/60",
  };
  return <span className={`shrink-0 px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wide ${tones[tone]}`}>{children}</span>;
}

/**
 * Group info: name, description, who can join and the member list. The owner
 * and admins edit the group, lock it (only admins can send messages) and add or
 * remove members; only the owner makes or removes admins and deletes the group.
 * Everyone else can leave.
 *
 * `act(action, body)` calls /api/chat/conversations for this group and resolves
 * to an error message, or "" on success. `onLeave` leaves (or, for the owner,
 * deletes) the group.
 */
export default function GroupInfoSheet({ convo, me, act, onClose, onOpenProfile, onLeave }) {
  const [editing, setEditing] = useState(false);
  const [manageOf, setManageOf] = useState(null); // member whose admin actions are showing
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState({ type: "", msg: "" });
  const { confirmAction } = useChat();

  const owner = groupOwner(convo);
  const amOwner = owner === me;
  const amAdmin = isGroupAdmin(convo, me);
  const members = [...(convo.participants || [])].sort((a, b) => roleRank(convo, a) - roleRank(convo, b) || a.localeCompare(b));
  const isPublic = convo.visibility === "public";
  const locked = !!convo.locked;

  const run = async (action, body, done) => {
    setBusy(true);
    setNote({ type: "", msg: "" });
    const problem = await act(action, body);
    setBusy(false);
    if (problem) return setNote({ type: "error", msg: problem });
    if (done) setNote({ type: "success", msg: done });
    setManageOf(null);
  };

  // Someone whose settings say "Ask me first" gets an invite instead of being added.
  const addMember = async (username) => {
    setBusy(true);
    setNote({ type: "", msg: "" });
    const r = await authFetch("/api/chat/conversations", { method: "POST", body: { action: "addMember", convoId: convo.id, as: me, username } })
      .catch((e) => ({ error: e.message }));
    setBusy(false);
    if (r.error) return setNote({ type: "error", msg: r.error });
    setNote({ type: "success", msg: r.invited ? `Invite sent. @${username} joins if they accept it.` : `Added @${username}.` });
  };

  const save = async (values) => {
    const problem = await act("updateGroup", values);
    if (!problem) {
      setEditing(false);
      setNote({ type: "success", msg: "Group updated." });
    }
    return problem;
  };

  // What I may do to member `p`.
  const canToggleAdmin = (p) => amOwner && p !== owner;
  const canRemove = (p) => amAdmin && p !== me && p !== owner && (amOwner || !(convo.admins || []).includes(p));

  return (
    <ChatSheet label={`${convo.groupName} info`} onClose={onClose}>
      <div className="p-5 pt-7">
        <div className="flex flex-col items-center text-center px-6">
          <GroupPhoto convo={convo} me={me} amAdmin={amAdmin} onNote={setNote} />
          <h2 className="mt-3 text-xl font-black leading-tight break-words">{convo.groupName}</h2>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-white/50">
            {isPublic ? <Globe size={12} /> : <Lock size={12} />}
            {isPublic ? "Public group" : "Private group"} · {members.length} member{members.length === 1 ? "" : "s"}
          </p>
          {locked && (
            <p className="mt-1.5 flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-400/10 text-[11px] font-bold text-amber-300">
              <LockKeyhole size={11} /> Locked · only admins can send messages
            </p>
          )}
          {convo.description && !editing && (
            <p className="mt-3 text-[14px] leading-relaxed text-white/80 whitespace-pre-wrap break-words">{convo.description}</p>
          )}
        </div>

        {note.msg && (
          <p className={`mt-4 text-xs font-bold p-2.5 rounded-xl ${note.type === "error" ? "bg-red-500/10 text-red-300" : "bg-emerald-500/10 text-emerald-300"}`}>{note.msg}</p>
        )}

        {amAdmin && (
          <div className="mt-4">
            {editing ? (
              <GroupForm
                initial={{ name: convo.groupName, description: convo.description, visibility: convo.visibility }}
                submitLabel="Save changes"
                onSubmit={save}
                onCancel={() => setEditing(false)}
              />
            ) : (
              <button type="button" onClick={() => setEditing(true)} className="w-full h-10 rounded-xl bg-white/[0.06] hover:bg-white/10 flex items-center justify-center gap-2 text-xs font-black uppercase">
                <Pencil size={14} /> Edit group
              </button>
            )}
            <div className="mt-3 rounded-2xl bg-black/20 overflow-hidden">
              <SettingsSwitch
                icon={LockKeyhole}
                title="Lock group"
                text={locked ? "Only admins can send messages" : "Everyone can send messages"}
                on={locked}
                disabled={busy}
                onChange={(on) => run("lockGroup", { locked: on }, on ? "Group locked. Only admins can send messages." : "Group unlocked. Everyone can send messages.")}
              />
            </div>
          </div>
        )}

        <GroupLink convo={convo} amAdmin={amAdmin} act={act} />

        {amAdmin && (
          <PlayerSearch
            className="mt-3"
            label="Add members"
            placeholder="Search players to add…"
            onPick={addMember}
          />
        )}

        <div className="mt-4">
          <p className="text-[10px] font-black uppercase text-white/40 mb-1.5 px-1">Members</p>
          <ul className="rounded-2xl bg-black/20 divide-y divide-white/5">
            {members.map((p) => {
              const manageable = canToggleAdmin(p) || canRemove(p);
              const isAdmin = (convo.admins || []).includes(p);
              return (
                <li key={p} className="px-2">
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => onOpenProfile(p)} className="min-w-0 flex-1 flex items-center gap-2.5 py-2 text-left">
                      <Avatar username={p} size={34} rounded="rounded-full" />
                      <span className="min-w-0 truncate text-[13px] font-bold">@{p}</span>
                      {p === owner && <Badge tone="owner"><Crown size={9} className="inline -mt-0.5 mr-0.5" />Owner</Badge>}
                      {p !== owner && isAdmin && <Badge tone="admin">Admin</Badge>}
                      {p === me && <Badge>You</Badge>}
                    </button>
                    {manageable && (
                      <button
                        type="button"
                        onClick={() => setManageOf((cur) => (cur === p ? null : p))}
                        aria-expanded={manageOf === p}
                        aria-label={`Manage @${p}`}
                        className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/5"
                      >
                        <MoreHorizontal size={16} />
                      </button>
                    )}
                  </div>
                  {manageOf === p && (
                    <div className="flex flex-wrap gap-2 pb-2.5 pl-11">
                      {canToggleAdmin(p) && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => run("setAdmin", { username: p, admin: !isAdmin }, isAdmin ? `@${p} is no longer an admin.` : `@${p} is now an admin.`)}
                          className="h-8 px-3 rounded-lg bg-white/[0.06] hover:bg-white/10 flex items-center gap-1.5 text-[11px] font-bold disabled:opacity-50"
                        >
                          {isAdmin ? <ShieldOff size={13} /> : <Shield size={13} />} {isAdmin ? "Remove admin" : "Make admin"}
                        </button>
                      )}
                      {canRemove(p) && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={async () => (await confirmAction({ title: `Remove @${p}?`, message: `@${p} will be removed from ${convo.groupName}.`, confirmLabel: "Remove" })) && run("removeMember", { username: p }, `Removed @${p}.`)}
                          className="h-8 px-3 rounded-lg bg-white/[0.06] hover:bg-white/10 flex items-center gap-1.5 text-[11px] font-bold text-[#FF8A9B] disabled:opacity-50"
                        >
                          <UserMinus size={13} /> Remove from group
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <button type="button" disabled={busy} onClick={onLeave} className="mt-4 w-full h-11 rounded-xl bg-white/[0.05] hover:bg-white/10 flex items-center justify-center gap-2 text-xs font-black uppercase text-[#FF8A9B] disabled:opacity-50">
          {amOwner ? <Trash2 size={15} /> : <LogOut size={15} />} {amOwner ? "Delete group" : "Leave group"}
        </button>
      </div>
    </ChatSheet>
  );
}
