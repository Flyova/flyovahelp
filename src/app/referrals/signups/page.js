"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { authFetch } from "@/lib/authFetch";
import Avatar from "@/components/Avatar";
import { ArrowRightLeft, CheckCircle2, ChevronLeft, Clock, Gift, Globe, Loader2, Users } from "lucide-react";

// Sign-up rewards: everyone who registered with your link or code (/api/wallet
// ?view=signups), where they're from, and the $0.0001 each verified one earned you.

const day = (ms) => (ms ? new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "");

export default function SignupsPage() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [unclaimed, setUnclaimed] = useState(0);
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    let unsubUser = null;
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      if (!u) return router.push("/login");
      authFetch("/api/wallet?view=signups").then((res) => (res.error ? setError(res.error) : setData(res)));
      unsubUser = onSnapshot(doc(db, "users", u.uid), (snap) => setUnclaimed(Number(snap.data()?.signupRewards || 0)));
    });
    return () => { unsubAuth(); if (unsubUser) unsubUser(); };
  }, [router]);

  const claim = async () => {
    setClaiming(true);
    try {
      const res = await authFetch("/api/wallet", { method: "POST", body: { action: "signupClaim" } });
      alert(res.error || `$${res.moved.toFixed(2)} moved to your main wallet.`);
    } finally {
      setClaiming(false);
    }
  };

  const reward = data?.reward || 0.0001;
  const value = unclaimed * reward;

  return (
    <div className="min-h-screen bg-[#0B1220] text-white flex flex-col pb-12">
      <div className="p-6 pt-12 flex items-center gap-4 max-w-md mx-auto w-full">
        <button onClick={() => router.back()} className="p-3 bg-[#142036] rounded-2xl border border-white/5 active:scale-90 transition-all" aria-label="Back">
          <ChevronLeft size={20} />
        </button>
        <h1 className="text-xl font-black italic uppercase tracking-tighter">Sign-up Rewards</h1>
      </div>

      <div className="p-6 pt-0 space-y-6 max-w-md mx-auto w-full">
        <div className="bg-gradient-to-br from-[#8B1E3F] to-[#5A1229] p-7 rounded-[2.5rem] shadow-2xl relative overflow-hidden">
          <Gift className="absolute -right-4 -bottom-4 w-28 h-28 opacity-10" />
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/60 mb-1">Unclaimed rewards</p>
          <h2 className="text-4xl font-black italic tracking-tighter">${value.toFixed(4)}</h2>
          <p className="text-[11px] font-bold text-white/60 mt-2">${reward} for every player who registers with your link or code and verifies their email.</p>
          <button onClick={claim} disabled={claiming || value < 0.01}
            className="mt-5 w-full bg-white/10 border border-white/20 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-40">
            {claiming ? <Loader2 size={14} className="animate-spin" /> : <ArrowRightLeft size={14} />} Move to Wallet {value < 0.01 ? "(from $0.01)" : ""}
          </button>
        </div>

        {error && <p className="text-sm font-bold text-red-400 text-center">{error}</p>}
        {!data && !error && <div className="h-24 bg-[#142036] rounded-3xl animate-pulse" />}

        {data && (
          <>
            <div className="grid grid-cols-3 gap-3">
              {[["Registered", data.total], ["Verified", data.verified], ["Rewarded", data.rewarded]].map(([label, n]) => (
                <div key={label} className="bg-[#142036] rounded-3xl p-4 border border-white/5 text-center">
                  <p className="text-2xl font-black italic">{n}</p>
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/40">{label}</p>
                </div>
              ))}
            </div>

            {data.byCountry.length > 0 && (
              <div className="bg-[#142036] rounded-[2rem] p-5 border border-white/5">
                <div className="flex items-center gap-2 mb-3">
                  <Globe size={16} className="text-[#7A9BEE]" />
                  <h3 className="font-black italic uppercase text-xs tracking-widest">By country</h3>
                </div>
                <div className="space-y-2">
                  {data.byCountry.map((c) => (
                    <div key={c.country} className="flex items-center justify-between text-[12px] font-bold">
                      <span className="text-white/70">{c.country}</span>
                      <span className="font-black">{c.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-3">
              <h3 className="font-black italic uppercase text-xs text-white/40 tracking-widest px-2">Who registered</h3>
              {data.people.length === 0 ? (
                <div className="bg-[#142036] rounded-[2rem] p-10 border border-dashed border-white/10 text-center">
                  <Users size={40} className="mx-auto mb-3 text-white/5" />
                  <p className="text-[10px] font-black uppercase text-white/20 tracking-widest">Nobody yet: share your link or code</p>
                </div>
              ) : data.people.map((p) => (
                <div key={p.id} className="bg-[#142036] rounded-3xl p-4 border border-white/5 flex items-center gap-4">
                  <Avatar username={p.username} size={44} rounded="rounded-2xl" className="border border-white/5" />
                  <div className="min-w-0 flex-1">
                    <p className="font-black italic uppercase text-[13px] text-[#8B1E3F] truncate">@{p.username || "player"}</p>
                    <p className="text-[10px] font-bold text-white/40 truncate">{[p.country, day(p.joinedAt) && `Joined ${day(p.joinedAt)}`].filter(Boolean).join(" · ")}</p>
                  </div>
                  {p.rewarded ? (
                    <span className="flex items-center gap-1 text-[9px] font-black uppercase text-green-400"><CheckCircle2 size={12} /> +${reward}</span>
                  ) : p.verified ? (
                    <span className="text-[9px] font-black uppercase text-white/40">Verified</span>
                  ) : (
                    <span className="flex items-center gap-1 text-[9px] font-black uppercase text-amber-400"><Clock size={12} /> Not verified</span>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
