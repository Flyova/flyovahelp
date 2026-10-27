import { sendEmail } from "@/lib/resend";
import { NextResponse } from "next/server";
import { getCaller } from "@/lib/apiAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { resolvePrivilegedRole } from "@/lib/adminAccess";
import { ADMIN_NOTIFY_EMAIL } from "@/lib/money";

// Used to send any HTML to any address for anyone, signed in or not, from our
// domain. Now portal staff (admin pages) can still email anyone; players can only
// email themselves (their sign-up code) or the team's notification inboxes, always
// with links and images taken out. Emails about money (transfers, trades, withdrawals)
// are sent by the money routes themselves.
const TEAM_INBOXES = new Set([ADMIN_NOTIFY_EMAIL, "contact.notifications.surname@gmail.com"]);
const MAX_HTML = 20000;

const normalize = (value) => String(value || "").trim().toLowerCase();

/** A player's HTML with anything clickable or loadable removed. */
const defang = (html) => String(html)
  .replace(/<\s*(script|style|iframe|object|embed|form)[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
  .replace(/<\s*\/?\s*(a|img|iframe|object|embed|form|input|button|link|meta|base)\b[^>]*>/gi, "")
  .replace(/\s(on\w+|href|src|srcset|action|formaction|style)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");

export async function POST(req) {
  try {
    const caller = await getCaller(req);
    if (!caller) return NextResponse.json({ error: "Sign in to send email." }, { status: 401 });
    const { to, subject, html } = await req.json();
    if (!to || !subject || !html) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const user = (await getAdminDb().collection("users").doc(caller.uid).get()).data();
    const staff = !!resolvePrivilegedRole(user?.role, caller.email);
    let body = String(html);
    if (!staff) {
      const recipient = normalize(to);
      // Their own address needn't be verified yet (the sign-up code goes to it), so it's
      // defanged too: an account made with someone else's address can't send them links.
      if (recipient !== normalize(caller.email) && !TEAM_INBOXES.has(recipient)) {
        return NextResponse.json({ error: "You can't email that address." }, { status: 403 });
      }
      if (body.length > MAX_HTML || String(subject).length > 200) {
        return NextResponse.json({ error: "Message too long." }, { status: 400 });
      }
      body = defang(body);
    }

    const result = await sendEmail(to, String(subject), body);

    if (result.success) {
      return NextResponse.json({ message: "Email sent successfully", data: result.data }, { status: 200 });
    } else {
      console.error("Resend internal error:", result.error);
      const errorMessage =
        typeof result.error === "string"
          ? result.error
          : result.error?.message || "Email delivery failed.";
      return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
  } catch (error) {
    console.error("API Route Error:", error);
    return NextResponse.json({ error: "Email delivery failed." }, { status: 500 });
  }
}
