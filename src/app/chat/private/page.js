"use client";
import { useState } from "react";
import { Archive, ArchiveRestore, Ban, ChevronDown, Flag, MessagesSquare, Trash2, UserRound } from "lucide-react";
import { presenceOf } from "@/lib/chat";
import { useChat } from "@/components/chat/ChatProvider";
import Avatar from "@/components/Avatar";
import ConversationList from "@/components/chat/ConversationList";
import ConversationThread, { ThreadPlaceholder } from "@/components/chat/ConversationThread";
import IdentityBar from "@/components/chat/IdentityBar";
import PlayerSearch from "@/components/chat/PlayerSearch";

/**
 * Private chats: only the people you're actually talking to (a chat shows up
 * once it has a message), plus a search to find anyone else and message them.
 * Each chat can be archived (moved to the Archived section) or deleted for you.
 */
export default function PrivateChatsPage() {
  const {
    identities, active, selectIdentity, createUsername, deleteUsername, usernamePrice,
    convos, convosLoading, myNameIn, openIds, setOpenId, setErr, typingIn, unread,
    messagePrivately, openProfile, blockUser, unblockUser, reportUser, presence, presenceNow, blockedNames,
    chatState, archiveChat, deleteChat, isDeletedForMe,
  } = useChat();
  const [showArchived, setShowArchived] = useState(false);
  const openId = openIds.private;
  const open = convos.find((c) => c.id === openId);
  const me = myNameIn(open);
  const other = open ? (open.participants || []).find((p) => p !== me) : null;
  const chats = convos.filter((c) => c.type !== "group" && (c.lastMessage || c.id === openId) && !isDeletedForMe(c));
  const inbox = chats.filter((c) => !chatState.archived[c.id]);
  const archived = chats.filter((c) => chatState.archived[c.id]);
  const archivedUnread = archived.filter((c) => unread[c.id]).length;
  const otherIn = (c) => (c.participants || []).find((p) => p !== myNameIn(c));
  const removeChat = (c) => {
    if (confirm(`Delete your chat with @${otherIn(c)}? Its messages are cleared for you; @${otherIn(c)} keeps theirs.`)) deleteChat(c.id);
  };
  const chatMenu = (c) => [
    chatState.archived[c.id]
      ? { label: "Unarchive", icon: ArchiveRestore, run: () => archiveChat(c.id, false) }
      : { label: "Archive", icon: Archive, run: () => archiveChat(c.id, true) },
    { label: "Delete chat", icon: Trash2, danger: true, run: () => removeChat(c) },
  ];
  const openChat = (id) => setOpenId("private", id);
  const status = other ? presenceOf(presence[other], presenceNow) : null;
  const iBlocked = !!other && blockedNames.includes(other);
  const online = new Set(Object.keys(presence).filter((name) => presenceOf(presence[name], presenceNow)?.online));
  const listProps = {
    loading: convosLoading, typingIn, unread, online, blocked: new Set(blockedNames), myNameIn, openId, onOpen: openChat, rowMenu: chatMenu,
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-4 lg:h-[calc(100vh-14.5rem)] lg:min-h-[520px]">
      {/* identity, search and inbox — hidden on phones while a chat is open */}
      <div className={`lg:col-span-4 flex-col gap-3 min-h-0 ${openId ? "hidden lg:flex" : "flex"}`}>
        <IdentityBar identities={identities} active={active} onSelect={selectIdentity} onCreate={createUsername} onDelete={deleteUsername} price={usernamePrice} />
        <PlayerSearch onPick={messagePrivately} label="Search people · username, name, phone, country" />
        <ConversationList
          {...listProps}
          className="lg:flex-1"
          convos={inbox}
          title="Private chats"
          emptyTitle={archived.length ? "No other chats" : "No private chats yet"}
          emptyText={archived.length ? "Your other chats are archived below." : "Search for a player above and send them a message — they'll show up here."}
        />
        {archived.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setShowArchived((v) => !v)}
              aria-expanded={showArchived}
              className="flex items-center justify-between gap-2 px-4 py-3 rounded-2xl bg-[#142036] border border-white/5 text-left"
            >
              <span className="flex items-center gap-2 text-[13px] font-bold"><Archive size={15} className="text-white/50" /> Archived ({archived.length})</span>
              <span className="flex items-center gap-2">
                {archivedUnread > 0 && <span className="min-w-5 h-5 px-1.5 rounded-full bg-white/15 text-[11px] font-black flex items-center justify-center">{archivedUnread}</span>}
                <ChevronDown size={16} className={`text-white/50 transition-transform ${showArchived ? "rotate-180" : ""}`} />
              </span>
            </button>
            {showArchived && <ConversationList {...listProps} convos={archived} title="Archived chats" />}
          </>
        )}
      </div>

      <section className={`lg:col-span-8 bg-[#142036] md:rounded-2xl md:border border-white/5 overflow-hidden flex-col min-h-0 h-dvh md:h-[calc(100dvh-5.25rem)] lg:h-auto ${openId ? "flex" : "hidden lg:flex"}`}>
        {openId ? (
          <ConversationThread
            key={openId}
            convoId={openId}
            convo={open}
            me={me}
            isGroup={false}
            header={{
              avatar: other && <Avatar username={other} size={40} rounded="rounded-full" />,
              title: other ? `@${other}` : "Private chat",
              subtitle: status?.text || "tap for profile",
              online: !!status?.online,
              label: other ? `View @${other}'s profile` : undefined,
              onClick: other ? () => openProfile(other) : undefined,
            }}
            menuItems={other ? [
              { label: "View profile", icon: UserRound, run: () => openProfile(other) },
              iBlocked
                ? { label: `Unblock @${other}`, icon: Ban, run: () => unblockUser(other) }
                : { label: `Block @${other}`, icon: Ban, danger: true, run: () => blockUser(other) },
              { label: `Report @${other}`, icon: Flag, danger: true, run: () => reportUser(other) },
              ...(open ? chatMenu(open) : []),
            ] : []}
            onBack={() => openChat(null)}
            onError={setErr}
            onReport={(m) => reportUser(m.sender)}
            onOpenProfile={openProfile}
            blockedByMe={iBlocked ? { name: other, onUnblock: () => unblockUser(other) } : null}
          />
        ) : (
          <ThreadPlaceholder icon={MessagesSquare} title="Select a chat" text="Pick a conversation on the left, or search for a player to message them." />
        )}
      </section>
    </div>
  );
}
