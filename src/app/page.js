"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { db } from "@/lib/firebase";
import { collection, query, orderBy, limit, onSnapshot, where, getDocs } from "firebase/firestore";
import {
  ArrowRight, ArrowLeft, X, Star, ShieldCheck, Zap, Menu, Timer, Trophy, Wallet,
  Instagram, Facebook, Twitter, Loader2, Users, CheckCircle2,
  TrendingUp, MessageCircle, ChevronDown, ChevronUp, Target,
  DollarSign, Clock, Gift, Hash, FileText, Calendar
} from "lucide-react";

// Animated counter hook
function useCountUp(target, duration = 2000) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const started = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started.current) {
        started.current = true;
        const start = Date.now();
        const tick = () => {
          const elapsed = Date.now() - start;
          const progress = Math.min(elapsed / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          setCount(Math.floor(eased * target));
          if (progress < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
    }, { threshold: 0.3 });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target, duration]);

  return [count, ref];
}

function StatCard({ value, suffix, label, color }) {
  const [count, ref] = useCountUp(value);
  return (
    <div ref={ref} className="text-center">
      <p className={`text-3xl md:text-4xl font-black italic tracking-tighter ${color}`}>
        {count.toLocaleString()}{suffix}
      </p>
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 mt-1">{label}</p>
    </div>
  );
}

const FAQ_ITEMS = [
  {
    q: "How does deposit work?",
    a: "Proceed to deposit using your verified crypto wallet or a verified Flyova Agent in your region. Deposits are processed in less than 30 minutes.",
  },
  {
    q: "How does withdrawal work?",
    a: "Request a withdrawal from your wallet to your verified crypto wallet or a verified Flyova Agent in your region. Agent payouts are completed within minutes.",
  },
  {
    q: "What is a Flyova Agent?",
    a: "Agents are verified community members who process deposits and withdrawals. They earn a commission on every transaction they handle.",
  },
  {
    q: "How do I transfer money to another user?",
    a: "Instantly transfer using the recipient's 8-digit account pin. No admin approval needed.",
  },
  {
    q: "Can I stake on my own?",
    a: "Yes. Flyova provides medium for users to stake on their own as many times and anytime as possible.",
  },
  {
    q: "How much do I need to play Flyova games?",
    a: "Deposit as low as 10.00 USD to start your journey on Flyovahelp. Minimum deposit starts from 1.00 USD.",
  },
  {
    q: "Is there free prediction days?",
    a: "Absolutely. Flyova admins offer daily free predictions on weekdays and weekends.",
  },
  {
    q: "Which country is eligible to create Flyova account?",
    a: "Everyone, regardless of country, can own a verified Flyova account.",
  },
  {
    q: "What do I need to apply as a Flyova Agent?",
    a: "Just a verified Flyova account, age qualification and trustworthiness.",
  },
  {
    q: "What are the withdrawal days?",
    a: "Flyova do not have any specific days or time for withdrawal. Users can withdraw anytime and any-day.",
  },
  {
    q: "How do I earn jackpot?",
    a: "Participate on Flyova activities including referral programs, advertising, deposits, stakes, etc to earn.",
  },
];

// ─── DEMO COMPONENTS ────────────────────────────────────────────────────────

function DemoGamePicker({ onSelect, onClose }) {
  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#fc7952] mb-1">No account needed</p>
          <h2 className="text-2xl font-black italic uppercase tracking-tighter text-white">Try a Demo</h2>
          <p className="text-xs font-bold text-gray-500 mt-1">Pick a game. No real money, no sign-up.</p>
        </div>
        <button onClick={onClose} className="bg-white/5 p-2.5 rounded-xl text-gray-500 hover:text-white transition-colors flex-shrink-0">
          <X size={18} />
        </button>
      </div>

      <div className="space-y-3">
        <button onClick={() => onSelect("flyova")}
          className="w-full bg-[#1e293b] border border-white/5 hover:border-[#fc7952]/40 p-5 rounded-2xl text-left transition-all group">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-[#fc7952]/10 flex items-center justify-center text-[#fc7952] flex-shrink-0">
              <Hash size={22} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-black italic uppercase tracking-tighter text-white">Flyova to Dollars</h3>
              <p className="text-xs font-bold text-gray-500 mt-0.5">Pick numbers · Countdown · Win 1.3×</p>
            </div>
            <ArrowRight size={16} className="text-gray-600 group-hover:text-[#fc7952] transition-colors flex-shrink-0" />
          </div>
        </button>

        <button onClick={() => onSelect("predict")}
          className="w-full bg-[#1e293b] border border-white/5 hover:border-emerald-500/40 p-5 rounded-2xl text-left transition-all group">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 flex-shrink-0">
              <Target size={22} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-black italic uppercase tracking-tighter text-white">Predict and Win</h3>
              <p className="text-xs font-bold text-gray-500 mt-0.5">Predict the outcome · Win $0.20 per round</p>
            </div>
            <ArrowRight size={16} className="text-gray-600 group-hover:text-emerald-400 transition-colors flex-shrink-0" />
          </div>
        </button>
      </div>
    </div>
  );
}

function TutorialTip({ step, total, accent = "#a78bfa", children }) {
  return (
    <div className="rounded-2xl p-4 space-y-2" style={{ background: `${accent}18`, border: `1px solid ${accent}35` }}>
      {step && (
        <div className="flex items-center justify-between mb-1">
          <span className="text-[9px] font-black uppercase tracking-[0.25em]" style={{ color: accent }}>
            Step {step} of {total}
          </span>
          <div className="flex gap-1">
            {Array.from({ length: total }, (_, i) => (
              <div key={i} className="w-4 h-1 rounded-full transition-all" style={{ background: i < step ? accent : `${accent}30` }} />
            ))}
          </div>
        </div>
      )}
      <p className="text-xs font-bold text-white/75 leading-relaxed">{children}</p>
    </div>
  );
}

