"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { doc, onSnapshot } from "firebase/firestore";
import {
  ArrowLeft, Ban, BadgeCheck, Bell, BellOff, ChevronRight, Coins, Copy, Crown, Flag, Globe, Loader2, MapPin, Mars, MessageCircle,
  Pencil, Radio, Share2, ShieldCheck, Store, UserPlus, Users, Venus, X,
} from "lucide-react";
import { db } from "@/lib/firebase";
import { authFetch } from "@/lib/authFetch";
import { avatarUrl } from "@/lib/avatar";
import { formatCoins, isGroupAdmin, norm, presenceOf } from "@/lib/chat";
import { useChatPhoto } from "@/lib/chatPhotos";
import { useChat } from "@/components/chat/ChatProvider";
import Avatar from "@/components/Avatar";
import ChatSheet from "@/components/chat/ChatSheet";
import { GroupAvatar } from "@/components/chat/GroupForm";

function Card({ title, icon: Icon, children }) {
  return (
    <section className="bg-[#142036] rounded-[2rem] p-5 border border-white/5">
      <h2 className="flex items-center gap-2 mb-3 text-[11px] font-black uppercase tracking-wider text-white/45">
        <Icon size={14} /> {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ icon: Icon, children, onClick, danger = false, disabled = false, trailing = null }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      {...(onClick ? { type: "button", onClick, disabled } : {})}
      className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left text-[14px] disabled:opacity-40 ${onClick ? "hover:bg-white/[0.05]" : ""} ${danger ? "text-[#FF8A9B]" : ""}`}
    >
      <Icon size={17} className={danger ? "" : "text-white/45"} />
      <span className="min-w-0 flex-1">{children}</span>
      {trailing}
    </Tag>
  );
}

const BADGES = {
  verified: { label: "Verified", icon: BadgeCheck, className: "bg-[#2457D6]/25 text-[#8FB0FF]" },
  agent: { label: "StraWins Agent", icon: Store, className: "bg-emerald-500/15 text-emerald-300" },
  staff: { label: "StraWins Team", icon: Crown, className: "bg-amber-400/15 text-amber-300" },
};

function BadgePill({ label, icon: Icon, className }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black ${className}`}>
      <Icon size={12} /> {label}
    </span>
  );
}

/**
 * A player's full profile page: photo (tap to view it big), badges, online
 * status, bio and details, groups you share and their public groups, and
 * everything you can do with them — message, send coins (in the Chatroom or a
 * shared group), add them to a group you run, mute their messages, share their
 * profile, block or report. Never shows their real name or join date.
 */
