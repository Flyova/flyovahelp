"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Info, RefreshCw, Timer, Trophy, Users } from "lucide-react";

const WIN_TARGET = 5;
const TURN_SECONDS = 20;

function getPool() {
  const a = Math.floor(Math.random() * 90) + 10;
  let b = Math.floor(Math.random() * 90) + 10;
  while (b === a) b = Math.floor(Math.random() * 90) + 10;
  return [a, b];
}

export default function DemoPlayWithFriends() {
  const router = useRouter();
  const [nextPath, setNextPath] = useState("/game/1");

  const [round, setRound] = useState(1);
  const [phase, setPhase] = useState("pick");
  const [timer, setTimer] = useState(TURN_SECONDS);
  const [pool, setPool] = useState(() => getPool());
  const [botHidden, setBotHidden] = useState(() => {
    const p = getPool();
    return p[Math.floor(Math.random() * p.length)];
  });
  const [myHidden, setMyHidden] = useState(null);
  const [myGuess, setMyGuess] = useState(null);
  const [scores, setScores] = useState({ you: 0, bot: 0 });
  const [outcome, setOutcome] = useState("");
  const [tip, setTip] = useState("Pick one number to hide. Opponent will try to guess it.");

  const isDone = phase === "done";

  useEffect(() => {
    if (typeof window === "undefined") return;
    const nextParam = new URLSearchParams(window.location.search).get("next");
    if (nextParam && nextParam.startsWith("/")) {
      setNextPath(nextParam);
    }
  }, []);

  const startRound = () => {
    const nextPool = getPool();
    setPool(nextPool);
    setBotHidden(nextPool[Math.floor(Math.random() * nextPool.length)]);
    setMyHidden(null);
    setMyGuess(null);
    setTimer(TURN_SECONDS);
    setPhase("pick");
    setTip("Pick one number to hide. Opponent will try to guess it.");
  };

  const applyRound = (youWon, message) => {
    const next = {
      you: scores.you + (youWon ? 1 : 0),
      bot: scores.bot + (youWon ? 0 : 1),
    };
    setScores(next);
    setOutcome(message);

    if (next.you >= WIN_TARGET || next.bot >= WIN_TARGET) {
      setPhase("done");
      setTip(next.you > next.bot ? "Great run. You reached the win target first." : "Tutorial finished. Opponent reached the win target first.");
      return;
    }

    setPhase("result");
    setTip("Round closed. Continue to the next round.");
  };

  const handlePick = (num) => {
    if (phase !== "pick") return;
    setMyHidden(num);
    setPhase("guess");
    setTimer(TURN_SECONDS);
    setTip("Now guess the opponent hidden number from the same two choices.");
  };

  const handleGuess = (num, isAuto = false) => {
    if (phase !== "guess") return;
    setMyGuess(num);
    const won = num === botHidden;
    const autoText = isAuto ? " (auto guess)" : "";
    const resultText = won
      ? `Correct guess${autoText}. You win this round.`
      : `Wrong guess${autoText}. Opponent wins this round.`;
    applyRound(won, `${resultText} Bot hidden: ${botHidden}.`);
  };

  const handleTimeout = () => {
    if (phase === "pick") {
      applyRound(false, "Time expired before pick. Opponent wins this round.");
      return;
    }
    if (phase === "guess") {
      const fallback = pool[Math.floor(Math.random() * pool.length)];
      handleGuess(fallback, true);
    }
  };

  useEffect(() => {
    if (isDone || phase === "result") return;
    const id = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) {
          clearInterval(id);
          handleTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [phase, isDone, pool]);

  const progressWidth = useMemo(() => `${(timer / TURN_SECONDS) * 100}%`, [timer]);

  return (
    <div className="min-h-screen bg-[#0f172a] text-white pb-24">
      <div className="w-full bg-amber-500/20 border-b border-amber-500/40 px-4 py-2 flex items-center justify-between">
        <span className="text-amber-400 text-xs font-black uppercase tracking-widest">Tutorial Simulator - Play with Friends</span>
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

      <div className="max-w-md mx-auto px-4 pt-4 space-y-4">
        <div className="bg-[#1e293b] rounded-3xl border border-white/10 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users size={18} className="text-[#a78bfa]" />
              <h1 className="text-lg font-black italic uppercase tracking-tight">Play with Friends Tutorial</h1>
            </div>
            <button
              onClick={() => {
                setRound(1);
                setScores({ you: 0, bot: 0 });
                setOutcome("");
                startRound();
              }}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/15 transition-colors"
              title="Reset tutorial"
            >
              <RefreshCw size={14} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="bg-black/20 rounded-2xl p-3">
              <p className="text-[10px] text-white/45 font-black uppercase tracking-widest">You</p>
              <p className="text-2xl font-black text-[#fc7952]">{scores.you}</p>
            </div>
            <div className="bg-black/20 rounded-2xl p-3 text-right">
              <p className="text-[10px] text-white/45 font-black uppercase tracking-widest">Opponent</p>
              <p className="text-2xl font-black text-[#a78bfa]">{scores.bot}</p>
            </div>
          </div>

          <div className="mt-4 bg-black/20 rounded-2xl p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-white/50">Round {round} · First to {WIN_TARGET}</span>
              <div className="flex items-center gap-1">
                <Timer size={12} className="text-amber-400" />
                <span className="text-sm font-black tabular-nums text-amber-300">{timer}s</span>
              </div>
            </div>
            <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
              <div className="h-full rounded-full bg-amber-400 transition-all duration-500" style={{ width: progressWidth }} />
            </div>
          </div>
        </div>

        <div className="bg-[#1e293b] rounded-3xl border border-white/10 p-5">
          <div className="flex items-start gap-3">
            <Info size={16} className="text-[#a78bfa] mt-0.5" />
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-white/50">Coach Tip</p>
              <p className="text-sm font-bold text-white/85 mt-1">{tip}</p>
              {outcome && <p className="text-xs font-bold text-emerald-300 mt-2">{outcome}</p>}
            </div>
          </div>
        </div>

        <div className="bg-[#1e293b] rounded-3xl border border-white/10 p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/50 mb-3">
            {phase === "pick" ? "Step 1 - Hide a Number" : phase === "guess" ? "Step 2 - Guess Opponent Number" : "Round Summary"}
          </p>

          <div className="grid grid-cols-2 gap-3">
            {pool.map((num) => (
              <button
                key={num}
                onClick={() => {
                  if (phase === "pick") handlePick(num);
                  if (phase === "guess") handleGuess(num);
                }}
                disabled={phase !== "pick" && phase !== "guess"}
                className={`rounded-2xl border px-4 py-5 text-2xl font-black transition-all ${
                  myHidden === num
                    ? "border-[#fc7952] bg-[#fc7952]/15 text-[#fc7952]"
                    : myGuess === num
                      ? "border-[#a78bfa] bg-[#a78bfa]/15 text-[#d8ccff]"
                      : "border-white/10 bg-black/20 text-white/90 hover:bg-white/5"
                } disabled:opacity-60`}
              >
                {num}
              </button>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            {phase === "result" && (
              <button
                onClick={() => {
                  setRound((r) => r + 1);
                  startRound();
                }}
                className="flex-1 bg-[#613de6] hover:bg-[#7251ed] rounded-2xl py-3 text-[11px] font-black uppercase tracking-widest transition-all active:scale-95"
              >
                Next Round
              </button>
            )}

            {isDone && (
              <div className="w-full space-y-3">
                <div className="rounded-2xl bg-black/30 border border-white/10 p-4 text-center">
                  <Trophy size={22} className="mx-auto text-amber-400 mb-2" />
                  <p className="text-sm font-black uppercase text-white">
                    {scores.you > scores.bot ? "Tutorial Completed - You Win" : "Tutorial Completed - Opponent Wins"}
                  </p>
                </div>
                <button
                  onClick={() => router.push(nextPath)}
                  className="w-full bg-[#fc7952] hover:brightness-110 rounded-2xl py-3 text-[11px] font-black uppercase tracking-widest transition-all active:scale-95"
                >
                  Start Real Game
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
