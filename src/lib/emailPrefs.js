// Which emails a player gets: users/{uid}.emailPrefs[kind] === false switches that kind
// off (missing = on). The server checks it before sending (lib/moneyEmails, /api/agent,
// /api/send-email for the admins' deposit and withdrawal decisions). Codes and links a
// player needs to keep their account (sign-up and login codes, password and PIN resets,
// confirming account changes or deletion) aren't a kind: they always go.
// The app keeps the same list (src/lib/emailPrefs.ts).
export const EMAIL_KINDS = [
  ["transfers", "Money received", "When another player sends you money"],
  ["trades", "Agent trades", "Agent deposits and withdrawals accepted, declined or completed. Agents: new requests and your application"],
  ["funds", "USDT deposits & withdrawals", "Withdrawal requests received, deposits and withdrawals approved or declined"],
  ["games", "Games & plans", "Predict & Win plans activated"],
];

export const EMAIL_KIND_KEYS = EMAIL_KINDS.map(([key]) => key);

export const ALWAYS_ON_EMAILS = "Sign-up and login codes, password and PIN resets, and links to confirm account changes always come, so you never lose access to your account.";

/** Whether a player with these emailPrefs gets `kind` emails. */
export const emailKindOn = (prefs, kind) => prefs?.[kind] !== false;
