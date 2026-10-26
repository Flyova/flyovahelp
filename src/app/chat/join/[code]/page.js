"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Globe, Loader2, Lock, Users } from "lucide-react";
import { authFetch } from "@/lib/authFetch";
import { formatCount } from "@/lib/chat";
import { useChat } from "@/components/chat/ChatProvider";
import { GroupAvatar } from "@/components/chat/GroupForm";

/** What a group invite link opens: the group's name, description and size, and Join. */
export default function JoinGroupPage() {
  const router = useRouter();
  const params = useParams();
  const code = String(params?.code || "");
  const { uid, active, identitiesLoaded, setOpenId, needUsername } = useChat();
  const [group, setGroup] = useState(null);
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!uid || !code) return;
    let live = true;
    authFetch(`/api/chat/groups?code=${encodeURIComponent(code)}&as=${encodeURIComponent(active)}`)
      .then((r) => live && (r.error ? setError(r.error) : setGroup(r.group)))
      .catch(() => live && setError("Could not open this group link."));
    return () => {
      live = false;
    };
  }, [uid, code, active]);

  const openGroup = (id) => {
    setOpenId("groups", id);
    router.push("/chat/groups");
  };

  const join = async () => {
    if (!active) return needUsername();
    setJoining(true);
    const r = await authFetch("/api/chat/conversations", { method: "POST", body: { action: "joinByLink", code, as: active } }).catch((e) => ({ error: e.message }));
    setJoining(false);
    if (r.error) return setError(r.error);
    openGroup(r.id);
  };

  return (
    <div className="max-w-md mx-auto pt-6 pb-10">
      <div className="bg-[#142036] rounded-[2rem] border border-white/5 p-6 flex flex-col items-center text-center">
        {!group && !error && <Loader2 size={24} className="animate-spin text-white/40 my-10" />}
        {error && !group && (
          <>
            <span className="w-14 h-14 rounded-full bg-white/[0.06] flex items-center justify-center text-white/50 mt-2"><Users size={24} /></span>
            <p className="mt-4 text-[15px] font-bold">Can&apos;t open this group</p>
            <p className="mt-1 text-[13px] text-white/55">{error}</p>
            <Link href="/chat/groups" className="mt-5 h-11 px-5 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] flex items-center text-sm font-bold">Find groups</Link>
          </>
        )}
        {group && (
          <>
            <GroupAvatar size={80} groupId={group.id} version={group.photoVersion} />
            <h1 className="mt-4 text-xl font-black leading-tight break-words">{group.groupName}</h1>
            <p className="mt-1.5 flex items-center gap-1.5 text-[13px] text-white/55">
              {group.visibility === "public" ? <Globe size={13} /> : <Lock size={13} />}
              {group.visibility === "public" ? "Public group" : "Private group"} · {formatCount(group.memberCount)} member{group.memberCount === 1 ? "" : "s"}
            </p>
            {group.description && <p className="mt-3 text-[14px] leading-relaxed text-white/80 whitespace-pre-wrap break-words">{group.description}</p>}
            {error && <p className="mt-3 text-[13px] font-semibold text-red-300">{error}</p>}
            {group.isMember ? (
              <button type="button" onClick={() => openGroup(group.id)} className="mt-6 w-full h-12 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] text-[15px] font-bold">
                You&apos;re in this group · Open it
              </button>
            ) : (
              <button type="button" onClick={join} disabled={joining || !identitiesLoaded} className="mt-6 w-full h-12 rounded-xl bg-[#8B1E3F] hover:bg-[#A62A4D] text-[15px] font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                {joining && <Loader2 size={16} className="animate-spin" />} Join group{active ? ` as @${active}` : ""}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
