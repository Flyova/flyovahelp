"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { auth, db } from "@/lib/firebase";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { Timer, CheckCircle2, Trophy, XCircle, History, Loader2, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const GAME_DURATION = 120;
const WIN_MULTIPLIER = 1.3;
const GRID_SIZE = 4;
const DEMO_STARTING_BALANCE = 50;

function generateNumbers() {
  const pool = new Set();
  while (pool.size < GRID_SIZE) pool.add(Math.floor(Math.random() * 90) + 1);
  return [...pool];
}

function generatePattern() {
  const slots = [false, false, false, false, false];
  const winsCount = Math.random() > 0.5 ? 4 : 3;
  [...Array(5).keys()]
    .sort(() => Math.random() - 0.5)
    .slice(0, winsCount)
    .forEach((p) => { slots[p] = true; });
  return slots;
}

export default function DemoFlyova() {
  const router = useRouter();
  const [nextPath, setNextPath] = useState("/game/flyova-to-dollars");
  const [uid, setUid] = useState(null);
  const [wallet, setWallet] = useState(null);

  const [numbers, setNumbers] = useState(() => generateNumbers());
  const [selected, setSelected] = useState([]);
  const [stake, setStake] = useState(1);
  const [hasBet, setHasBet] = useState(false);
  const [activeBets, setActiveBets] = useState([]);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [phase, setPhase] = useState("betting");

  const [winPattern, setWinPattern] = useState(() => generatePattern());
  const [gameCount, setGameCount] = useState(0);

  const [showResult, setShowResult] = useState(false);
  const [resultType, setResultType] = useState(null);
  const [winAmount, setWinAmount] = useState(0);
  const [winningNumbers, setWinningNumbers] = useState([]);

  const [history, setHistory] = useState([]);

  const stateRef = useRef({});
  stateRef.current = { hasBet, selected, stake, winPattern, gameCount, numbers, wallet };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const nextParam = new URLSearchParams(window.location.search).get("next");
    if (nextParam && nextParam.startsWith("/")) {
      setNextPath(nextParam);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) { router.push("/login"); return; }
      setUid(u.uid);
      const userRef = doc(db, "users", u.uid);
      const unsubWallet = onSnapshot(userRef, async (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        if (data.demoWallet == null) {
          await updateDoc(userRef, { demoWallet: DEMO_STARTING_BALANCE });
          setWallet(DEMO_STARTING_BALANCE);
        } else {
          setWallet(data.demoWallet);
        }
      });
      return unsubWallet;
    });
    return unsub;
  }, [router]);

  const startNextRound = useCallback(() => {
    setNumbers(generateNumbers());
    setSelected([]);
    setHasBet(false);
    setActiveBets([]);
    setStake(1);
    setTimeLeft(GAME_DURATION);
    setWinningNumbers([]);
    setPhase("betting");
  }, []);

  const resolveGame = useCallback(async () => {
    const { hasBet, selected, stake, winPattern, gameCount, numbers, wallet } = stateRef.current;

    if (!hasBet) {
      const drawn = [...numbers].sort(() => Math.random() - 0.5).slice(0, 2);
      setWinningNumbers(drawn);
      setPhase("waiting");
      setHistory((h) => [{ type: "no_bet", drawn }, ...h].slice(0, 10));
      setTimeout(startNextRound, 3000);
      return;
    }

    const willWin = winPattern[gameCount % 5];
    let drawn;
    if (willWin) {
      const guaranteed = selected[Math.floor(Math.random() * selected.length)];
      const others = numbers.filter((n) => !selected.includes(n));
      const second = others[Math.floor(Math.random() * others.length)];
      drawn = [guaranteed, second].sort(() => Math.random() - 0.5);
    } else {
      const safe = numbers.filter((n) => !selected.includes(n));
      drawn = safe.sort(() => Math.random() - 0.5).slice(0, 2);
    }

    const won = drawn.some((n) => selected.includes(n));
    const payout = won ? parseFloat((stake * WIN_MULTIPLIER).toFixed(2)) : 0;
    const delta = payout - stake;

    setWinningNumbers(drawn);
    setResultType(won ? "win" : "lose");
    setWinAmount(payout);
    setShowResult(true);
    setPhase("waiting");

    if (uid) {
      const newBalance = parseFloat(((wallet ?? 0) + delta).toFixed(2));
      const safeBalance = Math.max(newBalance, 0);
      await updateDoc(doc(db, "users", uid), { demoWallet: safeBalance });
      if (safeBalance < 0.5) {
        await updateDoc(doc(db, "users", uid), { demoWallet: DEMO_STARTING_BALANCE });
      }
    }

    const newCount = gameCount + 1;
    setGameCount(newCount);
    if (newCount % 5 === 0) setWinPattern(generatePattern());

    setHistory((h) =>
      [{ type: won ? "win" : "lose", drawn, stake, payout, picks: selected }, ...h].slice(0, 10)
    );

    setTimeout(() => {
      setShowResult(false);
      startNextRound();
    }, 4000);
  }, [startNextRound, uid]);

  useEffect(() => {
    if (phase !== "betting") return;
    if (timeLeft === 0) { setPhase("resolving"); resolveGame(); return; }
    const t = setInterval(() => setTimeLeft((p) => Math.max(0, p - 1)), 1000);
    return () => clearInterval(t);
  }, [phase, timeLeft, resolveGame]);

  const toggleNumber = (n) => {
    if (hasBet || phase !== "betting") return;
    setSelected((prev) =>
      prev.includes(n) ? prev.filter((x) => x !== n) : prev.length >= 2 ? prev : [...prev, n]
    );
  };

  const placeBet = () => {
    if (selected.length !== 2 || hasBet || phase !== "betting") return;
    if (stake < 1 || wallet == null || stake > wallet) return;
    setHasBet(true);
    setActiveBets([{ picks: [...selected], amount: stake }]);
  };

  if (wallet === null) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center text-white italic font-black uppercase">
        <Loader2 className="animate-spin text-[#fc7952] mb-4" size={32} />
        Loading game...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f172a] text-white flex flex-col pb-24 relative overflow-hidden">

      {/* RESULT MODAL */}
      {showResult && (
        <div className="absolute inset-0 z-100 flex items-center justify-center p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className={`w-full max-w-xs p-8 rounded-[2.5rem] border-2 text-center shadow-2xl ${
            resultType === "win"
              ? "bg-[#1e293b] border-green-500 shadow-green-500/30"
              : "bg-[#1e293b] border-red-500 shadow-red-500/30"
          }`}>
            {resultType === "win" ? (
              <>
                <Trophy size={60} className="mx-auto text-green-400 mb-4 animate-bounce" />
                <h2 className="text-3xl font-black italic uppercase mb-2 text-white">You Won!</h2>
                <p className="text-[#fc7952] text-2xl font-black italic">+${winAmount.toFixed(2)}</p>
                <p className="text-sm text-gray-400 mt-2">You won winning numbers: {winningNumbers.join(" & ")}</p>
              </>
            ) : (
              <>
                <XCircle size={60} className="mx-auto text-red-500 mb-4" />
                <h2 className="text-xl font-black italic uppercase mb-2 text-white">No Luck!</h2>
                <p className="text-sm text-gray-400">Winning numbers were: {winningNumbers.join(" & ")}</p>
                <p className="text-sm opacity-70 mt-1">Try again next round</p>
              </>
            )}
            <button onClick={() => setShowResult(false)} className="mt-6 text-[10px] font-bold uppercase tracking-widest opacity-50">Close</button>
          </div>
        </div>
      )}

      {/* DEMO BANNER */}
      <div className="w-full bg-amber-500/20 border-b border-amber-500/40 px-4 py-2 flex items-center justify-between">
        <span className="text-amber-400 text-xs font-black uppercase tracking-widest">
          Tutorial Simulator - Fake Money
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push(nextPath)}
            className="text-[10px] font-black uppercase tracking-widest text-amber-300/80 hover:text-amber-200 transition-colors"
          >
            Skip Tutorial
          </button>
          <Link href={nextPath} className="flex items-center gap-1 text-xs font-bold text-amber-400 hover:text-amber-300 transition-colors">
            Play Real <ArrowRight size={12} />
          </Link>
        </div>
      </div>

      {/* Header & Progress Bar */}
      <div className="p-8 text-center bg-[#1e293b] border-b border-white/5 relative">
        <div
          className="absolute top-0 left-0 h-1 bg-[#fc7952] transition-all duration-1000"
          style={{ width: `${(timeLeft / GAME_DURATION) * 100}%` }}
        />
        <h1 className="text-sm font-black italic uppercase text-[#fc7952] mb-1">Flyova to Dollars</h1>
        <p className="text-xs text-gray-500 font-bold mb-4">
          Demo Balance: <span className="text-amber-400">${wallet.toFixed(2)}</span>
        </p>
        <div className="inline-flex items-center space-x-3 bg-black/20 px-8 py-4 rounded-4xl border border-white/5 mt-2">
          <Timer size={24} className="text-[#613de6]" />
          <span className="text-4xl font-black italic font-mono">
            {phase === "waiting"
              ? "00:00"
              : `${Math.floor(timeLeft / 60).toString().padStart(2, "0")}:${(timeLeft % 60).toString().padStart(2, "0")}`}
          </span>
        </div>
      </div>

      <div className="flex-1 p-6 flex flex-col items-center justify-center">
        {phase === "waiting" ? (
          <div className="flex flex-col items-center justify-center w-full max-w-sm">
            <div className="grid grid-cols-4 gap-3 w-full mb-8">
              {numbers.map((num, idx) => (
                <div
                  key={idx}
                  className={`aspect-square rounded-2xl text-xl font-black italic flex items-center justify-center border-2 transition-all duration-500 ${
                    winningNumbers.includes(num)
                      ? "bg-green-500/20 border-green-500 shadow-[0_0_20px_rgba(34,197,94,0.4)] scale-110"
                      : "bg-[#1e293b] border-white/5 opacity-20"
                  }`}
                >
                  {num}
                </div>
              ))}
            </div>
            <div className="flex flex-col items-center space-y-2 animate-pulse">
              <Loader2 size={32} className="text-[#fc7952] animate-spin" />
              <h2 className="text-xl font-black italic uppercase">Next Round Starting Soon</h2>
            </div>
          </div>
        ) : (
          <>
            {/* Active Bets */}
            <div className="flex flex-wrap gap-2 mb-4 justify-center">
              {activeBets.map((b, i) => (
                <div key={i} className="bg-green-500/10 border border-green-500/30 px-3 py-1 rounded-full flex items-center space-x-2">
                  <CheckCircle2 size={10} className="text-green-500" />
                  <span className="text-[10px] font-black italic">
                    {b.picks?.join(", ")} (${b.amount} = ${(b.amount * WIN_MULTIPLIER).toFixed(1)})
                  </span>
                </div>
              ))}
            </div>

            {/* Number Grid */}
            <div className="grid grid-cols-4 gap-3 w-full max-w-sm mb-12">
              {numbers.map((num, idx) => (
                <button
                  key={idx}
                  onClick={() => toggleNumber(num)}
                  disabled={hasBet || phase !== "betting"}
                  className={`aspect-square rounded-2xl text-xl font-black italic transition-all border-2 ${
                    selected.includes(num)
                      ? "bg-[#613de6] border-[#fc7952] scale-105 shadow-lg"
                      : "bg-[#1e293b] border-white/5"
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>

            {/* Stake Panel */}
            <div className="w-full max-w-xs bg-[#1e293b] p-6 rounded-[2.5rem] border border-white/5">
              <div className="flex items-center justify-between mb-6 bg-black/20 p-4 rounded-2xl">
                <button
                  onClick={() => setStake(Math.max(1, stake - 1))}
                  className="w-10 h-10 bg-[#613de6] rounded-xl font-bold"
                >-</button>
                <div className="flex items-center text-[#fc7952]">
                  <span className="text-2xl font-black italic mr-1">$</span>
                  <input
                    type="number"
                    value={stake}
                    onChange={(e) => setStake(Math.max(1, parseInt(e.target.value) || 1))}
                    className="bg-transparent text-2xl font-black italic w-12 text-center outline-none"
                  />
                </div>
                <button
                  onClick={() => setStake(Math.min(stake + 1, Math.floor(wallet)))}
                  className="w-10 h-10 bg-[#613de6] rounded-xl font-bold"
                >+</button>
              </div>
              <button
                onClick={placeBet}
                disabled={selected.length !== 2 || timeLeft <= 0 || phase !== "betting" || hasBet}
                className="w-full bg-[#fc7952] py-4 rounded-2xl font-black uppercase italic shadow-lg active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {hasBet ? "BET PLACED ✓" : timeLeft <= 0 ? "BETTING CLOSED" : "PLACE BET"}
              </button>
            </div>
          </>
        )}
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="bg-black/20 p-6 border-t border-white/5">
          <div className="flex items-center space-x-2 mb-4 opacity-40">
            <History size={14} />
            <span className="text-[10px] font-black uppercase">Draw History</span>
          </div>
          <div className="flex space-x-4 overflow-x-auto pb-2 no-scrollbar">
            {history.map((h, i) => (
              <div key={i} className="bg-[#1e293b] px-4 py-3 rounded-2xl border border-white/5 shrink-0">
                <div className="flex space-x-2">
                  {h.drawn?.map((w, wi) => (
                    <span key={wi} className="text-[#fc7952] font-black italic">{w}</span>
                  ))}
                </div>
                {h.type !== "no_bet" && (
                  <p className={`text-[10px] font-bold mt-1 ${h.type === "win" ? "text-green-400" : "text-red-400"}`}>
                    {h.type === "win" ? `+$${h.payout?.toFixed(2)}` : `-$${h.stake?.toFixed(2)}`}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
