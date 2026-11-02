import { LockKeyhole, ShieldCheck } from "lucide-react";
import { E2E_NOTE } from "@/lib/e2e";

const GROUP_CAUTION =
  "Be respectful. Insults, bullying, theft and scams of any kind are not allowed on StraWins. Please don't trouble members with personal matters. Never share your password or OTP with anyone, and report anyone who asks for your account details. No admin will ever ask for them.";

const PRIVATE_CAUTION =
  "No admin will ever ask for your login details. Report anyone who asks for your password, OTP or account information. StraWins can only protect you inside StraWins chat: if you move a conversation to another messaging app, you do so at your own risk.";

/**
 * The safety note at the start of every group and private chat, Messenger style.
 * An end-to-end encrypted private chat (lib/e2e) says so above it.
 */
export default function ChatCaution({ group, encrypted = false }) {
  return (
    <div role="note" className="flex flex-col items-center gap-2 px-4 pt-5 pb-2">
      {encrypted && (
        <p data-e2e-note className="max-w-sm flex items-start justify-center gap-1.5 rounded-xl bg-[#0B1220]/70 backdrop-blur px-3 py-2 text-center text-[12px] leading-snug text-amber-200/85">
          <LockKeyhole size={13} className="shrink-0 mt-0.5" aria-hidden />
          <span>{E2E_NOTE}</span>
        </p>
      )}
      <div className="max-w-sm rounded-2xl bg-[#0B1220]/70 backdrop-blur px-4 py-3 text-center">
        <ShieldCheck size={18} className="mx-auto mb-1.5 text-[#E0708C]" aria-hidden />
        <p className="text-[12.5px] leading-relaxed text-white/70">{group ? GROUP_CAUTION : PRIVATE_CAUTION}</p>
      </div>
    </div>
  );
}
