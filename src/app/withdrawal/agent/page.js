import { redirect } from "next/navigation";

// Withdrawing with an agent is on /withdrawal (it asks for the PIN and checks the
// bank account); this old address leads there.
export default function AgentWithdraw() {
  redirect("/withdrawal");
}