export default function PlayerProfilePage() {
  const router = useRouter();
  const params = useParams();
  const name = norm(decodeURIComponent(String(params?.username || ""))).replace(/^@/, "");
  const {
    uid, active, convos, myNameIn, messagePrivately, sendCoins, blockUser, unblockUser, reportUser, blockedNames, setOpenId,
    settingsFor, updateSettings, setErr,
  } = useChat();
  const [viewingPhoto, setViewingPhoto] = useState(false);
  const photo = useChatPhoto(name);
  const [joining, setJoining] = useState(null); // public group id being joined
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState(null); // online / last seen
  const [choosingCoins, setChoosingCoins] = useState(false);
  const [note, setNote] = useState("");
  const [adding, setAdding] = useState(null); // group id being added to

  useEffect(() => {
    if (!uid || !name) return;
    let live = true;
    // `as`: which of their public groups the username you're using is already in.
    authFetch(`/api/chat/profile?u=${encodeURIComponent(name)}&as=${encodeURIComponent(active)}`)
      .then((r) => live && (r.error ? setError(r.error) : setProfile(r)))
      .catch(() => live && setError("Could not load this profile."));
    return () => {
      live = false;
    };
  }, [uid, name, active]);

  useEffect(() => {
    if (!uid || !name) return;
    return onSnapshot(doc(db, "chat_presence", name), (s) => setStatus(presenceOf(s.data(), Date.now())), () => {});
  }, [uid, name]);

  const flash = (msg) => {
    setNote(msg);
    setTimeout(() => setNote(""), 2500);
  };

  const groups = convos.filter((c) => c.type === "group");
  const shared = groups.filter((g) => (g.participants || []).includes(name));
  const canAddTo = groups.filter((g) => !(g.participants || []).includes(name) && isGroupAdmin(g, myNameIn(g)));
  const blocked = blockedNames.includes(name);
  const asks = profile?.groupAdds !== "everyone"; // adding them sends an invite they accept or decline
  const isYou = !!profile?.isYou;
  const ready = !!active; // your chat username has loaded (actions need it)
  // Muting belongs to the chat profile you're using.
  const muted = settingsFor(active).sounds.people?.[name] === false;
  const theirGroups = (profile?.publicGroups || []).filter((g) => !g.isMember && !shared.some((s) => s.id === g.id));

  const toggleMute = () =>
    updateSettings(active, { sounds: { people: { [name]: muted } } })
      .then(() => flash(muted ? `Sounds on for @${name}.` : `@${name} muted: no sound for their messages.`))
      .catch((e) => setErr(`Could not save: ${e.message}`));

  const joinGroup = async (g) => {
    setJoining(g.id);
    const r = await authFetch("/api/chat/conversations", { method: "POST", body: { action: "join", convoId: g.id, as: active } })
      .catch((e) => ({ error: e.message }));
    setJoining(null);
    if (r.error) return flash(r.error);
    openGroup(g.id);
  };

  const openGroup = (id) => {
    setOpenId("groups", id);
    router.push("/chat/groups");
  };

  const addToGroup = async (g) => {
    setAdding(g.id);
    const r = await authFetch("/api/chat/conversations", { method: "POST", body: { action: "addMember", convoId: g.id, as: myNameIn(g), username: name } })
      .catch((e) => ({ error: e.message }));
    setAdding(null);
    flash(r.error || (r.invited ? `Invite sent. @${name} can join ${g.groupName} or decline.` : `Added @${name} to ${g.groupName}.`));
  };

  const copy = async (text, done) => {
    try {
      await navigator.clipboard.writeText(text);
      flash(done);
    } catch {
      flash("Couldn't copy on this device.");
    }
  };

  const share = async () => {
    const link = `${window.location.origin}/chat/u/${name}`;
    if (navigator.share) {
      navigator.share({ title: `@${name} on StraWins`, url: link }).catch(() => {});
    } else {
      copy(link, "Profile link copied.");
    }
  };

  return (
    <div className="max-w-2xl space-y-4 pb-6">
      <button type="button" onClick={() => router.back()} className="flex items-center gap-1.5 h-9 pl-2 pr-3.5 rounded-xl bg-[#142036] border border-white/10 text-xs font-black uppercase text-white/80 hover:text-white">
        <ArrowLeft size={15} /> Back
      </button>

      <div className="bg-[#142036] rounded-[2rem] border border-white/5 overflow-hidden">
        <div className="h-28 sm:h-36 bg-gradient-to-br from-[#8B1E3F] via-[#4A1A3A] to-[#2457D6]/70" />
        <div className="px-5 pb-6 -mt-14 flex flex-col items-center text-center">
          <div className="relative p-1 rounded-full bg-[#142036]">
            <button type="button" onClick={() => setViewingPhoto(true)} aria-label={`View @${name}'s picture`} className="block rounded-full">
              <Avatar username={name} size={112} rounded="rounded-full" />
            </button>
            {status?.online && <span className="absolute right-2 bottom-2 w-5 h-5 rounded-full bg-emerald-400 ring-4 ring-[#142036]" aria-label="online" />}
          </div>
          <h1 className="mt-3 text-2xl font-black leading-tight break-all">@{profile?.username || name}</h1>
          {profile?.badges?.length > 0 && (
            <div className="mt-2 flex flex-wrap justify-center gap-1.5">
              {profile.badges.map((b) => BADGES[b] && <BadgePill key={b} {...BADGES[b]} />)}
            </div>
          )}
          {status && !isYou && (
            <p className={`text-xs mt-1 ${status.online ? "text-emerald-400 font-bold" : "text-white/45"}`}>{status.online ? "Online now" : status.text.replace(/^last/, "Last")}</p>
          )}
          <div className="mt-2.5 flex flex-wrap justify-center gap-2">
            {profile?.status && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.06] text-xs text-white/80">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> {profile.status}
              </span>
            )}
            {profile?.coins != null && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-br from-[#F6C453] to-[#D18E1F] text-[#2B1800] text-xs font-black">
                <Coins size={13} /> {formatCoins(profile.coins)} coins
              </span>
            )}
          </div>

          {!profile && !error && <Loader2 size={22} className="animate-spin text-white/40 mt-6" />}
          {error && <p className="text-sm text-red-300 mt-5">{error}</p>}

          {profile && (
            <div className="mt-5 w-full grid grid-cols-2 gap-2">
              {isYou ? (
                <Link href="/chat/settings" className="col-span-2 h-11 rounded-xl bg-white/10 hover:bg-white/15 flex items-center justify-center gap-2 text-sm font-black uppercase">
                  <Pencil size={16} /> Edit your profile
                </Link>
              ) : (
                <>
                  <button type="button" disabled={!ready} onClick={() => messagePrivately(name)} className="disabled:opacity-50 h-11 rounded-xl bg-gradient-to-br from-[#A0284D] to-[#6E1732] flex items-center justify-center gap-2 text-sm font-black uppercase">
                    <MessageCircle size={17} /> Message
                  </button>
                  <button type="button" disabled={!ready} onClick={() => setChoosingCoins(true)} className="disabled:opacity-50 h-11 rounded-xl bg-gradient-to-br from-[#F6C453] to-[#D18E1F] text-[#2B1800] flex items-center justify-center gap-2 text-sm font-black uppercase">
                    <Coins size={17} /> Send coins
                  </button>
                </>
              )}
            </div>
          )}
          {note && <p className="mt-3 text-xs font-bold text-emerald-300">{note}</p>}
        </div>
      </div>

      {profile && (
        <>
          <Card title="About" icon={ShieldCheck}>
            {profile.bio ? (
              <p className="px-3 pb-2 text-[14px] leading-relaxed text-white/85 whitespace-pre-wrap break-words">{profile.bio}</p>
            ) : (
              <p className="px-3 pb-2 text-[13px] text-white/40">No bio yet.</p>
            )}
            <div className="divide-y divide-white/5">
              {profile.gender && <Row icon={profile.gender === "female" ? Venus : Mars}>{profile.gender === "female" ? "Female" : "Male"}</Row>}
              {profile.country && <Row icon={MapPin}>{profile.country}</Row>}
              {status && !isYou && <Row icon={Radio}>{status.online ? "Online now" : status.text.replace(/^last/, "Last")}</Row>}
            </div>
          </Card>

          {!isYou && (
            <Card title={`Groups in common${shared.length ? ` · ${shared.length}` : ""}`} icon={Users}>
              {shared.length ? (
                <div className="divide-y divide-white/5">
                  {shared.map((g) => (
                    <button key={g.id} type="button" onClick={() => openGroup(g.id)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-white/[0.05]">
                      <GroupAvatar size={36} rounded="rounded-xl" groupId={g.id} version={g.photoVersion} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-bold truncate">{g.groupName}</span>
                        <span className="block text-[11px] text-white/45">{(g.participants || []).length} members</span>
                      </span>
                      <ChevronRight size={16} className="text-white/35" />
                    </button>
                  ))}
                </div>
              ) : (
                <p className="px-3 text-[13px] text-white/40">You&apos;re not in any groups together yet.</p>
              )}
            </Card>
          )}

          {!isYou && theirGroups.length > 0 && (
            <Card title="Their public groups" icon={Globe}>
              <div className="divide-y divide-white/5">
                {theirGroups.map((g) => (
                  <div key={g.id} className="flex items-center gap-3 px-3 py-2.5">
                    <GroupAvatar size={36} rounded="rounded-xl" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-bold truncate">{g.groupName}</span>
                      <span className="block text-[11px] text-white/45">{g.memberCount} member{g.memberCount === 1 ? "" : "s"}</span>
                    </span>
                    <button type="button" disabled={joining === g.id || !ready} onClick={() => joinGroup(g)} className="shrink-0 h-8 px-3 rounded-lg bg-[#8B1E3F] text-[11px] font-black uppercase disabled:opacity-50">
                      {joining === g.id ? "…" : "Join"}
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {!isYou && canAddTo.length > 0 && profile.allowsGroupAdds === false && (
            <Card title="Add to a group you run" icon={UserPlus}>
              <p className="px-3 text-[13px] text-white/55">@{name} only joins groups themselves. Send them your group&apos;s link instead (Group info → Group link).</p>
            </Card>
          )}

          {!isYou && canAddTo.length > 0 && profile.allowsGroupAdds !== false && (
            <Card title={asks ? "Invite to a group you run" : "Add to a group you run"} icon={UserPlus}>
              {asks && <p className="px-3 pb-1 text-[13px] text-white/55">@{name} decides: they get an invite to join or decline.</p>}
              <div className="divide-y divide-white/5">
                {canAddTo.map((g) => (
                  <div key={g.id} className="flex items-center gap-3 px-3 py-2.5">
                    <GroupAvatar size={36} rounded="rounded-xl" groupId={g.id} version={g.photoVersion} />
                    <span className="min-w-0 flex-1 text-[14px] font-bold truncate">{g.groupName}</span>
                    <button type="button" disabled={adding === g.id} onClick={() => addToGroup(g)} className="shrink-0 h-8 px-3 rounded-lg bg-[#8B1E3F] text-[11px] font-black uppercase disabled:opacity-50">
                      {adding === g.id ? "…" : asks ? "Invite" : "Add"}
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card title="More" icon={Share2}>
            <div className="divide-y divide-white/5">
              {!isYou && (
                <Row icon={muted ? Bell : BellOff} onClick={toggleMute}>{muted ? `Unmute @${name}` : `Mute @${name}`}</Row>
              )}
              <Row icon={Copy} onClick={() => copy(`@${name}`, "Username copied.")}>Copy username</Row>
              <Row icon={Share2} onClick={share}>Share profile</Row>
              {!isYou && (blocked ? (
                <Row icon={Ban} disabled={!ready} onClick={() => unblockUser(name)}>Unblock @{name}</Row>
              ) : (
                <Row icon={Ban} danger disabled={!ready} onClick={() => blockUser(name)}>Block @{name}</Row>
              ))}
              {!isYou && <Row icon={Flag} danger disabled={!ready} onClick={() => reportUser(name)}>Report @{name}</Row>}
            </div>
          </Card>
        </>
      )}

      {viewingPhoto && (
        <div className="chat-backdrop fixed inset-0 z-[350] bg-[#060b14]/95 backdrop-blur-sm flex items-center justify-center p-3" role="dialog" aria-modal="true" aria-label={`@${name}'s picture`} onClick={() => setViewingPhoto(false)}>
          <button type="button" aria-label="Close" className="absolute right-4 top-4 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"><X size={20} /></button>
          <div className="chat-pop w-[min(94vw,560px)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo || avatarUrl(name)}
              alt={`@${name}`}
              className="w-full aspect-square rounded-3xl bg-[#142036] object-cover"
              style={photo ? undefined : { imageRendering: "pixelated" }}
            />
            <p className="mt-3 text-center font-black">@{profile?.username || name}</p>
          </div>
        </div>
      )}

      {choosingCoins && (
        <ChatSheet label="Where to send coins" onClose={() => setChoosingCoins(false)}>
          <div className="p-5 pt-7">
            <h2 className="text-lg font-black pr-10">Send coins to @{name}</h2>
            <p className="text-xs text-white/50 mt-0.5 mb-4">Coins are sent in the Chatroom or a group you share, where everyone sees the coin card.</p>
            <div className="space-y-1.5">
              {[{ id: null, label: "Chatroom", sub: "Everyone" }, ...shared.map((g) => ({ id: g.id, label: g.groupName, sub: "Group" }))].map((c) => (
                <button
                  key={c.id || "room"}
                  type="button"
                  onClick={() => {
                    setChoosingCoins(false);
                    sendCoins(name, c.id ? { convoId: c.id } : {});
                  }}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl bg-black/20 hover:bg-white/[0.06] text-left"
                >
                  {c.id ? <GroupAvatar size={34} rounded="rounded-xl" /> : <span className="w-[34px] h-[34px] rounded-xl bg-[#8B1E3F]/40 flex items-center justify-center"><Radio size={16} /></span>}
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-bold truncate">{c.label}</span>
                    <span className="block text-[11px] text-white/45">{c.sub}</span>
                  </span>
                  <ChevronRight size={16} className="text-white/35" />
                </button>
              ))}
            </div>
          </div>
        </ChatSheet>
      )}
    </div>
  );
}
