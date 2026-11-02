import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { getCaller } from "@/lib/apiAuth";
import { resolvePrivilegedRole } from "@/lib/adminAccess";
import { lockChats, unlockChats } from "@/lib/chatLock";

// POST /api/chat/lock — the lock on an account's Chats (lib/chat CHAT_UNLOCK_PRICE, lib/chatLock).
//
//   { action: "unlock" }             -> { ok }  the locked player pays $12 from their main wallet
//   { action: "lock", uid }          -> { ok }  admins (Admin → Users): lock that account's Chats
//   { action: "release", uid }       -> { ok }  admins: lift it for free

const fail = (error, status = 400) => NextResponse.json({ error }, { status });
const UID = /^[A-Za-z0-9_-]{1,128}$/;

async function isAdminCaller(db, caller) {
  const me = await db.collection("users").doc(caller.uid).get();
  return resolvePrivilegedRole(me.exists ? me.data().role : null, caller.email) === "admin";
}

export async function POST(req) {
  try {
    const caller = await getCaller(req);
    if (!caller) return fail("Sign in again to continue.", 401);
    const { action, uid } = await req.json().catch(() => ({}));
    const db = getAdminDb();
    let out;
    if (action === "unlock") {
      out = await unlockChats(db, caller.uid, { paid: true });
    } else if (action === "lock" || action === "release") {
      if (!(await isAdminCaller(db, caller))) return fail("Admins only.", 403);
      if (!UID.test(String(uid || ""))) return fail("Choose a player.");
      if (uid === caller.uid) return fail("You can't lock your own Chats.");
      out = action === "lock"
        ? await lockChats(db, uid, { reason: "admin", by: caller.uid })
        : await unlockChats(db, uid, { by: caller.uid });
    } else {
      return fail("Unknown action.");
    }
    return out.error ? fail(out.error, out.status) : NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Chat lock error:", e);
    return fail(e?.message || "Something went wrong.", 500);
  }
}
