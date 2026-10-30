"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

// The link in the "Confirm your StraWins account change" email (/api/account).
function Confirm() {
  const params = useSearchParams();
  const [state, setState] = useState({ busy: true });

  useEffect(() => {
    let live = true;
    fetch("/api/account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "profileChangeConfirm", uid: params.get("u"), token: params.get("t") }),
    })
      .then((r) => r.json().catch(() => ({ error: "Something went wrong. Please try again." })))
      .then((res) => live && setState({ done: !res.error, error: res.error, res }))
      .catch(() => live && setState({ error: "Check your connection and open the link again." }));
    return () => { live = false; };
  }, [params]);

  return (
    <div className="bg-[#142036] w-full max-w-sm rounded-[2.5rem] border border-white/10 p-8 shadow-2xl space-y-5 text-center">
      {state.busy && !state.done && !state.error ? (
        <Loader2 size={32} className="animate-spin mx-auto text-white/50" />
      ) : state.done ? (
        <>
          <CheckCircle2 size={40} className="mx-auto text-green-500" />
          <h1 className="text-xl font-black uppercase italic tracking-tighter">Account Updated</h1>
          <p className="text-sm text-gray-400 font-bold leading-relaxed">
            {[state.res?.fullName && `Name: ${state.res.fullName}`, state.res?.email && `Email: ${state.res.email}`].filter(Boolean).join(" · ")}. Sign in with your email from now on.
          </p>
        </>
      ) : (
        <>
          <AlertCircle size={40} className="mx-auto text-red-500" />
          <h1 className="text-xl font-black uppercase italic tracking-tighter">Link Not Valid</h1>
          <p className="text-sm text-gray-400 font-bold leading-relaxed">{state.error}</p>
        </>
      )}
      <Link href="/settings" className="block w-full bg-[#2457D6] py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest">
        Go to Settings
      </Link>
    </div>
  );
}

export default function ConfirmChangePage() {
  return (
    <div className="min-h-screen bg-[#0B1220] text-white flex items-center justify-center p-6">
      <Suspense fallback={<Loader2 size={32} className="animate-spin text-white/50" />}>
        <Confirm />
      </Suspense>
    </div>
  );
}
