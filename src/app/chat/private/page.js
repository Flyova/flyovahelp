"use client";
import { Ban, Flag, MessagesSquare, UserRound } from "lucide-react";
import { useChat } from "@/components/chat/ChatProvider";
import Avatar from "@/components/Avatar";
import ConversationList from "@/components/chat/ConversationList";
import ConversationThread, { ThreadPlaceholder } from "@/components/chat/ConversationThread";
import IdentityBar from "@/components/chat/IdentityBar";
import PlayerSearch from "@/components/chat/PlayerSearch";

/**
 * Private chats: only the people you're actually talking to (a chat shows up
 * once it has a message), plus a search to find anyone else and message them.
 */
export default function PrivateChatsPage() {
  const {
    identities, active, setActive, createUsername, deleteUsername,
    convos, convosLoading, myNameIn, openIds, setOpenId, setErr,
    messagePrivately, openProfile, blockUser, reportUser,
  } = useChat();
  const openId = openIds.private;
  const open = convos.find((c) => c.id === openId);
  const me = myNameIn(open);
  const other = open ? (open.participants || []).find((p) => p !== me) : null;
  const chats = convos.filter((c) => c.type !== "group" && (c.lastMessage || c.id === openId));
  const openChat = (id) => setOpenId("private", id);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-4 lg:h-[calc(100vh-14.5rem)] lg:min-h-[520px]">
      {/* identity, search and inbox — hidden on phones while a chat is open */}
      <div className={`lg:col-span-4 flex-col gap-3 min-h-0 ${openId ? "hidden lg:flex" : "flex"}`}>
        <IdentityBar identities={identities} active={active} onSelect={setActive} onCreate={createUsername} onDelete={deleteUsername} />
        <PlayerSearch onPick={messagePrivately} label="Search people · username, name, phone, country" />
        <ConversationList
          className="lg:flex-1"
          convos={chats}
          loading={convosLoading}
          myNameIn={myNameIn}
          openId={openId}
          onOpen={openChat}
          title="Private chats"
          emptyTitle="No private chats yet"
          emptyText="Search for a player above and send them a message — they'll show up here."
        />
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
              subtitle: "tap for profile",
              label: other ? `View @${other}'s profile` : undefined,
              onClick: other ? () => openProfile(other) : undefined,
            }}
            menuItems={other ? [
              { label: "View profile", icon: UserRound, run: () => openProfile(other) },
              { label: `Block @${other}`, icon: Ban, danger: true, run: () => blockUser(other) },
              { label: `Report @${other}`, icon: Flag, danger: true, run: () => reportUser(other) },
            ] : []}
            onBack={() => openChat(null)}
            onError={setErr}
            onReport={(m) => reportUser(m.sender)}
            onOpenProfile={openProfile}
          />
        ) : (
          <ThreadPlaceholder icon={MessagesSquare} title="Select a chat" text="Pick a conversation on the left, or search for a player to message them." />
        )}
      </section>
    </div>
  );
}
