"use client";
import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { authFetch } from "@/lib/authFetch";
import { useChat } from "@/components/chat/ChatProvider";
import { GroupAvatar } from "@/components/chat/GroupForm";

const REFRESH_MS = 60_000;
const keyOf = (invite) => `${invite.id}:${invite.name}`;

/**
 * Group invites waiting for any of your usernames: an admin added a player whose
 * chat settings say "Ask me first" (lib/groupInvites). Loaded from the server,
 * again whenever the page comes back into view, and every minute while it shows.
 */
export function useGroupInvites() {
  const { uid } = useChat();
  const [invites, setInvites] = useState([]);

  const load = useCallback(async () => {
    const r = await authFetch("/api/chat/group-invites").catch(() => null);
    if (r?.items) setInvites(r.items);
  }, []);

  useEffect(() => {
    if (!uid) return;
    const refresh = () => document.visibilityState === "visible" && load();
    refresh();
    document.addEventListener("visibilitychange", refresh);
    const timer = setInterval(refresh, REFRESH_MS);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      clearInterval(timer);
    };
  }, [uid, load]);

  // Joins (accept) or declines one, as the username invited; resolves to an error message, or "" on success.
  const respond = useCallback(async (invite, accept) => {
    const r = await authFetch("/api/chat/conversations", {
      method: "POST",
      body: { action: accept ? "acceptInvite" : "declineInvite", convoId: invite.id, as: invite.name },
    }).catch((e) => ({ error: e.message }));
    if (r.error) {
      load(); // it may have gone (group deleted, invite withdrawn)
      return r.error;
    }
    setInvites((list) => list.filter((i) => keyOf(i) !== keyOf(invite)));
    return "";
  }, [load]);

  return { invites, respond };
}

/** The invites as a card: join each group, or decline. `onJoined(invite)` opens the group. */
export function GroupInvites({ invites, respond, active, onJoined }) {
  const [busy, setBusy] = useState(""); // key of the invite being answered
  const [error, setError] = useState("");
  if (!invites.length) return null;

  const answer = async (invite, accept) => {
    setBusy(keyOf(invite));
    setError("");
    const problem = await respond(invite, accept);
    setBusy("");
    if (problem) return setError(problem);
    if (accept) onJoined(invite);
  };

  return (
    <section aria-label="Group invites" className="shrink-0 bg-[#142036] rounded-2xl border border-white/5">
      <p className="px-4 pt-3.5 pb-2 text-[10px] font-black uppercase tracking-wider text-white/40">Group invites ({invites.length})</p>
      <ul className="px-2 pb-2">
        {invites.map((i) => {
          const key = keyOf(i);
          const name = i.groupName || "Group";
          return (
            <li key={key} className="flex items-center gap-3 rounded-xl px-2.5 py-2.5">
              <GroupAvatar size={44} rounded="rounded-xl" groupId={i.id} version={i.photoVersion} />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-bold truncate">{name}</span>
                <span className="block text-[12px] text-white/50 truncate">
                  {i.name !== active && `For @${i.name} · `}Invited by @{i.by} · {i.memberCount} member{i.memberCount === 1 ? "" : "s"}
                </span>
              </span>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => answer(i, false)}
                aria-label={`Decline the invite to ${name}`}
                className="shrink-0 w-9 h-9 rounded-lg bg-white/[0.06] hover:bg-white/10 text-white/70 flex items-center justify-center disabled:opacity-50"
              >
                <X size={16} />
              </button>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => answer(i, true)}
                aria-label={`Join ${name}`}
                className="shrink-0 h-9 px-3.5 rounded-lg bg-[#8B1E3F] text-[11px] font-black uppercase disabled:opacity-50"
              >
                {busy === key ? "…" : "Join"}
              </button>
            </li>
          );
        })}
      </ul>
      {error && <p role="alert" className="px-4 pb-3 text-[12px] text-[#FF8A9B]">{error}</p>}
    </section>
  );
}
