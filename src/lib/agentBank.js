// Agents trade only with a bank account (where players pay them) in their approved agent
// name, agents/{uid}.full_name. No server imports: /api/trades and /api/agent check it,
// and the agent's pages and Admin → Agents say why. Names match whatever the case,
// spacing, punctuation or word order ("Ade Bola-Usen" is "USEN, ADE BOLA").

const nameWords = (name) => String(name || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean).sort();

/** Whether `accountName` is `agentName`: the same words in any order. */
export function sameAccountName(agentName, accountName) {
  const a = nameWords(agentName);
  const b = nameWords(accountName);
  return a.length > 0 && a.length === b.length && a.every((w, i) => w === b[i]);
}

/** Whether an agent's bank account is in their approved name, so they can take trades. */
export const agentBankMatches = (agent) => sameAccountName(agent?.full_name, agent?.accountName);

/** Why an agent can't trade because of their bank account (for the agent), or null. */
export function agentBankProblem(agent) {
  if (agentBankMatches(agent)) return null;
  const name = agent?.full_name || "your approved agent name";
  return agent?.accountName
    ? `Your bank account name (${agent.accountName}) doesn't match your approved agent name (${name}). Change your bank details in Agent Profile to an account in your name to take trades again.`
    : `Add a bank account in your approved agent name (${name}) in Agent Profile to take trades.`;
}
