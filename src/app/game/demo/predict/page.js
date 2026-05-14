"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { auth, db } from "@/lib/firebase";
import { doc, onSnapshot, updateDoc, increment } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { Timer, CheckCircle2, Trophy, XCircle, ArrowRight, TrendingUp } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const ROUND_DURATION = 20;
const WIN_REWARD = 0.20;
const DEMO_STARTING_BALANCE = 10;
const CONDITIONS = ["Odd", "Even", "Both"];

function generatePattern() {
  const winsCount = Math.random() > 0.5 ? 4 : 3;
  const slots = [false, false, false, false, false];
  [...Array(5).keys()]
    .sort(() => Math.random() - 0.5)
    .slice(0, winsCount)
    .forEach((p) => { slots[p] = true; });
  return slots;
}

function drawResult(willWin, selectedChoice) {
  if (willWin) return selectedChoice;
  const others = CONDITIONS.filter((c) => c !== selectedChoice);
  return others[Math.floor(Math.random() * others.length)];
}

export default function DemoPredict() {
  const router = useRouter();
  const [nextPath, setNextPath] = useState("/game/predict-and-win");
  const [uid, setUid] = useState(null);

  // Persisted demo wallet from Firestore
  const [wallet, setWallet] = useState(null);

  const [selectedChoice, setSelectedChoice] = useState("");
  const [hasBet, setHasBet] = useState(false);
  const [timeLeft, setTimeLeft] = useState(ROUND_DURATION);
  const [phase, setPhase] = useState("betting");

  const [winPattern, setWinPattern] = useState(() => generatePattern());
  const [gameCount, setGameCount] = useState(0);

  const [showResult, setShowResult] = useState(false);
  const [resultType, setResultType] = useState(null);
  const [resultCondition, setResultCondition] = useState("");
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [history, setHistory] = useState([]);

  const stateRef = useRef({});
  stateRef.current = { hasBet, selectedChoice, winPattern, gameCount, wallet };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const nextParam = new URLSearchParams(window.location.search).get("next");
    if (nextParam && nextParam.startsWith("/")) {
      setNextPath(nextParam);
    }
  }, []);

  // Auth guard + Firestore wallet subscription
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
    setSelectedChoice("");
    setHasBet(false);
    setTimeLeft(ROUND_DURATION);
    setPhase("betting");
  }, []);

  const resolveGame = useCallback(async () => {
    const { hasBet, selectedChoice, winPattern, gameCount, wallet } = stateRef.current;

    const willWin = hasBet && winPattern[gameCount % 5];
    const drawn = hasBet ? drawResult(willWin, selectedChoice) : CONDITIONS[Math.floor(Math.random() * 3)];
    setResultCondition(drawn);

    if (hasBet) {
      const won = drawn === selectedChoice;
      setResultType(won ? "win" : "lose");
      setShowResult(true);

      if (won && uid) {
        const newBalance = parseFloat(((wallet ?? 0) + WIN_REWARD).toFixed(2));
        await updateDoc(doc(db, "users", uid), { demoWallet: newBalance });
        setTotalEarnings((e) => parseFloat((e + WIN_REWARD).toFixed(2)));
      }

      setHistory((h) => [{ won, pick: selectedChoice, drawn }, ...h].slice(0, 10));
    } else {
      setHistory((h) => [{ won: null, pick: null, drawn }, ...h].slice(0, 10));
    }

    const newCount = gameCount + 1;
    setGameCount(newCount);
    if (newCount % 5 === 0) setWinPattern(generatePattern());

    setPhase("waiting");
    setTimeout(() => {
      setShowResult(false);
      startNextRound();
    }, 3500);
  }, [startNextRound, uid]);

  useEffect(() => {
    if (phase !== "betting") return;
    if (timeLeft === 0) {
      setPhase("resolving");
      resolveGame();
      return;
    }
    const t = setInterval(() => setTimeLeft((p) => Math.max(0, p - 1)), 1000);
    return () => clearInterval(t);
  }, [phase, timeLeft, resolveGame]);

  if (wallet === null) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const timerPct = (timeLeft / ROUND_DURATION) * 100;
  const timerColor = timeLeft > 12 ? "#22c55e" : timeLeft > 6 ? "#f59e0b" : "#ef4444";

  return (
    <div className="min-h-screen bg-[#0f172a] text-white pb-24">
      {/* DEMO BANNER */}
      <div className="w-full bg-amber-500/20 border-b border-amber-500/40 px-4 py-2 flex items-center justify-between">
        <span className="text-amber-400 text-xs font-black uppercase tracking-widest">
          Tutorial Simulator - No Subscription Needed
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push(nextPath)}
            className="text-[10px] font-black uppercase tracking-widest text-amber-300/80 hover:text-amber-200 transition-colors"
          >
            Skip Tutorial
          </button>
          <Link
            href={nextPath}
            className="flex items-center gap-1 text-xs font-bold text-amber-400 hover:text-amber-300 transition-colors"
          >
            Play Real <ArrowRight size={12} />
          </Link>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 pt-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-black">Predict &amp; Win</h1>
            <p className="text-xs text-gray-400">Predict: Odd, Even, or Both?</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Demo Balance</p>
            <p className="text-xl font-black text-amber-400">${wallet.toFixed(2)}</p>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[#1e293b] rounded-2xl p-3 text-center">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Session Earnings</p>
            <div className="flex items-center justify-center gap-1">
              <TrendingUp size={14} className="text-emerald-400" />
              <span className="text-base font-black text-emerald-400">+${totalEarnings.toFixed(2)}</span>
            </div>
          </div>
          <div className="bg-[#1e293b] rounded-2xl p-3 text-center">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Reward/Win</p>
            <span className="text-base font-black text-yellow-400">+${WIN_REWARD.toFixed(2)}</span>
          </div>
        </div>

        {/* Timer */}
        <div className="bg-[#1e293b] rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Timer size={14} style={{ color: timerColor }} />
              <span className="text-xs text-gray-400 uppercase tracking-wider">Round Timer</span>
            </div>
            <span className="text-2xl font-black tabular-nums" style={{ color: timerColor }}>
              {timeLeft}s
            </span>
          </div>
          <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${timerPct}%`, background: timerColor }}
            />
          </div>
        </div>

        {/* Choice Buttons */}
        <div className="bg-[#1e293b] rounded-2xl p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-3">Make Your Prediction</p>
          <div className="grid grid-cols-3 gap-3">
            {CONDITIONS.map((c) => {
              const isSelected = selectedChoice === c;
              const colors = { Odd: "#a78bfa", Even: "#34d399", Both: "#f59e0b" };
              const color = colors[c];
              return (
                <button
                  key={c}
                  onClick={() => { if (!hasBet && phase === "betting") setSelectedChoice(c); }}
                  disabled={hasBet || phase !== "betting"}
                  className="py-4 rounded-2xl font-black text-sm transition-all active:scale-95 disabled:opacity-60"
                  style={{
                    background: isSelected ? `${color}22` : "#0f172a",
                    border: `2px solid ${isSelected ? color : "#334155"}`,
                    color: isSelected ? color : "#64748b",
                  }}
                >
                  {c}
                </button>
              );
            })}
          </div>
        </div>

        {/* Bet Button */}
        {!hasBet && phase === "betting" && (
          <button
            onClick={() => { if (selectedChoice) setHasBet(true); }}
            disabled={!selectedChoice}
            className="w-full py-3 rounded-xl font-black text-sm uppercase tracking-wider transition-all disabled:opacity-40"
            style={{ background: selectedChoice ? "#f59e0b" : "#334155", color: "white" }}
          >
            {selectedChoice ? `Lock — ${selectedChoice} wins +$${WIN_REWARD.toFixed(2)}` : "Select a condition first"}
          </button>
        )}

        {hasBet && phase === "betting" && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 text-center">
            <CheckCircle2 size={20} className="text-amber-400 mx-auto mb-1" />
            <p className="text-sm font-bold text-amber-400">Prediction Locked: {selectedChoice}</p>
            <p className="text-xs text-gray-400 mt-1">Win +${WIN_REWARD.toFixed(2)} if correct</p>
          </div>
        )}

        {phase === "resolving" && (
          <div className="bg-[#1e293b] rounded-2xl p-4 text-center">
            <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-sm text-gray-400">Resolving round…</p>
          </div>
        )}

        {/* Result */}
        {showResult && (
          <div
            className="rounded-2xl p-5 text-center"
            style={{
              background: resultType === "win" ? "#22c55e15" : "#ef444415",
              border: `1px solid ${resultType === "win" ? "#22c55e40" : "#ef444440"}`,
            }}
          >
            {resultType === "win" ? (
              <>
                <Trophy size={28} className="text-yellow-400 mx-auto mb-2" />
                <p className="text-lg font-black text-emerald-400">Correct! +${WIN_REWARD.toFixed(2)}</p>
                <p className="text-xs text-gray-400 mt-1">Result was: {resultCondition}</p>
              </>
            ) : (
              <>
                <XCircle size={28} className="text-red-400 mx-auto mb-2" />
                <p className="text-lg font-black text-red-400">Wrong Prediction</p>
                <p className="text-xs text-gray-400 mt-1">
                  You picked: {stateRef.current.selectedChoice} · Result: {resultCondition}
                </p>
              </>
            )}
          </div>
        )}

        {/* History */}
        {history.length > 0 && (
          <div className="bg-[#1e293b] rounded-2xl p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-3">Round History</p>
            <div className="space-y-2">
              {history.map((h, i) => (
                <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-white/5">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${h.won === true ? "bg-emerald-400" : h.won === false ? "bg-red-400" : "bg-gray-600"}`} />
                    <span className="text-gray-400">{h.pick ? `Picked: ${h.pick}` : "No pick"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">Result: {h.drawn}</span>
                    {h.won === true && <span className="text-emerald-400 font-bold">+${WIN_REWARD.toFixed(2)}</span>}
                    {h.won === false && <span className="text-red-400 font-bold">Miss</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
