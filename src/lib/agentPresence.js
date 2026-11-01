// Agents show players whether they're around: while an agent has the site or app open
// it stamps users/{uid}.activeAt every AGENT_HEARTBEAT_MS (Header; the app's
// AuthContext), and /api/trades calls them online for AGENT_ONLINE_MS after.
// (users.lastSeen is the friends-game lobby's, so it isn't used here.)

export const AGENT_HEARTBEAT_MS = 2 * 60 * 1000;
export const AGENT_ONLINE_MS = 5 * 60 * 1000;

/** { online, lastSeenAt } from an agent's users doc: lastSeenAt in ms, or null if never. */
export function agentPresence(user, now = Date.now()) {
  const at = user?.activeAt?.toMillis?.() || 0;
  return { online: at > 0 && now - at <= AGENT_ONLINE_MS, lastSeenAt: at || null };
}