function FlyovaDemo({ onBack, onRegister }) {
  const DEMO_NUMBERS = [1, 2, 3, 4];
  const [phase, setPhase] = useState("intro"); // intro | numbers | stake | countdown | result
  const [picks, setPicks] = useState([]);
  const [stake, setStake] = useState(null);
  const [timeLeft, setTimeLeft] = useState(10);
  const [winningNums, setWinningNums] = useState([]);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (phase !== "countdown") return;
    if (timeLeft <= 0) {
      const w1 = DEMO_NUMBERS[Math.floor(Math.random() * DEMO_NUMBERS.length)];
      let w2;
      do { w2 = DEMO_NUMBERS[Math.floor(Math.random() * DEMO_NUMBERS.length)]; } while (w2 === w1);
      setWinningNums([w1, w2]);
      setResult(picks.includes(w1) || picks.includes(w2) ? "win" : "lose");
      setPhase("result");
      return;
    }
    const t = setTimeout(() => setTimeLeft(p => p - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, timeLeft, picks]);

  const togglePick = (n) => {
    if (picks.includes(n)) setPicks(picks.filter(p => p !== n));
    else if (picks.length < 2) setPicks([...picks, n]);
  };

  const reset = () => { setPhase("intro"); setPicks([]); setStake(null); setTimeLeft(10); setWinningNums([]); setResult(null); };
  const winAmount = stake ? +(stake * 1.3).toFixed(2) : 0;

  return (
    <div className="p-7 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={phase === "intro" ? onBack : () => { if (phase === "numbers") setPhase("intro"); if (phase === "stake") setPhase("numbers"); }}
          className="bg-white/5 p-2.5 rounded-xl text-gray-500 hover:text-white transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#fc7952]">Tutorial</p>
          <h2 className="text-lg font-black italic uppercase tracking-tighter text-white">Flyova to Dollars</h2>
        </div>
        {phase !== "intro" && (
          <div className="bg-[#1e293b] px-3 py-2 rounded-xl border border-white/5 text-right">
            <p className="text-[9px] font-black text-gray-500 uppercase">Demo Wallet</p>
            <p className="text-sm font-black text-emerald-400">$50.00</p>
          </div>
        )}
      </div>

      {/* INTRO */}
      {phase === "intro" && (
        <div className="space-y-5">
          <div className="bg-[#fc7952]/10 border border-[#fc7952]/20 rounded-2xl p-5 space-y-4">
            <p className="text-sm font-black italic uppercase tracking-tighter text-white">How the game works</p>
            <ul className="space-y-3">
              {[
                { n: "1", text: "Every 120 seconds, the game draws 2 random winning numbers." },
                { n: "2", text: "Before the draw closes, you pick any 2 numbers you think will come up." },
                { n: "3", text: "You stake an amount from your wallet on your picks." },
                { n: "4", text: "If either of your picks matches a winning number, you win 1.3× your stake instantly." },
              ].map(item => (
                <li key={item.n} className="flex gap-3">
                  <span className="w-5 h-5 rounded-full bg-[#fc7952]/20 text-[#fc7952] text-[10px] font-black flex items-center justify-center flex-shrink-0 mt-0.5">{item.n}</span>
                  <p className="text-xs font-bold text-white/75 leading-relaxed">{item.text}</p>
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-[#1e293b] border border-white/5 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 flex-shrink-0">
              <Wallet size={16} />
            </div>
            <p className="text-xs font-bold text-gray-400 leading-relaxed">
              You start with a <span className="text-white">$50 demo wallet</span>. No real money involved — this tutorial just shows you exactly how to play.
            </p>
          </div>
          <button onClick={() => setPhase("numbers")}
            className="w-full bg-[#fc7952] text-white py-4 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2">
            Start Tutorial <ArrowRight size={14} />
          </button>
        </div>
      )}

      {/* STEP 1 — PICK NUMBERS */}
      {phase === "numbers" && (
        <div className="space-y-4">
          <TutorialTip step={1} total={3} accent="#fc7952">
            Pick any 2 numbers from the grid below. The game will draw 2 winning numbers at random — if either of your picks matches, you win. There's no correct answer; it's your lucky guess.
          </TutorialTip>
          <div className="grid grid-cols-4 gap-2">
            {DEMO_NUMBERS.map(n => (
              <button key={n} onClick={() => togglePick(n)}
                className={`aspect-square rounded-xl font-black text-sm transition-all active:scale-90 ${
                  picks.includes(n)
                    ? "bg-[#fc7952] text-white shadow-lg shadow-[#fc7952]/30 scale-105"
                    : "bg-[#1e293b] border border-white/5 text-gray-400 hover:border-[#fc7952]/40"
                }`}>
                {n}
              </button>
            ))}
          </div>
          <p className="text-center text-[10px] font-black text-gray-600 uppercase tracking-widest">{picks.length}/2 numbers selected</p>
          <button onClick={() => setPhase("stake")} disabled={picks.length < 2}
            className="w-full bg-[#613de6] disabled:opacity-30 text-white py-4 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all active:scale-95">
            Next: Set Your Stake →
          </button>
        </div>
      )}

      {/* STEP 2 — STAKE */}
      {phase === "stake" && (
        <div className="space-y-4">
          <TutorialTip step={2} total={3} accent="#fc7952">
            Choose how much to put on the line. This amount comes out of your wallet when you place the bet. Win = stake × 1.3. So a $10 stake returns $13 if you're right. You can stake any amount within your balance.
          </TutorialTip>
          <div className="bg-[#1e293b]/60 px-4 py-2 rounded-xl border border-white/5 flex items-center justify-between">
            <span className="text-[10px] font-black text-gray-500 uppercase">Your picks</span>
            <span className="text-sm font-black text-[#fc7952]">{picks.join(" & ")}</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[1, 5, 10].map(s => (
              <button key={s} onClick={() => setStake(s)}
                className={`py-5 rounded-2xl font-black text-base transition-all active:scale-90 ${
                  stake === s ? "bg-[#fc7952] text-white shadow-lg shadow-[#fc7952]/30" : "bg-[#1e293b] border border-white/5 text-gray-300 hover:border-[#fc7952]/30"
                }`}>
                ${s}
              </button>
            ))}
          </div>
          {stake && (
            <div className="bg-[#1e293b] p-4 rounded-2xl border border-white/5 space-y-2">
              <div className="flex justify-between text-xs font-black">
                <span className="text-gray-500 uppercase">You stake</span>
                <span className="text-white">${stake}.00</span>
              </div>
              <div className="flex justify-between text-xs font-black">
                <span className="text-gray-500 uppercase">If you win, you get</span>
                <span className="text-emerald-400">${winAmount} (+${(winAmount - stake).toFixed(2)} profit)</span>
              </div>
            </div>
          )}
          <button onClick={() => setPhase("countdown")} disabled={!stake}
            className="w-full bg-[#fc7952] disabled:opacity-30 text-white py-4 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all active:scale-95">
            Place Stake & Watch the Draw →
          </button>
        </div>
      )}

      {/* STEP 3 — COUNTDOWN */}
      {phase === "countdown" && (
        <div className="space-y-5">
          <TutorialTip step={3} total={3} accent="#fc7952">
            The draw is now running. In the real game this lasts 120 seconds — other players are placing stakes at the same time. When the timer hits zero, 2 winning numbers are revealed and all matching bets are paid out instantly.
          </TutorialTip>
          <div className="flex flex-col items-center py-6 space-y-4">
            <div className="relative w-28 h-28">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
                <circle cx="50" cy="50" r="42" fill="none" stroke="#fc7952" strokeWidth="8"
                  strokeDasharray={`${2 * Math.PI * 42}`}
                  strokeDashoffset={`${2 * Math.PI * 42 * (1 - timeLeft / 10)}`}
                  strokeLinecap="round" className="transition-all duration-1000" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-4xl font-black italic text-white">{timeLeft}</span>
              </div>
            </div>
            <div className="text-center space-y-1">
              <p className="text-xs font-black uppercase tracking-widest text-gray-500">Draw in progress — sped up for demo</p>
              <p className="text-sm font-bold text-white">Your picks: <span className="text-[#fc7952] font-black">{picks.join(" & ")}</span> · Stake: <span className="text-white font-black">${stake}</span></p>
            </div>
          </div>
        </div>
      )}

      {/* RESULT */}
      {phase === "result" && (
        <div className="space-y-4">
          <div className={`p-6 rounded-2xl text-center space-y-2 ${result === "win" ? "bg-emerald-500/10 border border-emerald-500/30" : "bg-white/5 border border-white/10"}`}>
            <p className="text-4xl">{result === "win" ? "🎉" : "🎯"}</p>
            <p className={`text-xl font-black italic uppercase tracking-tighter ${result === "win" ? "text-emerald-400" : "text-white"}`}>
              {result === "win" ? `You won $${winAmount}!` : "No match this draw"}
            </p>
            <p className="text-xs font-bold text-gray-400">
              Winning numbers were: <span className="text-white font-black">{winningNums.join(" & ")}</span>
              {result === "lose" && <span className="block mt-1 text-gray-500">Your picks ({picks.join(" & ")}) didn't match — try different numbers next round.</span>}
            </p>
          </div>
          <div className="bg-[#613de6]/10 border border-[#613de6]/25 rounded-2xl p-4 space-y-1.5">
            <p className="text-[10px] font-black uppercase tracking-widest text-[#a78bfa]">How payouts work</p>
            <p className="text-xs font-bold text-white/65 leading-relaxed">
              In the real game, winning amounts land in your wallet instantly after the draw. You can withdraw anytime through a verified Flyova Agent — no waiting, no hidden fees.
            </p>
          </div>
          <button onClick={onRegister}
            className="w-full bg-[#613de6] text-white py-4 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2">
            Play for Real — Sign Up Free <ArrowRight size={14} />
          </button>
          <button onClick={reset}
            className="w-full bg-white/5 border border-white/5 text-gray-500 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-white/10 transition-all">
            Replay Tutorial
          </button>
        </div>
      )}
    </div>
  );
}

function PredictDemo({ onBack, onRegister }) {
  const TOTAL_ROUNDS = 3;
  const [round, setRound] = useState(1);
  const [phase, setPhase] = useState("intro"); // intro | pick | countdown | result | done
  const [choice, setChoice] = useState(null);
  const [timeLeft, setTimeLeft] = useState(5);
  const [outcome, setOutcome] = useState(null);
  const [earnings, setEarnings] = useState(0);

  useEffect(() => {
    if (phase !== "countdown") return;
    if (timeLeft <= 0) {
      const res = Math.random() > 0.5 ? "A" : "B";
      setOutcome(res);
      if (res === choice) setEarnings(e => +(e + 0.20).toFixed(2));
      setPhase("result");
      return;
    }
    const t = setTimeout(() => setTimeLeft(p => p - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, timeLeft, choice]);

  const nextRound = () => {
    if (round >= TOTAL_ROUNDS) { setPhase("done"); return; }
    setRound(r => r + 1);
    setPhase("pick");
    setChoice(null);
    setTimeLeft(5);
    setOutcome(null);
  };

  const reset = () => { setRound(1); setPhase("intro"); setChoice(null); setTimeLeft(5); setOutcome(null); setEarnings(0); };

  return (
    <div className="p-7 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={phase === "intro" ? onBack : () => { if (phase === "pick") setPhase("intro"); }}
          className="bg-white/5 p-2.5 rounded-xl text-gray-500 hover:text-white transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-400">Tutorial</p>
          <h2 className="text-lg font-black italic uppercase tracking-tighter text-white">Predict and Win</h2>
        </div>
        {phase !== "intro" && phase !== "done" && (
          <div className="bg-[#1e293b] px-3 py-2 rounded-xl border border-white/5 text-right">
            <p className="text-[9px] font-black text-gray-500 uppercase">Earned</p>
            <p className="text-sm font-black text-emerald-400">${earnings.toFixed(2)}</p>
          </div>
        )}
      </div>

      {/* Round progress bar (active rounds only) */}
      {(phase === "pick" || phase === "countdown" || phase === "result") && (
        <div className="space-y-1">
          <div className="flex gap-1.5">
            {Array.from({ length: TOTAL_ROUNDS }, (_, i) => (
              <div key={i} className={`flex-1 h-1.5 rounded-full transition-all ${i < round - 1 ? "bg-emerald-400" : i === round - 1 ? "bg-[#fc7952]" : "bg-white/10"}`} />
            ))}
          </div>
          <p className="text-[9px] font-black uppercase tracking-widest text-gray-600 text-right">Round {round} of {TOTAL_ROUNDS}</p>
        </div>
      )}

      {/* INTRO */}
      {phase === "intro" && (
        <div className="space-y-5">
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-5 space-y-4">
            <p className="text-sm font-black italic uppercase tracking-tighter text-white">How the game works</p>
            <ul className="space-y-3">
              {[
                { n: "1", text: "Buy a time-based subscription — from 3 hours ($12) up to 1 week ($650)." },
                { n: "2", text: "Each round (60 seconds), the game randomly lands on one of two outcomes." },
                { n: "3", text: "Before the round closes, predict which outcome it will be." },
                { n: "4", text: "Correct prediction = $0.20 credited to your wallet. Play as many rounds as your subscription allows." },
              ].map(item => (
                <li key={item.n} className="flex gap-3">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-black flex items-center justify-center flex-shrink-0 mt-0.5">{item.n}</span>
                  <p className="text-xs font-bold text-white/75 leading-relaxed">{item.text}</p>
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-[#1e293b] border border-white/5 rounded-2xl p-4 space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Subscription plans</p>
            <div className="grid grid-cols-2 gap-2">
              {[["3 Hours", "$12"], ["5 Hours", "$20"], ["12 Hours", "$48"], ["1 Day", "$95"], ["1 Week", "$650"]].map(([label, price]) => (
                <div key={label} className="bg-black/20 rounded-xl px-3 py-2 flex justify-between items-center">
                  <span className="text-[10px] font-black text-gray-400 uppercase">{label}</span>
                  <span className="text-[10px] font-black text-emerald-400">{price}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-[#1e293b] border border-white/5 rounded-2xl p-4 flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#fc7952]/10 flex items-center justify-center text-[#fc7952] flex-shrink-0 mt-0.5">
              <Target size={16} />
            </div>
            <p className="text-xs font-bold text-gray-400 leading-relaxed">
              This tutorial simulates <span className="text-white">3 rounds</span> so you can see exactly how predictions and payouts work before you subscribe.
            </p>
          </div>
          <button onClick={() => setPhase("pick")}
            className="w-full bg-emerald-500 text-white py-4 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2">
            Start Tutorial <ArrowRight size={14} />
          </button>
        </div>
      )}

      {/* PICK PHASE */}
      {phase === "pick" && (
        <div className="space-y-4">
          <TutorialTip step={round === 1 ? 1 : undefined} total={2} accent="#10b981">
            {round === 1
              ? "Each round the game will randomly pick Blue or Orange. Your job is to predict which one it'll be before the timer runs out. Tap your prediction below."
              : "Same mechanic — new round. Your prediction resets each time. Pick again and lock it in."}
          </TutorialTip>
          <div className="grid grid-cols-2 gap-4">
            {[
              { id: "A", emoji: "🔵", label: "Blue", activeClass: "bg-[#613de6] shadow-[#613de6]/30" },
              { id: "B", emoji: "🟠", label: "Orange", activeClass: "bg-[#fc7952] shadow-[#fc7952]/30" },
            ].map(opt => (
              <button key={opt.id} onClick={() => setChoice(opt.id)}
                className={`py-7 rounded-2xl font-black transition-all active:scale-95 ${
                  choice === opt.id
                    ? `${opt.activeClass} text-white shadow-lg scale-105`
                    : "bg-[#1e293b] border border-white/5 text-gray-500 hover:border-white/20"
                }`}>
                <div className="text-3xl">{opt.emoji}</div>
                <div className="text-xs mt-2 uppercase tracking-widest">{opt.label}</div>
              </button>
            ))}
          </div>
          <button onClick={() => setPhase("countdown")} disabled={!choice}
            className="w-full bg-emerald-500 disabled:opacity-30 text-white py-4 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all active:scale-95">
            Lock In Prediction →
          </button>
        </div>
      )}

      {/* COUNTDOWN */}
      {phase === "countdown" && (
        <div className="space-y-5">
          <TutorialTip accent="#10b981">
            The round timer is running. In the real game this lasts 60 seconds — plenty of time to decide. Once it hits zero the outcome is revealed and your wallet is updated immediately if you're right.
          </TutorialTip>
          <div className="flex flex-col items-center py-6 space-y-4">
            <div className="relative w-24 h-24">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
                <circle cx="50" cy="50" r="42" fill="none" stroke="#10b981" strokeWidth="8"
                  strokeDasharray={`${2 * Math.PI * 42}`}
                  strokeDashoffset={`${2 * Math.PI * 42 * (1 - timeLeft / 5)}`}
                  strokeLinecap="round" className="transition-all duration-1000" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-3xl font-black italic text-white">{timeLeft}</span>
              </div>
            </div>
            <p className="text-xs font-black uppercase tracking-widest text-gray-500">Round closing — sped up for tutorial</p>
            <p className="text-sm font-bold text-white">
              Your prediction: <span className={`font-black ${choice === "A" ? "text-[#613de6]" : "text-[#fc7952]"}`}>
                {choice === "A" ? "🔵 Blue" : "🟠 Orange"}
              </span>
            </p>
          </div>
        </div>
      )}

      {/* RESULT */}
      {phase === "result" && (
        <div className="space-y-4">
          <div className={`p-5 rounded-2xl text-center space-y-2 ${choice === outcome ? "bg-emerald-500/10 border border-emerald-500/30" : "bg-white/5 border border-white/10"}`}>
            <p className="text-3xl">{choice === outcome ? "✅" : "❌"}</p>
            <p className={`text-xl font-black italic uppercase tracking-tighter ${choice === outcome ? "text-emerald-400" : "text-white"}`}>
              {choice === outcome ? "+$0.20 earned!" : "Wrong this round"}
            </p>
            <p className="text-xs font-bold text-gray-400">
              Outcome was: <span className="text-white font-black">{outcome === "A" ? "🔵 Blue" : "🟠 Orange"}</span>
            </p>
          </div>
          <TutorialTip accent="#10b981">
            {choice === outcome
              ? "Correct! $0.20 lands in your wallet instantly. In a real session with a 1-day plan, you could play ~1,440 rounds — hundreds of $0.20 wins add up fast."
              : "Not this time — the outcome was random. That's the challenge. Over many rounds, consistent predictions build steady earnings. No round costs you anything extra beyond your subscription."}
          </TutorialTip>
          <div className="bg-[#1e293b] p-3 rounded-xl flex justify-between items-center">
            <span className="text-xs font-black uppercase text-gray-500">Running total</span>
            <span className="text-base font-black text-emerald-400">${earnings.toFixed(2)}</span>
          </div>
          <button onClick={nextRound}
            className="w-full bg-[#fc7952] text-white py-4 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all active:scale-95">
            {round >= TOTAL_ROUNDS ? "See Summary →" : `Next Round →`}
          </button>
        </div>
      )}

      {/* DONE */}
      {phase === "done" && (
        <div className="space-y-5">
          <div className="p-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-center space-y-2">
            <p className="text-4xl">🏆</p>
            <p className="text-2xl font-black italic uppercase tracking-tighter text-white">Tutorial Complete!</p>
            <p className="text-sm font-bold text-gray-400">
              You earned <span className="text-emerald-400 font-black">${earnings.toFixed(2)}</span> across {TOTAL_ROUNDS} rounds
            </p>
          </div>
          <div className="bg-[#1e293b] border border-white/5 rounded-2xl p-4 space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Real game potential</p>
            <p className="text-xs font-bold text-white/70 leading-relaxed">
              A 1-day plan ($35) gives you ~1,440 rounds. At $0.20 per correct prediction, even a 50% hit rate earns you $144 — over 4× your subscription cost.
            </p>
          </div>
          <button onClick={onRegister}
            className="w-full bg-emerald-500 text-white py-4 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2">
            Subscribe & Start Winning <ArrowRight size={14} />
          </button>
          <button onClick={reset}
            className="w-full bg-white/5 border border-white/5 text-gray-500 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-white/10 transition-all">
            Replay Tutorial
          </button>
        </div>
      )}
    </div>
  );
}

function DemoModal({ onClose, router }) {
  const [screen, setScreen] = useState("pick");
  const handleRegister = () => { onClose(); router.push("/register"); };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md bg-[#0f172a] rounded-[2.5rem] border border-white/10 shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        {screen === "pick"    && <DemoGamePicker onSelect={setScreen} onClose={onClose} />}
        {screen === "flyova"  && <FlyovaDemo  onBack={() => setScreen("pick")} onRegister={handleRegister} />}
        {screen === "predict" && <PredictDemo onBack={() => setScreen("pick")} onRegister={handleRegister} />}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const router = useRouter();
  const [activeTestimonial, setActiveTestimonial] = useState(0);
  const [testimonials, setTestimonials] = useState([]);
  const [blogPosts, setBlogPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openFaq, setOpenFaq] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, "withdrawal_testimonials"),
      where("approved", "==", true),
      orderBy("timestamp", "desc"),
      limit(10)
    );
    const unsub = onSnapshot(q, (snap) => {
      const liveData = snap.docs.map(doc => ({
        id: doc.id,
        name: doc.data().userName || "Anonymous Player",
        text: doc.data().text || doc.data().message,
        rating: doc.data().rating || 5
      }));
      if (liveData.length === 0) {
        setTestimonials([
          { name: "John D.", text: "Turned my lucky $10 into $500 in one afternoon. The withdrawals are instant!", rating: 5 },
          { name: "Sarah K.", text: "Finally a platform that is transparent and fun. Flyova is the real deal.", rating: 5 },
          { name: "Mike A.", text: "The agent system is genius. Got paid within minutes of requesting a withdrawal.", rating: 5 },
          { name: "Tunde B.", text: "Play with Friends is so addictive. Beat my brother 3 times in a row!", rating: 5 },
        ]);
      } else {
        setTestimonials(liveData);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    getDocs(query(collection(db, "blog_posts"), where("published", "==", true)))
      .then((snap) => {
        const sorted = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.publishedAt?.toMillis?.() ?? 0) - (a.publishedAt?.toMillis?.() ?? 0))
          .slice(0, 3);
        setBlogPosts(sorted);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (testimonials.length === 0) return;
    const interval = setInterval(() => {
      setActiveTestimonial((prev) => (prev + 1) % testimonials.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [testimonials.length]);

  const features = [
    {
      icon: <Wallet size={24} />,
      title: "Instant Wallet",
      desc: "Fund your account and manage your balance in real time. Every win lands in your wallet immediately.",
      color: "text-cyan-400",
      bg: "bg-cyan-400/10",
    },
    {
      icon: <DollarSign size={24} />,
      title: "Fast Withdrawals",
      desc: "Cash out whenever you want. Our agent network ensures payouts reach you within minutes, not days.",
      color: "text-emerald-400",
      bg: "bg-emerald-400/10",
    },
    {
      icon: <Users size={24} />,
      title: "Live Multiplayer",
      desc: "Challenge real players online. Find opponents instantly and compete with real money on the line.",
      color: "text-[#fc7952]",
      bg: "bg-[#fc7952]/10",
    },
    {
      icon: <ShieldCheck size={24} />,
      title: "Verified Agents",
      desc: "Every withdrawal is handled by a vetted agent in your region. Safe, accountable, and trackable.",
      color: "text-[#613de6]",
      bg: "bg-[#613de6]/20",
    },
    {
      icon: <Zap size={24} />,
      title: "Real-Time Engine",
      desc: "Games run on a live database with millisecond sync. No lag, no refresh — just pure real-time action.",
      color: "text-yellow-400",
      bg: "bg-yellow-400/10",
    },
    {
      icon: <Gift size={24} />,
      title: "Jackpot Drops",
      desc: "Random bonus jackpots are dropped into player wallets. No entry required — just play and you might get lucky.",
      color: "text-pink-400",
      bg: "bg-pink-400/10",
    },
  ];

  return (
    <div className="min-h-screen bg-[#613de6] text-white selection:bg-[#fc7952] overflow-x-hidden">

      {/* ── NAVIGATION ───────────────────────────────── */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto relative z-50">
        <div className="flex items-center space-x-2">
          <Image src="/logo.svg" alt="Logo" width={120} height={40} className="rounded-full bg-white/10 p-1" />
        </div>

        <div className="hidden md:flex items-center space-x-8 text-sm font-bold uppercase tracking-wider">
          <a href="#how-it-works" className="hover:text-[#fc7952] transition">How It Works</a>
          <a href="#features" className="hover:text-[#fc7952] transition">Features</a>
          <a href="#reviews" className="hover:text-[#fc7952] transition">Reviews</a>
          <button onClick={() => router.push('/about')} className="hover:text-[#fc7952] transition">About Us</button>
          <button onClick={() => router.push('/login')} className="hover:text-[#fc7952] transition">Login</button>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/register')}
            className="hidden md:block border border-white/30 hover:border-white text-white px-5 py-2 rounded-full font-black text-sm transition-all"
          >
            Register
          </button>
          <button
            onClick={() => router.push('/login')}
            className="bg-cyan-400 hover:bg-cyan-300 text-black px-6 py-2 rounded-full font-black text-sm transition-all flex items-center shadow-[0_0_20px_rgba(34,211,238,0.4)]"
          >
            Play Now <ArrowRight size={16} className="ml-2" />
          </button>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden bg-white/10 p-2.5 rounded-xl"
          >
            <Menu size={20} />
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden bg-[#4d2ec9] border-t border-white/10 px-6 py-6 space-y-4 z-40 relative">
          {["#how-it-works", "#features", "#reviews"].map((href) => (
            <a key={href} href={href} onClick={() => setMenuOpen(false)}
              className="block text-sm font-black uppercase tracking-wider hover:text-[#fc7952] transition py-1">
              {href.replace("#", "").replace(/-/g, " ")}
            </a>
          ))}
          <button
            onClick={() => {
              setMenuOpen(false);
              router.push('/about');
            }}
            className="block w-full text-left text-sm font-black uppercase tracking-wider hover:text-[#fc7952] transition py-1"
          >
            About Us
          </button>
          <button onClick={() => router.push('/register')}
            className="block w-full border border-white/30 text-white py-3 rounded-full font-black text-sm text-center">
            Register Free
          </button>
        </div>
      )}

      {/* ── HERO ─────────────────────────────────────── */}
      <main className="relative max-w-7xl mx-auto px-6 pt-12 pb-24 flex flex-col md:flex-row items-center">
        <div className="absolute top-20 right-1/4 w-32 h-32 bg-cyan-400 rounded-full blur-[80px] opacity-30 animate-pulse" />
        <div className="absolute bottom-10 left-10 w-48 h-48 bg-[#fc7952] rounded-full blur-[100px] opacity-20" />

        <div className="flex-1 text-center md:text-left z-10 space-y-8">
          <div className="space-y-4">
            <h1 className="text-4xl md:text-7xl font-black italic leading-[0.9] tracking-tighter">
              Feeling Lucky? <br />
              <span className="text-white">Play Flyovahelp </span> <br />
              <span className="text-white">and Win Big</span>
            </h1>
            <p className="text-md md:text-xl text-white/80 max-w-lg font-medium mx-auto md:mx-0">
              Stake your bet, challenge your friends, and get a chance to win huge prizes.
              It's simple, fun, and could turn your luck around in an instant.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center md:justify-start">
            <button
              onClick={() => router.push('/login')}
              className="group relative inline-flex items-center justify-center px-10 py-5 font-black text-white transition-all duration-200 bg-[#fc7952] rounded-full hover:bg-[#fd8a6a] active:scale-95 shadow-2xl"
            >
              Play Now <ArrowRight className="ml-2 group-hover:translate-x-1 transition-transform" />
            </button>
            <button
              onClick={() => setDemoOpen(true)}
              className="inline-flex items-center justify-center px-10 py-5 font-black text-white border border-white/30 rounded-full hover:bg-white/10 transition-all active:scale-95"
            >
              See Demo
            </button>
            <button
              onClick={() => router.push('/about')}
              className="inline-flex items-center justify-center px-10 py-5 font-black text-white border border-cyan-300/50 rounded-full hover:bg-cyan-300/10 transition-all active:scale-95"
            >
              About Us
            </button>
          </div>

          {/* Testimonials */}
          <div className="mt-12 max-w-sm mx-auto md:mx-0">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-400 mb-4 text-center md:text-left">Player Reviews</p>
            <div className="bg-black/20 backdrop-blur-md border border-white/5 p-6 rounded-[2rem] min-h-[140px] flex flex-col justify-center relative overflow-hidden text-left shadow-2xl">
              {loading ? (
                <div className="flex justify-center"><Loader2 className="animate-spin text-white/20" /></div>
              ) : testimonials.length > 0 ? (
                <div className="animate-in fade-in slide-in-from-right-4 duration-500" key={activeTestimonial}>
                  <div className="flex gap-1 mb-2">
                    {[...Array(testimonials[activeTestimonial]?.rating || 5)].map((_, i) => (
                      <Star key={i} size={12} className="fill-yellow-400 text-yellow-400" />
                    ))}
                  </div>
                  <p className="text-sm font-bold italic text-white/90 leading-relaxed mb-3">
                    "{testimonials[activeTestimonial]?.text}"
                  </p>
                  <p className="text-[10px] font-black uppercase text-[#fc7952] tracking-widest">
                    — {testimonials[activeTestimonial]?.name}
                  </p>
                </div>
              ) : null}
              <div className="absolute right-6 bottom-6 flex gap-1">
                {testimonials.map((_, i) => (
                  <div key={i} className={`w-1 h-1 rounded-full transition-all duration-500 ${activeTestimonial === i ? 'bg-white w-4' : 'bg-white/20'}`} />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Phone Mockup */}
        <div className="flex-1 mt-16 md:mt-0 relative flex justify-center z-10">
          <div className="w-[300px] md:w-[310px] h-[610px] md:h-[630px] bg-[#0f172a] rounded-[3.5rem] p-3 shadow-[0_50px_100px_rgba(0,0,0,0.6)] border-[10px] border-white/10 relative overflow-hidden">
            <div className="bg-[#0f172a] h-full rounded-[2.8rem] overflow-hidden flex flex-col text-white font-sans">
              <div className="pt-6 px-8 flex justify-between items-center opacity-40">
                <span className="text-[10px] font-bold">9:41</span>
                <div className="flex gap-1">
                  <div className="w-3 h-3 bg-white rounded-full scale-75" />
                  <div className="w-3 h-3 bg-white rounded-full scale-75" />
                </div>
              </div>
              <div className="p-5 flex justify-between items-center">
                <div className="bg-white/5 p-2 rounded-xl"><Menu size={18} className="text-[#613de6]" /></div>
                <div className="flex flex-col items-center">
                  <span className="text-[8px] font-black uppercase tracking-[0.2em] text-gray-500 italic">Arena Live</span>
                  <span className="text-xs font-black italic">FLYODOLS</span>
                </div>
                <div className="bg-[#613de6]/20 p-2 rounded-xl border border-[#613de6]/30 text-[#613de6]">
                  <Wallet size={16} />
                </div>
              </div>
              <div className="px-5 flex-1 flex flex-col space-y-5">
                <div className="bg-gradient-to-br from-[#1e293b] to-[#0f172a] p-5 rounded-3xl border border-white/5 shadow-inner">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-[9px] font-black uppercase text-[#fc7952] flex items-center gap-1">
                      <Trophy size={10} /> Winning Numbers
                    </span>
                    <span className="text-[8px] bg-white/5 px-2 py-1 rounded-lg text-gray-400 font-bold uppercase">ID: 88241</span>
                  </div>
                  <div className="flex justify-around gap-2">
                    <div className="w-14 h-14 rounded-2xl bg-[#613de6] flex items-center justify-center text-2xl font-black italic shadow-lg shadow-[#613de6]/40 border border-white/20 animate-pulse">42</div>
                    <div className="w-14 h-14 rounded-2xl bg-[#fc7952] flex items-center justify-center text-2xl font-black italic shadow-lg shadow-[#fc7952]/40 border border-white/20 animate-pulse">17</div>
                  </div>
                </div>
                <div className="text-center space-y-1 py-2">
                  <div className="flex items-center justify-center gap-2 text-rose-500">
                    <Timer size={14} />
                    <p className="font-black text-xl italic tracking-tighter">00:27</p>
                  </div>
                  <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">Next Draw Closing</p>
                </div>
                <div className="space-y-3 pt-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-black/40 border border-white/5 p-3 rounded-2xl text-center">
                      <p className="text-[8px] font-black text-gray-500 uppercase mb-1">Your Pick 1</p>
                      <p className="font-black text-lg">08</p>
                    </div>
                    <div className="bg-black/40 border border-white/5 p-3 rounded-2xl text-center">
                      <p className="text-[8px] font-black text-gray-500 uppercase mb-1">Your Pick 2</p>
                      <p className="font-black text-lg">26</p>
                    </div>
                  </div>
                  <button className="w-full bg-[#613de6] text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl">
                    Place Stake Now
                  </button>
                </div>
              </div>
              <div className="p-6 pb-10 flex justify-around border-t border-white/5 bg-black/20">
                <div className="w-2 h-2 bg-[#613de6] rounded-full" />
                <div className="w-2 h-2 bg-gray-700 rounded-full" />
                <div className="w-2 h-2 bg-gray-700 rounded-full" />
              </div>
            </div>
          </div>
          <div className="absolute -top-10 -right-4 w-16 h-16 bg-cyan-400 rounded-full shadow-inner animate-bounce pointer-events-none" />
          <div className="absolute bottom-10 -left-10 w-24 h-24 bg-[#fc7952] rounded-full shadow-inner animate-pulse pointer-events-none" />
        </div>
      </main>

      {/* ── STATS BAR ────────────────────────────────── */}
      <section className="bg-black/20 backdrop-blur-sm border-y border-white/10 py-10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <StatCard value={12400} suffix="+" label="Active Players" color="text-cyan-400" />
            <StatCard value={980000} suffix="+" label="Games Played" color="text-[#fc7952]" />
            <StatCard value={3} suffix="" label="Live Games" color="text-emerald-400" />
            <StatCard value={50000} suffix="+" label="Payouts Processed" color="text-white" />
          </div>
        </div>
      </section>

      {/* ── ABOUT PREVIEW ────────────────────────────── */}
      <section className="bg-[#0a0f1e] py-16 px-6 border-b border-white/5">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-400 mb-3">About Flyovahelp</p>
          <h2 className="text-3xl md:text-5xl font-black italic uppercase tracking-tighter text-white leading-tight">
            Learn Who We Are
          </h2>
          <p className="mt-4 text-sm text-white/65 font-bold max-w-2xl mx-auto leading-relaxed">
            Flyovahelp is built for fast, transparent gameplay with reliable payouts. Read our full story, mission, and values on the About page.
          </p>
          <button
            onClick={() => router.push("/about")}
            className="mt-8 inline-flex items-center gap-2 bg-[#613de6] hover:bg-[#7251ed] text-white px-8 py-4 rounded-full font-black text-xs uppercase tracking-widest transition-all active:scale-95 shadow-xl shadow-[#613de6]/20"
          >
            Visit About Us <ArrowRight size={14} />
          </button>
        </div>
      </section>

      {/* ── TRANSITION TO DARK ───────────────────────── */}
      <div className="h-16 bg-gradient-to-b from-[#613de6] to-[#0f172a]" />

      {/* ── HOW IT WORKS ─────────────────────────────── */}
      <section id="how-it-works" className="bg-[#0a0f1e] py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-400 mb-3">Simple Process</p>
            <h2 className="text-4xl md:text-6xl font-black italic uppercase tracking-tighter text-white leading-tight">
              How It Works
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            {/* Connector line on desktop */}
            <div className="hidden md:block absolute top-12 left-[calc(16.7%+1rem)] right-[calc(16.7%+1rem)] h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

            {[
              {
                step: "01",
                icon: <Users size={28} />,
                title: "Create Your Account",
                desc: "Sign up for free in under 2 minutes. No lengthy verification — just a username, email, and password.",
                color: "text-cyan-400",
                bg: "bg-cyan-400/10",
                border: "border-cyan-400/20",
              },
              {
                step: "02",
                icon: <Wallet size={28} />,
                title: "Fund Your Wallet",
                desc: "Deposit into your wallet via your preferred payment method. Your balance is live and ready to use instantly.",
                color: "text-[#fc7952]",
                bg: "bg-[#fc7952]/10",
                border: "border-[#fc7952]/20",
              },
              {
                step: "03",
                icon: <Trophy size={28} />,
                title: "Play & Withdraw",
                desc: "Jump into any game, win, and cash out to your account. Payouts are processed by verified agents near you.",
                color: "text-emerald-400",
                bg: "bg-emerald-400/10",
                border: "border-emerald-400/20",
              },
            ].map((item) => (
              <div key={item.step} className="relative flex flex-col items-center md:items-start text-center md:text-left">
                <div className={`w-20 h-20 rounded-[1.5rem] ${item.bg} border ${item.border} flex items-center justify-center mb-6 ${item.color}`}>
                  {item.icon}
                </div>
                <div className={`text-[10px] font-black uppercase tracking-[0.3em] ${item.color} mb-2`}>Step {item.step}</div>
                <h3 className="text-xl font-black italic uppercase tracking-tighter text-white mb-3">{item.title}</h3>
                <p className="text-sm text-gray-400 font-bold leading-relaxed max-w-xs">{item.desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-16 text-center">
            <button
              onClick={() => router.push('/register')}
              className="inline-flex items-center gap-3 bg-[#613de6] hover:bg-[#7251ed] text-white px-10 py-5 rounded-full font-black text-sm uppercase tracking-widest transition-all shadow-2xl shadow-[#613de6]/30 active:scale-95"
            >
              Start Playing Now <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </section>

      {/* ── FEATURES GRID ────────────────────────────── */}
      <section id="features" className="bg-[#0f172a] py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#613de6] mb-3">Platform</p>
            <h2 className="text-4xl md:text-6xl font-black italic uppercase tracking-tighter text-white leading-tight">
              Everything You Need
            </h2>
            <p className="text-white/50 font-bold mt-4 max-w-xl mx-auto text-sm">
              Built for speed, security, and simplicity. Everything on Flyovahelp is designed to get you playing and winning faster.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((f) => (
              <div key={f.title} className="bg-[#1e293b] border border-white/5 p-6 rounded-[2rem] hover:border-white/10 transition-all group hover:-translate-y-0.5">
                <div className={`w-14 h-14 rounded-2xl ${f.bg} flex items-center justify-center mb-5 ${f.color} group-hover:scale-110 transition-transform`}>
                  {f.icon}
                </div>
                <h3 className="text-lg font-black italic uppercase tracking-tighter text-white mb-3">{f.title}</h3>
                <p className="text-sm text-gray-400 font-bold leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── AGENT SECTION ────────────────────────────── */}
      <section className="bg-[#0a0f1e] py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="relative bg-gradient-to-br from-[#613de6] to-[#3b1f9e] rounded-[2.5rem] overflow-hidden p-10 md:p-16 shadow-2xl">
            <div className="absolute top-0 right-0 w-80 h-80 bg-[#fc7952] rounded-full blur-[120px] opacity-20 pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-cyan-400 rounded-full blur-[100px] opacity-10 pointer-events-none" />
            <ShieldCheck size={220} className="absolute -right-10 -bottom-10 opacity-[0.06] text-white pointer-events-none" />

            <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-10">
              <div className="space-y-5 max-w-lg">
                <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 px-4 py-2 rounded-full text-[11px] font-black uppercase tracking-widest text-[#fc7952]">
                  <TrendingUp size={14} /> Revenue Opportunity
                </div>
                <h2 className="text-4xl md:text-5xl font-black italic uppercase tracking-tighter text-white leading-tight">
                  Become a <br /><span className="text-[#fc7952]">Flyova Agent</span>
                </h2>
                <p className="text-white/70 font-bold text-sm leading-relaxed">
                  Join our agent network and earn commissions by processing withdrawal requests in your region. No capital needed — just your time and trustworthiness.
                </p>
                <ul className="space-y-3">
                  {[
                    "Earn commissions on every processed payout",
                    "Work from anywhere, anytime",
                    "Full support and training provided",
                    "Grow your income as you process more trades",
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-3 text-sm font-bold text-white/80">
                      <CheckCircle2 size={16} className="text-[#fc7952] flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex flex-col gap-4 items-start md:items-center">
                <button
                  onClick={() => router.push('/register')}
                  className="bg-[#fc7952] hover:bg-[#fd8a6a] text-white px-10 py-5 rounded-full font-black text-sm uppercase tracking-widest transition-all shadow-2xl shadow-[#fc7952]/30 active:scale-95 flex items-center gap-3"
                >
                  Apply to Be an Agent <ArrowRight size={18} />
                </button>
                <p className="text-white/40 text-xs font-bold uppercase tracking-wider">Free to apply. No commitment.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ─────────────────────────────── */}
      <section id="reviews" className="bg-[#0f172a] py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-yellow-400 mb-3">Community Voice</p>
            <h2 className="text-4xl md:text-6xl font-black italic uppercase tracking-tighter text-white leading-tight">
              Real Players, Real Wins
            </h2>
            <p className="text-white/50 font-bold mt-4 max-w-xl mx-auto text-sm">
              Don't take our word for it. Here's what our players have to say.
            </p>
          </div>

          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="animate-spin text-white/20" size={32} /></div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              {testimonials.slice(0, 8).map((t, i) => (
                <div key={t.id || i} className="bg-[#1e293b] border border-white/5 p-6 rounded-[2rem] flex flex-col gap-4">
                  <div className="flex gap-1">
                    {[...Array(t.rating || 5)].map((_, j) => (
                      <Star key={j} size={13} className="fill-yellow-400 text-yellow-400" />
                    ))}
                  </div>
                  <p className="text-sm font-bold italic text-white/80 leading-relaxed flex-1">"{t.text}"</p>
                  <p className="text-[10px] font-black uppercase text-[#fc7952] tracking-widest">— {t.name}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── COMMUNITY SECTION ────────────────────────── */}
      <section className="bg-[#0a0f1e] py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-400 mb-3">Stay Connected</p>
            <h2 className="text-4xl md:text-6xl font-black italic uppercase tracking-tighter text-white leading-tight">
              Join the Community
            </h2>
            <p className="text-white/50 font-bold mt-4 max-w-xl mx-auto text-sm">
              Connect with thousands of players. Get tips, announcements, and live game updates.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 max-w-6xl mx-auto">
            {[
              {
                href: "http://chat.flyovahelp.com/",
                bg: "bg-[#613de6]",
                shadow: "shadow-[#613de6]/20",
                icon: <MessageCircle size={24} />,
                name: "Chatroom",
                desc: "Hang out in our dedicated player chatroom. Talk strategy and wins.",
              },
              {
                href: "https://www.instagram.com/flyovahelp1?igsh=MW5ubDB1Z2tueHhuaQ==",
                bg: "bg-gradient-to-tr from-[#f9ce34] via-[#ee2a7b] to-[#6228d7]",
                shadow: "shadow-[#ee2a7b]/20",
                icon: <Instagram size={24} />,
                name: "Instagram",
                desc: "Follow us for winner highlights and behind-the-scenes content.",
              },
              {
                href: "https://www.facebook.com/share/18nRMrs7P5/",
                bg: "bg-[#1877F2]",
                shadow: "shadow-[#1877F2]/20",
                icon: <Facebook size={24} />,
                name: "Facebook",
                desc: "Like our page and stay updated with promotions and game events.",
              },
              {
                href: "https://www.tiktok.com/@flyovahelp1?_r=1&_t=ZN-96IBVFFEsp4",
                bg: "bg-black",
                shadow: "shadow-black/40",
                icon: (
                  <svg className="fill-current w-6 h-6" viewBox="0 0 24 24">
                    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.04-.1z" />
                  </svg>
                ),
                name: "TikTok",
                desc: "Watch clips, wins, and quick updates from Flyovahelp.",
              },
            ].map((channel) => (
              <a
                key={channel.name}
                href={channel.href}
                className={`${channel.bg} w-full p-6 rounded-[2rem] flex flex-col gap-4 hover:opacity-90 active:scale-95 transition-all shadow-lg ${channel.shadow}`}
              >
                <div className="bg-white/20 w-12 h-12 rounded-2xl flex items-center justify-center text-white">
                  {channel.icon}
                </div>
                <div>
                  <h3 className="text-base font-black italic uppercase tracking-tighter text-white mb-1">{channel.name}</h3>
                  <p className="text-xs font-bold text-white/70 leading-relaxed">{channel.desc}</p>
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ── BLOG ─────────────────────────────────────── */}
      {blogPosts.length > 0 && (
        <section className="bg-[#1e293b] py-20 px-6 border-y border-white/5">
          <div className="max-w-6xl mx-auto">
            {/* Header */}
            <div className="text-center mb-12">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#a78bfa] mb-3">From the Team</p>
              <h2 className="text-4xl md:text-5xl font-black italic uppercase tracking-tighter text-white leading-tight">
                Latest <span className="text-[#613de6]">Posts</span>
              </h2>
            </div>

            {/* Cards grid */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {blogPosts.map((post) => {
                const date = post.publishedAt?.toDate().toLocaleDateString("en-US", {
                  month: "short", day: "numeric", year: "numeric",
                });
                return (
                  <button
                    key={post.id}
                    onClick={() => router.push(`/blog/${post.slug}`)}
                    className="group text-left bg-[#0f172a] border border-white/5 hover:border-[#613de6]/40 rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-xl hover:shadow-[#613de6]/10 flex flex-col"
                  >
                    {post.coverImage ? (
                      <div className="h-44 overflow-hidden bg-[#0a0f1e]">
                        <img
                          src={post.coverImage}
                          alt={post.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      </div>
                    ) : (
                      <div className="h-44 bg-gradient-to-br from-[#613de6]/25 to-[#fc7952]/15 flex items-center justify-center">
                        <FileText size={28} className="text-white/20" />
                      </div>
                    )}
                    <div className="p-5 flex flex-col flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        {date && (
                          <span className="flex items-center gap-1.5 text-[10px] font-bold text-gray-500">
                            <Calendar size={10} /> {date}
                          </span>
                        )}
                        {post.readTime && (
                          <span className="flex items-center gap-1.5 text-[10px] font-bold text-gray-500">
                            <Clock size={10} /> {post.readTime} min
                          </span>
                        )}
                      </div>
                      <h3 className="font-black text-white text-base leading-snug mb-2 group-hover:text-[#a78bfa] transition-colors line-clamp-2">
                        {post.title}
                      </h3>
                      {post.excerpt && (
                        <p className="text-xs text-gray-500 font-bold leading-relaxed line-clamp-3 flex-1">
                          {post.excerpt}
                        </p>
                      )}
                      <div className="flex items-center gap-1.5 mt-4 text-xs font-black text-[#fc7952] uppercase tracking-wider">
                        Read More <ArrowRight size={12} className="group-hover:translate-x-1 transition-transform" />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* See All */}
            <div className="flex justify-center mt-10">
              <button
                onClick={() => router.push("/blog")}
                className="inline-flex items-center gap-3 bg-[#0f172a] border border-white/10 hover:border-[#613de6]/50 text-white px-8 py-4 rounded-full font-black text-xs uppercase tracking-widest transition-all hover:shadow-lg hover:shadow-[#613de6]/10 active:scale-95"
              >
                See All Posts <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ── FAQ ──────────────────────────────────────── */}
      <section className="bg-[#0f172a] py-20 px-6">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#fc7952] mb-3">FAQ</p>
            <h2 className="text-4xl md:text-6xl font-black italic uppercase tracking-tighter text-white leading-tight">
              Got Questions?
            </h2>
          </div>

          <div className="space-y-3">
            {FAQ_ITEMS.map((item, i) => (
              <div key={i} className="bg-[#1e293b] border border-white/5 rounded-[1.5rem] overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between p-6 text-left"
                >
                  <span className="font-black text-white text-sm md:text-base uppercase tracking-tighter italic">{item.q}</span>
                  <div className="flex-shrink-0 ml-4 text-gray-500">
                    {openFaq === i ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </div>
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-6 animate-in slide-in-from-top-2 duration-200">
                    <p className="text-sm text-gray-400 font-bold leading-relaxed">{item.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ────────────────────────────────── */}
      <section className="bg-[#613de6] py-24 px-6 relative overflow-hidden">
        <div className="absolute top-0 left-1/4 w-64 h-64 bg-cyan-400 rounded-full blur-[120px] opacity-20 pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-[#fc7952] rounded-full blur-[120px] opacity-20 pointer-events-none" />
        <div className="max-w-3xl mx-auto text-center relative z-10 space-y-8">
          <h2 className="animate-flicker text-4xl md:text-7xl font-black italic uppercase tracking-tighter text-white leading-tight">
            Your Next <br /><span className="text-[#fc7952]">Big Win</span><br /> Starts Here
          </h2>
          <p className="text-white/70 font-bold text-sm md:text-lg max-w-xl mx-auto leading-relaxed">
            Join thousands of players already winning on Flyovahelp. Create your free account now and play your first game today.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => router.push('/register')}
              className="inline-flex items-center justify-center gap-3 bg-white text-[#613de6] px-10 py-5 rounded-full font-black text-sm uppercase tracking-widest transition-all shadow-2xl hover:bg-white/90 active:scale-95"
            >
              Create Free Account <ArrowRight size={18} />
            </button>
            <button
              onClick={() => router.push('/login')}
              className="inline-flex items-center justify-center gap-3 border border-white/30 text-white px-10 py-5 rounded-full font-black text-sm uppercase tracking-widest transition-all hover:bg-white/10 active:scale-95"
            >
              I Have an Account
            </button>
          </div>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────── */}
      <footer className="relative bg-[#613de6] overflow-hidden">
        {/* Glowing top border */}
        <div className="h-px w-full bg-gradient-to-r from-transparent via-cyan-400 to-transparent opacity-60" />

        {/* Giant watermark */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden">
          <span className="text-[18vw] font-black italic uppercase tracking-tighter text-white/[0.04] whitespace-nowrap leading-none">
            FLYOVAHELP
          </span>
        </div>

        <div className="relative z-10 max-w-4xl mx-auto px-6 py-16 flex flex-col items-center gap-10 text-center">
          {/* Logo */}
          <Image src="/logo.svg" alt="Logo" width={140} height={46} className="rounded-full bg-white/10 p-1.5" />

          {/* Nav links */}
          <nav className="flex flex-wrap justify-center gap-x-8 gap-y-3">
            {[
              { label: "How It Works", href: "#how-it-works" },
              { label: "Features", href: "#features" },
              { label: "Reviews", href: "#reviews" },
              { label: "About Us", href: "/about", push: true },
              { label: "Register", href: "/register", push: true },
              { label: "Support", href: "/support", push: true },
            ].map((link) => (
              link.push
                ? <button key={link.label} onClick={() => router.push(link.href)} className="text-xs font-black uppercase tracking-widest text-white/50 hover:text-white transition-colors">{link.label}</button>
                : <a key={link.label} href={link.href} className="text-xs font-black uppercase tracking-widest text-white/50 hover:text-white transition-colors">{link.label}</a>
            ))}
          </nav>

          {/* Business links */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push("/advertise")}
              className="px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border border-white/15 text-white/60 hover:bg-white/10 hover:text-white transition-all"
            >
              Advertise with Us
            </button>
            <button
              onClick={() => router.push("/partner")}
              className="px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest bg-white/10 border border-white/15 text-white/80 hover:bg-white/20 hover:text-white transition-all"
            >
              Partner with Us
            </button>
          </div>

          {/* Social icons */}
          <div className="flex items-center gap-3">
            <a href="https://www.facebook.com/share/18nRMrs7P5/"
              className="w-11 h-11 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center hover:bg-[#1877F2] hover:border-[#1877F2] transition-all hover:scale-110">
              <Facebook size={17} fill="currentColor" />
            </a>
            <a href="https://www.instagram.com/flyovahelp1?igsh=MW5ubDB1Z2tueHhuaQ=="
              className="w-11 h-11 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center hover:bg-gradient-to-tr hover:from-[#f9ce34] hover:via-[#ee2a7b] hover:to-[#6228d7] hover:border-transparent transition-all hover:scale-110">
              <Instagram size={17} />
            </a>
            <a href="https://x.com/flyovahelp"
              className="w-11 h-11 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center hover:bg-[#1DA1F2] hover:border-[#1DA1F2] transition-all hover:scale-110">
              <Twitter size={17} fill="currentColor" />
            </a>
            <a href="https://www.tiktok.com/@flyovahelp1?_r=1&_t=ZN-96IBVFFEsp4"
              className="w-11 h-11 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center hover:bg-black hover:border-black transition-all hover:scale-110">
              <svg className="fill-current w-4 h-4" viewBox="0 0 24 24"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.04-.1z"/></svg>
            </a>
          </div>

          {/* Divider */}
          <div className="w-full h-px bg-white/10" />

          {/* Bottom bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between w-full gap-3">
            <p className="text-[10px] font-black tracking-widest text-white/30 uppercase">© 2026 Flyovahelp Arena. All rights reserved.</p>
            <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Play responsibly · 18+ only</p>
          </div>
          <a
            href="mailto:support@flyovahelp.com"
            className="text-[11px] font-black tracking-widest text-white/70 uppercase hover:text-white transition-colors"
          >
            support@flyovahelp.com
          </a>
        </div>
      </footer>

      {demoOpen && <DemoModal onClose={() => setDemoOpen(false)} router={router} />}
    </div>
  );
}
