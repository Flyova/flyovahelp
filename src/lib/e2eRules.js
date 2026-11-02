import { getServiceAccount, googleFetch } from "@/lib/firebase-rest/credentials";

// Encrypted private chats (lib/e2e) only work once the published Firestore rules
// accept sealed messages: the older rules refuse them, so turning a chat encrypted
// before then would stop both people sending. The published rules are read through
// the Firebase Rules API and looked for the sealed-message check; until it's there,
// /api/chat/keys keeps every chat as it is. Rules are published by hand, so this
// switches encryption on by itself once they are.

const MARK = "function sealedRight(";
const RECHECK_MS = 5 * 60 * 1000;
let known = { at: 0, live: false };

export async function e2eRulesLive() {
  if (known.live || Date.now() - known.at < RECHECK_MS) return known.live;
  let live = false;
  try {
    const { projectId } = getServiceAccount();
    const release = await googleFetch(`https://firebaserules.googleapis.com/v1/projects/${projectId}/releases/cloud.firestore`);
    const ruleset = release?.rulesetName ? await googleFetch(`https://firebaserules.googleapis.com/v1/${release.rulesetName}`) : null;
    live = (ruleset?.source?.files || []).some((f) => String(f.content || "").includes(MARK));
  } catch (e) {
    console.error("Couldn't read the published Firestore rules:", e?.message || e);
  }
  known = { at: Date.now(), live };
  return live;
}
