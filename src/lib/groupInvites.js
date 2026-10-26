import { isGroupAdmin } from "@/lib/chat";

// Group invites. When an admin adds a player whose chat settings say "Ask me first"
// (groupAdds "ask", the default), the player gets an invite instead of being added:
// group_invites/{convoId}__{username} = { convoId, name, by, createdAt }, where
// `name` is the invited username and `by` the admin who sent it. Server only; the
// invited player lists them with /api/chat/group-invites and accepts or declines
// with /api/chat/conversations.

export const groupInviteRef = (db, convoId, name) => db.collection("group_invites").doc(`${convoId}__${name}`);

/**
 * Pending invites for `names` (usernames), newest first, with the group each is
 * for. Invites that no longer apply (the group is gone, they're in it already, or
 * whoever sent it isn't an admin any more) are deleted instead.
 */
export async function groupInvitesFor(db, names) {
  if (!names.length) return [];
  const pages = await Promise.all(names.map((name) => db.collection("group_invites").where("name", "==", name).get()));
  const invites = pages.flatMap((p) => p.docs);
  if (!invites.length) return [];

  const ids = [...new Set(invites.map((d) => d.data().convoId))];
  const groups = await db.getAll(...ids.map((id) => db.collection("conversations").doc(id)));
  const byId = new Map(groups.filter((g) => g.exists).map((g) => [g.id, g.data()]));

  const live = [];
  const stale = [];
  for (const d of invites) {
    const { convoId, name, by, createdAt } = d.data();
    const g = byId.get(convoId);
    if (!g || g.deleted || g.type !== "group" || (g.participants || []).includes(name) || !isGroupAdmin(g, by)) {
      stale.push(d.ref);
      continue;
    }
    live.push({
      id: convoId,
      name,
      by,
      groupName: g.groupName || "",
      description: g.description || "",
      visibility: g.visibility === "public" ? "public" : "private",
      memberCount: (g.participants || []).length,
      photoVersion: g.photoVersion || 0,
      createdAt: createdAt?.toMillis?.() || 0,
    });
  }
  if (stale.length) {
    const batch = db.batch();
    stale.forEach((ref) => batch.delete(ref));
    await batch.commit().catch((e) => console.error("Clearing old group invites failed:", e));
  }
  return live.sort((a, b) => b.createdAt - a.createdAt);
}
