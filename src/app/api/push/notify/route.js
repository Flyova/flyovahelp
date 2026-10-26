import { NextResponse } from "next/server";
import { admin, getAdminDb } from "@/lib/firebaseAdmin";
import { resolvePrivilegedRole } from "@/lib/adminAccess";
import { mentionsIn, norm, usernameUids } from "@/lib/chat";
import { sendPushToUsers } from "@/lib/push";
import { chatSettingsFor } from "@/lib/chatSettings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/push/notify { event, ...ids }
// Callers only name the record they just wrote; the server re-reads it and decides
// who is notified and what they see, so a client cannot push arbitrary text to arbitrary users.

const bearer = (req) => {
  const raw = String(req.headers.get("authorization") || "").trim();
  return raw.toLowerCase().startsWith("bearer ") ? raw.slice(7).trim() : "";
};

const money = (n) => `$${Number(n || 0).toFixed(2)}`;

async function chatMessage(db, caller, { convoId, messageId }) {
  if (!convoId || !messageId) return { error: "convoId and messageId required", status: 400 };
  const convoRef = db.collection("conversations").doc(String(convoId));
  const [convoSnap, msgSnap] = await Promise.all([
    convoRef.get(),
    convoRef.collection("messages").doc(String(messageId)).get(),
  ]);
  if (!convoSnap.exists || !msgSnap.exists) return { error: "Message not found", status: 404 };

  const convo = convoSnap.data();
  const msg = msgSnap.data();
  const sender = norm(msg.sender);
  const owner = await db.collection("usernames").doc(sender).get();
  if (!owner.exists || !usernameUids(owner.data()).includes(caller.uid)) return { error: "Not your message", status: 403 };

  const others = (convo.participants || []).map(norm).filter((p) => p && p !== sender);
  if (!others.length) return { sent: 0 };

  const [ownerSnaps, blockSnaps] = await Promise.all([
    db.getAll(...others.map((p) => db.collection("usernames").doc(p))),
    db.getAll(...others.map((p) => db.collection("chat_blocks").doc(`${p}_${sender}`))),
  ]);

  const targets = [];
  others.forEach((p, i) => {
    const o = ownerSnaps[i];
    if (!o.exists || o.data().deleted || blockSnaps[i].exists) return;
    // The owner and any account logged in to the username. The mobile thread screen
    // needs to know which of the recipient's identities is active.
    for (const uid of usernameUids(o.data())) {
      if (uid !== caller.uid) targets.push({ uid, name: p, owner: o.data().uid, data: { url: `/chat/${convoId}?as=${encodeURIComponent(p)}` } });
    }
  });

  const isGroup = convo.type === "group";
  // A chat the recipient's chat profile muted (Chat settings → Notifications), or
  // that they archived, still notifies them, just without a sound.
  if (targets.length) {
    const [states, settings] = await Promise.all([
      db.getAll(...targets.map((t) => db.collection("chat_state").doc(t.uid))),
      chatSettingsFor(db, [...new Map(targets.map((t) => [t.name, { name: t.name, uid: t.owner }])).values()]),
    ]);
    // Being @mentioned always makes a sound.
    const mentioned = new Set(mentionsIn(msg.text, 20));
    states.forEach((snap, i) => {
      const t = targets[i];
      if (mentioned.has(t.name)) {
        t.mentioned = true;
        return;
      }
      const archived = snap.exists && snap.data().archived?.[convoId] === true;
      const sounds = settings.get(t.name)?.sounds || {};
      t.silent = archived || (isGroup
        ? sounds.groups?.[convoId] === false
        : sounds.private === false || sounds.people?.[sender] === false);
    });
  }
  // Mentioned players get "@ade mentioned you in <group>"; everyone else the usual title.
  const mentionTitle = isGroup ? `@${msg.sender} mentioned you in ${convo.groupName || "a group"}` : `@${msg.sender} mentioned you`;
  for (const t of targets) if (t.mentioned) t.title = mentionTitle;
  const sent = await sendPushToUsers(targets, {
    title: isGroup ? convo.groupName || "New group message" : `@${msg.sender}`,
    body: isGroup ? `@${msg.sender}: ${msg.text || ""}` : msg.text || "New message",
    data: { kind: "chat", convoId },
  });
  return { sent };
}

async function requireAdmin(db, caller) {
  const snap = await db.collection("users").doc(caller.uid).get();
  return resolvePrivilegedRole(snap.exists ? snap.data().role : null, caller.email) === "admin";
}

async function moneyStatus(db, caller, kind, id) {
  if (!id) return { error: `${kind}Id required`, status: 400 };
  if (!(await requireAdmin(db, caller))) return { error: "Administrative access required.", status: 403 };

  const snap = await db.collection(kind === "deposit" ? "deposits" : "withdrawals").doc(String(id)).get();
  if (!snap.exists) return { error: "Not found", status: 404 };
  const d = snap.data();
  if (!d.userId) return { sent: 0 };

  const ok = d.status === "completed";
  const label = kind === "deposit" ? "Deposit" : "Withdrawal";
  const body = ok
    ? kind === "deposit"
      ? `${money(d.amount)} has been added to your wallet.`
      : `Your ${money(d.amount)} withdrawal has been paid out.`
    : kind === "deposit"
      ? `Your ${money(d.amount)} deposit could not be verified. Contact support if this is a mistake.`
      : `Your ${money(d.amount)} withdrawal was declined and refunded to your wallet.`;

  const sent = await sendPushToUsers([d.userId], {
    title: `${label} ${ok ? "approved" : "declined"}`,
    body,
    data: { kind, id: snap.id, url: "/history" },
  });
  return { sent };
}

export async function POST(req) {
  try {
    const token = bearer(req);
    if (!token) return NextResponse.json({ error: "Missing authorization token." }, { status: 401 });

    let caller;
    try {
      caller = await admin.auth().verifyIdToken(token);
    } catch {
      return NextResponse.json({ error: "Invalid or expired authorization token." }, { status: 401 });
    }

    const payload = await req.json().catch(() => ({}));
    const db = getAdminDb();

    let result;
    switch (payload.event) {
      case "chat_message":
        result = await chatMessage(db, caller, payload);
        break;
      case "deposit_status":
        result = await moneyStatus(db, caller, "deposit", payload.depositId);
        break;
      case "withdrawal_status":
        result = await moneyStatus(db, caller, "withdrawal", payload.withdrawalId);
        break;
      default:
        return NextResponse.json({ error: "Unknown event" }, { status: 400 });
    }

    if (result.error) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, sent: result.sent });
  } catch (e) {
    console.error("Push notify error:", e);
    return NextResponse.json({ error: e?.message || "Push failed" }, { status: 500 });
  }
}
