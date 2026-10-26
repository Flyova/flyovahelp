"use client";
import { useState } from "react";
import { Archive, ArchiveRestore, ChevronDown, Info, LogOut, Plus, Trash2, Users } from "lucide-react";
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
    identities, active, selectIdentity,
    convos, convosLoading, myNameIn, openIds, setOpenId, setErr, typingIn, unread,
    messagePrivately, openProfile, reportUser, sendCoins, blockUser, chatState, archiveChat, confirmAction,
  } = useChat();
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [joining, setJoining] = useState(null); // id of the group being joined

  const openId = openIds.groups;
  const groups = convos.filter((c) => c.type === "group");
  const inbox = groups.filter((g) => !chatState.archived[g.id]);
  const archived = groups.filter((g) => chatState.archived[g.id]);
  const archiveItem = (g) => (chatState.archived[g.id]
    ? { label: "Unarchive", icon: ArchiveRestore, run: () => archiveChat(g.id, false) }
    : { label: "Archive", icon: Archive, run: () => archiveChat(g.id, true) });
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
    const ok = await confirmAction(amOwner
      ? { title: `Delete ${open.groupName}?`, message: "Members lose the group and its messages. This can't be undone.", confirmLabel: "Delete group" }
      : { title: `Leave ${open.groupName}?`, confirmLabel: "Leave group" });
    if (!ok) return;
    const problem = await act(amOwner ? "deleteGroup" : "leave");
    if (problem) return setErr(problem);
    openGroup(null);
  };

  const removeMessage = async (m) => {
    if (!(await confirmAction({ title: "Remove this message?", message: `@${m.sender}'s message is removed for everyone in the group.`, confirmLabel: "Remove" }))) return;
    const problem = await act("deleteMessage", { messageId: m.id });
    if (problem) setErr(problem);
  };

  const memberCount = (open?.participants || []).length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-4 lg:h-[calc(100vh-14.5rem)] lg:min-h-[520px]">
      {/* identity, search and your groups — hidden on phones while a group is open */}
      <div className={`lg:col-span-4 flex-col gap-3 min-h-0 lg:overflow-y-auto lg:pr-1 ${openId ? "hidden lg:flex" : "flex"}`}>
        <IdentityBar identities={identities} active={active} onSelect={selectIdentity} />
        <GroupSearch memberOf={memberOf} joining={joining} onOpen={openGroup} onJoin={joinGroup} />
        <ConversationList
          className="shrink-0"
          convos={inbox}
          loading={convosLoading}
          typingIn={typingIn}
          unread={unread}
          myNameIn={myNameIn}
          openId={openId}
          onOpen={openGroup}
          rowMenu={(g) => [archiveItem(g)]}
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
          emptyTitle={archived.length ? "No other groups" : "No groups yet"}
          emptyText={archived.length ? "Your other groups are archived below." : "Create your own group, or find a public one to join."}
        />
        {archived.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setShowArchived((v) => !v)}
              aria-expanded={showArchived}
              className="shrink-0 flex items-center justify-between gap-2 px-4 py-3 rounded-2xl bg-[#142036] border border-white/5 text-left"
            >
              <span className="flex items-center gap-2 text-[13px] font-bold"><Archive size={15} className="text-white/50" /> Archived groups ({archived.length})</span>
              <ChevronDown size={16} className={`text-white/50 transition-transform ${showArchived ? "rotate-180" : ""}`} />
            </button>
            {showArchived && (
              <ConversationList
                className="shrink-0"
                convos={archived}
                typingIn={typingIn}
                unread={unread}
                myNameIn={myNameIn}
                openId={openId}
                onOpen={openGroup}
                rowMenu={(g) => [archiveItem(g)]}
                title="Archived groups"
              />
            )}
          </>
        )}
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
              avatar: <GroupAvatar size={44} groupId={openId} version={open?.photoVersion} />,
              title: open?.groupName,
              subtitle: `${memberCount} member${memberCount === 1 ? "" : "s"} · ${open?.visibility === "public" ? "public" : "private"} · tap for info`,
              label: "Group info",
              onClick: () => setInfoOpen(true),
            }}
            menuItems={[
              { label: "Group info & members", icon: Info, run: () => setInfoOpen(true) },
              ...(open ? [archiveItem(open)] : []),
              { label: amOwner ? "Delete group" : "Leave group", icon: amOwner ? Trash2 : LogOut, danger: true, run: leaveGroup },
            ]}
            onBack={() => openGroup(null)}
            onError={setErr}
            onModerate={isGroupAdmin(open, me) ? removeMessage : undefined}
            onMessagePrivately={messagePrivately}
            onReport={(m) => reportUser(m.sender)}
            onOpenProfile={(u) => openProfile(u, { convoId: openId })}
            onSendCoins={(u) => sendCoins(u, { convoId: openId })}
            onBlock={blockUser}
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
