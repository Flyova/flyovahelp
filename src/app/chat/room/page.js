"use client";
import { useChat } from "@/components/chat/ChatProvider";
import ChatRoom from "@/components/chat/ChatRoom";
import IdentityBar from "@/components/chat/IdentityBar";

/** The public chatroom: one room for every signed-in player. */
export default function ChatroomPage() {
  const { uid, identities, active, selectIdentity, blockedNames, messagePrivately, reportUser, openProfile, sendCoins, soundOn, blockUser } = useChat();

  const reportMessage = (m) =>
    reportUser(m.sender, { room: "public", messageId: m.id, messageText: String(m.text || "").slice(0, 500) });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-4">
      <div className="lg:col-span-3">
        <IdentityBar identities={identities} active={active} onSelect={selectIdentity} />
      </div>
      <div className="lg:col-span-9">
        <ChatRoom
          uid={uid}
          active={active}
          blocked={blockedNames}
          sound={soundOn("room")}
          onMessagePrivately={messagePrivately}
          onReport={reportMessage}
          onOpenProfile={(u) => openProfile(u, {})}
          onSendCoins={(u) => sendCoins(u)}
          onBlock={blockUser}
        />
      </div>
    </div>
  );
}
