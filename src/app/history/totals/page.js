"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { authFetch } from "@/lib/authFetch";
import { PERIODS, PERIOD_LABELS, myTz } from "@/lib/periods";
import { ArrowDownLeft, ArrowUpRight, BarChart3, ChevronLeft, Coins, Send, Swords } from "lucide-react";

// Your money today, this week, this month and this year (/api/wallet?view=activity):
// games won and lost, transfers, chat coins and usernames, withdrawals and deposits.

const usd = (n) => `$${Math.abs(Number(n || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signed = (n) => `${Number(n) > 0 ? "+" : Number(n) < 0 ? "−" : ""}${usd(n)}`;
const times = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function Card({ icon: Icon, title, tone, children }) {
  return (
    <div className="bg-[#142036] rounded-[2rem] p-5 border border-white/5 space-y-3">
      <h3 className={`font-black italic uppercase text-xs tracking-widest flex items-center gap-2 ${tone}`}><Icon size={15} /> {title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({ label, value, strong, tone = "" }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[12px]">
      <span className="font-bold text-white/50">{label}</span>
      <span className={`${strong ? "font-black text-[15px] italic" : "font-black"} ${tone}`}>{value}</span>
    </div>
  );
}

export default function TotalsPage() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState("day");

  useEffect(() => onAuthStateChanged(auth, (u) => {
    if (!u) return router.push("/login");
    authFetch(`/api/wallet?view=activity&tz=${myTz()}`).then((res) => (res.error ? setError(res.error) : setData(res)));
  }), [router]);

  const p = data?.periods?.[period];

  return (
    <div className="min-h-screen bg-[#0B1220] text-white pb-24">
      <div className="p-6 pt-12 flex items-center gap-4 max-w-md mx-auto w-full">
        <button onClick={() => router.back()} className="p-3 bg-[#142036] rounded-2xl border border-white/5 active:scale-90 transition-all" aria-label="Back">
          <ChevronLeft size={20} />
        </button>
        <h1 className="text-xl font-black italic uppercase tracking-tighter flex items-center gap-2"><BarChart3 size={20} /> My Totals</h1>
      </div>

      <div className="px-6 space-y-5 max-w-md mx-auto w-full">
        <div className="grid grid-cols-4 gap-2">
          {PERIODS.map((k) => (
            <button key={k} onClick={() => setPeriod(k)}
              className={`py-3 rounded-2xl text-[9px] font-black uppercase tracking-wider border-2 ${period === k ? "bg-[#8B1E3F] border-[#8B1E3F] text-white" : "bg-[#142036] border-white/5 text-gray-400"}`}>
              {PERIOD_LABELS[k]}
            </button>
          ))}
        </div>

        {error && <p className="text-sm font-bold text-red-400 text-center">{error}</p>}
        {!p && !error && <div className="h-40 bg-[#142036] rounded-[2rem] animate-pulse" />}

        {p && (
          <>
            <Card icon={Swords} title="Games" tone="text-[#F6C453]">
              <Row label="Staked" value={usd(p.games.staked)} />
              <Row label="Won back" value={usd(p.games.won)} />
              <Row label={p.games.net >= 0 ? "Net win" : "Net loss"} value={signed(p.games.net)} strong
                tone={p.games.net > 0 ? "text-emerald-400" : p.games.net < 0 ? "text-rose-400" : ""} />
              <Row label="Rounds" value={`${times(p.games.wins, "win")} · ${p.games.losses} loss${p.games.losses === 1 ? "" : "es"}`} />
              {p.games.jackpots > 0 && <Row label="Jackpots" value={usd(p.games.jackpots)} tone="text-emerald-400" />}
            </Card>

            <Card icon={Send} title="Transfers" tone="text-[#7A9BEE]">
              <Row label={`Sent (${p.transfers.sentCount})`} value={usd(p.transfers.sent)} />
              <Row label="Transfer fees" value={usd(p.transfers.fees)} />
              <Row label={`Received (${p.transfers.receivedCount})`} value={usd(p.transfers.received)} tone="text-emerald-400" />
            </Card>

            <Card icon={Coins} title="Chat coins & usernames" tone="text-[#F6C453]">
              <Row label="Chat coins bought" value={usd(p.chat.coinsBought)} />
              <Row label="Chat coins withdrawn" value={usd(p.chat.coinsSold)} tone="text-emerald-400" />
              <Row label="Usernames" value={usd(p.chat.usernames)} />
            </Card>

            <div className="grid grid-cols-2 gap-3">
              <Card icon={ArrowDownLeft} title="Deposits" tone="text-emerald-400">
                <p className="text-xl font-black italic">{usd(p.deposits.amount)}</p>
                <p className="text-[10px] font-bold text-white/40 uppercase">{times(p.deposits.count, "deposit")}</p>
              </Card>
              <Card icon={ArrowUpRight} title="Withdrawals" tone="text-rose-400">
                <p className="text-xl font-black italic">{usd(p.withdrawals.amount)}</p>
                <p className="text-[10px] font-bold text-white/40 uppercase">{times(p.withdrawals.count, "withdrawal")}</p>
              </Card>
            </div>

            <p className="text-[10px] font-bold text-white/30 text-center leading-relaxed px-2">
              In your own time zone; weeks start on Monday. Deposits and withdrawals count once they&apos;re completed,
              with agents or in USDT.{data.partial ? " This year has more records than we can add up at once, so it's partly counted." : ""}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
