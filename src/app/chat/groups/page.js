"use client";
import { useState } from "react";
import { Info, LogOut, Plus, Trash2, Users } from "lucide-react";
import { authFetch } from "@/lib/authFetch";
import { groupOwner, isGroupAdmin } from "@/lib/chat";
import { useChat } from "@/components/chat/ChatProvider";
import ConversationList from "@/components/chat/ConversationList";
import ConversationThread, { ThreadPlaceholder } from "@/components/chat/ConversationThread";
import { CreateGroupSheet, GroupAvatar } from "@/components/chat/GroupForm";
import GroupInfoSheet from "@/components/chat/GroupInfoSheet";
import GroupSearch, { PopularGroups } from "@/components/chat/GroupSearch";
import IdentityBar from "@/components/chat/IdentityBar";

const conversationsApi = (body) => authFetch("/api/chat/conversations", { method: "POST", body });

/**
 * Groups: the groups you're in, a search for public groups to join, and your
 * own groups to create. Each group has one owner; the owner and their admins
 * run it from the group info sheet.
 */
export default function GroupsPage() {
  const {
    identities, active, setActive, createUsername, deleteUsername,
    convos, convosLoading, myNameIn, openIds, setOpenId, setErr, typingIn, unread,
    messagePrivately, openProfile, reportUser, sendCoins,
  } = useChat();
  const [creating, setCreating] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [joining, setJoining] = useState(null); // id of the group being joined

  const openId = openIds.groups;
  const groups = convos.filter((c) => c.type === "group");
  const memberOf = new Set(groups.map((g) => g.id));
  const open = groups.find((c) => c.id === openId);
  const me = myNameIn(open);
  const amOwner = !!open && groupOwner(open) === me;

  const openGroup = (id) => {
    setInfoOpen(false);
    setOpenId("groups", id);
  };

  // An action on the open group; resolves to an error message, or "" on success.
  const act = async (action, body = {}) => {
    const r = await conversationsApi({ action, convoId: openId, as: me, ...body });
    return r.error || "";
  };

  const createGroup = async (values) => {
    if (!active) return "Claim a chat username first.";
    const r = await conversationsApi({ action: "group", as: active, ...values });
    if (r.error) return r.error;
    setCreating(false);
    openGroup(r.id);
    return "";
  };

  const joinGroup = async (group) => {
    setErr("");
    if (!active) return setErr("Claim a chat username first.");
    setJoining(group.id);
    const r = await conversationsApi({ action: "join", convoId: group.id, as: active });
    setJoining(null);
    if (r.error) return setErr(r.error);
    openGroup(group.id);
  };

  const leaveGroup = async () => {
    const ask = amOwner
      ? `Delete ${open.groupName} for everyone? Members lose the group and its messages.`
      : `Leave ${open.groupName}?`;
    if (!confirm(ask)) return;
    const problem = await act(amOwner ? "deleteGroup" : "leave");
    if (problem) return setErr(problem);
    openGroup(null);
  };

  const removeMessage = async (m) => {
    if (!confirm(`Remove @${m.sender}'s message for everyone?`)) return;
    const problem = await act("deleteMessage", { messageId: m.id });
    if (problem) setErr(problem);
  };

  const memberCount = (open?.participants || []).length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-4 lg:h-[calc(100vh-14.5rem)] lg:min-h-[520px]">
      {/* identity, search and your groups — hidden on phones while a group is open */}
      <div className={`lg:col-span-4 flex-col gap-3 min-h-0 lg:overflow-y-auto lg:pr-1 ${openId ? "hidden lg:flex" : "flex"}`}>
        <IdentityBar identities={identities} active={active} onSelect={setActive} onCreate={createUsername} onDelete={deleteUsername} />
        <GroupSearch memberOf={memberOf} joining={joining} onOpen={openGroup} onJoin={joinGroup} />
        <ConversationList
          className="shrink-0"
          convos={groups}
          loading={convosLoading}
          typingIn={typingIn}
          unread={unread}
          myNameIn={myNameIn}
          openId={openId}
          onOpen={openGroup}
          title="Your groups"
          action={(
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex items-center gap-1 h-7 px-2.5 rounded-lg text-[11px] font-black uppercase text-[#E0708C] hover:bg-white/5"
            >
              <Plus size={13} /> New group
            </button>
          )}
          emptyTitle="No groups yet"
          emptyText="Create your own group, or find a public one to join."
        />
        <PopularGroups memberOf={memberOf} joining={joining} onOpen={openGroup} onJoin={joinGroup} />
      </div>

      <section className={`lg:col-span-8 bg-[#142036] md:rounded-2xl md:border border-white/5 overflow-hidden flex-col min-h-0 h-dvh md:h-[calc(100dvh-5.25rem)] lg:h-auto ${openId ? "flex" : "hidden lg:flex"}`}>
        {openId ? (
          <ConversationThread
            key={openId}
            convoId={openId}
            convo={open}
            me={me}
            isGroup
            header={{
              avatar: <GroupAvatar size={40} />,
              title: open?.groupName,
              subtitle: `${memberCount} member${memberCount === 1 ? "" : "s"} · ${open?.visibility === "public" ? "public" : "private"} · tap for info`,
              label: "Group info",
              onClick: () => setInfoOpen(true),
            }}
            menuItems={[
              { label: "Group info & members", icon: Info, run: () => setInfoOpen(true) },
              { label: amOwner ? "Delete group" : "Leave group", icon: amOwner ? Trash2 : LogOut, danger: true, run: leaveGroup },
            ]}
            onBack={() => openGroup(null)}
            onError={setErr}
            onModerate={isGroupAdmin(open, me) ? removeMessage : undefined}
            onMessagePrivately={messagePrivately}
            onReport={(m) => reportUser(m.sender)}
            onOpenProfile={(u) => openProfile(u, { convoId: openId })}
            onSendCoins={(u) => sendCoins(u, { convoId: openId })}
          />
        ) : (
          <ThreadPlaceholder icon={Users} title="Select a group" text="Open one of your groups, search for a public group to join, or create your own." />
        )}
      </section>

      {creating && <CreateGroupSheet onCreate={createGroup} onClose={() => setCreating(false)} />}
      {infoOpen && open && (
        <GroupInfoSheet
          convo={open}
          me={me}
          act={act}
          onClose={() => setInfoOpen(false)}
          onOpenProfile={(p) => {
            setInfoOpen(false);
            openProfile(p, { convoId: openId });
          }}
          onLeave={leaveGroup}
        />
      )}
    </div>
  );
}
