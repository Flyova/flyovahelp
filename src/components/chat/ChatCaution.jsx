import { ShieldCheck } from "lucide-react";

const GROUP_CAUTION =
  "Be respectful. Insults, bullying, theft and scams of any kind are not allowed on StraWins. Please don't trouble members with personal matters. Never share your password or OTP with anyone, and report anyone who asks for your account details. No admin will ever ask for them.";

const PRIVATE_CAUTION =
  "No admin will ever ask for your login details. Report anyone who asks for your password, OTP or account information. StraWins can only protect you inside StraWins chat: if you move a conversation to another messaging app, you do so at your own risk.";

/** The safety note at the start of every group and private chat, Messenger style. */
export default function ChatCaution({ group }) {
  return (
    <div role="note" className="flex justify-center px-4 pt-5 pb-2">
      <div className="max-w-sm rounded-2xl bg-[#0B1220]/70 backdrop-blur px-4 py-3 text-center">
        <ShieldCheck size={18} className="mx-auto mb-1.5 text-[#E0708C]" aria-hidden />
        <p className="text-[12.5px] leading-relaxed text-white/70">{group ? GROUP_CAUTION : PRIVATE_CAUTION}</p>
      </div>
    </div>
  );
}
