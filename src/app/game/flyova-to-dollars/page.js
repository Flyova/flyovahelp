"use client";
import { useState, useEffect, useRef } from "react";
import { db, auth } from "@/lib/firebase";
import {
  doc,
  onSnapshot,
  updateDoc,
  increment,
  collection,
  query,
  where,
  addDoc,
  serverTimestamp,
  orderBy,
  limit,
  getDoc,
  getDocs,
  runTransaction
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { rtdb } from "@/lib/firebase";
import { ref as rtdbRef, onValue as rtdbOnValue } from "firebase/database";
import { Timer, CheckCircle2, Trophy, History, XCircle, RefreshCw, Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";

export default function FlyovaToDollars() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [myWallet, setMyWallet] = useState(0);
  const [loading, setLoading] = useState(true);

  // Game States
  const [currentGame, setCurrentGame] = useState(null);
  const [pastGames, setPastGames] = useState([]);
  const [timeLeft, setTimeLeft] = useState(0);
  const [selectedNumbers, setSelectedNumbers] = useState([]);
  const [stake, setStake] = useState(1);
  const [gameStatus, setGameStatus] = useState("betting");
  const [lastWinners, setLastWinners] = useState([]);
  const [activeBets, setActiveBets] = useState([]);
  const [placingBet, setPlacingBet] = useState(false);
  const [lastGameNumbers, setLastGameNumbers] = useState([]);
  const [breakEndsAt, setBreakEndsAt] = useState(null);

  // Alert States
  const [showResultAlert, setShowResultAlert] = useState(false);
  const [resultType, setResultType] = useState(null); // 'win' | 'partial' | 'lose'
  const [winAmount, setWinAmount] = useState(0);
  const [betResults, setBetResults] = useState([]); // per-bet breakdown for the modal
  const [modalWinners, setModalWinners] = useState([]); // winning numbers shown inside the modal

  const WIN_MULTIPLIER = 1.3;
  const PARTIAL_REFUND = 0.8;
  const REFERRAL_RATE = 0.025;
  const ROUND_DURATION = 120000;
  const BREAK_DURATION = 120000;

  const revealedGameRef = useRef(null);
  const resultTimeoutRef = useRef(null);
  const winnersTimeoutRef = useRef(null);
  const engineKickRef = useRef({ inFlight: false, lastRunAt: 0 });
  // Mirrors gameStatus so effects that shouldn't re-subscribe on every status change can still read it
  const gameStatusRef = useRef("betting");
  // Firebase RTDB serverTimeOffset: server_time = Date.now() + offset
  // Keeps all clients in sync regardless of local clock accuracy
  const serverTimeOffsetRef = useRef(0);
  const serverNow = () => Date.now() + serverTimeOffsetRef.current;

  async function maybeKickGameEngine(reason = "heartbeat") {
    const now = Date.now();
    if (engineKickRef.current.inFlight) return;
    if (now - engineKickRef.current.lastRunAt < 12000) return;

    engineKickRef.current.inFlight = true;
    engineKickRef.current.lastRunAt = now;
    try {
      await fetch(`/api/cron/game-engine?r=${encodeURIComponent(reason)}&t=${now}`, {
        method: "GET",
        cache: "no-store",
        keepalive: true
      });
    } catch {
      // Ignore transient network errors; next heartbeat retries.
    } finally {
      engineKickRef.current.inFlight = false;
    }
  }

  async function checkIfUserBet(gameId) {
    if (!user) return;
    const q = query(
      collection(db, "users", user.uid, "transactions"),
      where("gameId", "==", gameId),
      where("type", "==", "stake")
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      setActiveBets(snap.docs.map(d => ({ picks: d.data().picks || [], amount: d.data().amount })));
    }
  }

  async function revealResults() {
    // Guard 1: ensure we only process each game once
    if (revealedGameRef.current === currentGame.id) return;
    // Guard 2: only process games that have genuinely ended — prevents stale closure
    // from firing for a fresh game that still has ~120s remaining
    if (currentGame.endTime - serverNow() > 5000) return;
    revealedGameRef.current = currentGame.id;
    maybeKickGameEngine("reveal-results");

    setGameStatus("results");
    const gameWinners = [...(currentGame.winners || [])]; // capture before any awaits
    const capturedNumbers = [...(currentGame.numbers || [])]; // freeze grid before game switches
    setLastGameNumbers(capturedNumbers);

    // Show winning numbers green immediately — start 6s timer now so it's anchored to round end,
    // not to whenever async processing finishes.
    setLastWinners(gameWinners);
    if (resultTimeoutRef.current) clearTimeout(resultTimeoutRef.current);
    resultTimeoutRef.current = setTimeout(() => {
      resultTimeoutRef.current = null;
      setLastWinners([]);
      setLastGameNumbers([]);
    }, 6000);

    let hasBets = false;

    if (user) {
      try {
        // Only fetch bets that haven't been processed yet (status === "pending")
        const q = query(
          collection(db, "users", user.uid, "transactions"),
          where("gameId", "==", currentGame.id),
          where("type", "==", "stake"),
          where("status", "==", "pending")
        );
        const betsSnap = await getDocs(q);

        if (betsSnap.empty) {
          // No stake this round — show winning numbers with a missed message
          setResultType("noStake");
          setModalWinners(gameWinners);
          setShowResultAlert(true);
        }

        if (!betsSnap.empty) {
          hasBets = true;
          // Get user's referrer once
          const userSnap = await getDoc(doc(db, "users", user.uid));
          const referrerUid = userSnap.data()?.referrerUid;

          let displayPayout = 0;
          let displayResult = "lose"; // 'win' | 'partial' | 'lose'
          let totalLost = 0;
          const userRef = doc(db, "users", user.uid);
          const collectedResults = [];

          for (const betDoc of betsSnap.docs) {
            const { picks = [], amount: betStake } = betDoc.data();
            const matchCount = currentGame.winners.filter(w => picks.includes(w)).length;

            if (matchCount === 2) {
              const payout = parseFloat((betStake * WIN_MULTIPLIER).toFixed(2));
              displayPayout += payout;
              displayResult = "win";
              collectedResults.push({ picks, stake: betStake, result: "win", payout, matchCount });
              await runTransaction(db, async (tx) => {
                const fresh = await tx.get(betDoc.ref);
                if (fresh.data()?.status !== "pending") return;
                const stakeAmount = Math.abs(Number(fresh.data()?.stakeAmount || fresh.data()?.amount || betStake || 0));
                // Keep the original stake amount as debit; only set the win status.
                tx.update(betDoc.ref, { status: "win", stakeAmount });
                tx.update(userRef, { wallet: increment(payout) });
              }).catch(console.error);
            } else if (matchCount === 1) {
              const refund = parseFloat((betStake * PARTIAL_REFUND).toFixed(2));
              displayPayout += refund;
              if (displayResult !== "win") displayResult = "partial";
              collectedResults.push({ picks, stake: betStake, result: "partial", payout: refund, matchCount });
              await runTransaction(db, async (tx) => {
                const fresh = await tx.get(betDoc.ref);
                if (fresh.data()?.status !== "pending") return;
                const stakeAmount = Math.abs(Number(fresh.data()?.stakeAmount || fresh.data()?.amount || betStake || 0));
                // Keep original stake amount untouched; outcome is shown via status tag only.
                tx.update(betDoc.ref, { status: "partial", stakeAmount });
                tx.update(userRef, { wallet: increment(refund) });
              }).catch(console.error);
            } else {
              totalLost += betStake;
              collectedResults.push({ picks, stake: betStake, result: "loss", payout: 0, matchCount });
              await runTransaction(db, async (tx) => {
                const fresh = await tx.get(betDoc.ref);
                if (fresh.data()?.status !== "pending") return;
                const stakeAmount = Math.abs(Number(fresh.data()?.stakeAmount || fresh.data()?.amount || betStake || 0));
                // Mark the original stake as "loss" — no separate outcome doc needed
                tx.update(betDoc.ref, { status: "loss", stakeAmount });
              }).catch(console.error);
            }
          }

          // Referral commission: 2.5% of total lost stake goes to referrer's bonus
          if (totalLost > 0 && referrerUid) {
            const commission = parseFloat((totalLost * REFERRAL_RATE).toFixed(2));
            await updateDoc(doc(db, "users", referrerUid), {
              referralBonus: increment(commission)
            });
            await addDoc(collection(db, "users", referrerUid, "transactions"), {
              title: "Referral Commission",
              amount: commission,
              type: "commission",
              status: "completed",
              timestamp: serverTimestamp()
            });
          }

          setBetResults(collectedResults);
          setResultType(displayResult);
          setWinAmount(displayPayout);
          setModalWinners(gameWinners);
          setShowResultAlert(true);
        }
      } catch (err) { console.error(err); }
    }

    // Game lifecycle (mark completed, create next game) is the cron's job — not the client's.
    // The client only settles the current user's bets and shows the results UI.
    // We wait here for the cron to push a new active game via qActive.
    if (hasBets) {
      // Green numbers: show for 6s, then clear
      if (resultTimeoutRef.current) clearTimeout(resultTimeoutRef.current);
      if (winnersTimeoutRef.current) clearTimeout(winnersTimeoutRef.current);
      winnersTimeoutRef.current = setTimeout(() => {
        winnersTimeoutRef.current = null;
        setLastWinners([]);
        setLastGameNumbers([]);
      }, 6000);
      // Modal: auto-dismiss after 7s
      resultTimeoutRef.current = setTimeout(() => {
        resultTimeoutRef.current = null;
        setShowResultAlert(false);
        setBetResults([]);
        setModalWinners([]);
        setResultType(null);
      }, 7000);
    } else {
      // No-stake modal: auto-dismiss after 4s (green numbers cleared by the 3s timer above)
      if (resultTimeoutRef.current) clearTimeout(resultTimeoutRef.current);
      resultTimeoutRef.current = setTimeout(() => {
        resultTimeoutRef.current = null;
        setShowResultAlert(false);
        setModalWinners([]);
        setResultType(null);
      }, 4000);
    }
  }

  // 0. Sync client clock with Firebase server clock
  useEffect(() => {
    const offsetRef = rtdbRef(rtdb, ".info/serverTimeOffset");
    const unsub = rtdbOnValue(offsetRef, (snap) => {
      serverTimeOffsetRef.current = snap.val() || 0;
    });
    return () => unsub();
  }, []);

  // 1. Auth & Wallet Listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) return router.push("/login");
      setUser(u);
      const unsubWallet = onSnapshot(doc(db, "users", u.uid), (snap) => {
        if (snap.exists()) setMyWallet(snap.data().wallet || 0);
      });
      setLoading(false);
      return () => unsubWallet();
    });
    return () => unsub();
  }, [router]);

  // Keep gameStatusRef in sync so effects don't need gameStatus as a dep
  useEffect(() => { gameStatusRef.current = gameStatus; }, [gameStatus]);

  // Break-state listener (cron writes status:"break" to RTDB after round 3).
  useEffect(() => {
    const gameStateRef = rtdbRef(rtdb, "active_game_flyova");
    const unsub = rtdbOnValue(gameStateRef, (snap) => {
      const data = snap.val();
      if (data?.status === "break" && data.breakEndTime > serverNow()) {
        setBreakEndsAt(data.breakEndTime);
        setGameStatus("break");
      } else if (gameStatusRef.current === "break") {
        setBreakEndsAt(null);
        setGameStatus("betting");
      }
    });
    return () => unsub();
  }, []);

  // 2. Global Game & History Listener
  useEffect(() => {
    // Listen to all active docs and choose the freshest by endTime.
    // This prevents stale duplicate-active docs from pinning users at 0:00.
    const qActive = query(
      collection(db, "timed_games"),
      where("status", "==", "active")
    );
    const unsubActive = onSnapshot(qActive, (snap) => {
      if (!snap.empty) {
        const gameData = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => Number(b.endTime || 0) - Number(a.endTime || 0))[0];

        // Discard orphaned games whose endTime is more than 135s away — stale doc from dev/testing
        if (typeof gameData.endTime === "number" && gameData.endTime - serverNow() > 135000) {
          // Lifecycle is server-owned (cron). Client should never mark rounds completed.
          setCurrentGame(null);
          maybeKickGameEngine("orphan-active");
          return;
        }

        setCurrentGame(gameData);
        setBreakEndsAt(null);
        checkIfUserBet(gameData.id);

        if (gameStatusRef.current === "results" && gameData.id !== revealedGameRef.current) {
          // Clear pending winner display immediately — new game is confirmed
          if (resultTimeoutRef.current) { clearTimeout(resultTimeoutRef.current); resultTimeoutRef.current = null; }
          if (winnersTimeoutRef.current) { clearTimeout(winnersTimeoutRef.current); winnersTimeoutRef.current = null; }
          setLastWinners([]);
          setLastGameNumbers([]);
          setGameStatus("betting");
          setSelectedNumbers([]);
          setActiveBets([]);
        }
      } else {
        setCurrentGame(null);
        maybeKickGameEngine("no-active-game");
      }
    });

    const qHistory = query(collection(db, "timed_games"), where("status", "==", "completed"), orderBy("endTime", "desc"), limit(5));
    const unsubHistory = onSnapshot(qHistory, (snap) => {
      setPastGames(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsubActive(); unsubHistory(); };
  // gameStatus intentionally excluded — use gameStatusRef.current inside to avoid re-subscribing
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // 2b. Engine heartbeat for stuck states (no active round / round ended at 0:00).
  useEffect(() => {
    if (!user) return;

    const tick = () => {
      const now = serverNow();

      if (gameStatusRef.current === "break") {
        if (breakEndsAt && breakEndsAt - now <= 3000) maybeKickGameEngine("break-ending");
        return;
      }

      if (!currentGame) {
        maybeKickGameEngine("missing-current-game");
        return;
      }

      const msLeft = Number(currentGame.endTime || 0) - now;
      if (msLeft <= 2000) {
        maybeKickGameEngine("round-ending");
      }
    };

    tick();
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, currentGame?.id, currentGame?.endTime, breakEndsAt]);

  // 3. Sync Countdown
  useEffect(() => {
    if (!currentGame && !breakEndsAt) return;
    const interval = setInterval(() => {
      if (currentGame) {
        const diff = Math.max(0, Math.floor((currentGame.endTime - serverNow()) / 1000));
        setTimeLeft(diff);
        if (diff === 0 && gameStatusRef.current === "betting") revealResults();
      } else if (breakEndsAt) {
        const diff = Math.max(0, Math.floor((breakEndsAt - serverNow()) / 1000));
        setTimeLeft(diff);
        if (diff === 0) {
          setBreakEndsAt(null);
          setGameStatus("betting");
          maybeKickGameEngine("break-finished");
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentGame, breakEndsAt]);

  const closeModal = () => {
    if (resultTimeoutRef.current) {
      clearTimeout(resultTimeoutRef.current);
      resultTimeoutRef.current = null;
    }
    if (winnersTimeoutRef.current) {
      clearTimeout(winnersTimeoutRef.current);
      winnersTimeoutRef.current = null;
    }
    setShowResultAlert(false);
    setLastWinners([]);
    setLastGameNumbers([]);
    setBetResults([]);
    setModalWinners([]);
    setResultType(null);
  };

  const placeBet = async () => {
    const stakeAmount = parseInt(stake, 10);
    if (selectedNumbers.length !== 2 || gameStatus !== "betting" || timeLeft <= 0) return;
    if (!stakeAmount || stakeAmount < 1 || stakeAmount > myWallet) return;
    setPlacingBet(true);
    try {
      // Verify balance and deduct stake atomically
      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await transaction.get(userRef);
        const balance = userSnap.data()?.wallet || 0;
        if (balance < stakeAmount) throw new Error("Insufficient balance");
        transaction.update(userRef, { wallet: increment(-stakeAmount) });
      });

      // Record stake with picks and gameId for payout computation
      await addDoc(collection(db, "users", user.uid, "transactions"), {
        title: "Flyova Stake",
        amount: stakeAmount,
        picks: [...selectedNumbers],
        gameId: currentGame.id,
        type: "stake",
        status: "pending",
        timestamp: serverTimestamp()
      });

      setActiveBets(prev => [...prev, { picks: [...selectedNumbers], amount: stakeAmount }]);
      setSelectedNumbers([]);
    } catch (e) { console.error(e); alert(e.message || "Transaction failed"); }
    finally { setPlacingBet(false); }
  };

  const toggleNumber = (num) => {
    if (gameStatus !== "betting" || !currentGame || timeLeft <= 0) return;
    if (selectedNumbers.includes(num)) {
      setSelectedNumbers(selectedNumbers.filter(n => n !== num));
    } else if (selectedNumbers.length < 2) {
      setSelectedNumbers([...selectedNumbers, num]);
    }
  };

  if (loading) return <div className="min-h-screen bg-[#0f172a] flex items-center justify-center text-white italic font-black">SYNCING...</div>;

  return (
    <div className="min-h-screen bg-[#0f172a] text-white flex flex-col pb-24 relative overflow-hidden">

      {showResultAlert && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-md bg-[#0f172a] rounded-t-[2.5rem] border border-white/10 shadow-2xl animate-in slide-in-from-bottom-8 duration-300 overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className={`px-6 pt-6 pb-5 flex items-center justify-between border-b border-white/5 ${
              resultType === 'win' ? 'bg-green-500/10' :
              resultType === 'partial' ? 'bg-amber-500/10' :
              resultType === 'noStake' ? 'bg-slate-500/10' : 'bg-red-500/10'
            }`}>
              <div className="flex items-center gap-3">
                {resultType === 'win'
                  ? <Trophy size={24} className="text-green-400 animate-bounce" />
                  : resultType === 'partial'
                  ? <RefreshCw size={24} className="text-amber-400 animate-spin" />
                  : resultType === 'noStake'
                  ? <Timer size={24} className="text-slate-400" />
                  : <XCircle size={24} className="text-red-400 animate-pulse" />}
                <div>
                  <h2 className="text-lg font-black italic uppercase text-white leading-none">
                    {resultType === 'win' ? 'You Won!' : resultType === 'partial' ? 'Partial Refund!' : resultType === 'noStake' ? 'Round Ended!' : 'No Luck!'}
                  </h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Round Results</p>
                </div>
              </div>
              <button onClick={closeModal} className="p-2 rounded-xl hover:bg-white/10 transition-colors">
                <X size={18} className="text-slate-400" />
              </button>
            </div>

            {/* Winning numbers strip */}
            {modalWinners.length > 0 && (
              <div className="px-6 py-3 bg-black/20 border-b border-white/5 flex items-center gap-3">
                <p className="text-[9px] font-black uppercase text-slate-500 tracking-widest shrink-0">Winning</p>
                <div className="flex gap-2">
                  {modalWinners.map(n => (
                    <span key={n} className="w-9 h-9 bg-green-500 rounded-xl flex items-center justify-center font-black italic text-sm shadow-[0_0_12px_rgba(34,197,94,0.5)]">
                      {n}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Per-bet list / no-stake message */}
            <div className="p-4 space-y-3 max-h-60 overflow-y-auto">
              {resultType === 'noStake' && (
                <div className="py-6 flex flex-col items-center justify-center gap-2">
                  <p className="text-base font-black italic uppercase text-slate-300">You Did Not Stake!</p>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Place a bet before the timer runs out next round</p>
                </div>
              )}
              {betResults.map((bet, i) => (
                <div key={i} className={`p-4 rounded-2xl border ${
                  bet.result === 'win' ? 'bg-green-500/5 border-green-500/20' :
                  bet.result === 'partial' ? 'bg-amber-500/5 border-amber-500/20' :
                  'bg-red-500/5 border-red-500/20'
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Picks</span>
                      {bet.picks.map(p => (
                        <span key={p} className={`w-8 h-8 rounded-lg flex items-center justify-center font-black italic text-xs border ${
                          modalWinners.includes(p)
                            ? 'bg-green-500 border-green-400 text-white'
                            : 'bg-[#1e293b] border-white/10 text-slate-400'
                        }`}>{p}</span>
                      ))}
                    </div>
                    <span className={`text-base font-black italic ${
                      bet.result === 'win' ? 'text-green-400' :
                      bet.result === 'partial' ? 'text-amber-400' : 'text-red-400'
                    }`}>
                      {bet.result === 'loss' ? `-$${bet.stake.toFixed(2)}` : `+$${bet.payout.toFixed(2)}`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[9px] font-bold text-slate-500 uppercase">Staked: ${bet.stake.toFixed(2)}</span>
                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${
                      bet.result === 'win' ? 'bg-green-500/20 text-green-400' :
                      bet.result === 'partial' ? 'bg-amber-500/20 text-amber-400' :
                      'bg-red-500/20 text-red-400'
                    }`}>
                      {bet.result === 'win' ? '2/2 · +30%' : bet.result === 'partial' ? '1/2 · 80% back' : '0/2 · Lost'}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer summary + close */}
            <div className="px-6 py-5 border-t border-white/5 flex items-center justify-between">
              {resultType !== 'noStake' && (
                <div>
                  <p className="text-[9px] font-black uppercase text-slate-500 tracking-widest">
                    {resultType === 'lose' ? 'Total Lost' : 'Total Received'}
                  </p>
                  <p className={`text-2xl font-black italic tracking-tighter ${
                    resultType === 'lose' ? 'text-red-400' : 'text-green-400'
                  }`}>
                    {resultType === 'lose'
                      ? `-$${betResults.reduce((s, b) => s + b.stake, 0).toFixed(2)}`
                      : `+$${winAmount.toFixed(2)}`}
                  </p>
                </div>
              )}
              <button
                onClick={closeModal}
                className={`bg-[#613de6] hover:bg-[#7c5ce6] text-white font-black uppercase text-xs px-7 py-3 rounded-2xl transition-all active:scale-95 ${resultType === 'noStake' ? 'ml-auto' : ''}`}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Real-time Timer */}
      <div className="p-8 text-center bg-[#1e293b] border-b border-white/5 relative">
        <div className="absolute top-0 left-0 h-1 transition-all duration-1000"
          style={{
            width: `${gameStatus === "break"
              ? (timeLeft / (BREAK_DURATION / 1000)) * 100
              : (timeLeft / (ROUND_DURATION / 1000)) * 100}%`,
            backgroundColor: gameStatus === "break" ? "#64748b" : "#fc7952"
          }}
        />
        <h1 className="lg:text-xl text-lg font-black italic uppercase text-[#fc7952] mb-1">Flyova to Dollars</h1>
        {currentGame?.roundInSession && gameStatus !== "break" && (
          <p className="text-[10px] font-black uppercase tracking-widest text-white/30 mt-1">
            Round {currentGame.roundInSession} / 3
          </p>
        )}
        <div className={`inline-flex items-center space-x-3 px-8 py-4 rounded-4xl border mt-4 ${
          gameStatus === "break" ? "bg-slate-800/50 border-slate-600/30" : "bg-black/20 border-white/5"
        }`}>
          <Timer size={24} className={gameStatus === "break" ? "text-slate-400" : "text-[#613de6]"} />
          <span className="text-4xl font-black italic font-mono">
            {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
          </span>
        </div>
        {gameStatus === "break" && (
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-3">
            Session Break — Next session starting soon
          </p>
        )}
      </div>

      <div className="flex-1 p-6 flex flex-col items-center justify-center">

        {/* Active bets this round */}
        {activeBets.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4 justify-center">
            {activeBets.map((b, i) => (
              <div key={i} className="bg-green-500/10 border border-green-500/30 px-3 py-1 rounded-full flex items-center space-x-2">
                <CheckCircle2 size={10} className="text-green-500" />
                <span className="text-[10px] font-black italic">
                  {b.picks?.join(", ")} — ${b.amount} → ${(b.amount * WIN_MULTIPLIER).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        )}

        <p className="text-[#fc7952] font-black italic uppercase text-xs mb-4 tracking-tighter">
          Pick 2 Numbers and Enter Stake Amount
        </p>

        {/* 4 Number Grid */}
        {(lastGameNumbers.length > 0 ? lastGameNumbers : currentGame?.numbers || []).length === 0 ? (
          <div className="grid grid-cols-4 gap-4 w-full max-w-sm mb-12">
            {[0,1,2,3].map(i => (
              <div key={i} className="aspect-square rounded-2xl bg-[#1e293b] border-2 border-white/5 flex items-center justify-center">
                <Loader2 size={20} className="animate-spin text-white/20" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-4 w-full max-w-sm mb-12">
            {(lastGameNumbers.length > 0 ? lastGameNumbers : currentGame?.numbers || []).map((num) => {
              const isSelected = selectedNumbers.includes(num);
              const isWinner = lastWinners.includes(num);
              return (
                <button
                  key={num}
                  disabled={gameStatus === "results" || gameStatus === "break" || timeLeft <= 0}
                  onClick={() => toggleNumber(num)}
                  className={`aspect-square rounded-2xl text-xl font-black italic transition-all border-2
                    ${isWinner ? 'bg-green-500 border-white scale-110 shadow-[0_0_25px_rgba(34,197,94,0.6)]' :
                      isSelected ? 'bg-[#613de6] border-[#fc7952]' : 'bg-[#1e293b] border-white/5'}`}
                >{num}</button>
              );
            })}
          </div>
        )}

        {/* Betting Panel */}
        <div className="w-full max-w-xs bg-[#1e293b] p-6 rounded-[2.5rem] border border-white/5">
          {gameStatus === "break" ? (
            <div className="text-center py-2">
              <p className="font-black italic uppercase text-sm text-slate-400">Session Break</p>
              <p className="text-[10px] font-bold opacity-30 mt-1">3 ROUNDS COMPLETE — RESUMING SHORTLY</p>
            </div>
          ) : gameStatus === "results" || !currentGame ? (
            <div className="text-center py-2">
              <p className="font-black italic uppercase text-sm">{!currentGame ? 'Waiting for Round...' : 'Round Ended'}</p>
              <p className="text-[10px] font-bold opacity-30 mt-1">NEXT ROUND STARTING SOON...</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-6 bg-black/20 p-4 rounded-2xl">
                <button onClick={() => setStake(Math.max(1, stake - 1))} className="w-10 h-10 bg-[#613de6] rounded-xl font-bold">-</button>
                <input
                  type="number"
                  min="1"
                  value={stake}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val) && val >= 1) setStake(val);
                    else if (e.target.value === "") setStake("");
                  }}
                  onBlur={() => { if (!stake || stake < 1) setStake(1); }}
                  className="w-20 text-center text-2xl font-black italic text-[#fc7952] bg-transparent outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <button onClick={() => setStake((s) => (parseInt(s) || 0) + 1)} className="w-10 h-10 bg-[#613de6] rounded-xl font-bold">+</button>
              </div>
              <button
                onClick={placeBet}
                disabled={placingBet || selectedNumbers.length !== 2 || timeLeft <= 0 || !parseInt(stake) || parseInt(stake) > myWallet}
                className="w-full bg-[#fc7952] pt-4 pb-3 rounded-2xl font-black uppercase italic shadow-lg disabled:opacity-20 flex flex-col items-center"
              >
                {placingBet ? (
                  <Loader2 size={22} className="animate-spin my-0.5" />
                ) : (
                  <>
                    <span className="text-lg">PLACE BET</span>
                    <span className="text-[10px] opacity-80 mt-1 italic tracking-tight">Win: ${(parseInt(stake) * WIN_MULTIPLIER).toFixed(2)} · Partial: ${(parseInt(stake) * PARTIAL_REFUND).toFixed(2)}</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Last 5 Winners Ticker */}
      <div className="bg-black/20 p-6 border-t border-white/5">
        <div className="flex items-center space-x-2 mb-4 opacity-40">
          <History size={14} /><span className="text-[10px] font-black uppercase">Recent Winning Pairs</span>
        </div>
        <div className="flex space-x-4 overflow-x-auto pb-2 no-scrollbar">
          {pastGames.map((pg) => (
            <div key={pg.id} className="bg-[#1e293b] px-4 py-3 rounded-2xl border border-white/5 shrink-0">
              <div className="flex space-x-2">
                {pg.winners?.map(w => <span key={w} className="text-[#fc7952] font-black italic">{w}</span>)}
              </div>
              <p className="text-[8px] font-bold opacity-20 uppercase mt-1">Round #{pg.id.slice(-4)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
