"use client";
import { useState, useEffect, useRef } from "react";
import { db, auth, rtdb } from "@/lib/firebase"; // Using rtdb for high-speed sync
import { 
  doc, onSnapshot, increment, collection, query, where, 
  serverTimestamp, orderBy, limit, getDocs, runTransaction
} from "firebase/firestore";
import { ref as rtdbRef, onValue } from "firebase/database"; 
import { onAuthStateChanged } from "firebase/auth";
import { Timer, CheckCircle2, Trophy, History, XCircle, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import ToastNotification from "@/components/ToastNotification";

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
  const [placingBet, setPlacingBet] = useState(false);
  const placeBetLockRef = useRef(false);
  const [betError, setBetError] = useState("");
  const [notification, setNotification] = useState(null);
  const [activeBets, setActiveBets] = useState([]);
  const activeBetsRef = useRef([]);
  const [gameStatus, setGameStatus] = useState("betting");
  const gameStatusRef = useRef("betting");
  const currentGameIdRef = useRef(null);
  const [lastWinningNumbers, setLastWinningNumbers] = useState([]);
  
  // Alert States
  const [showResultAlert, setShowResultAlert] = useState(false);
  const [resultType, setResultType] = useState(null); 
  const [winAmount, setWinAmount] = useState(0);

  const GAME_DURATION = 120;
  const WIN_MULTIPLIER = 1.3; 

  const showNotification = (type, title, message) => {
    setNotification({ type, title, message, id: Date.now() });
  };


    
  // Keep refs in sync so RTDB listener always sees fresh state
  useEffect(() => { activeBetsRef.current = activeBets; }, [activeBets]);
  useEffect(() => { gameStatusRef.current = gameStatus; }, [gameStatus]);

  // 1. AUTH & WALLET SYNC
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) return router.push("/login");
      setUser(u);
      const unsubWallet = onSnapshot(doc(db, "users", u.uid), (snap) => {
        if (snap.exists()) setMyWallet(snap.data().wallet || 0);
      });
      return () => unsubWallet();
    });
    return () => unsub();
  }, [router]);

  // 2. REALTIME ENGINE SYNC
  // NOTE: gameStatus is intentionally NOT in the deps array.
  // We use gameStatusRef + currentGameIdRef to read current values inside the callback
  // without triggering re-subscriptions that can miss rapid RTDB transitions.
  useEffect(() => {
    const gameRef = rtdbRef(rtdb, "active_game_flyova");
    const unsubscribe = onValue(gameRef, async (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const now = Date.now();
        const diff = Math.max(0, Math.floor((data.endTime - now) / 1000));
        const isNewGame = currentGameIdRef.current !== data.gameId;

        setCurrentGame({
            id: data.gameId,
            endTime: data.endTime,
            numbers: data.displayNumbers || []
        });
        setTimeLeft(diff);
        currentGameIdRef.current = data.gameId;

        if (data.status === "settled") {
          const winners = data.winners || [];
          setLastWinningNumbers(winners);

          // Compute result immediately from local bet state — no Firestore query needed
          const bets = activeBetsRef.current;
          if (bets.length > 0) {
            const userPicks = bets.flatMap(b => b.picks || []);
            const won = userPicks.some(pick => winners.includes(pick));
            const totalStake = bets.reduce((sum, b) => sum + Number(b.amount || 0), 0);
            setResultType(won ? "win" : "loss");
            if (won) setWinAmount(totalStake * WIN_MULTIPLIER);
            setShowResultAlert(true);
          }

          // Also query Firestore in background to get accurate payout if backend differs
          if (user) checkGameResult(user.uid, data.gameId);
          setGameStatus("waiting");
          gameStatusRef.current = "waiting";
        } else {
          // New game started OR transitioning from waiting — always reset
          if (gameStatusRef.current === "waiting" || isNewGame || !currentGameIdRef.current) {
            setGameStatus("betting");
            gameStatusRef.current = "betting";
            setSelectedNumbers([]);
            setActiveBets([]);
            setLastWinningNumbers([]);
            if (user) fetchUserBets(data.gameId);
          }
        }
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [user]);

  // 3. HISTORY SYNC
  useEffect(() => {
    const qHistory = query(collection(db, "timed_games"), where("status", "==", "completed"), orderBy("endTime", "desc"), limit(5));
    const unsubHistory = onSnapshot(qHistory, (snap) => {
        setPastGames(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsubHistory();
  }, []);

  // 4. LOCAL TICKER
  useEffect(() => {
    if (timeLeft <= 0 || gameStatus === "waiting") return;
    const interval = setInterval(() => {
      setTimeLeft(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [timeLeft, gameStatus]);

  const checkGameResult = async (userId, gameId, attempt = 0) => {
    const MAX_ATTEMPTS = 10;
    const RETRY_DELAY = 1500;

    const q = query(
      collection(db, "users", userId, "transactions"),
      where("gameId", "==", gameId),
      limit(1)
    );
    const snap = await getDocs(q);

    if (!snap.empty) {
      const betData = snap.docs[0].data();
      if (betData.status === "win") {
        setWinAmount(betData.payout || betData.amount * WIN_MULTIPLIER);
        setResultType("win");
        setShowResultAlert(true);
        return;
      } else if (betData.status === "loss") {
        setResultType("loss");
        setShowResultAlert(true);
        return;
      }
      // status is still "pending" — backend hasn't settled yet, retry
    }

    if (attempt < MAX_ATTEMPTS) {
      setTimeout(() => checkGameResult(userId, gameId, attempt + 1), RETRY_DELAY);
    }
  };


  useEffect(() => {
    if (showResultAlert) {
      const timer = setTimeout(() => setShowResultAlert(false), 8000);
      return () => clearTimeout(timer);
    }
  }, [showResultAlert]);

  // Safety valve: if Drawing Results overlay is stuck for 30s, push to waiting state
  // so users aren't permanently frozen when the backend is slow
  useEffect(() => {
    if (timeLeft > 0 || gameStatus !== "betting") return;
    const timeout = setTimeout(() => {
      setGameStatus("waiting");
      gameStatusRef.current = "waiting";
    }, 30000);
    return () => clearTimeout(timeout);
  }, [timeLeft, gameStatus]);

  const fetchUserBets = async (gameId) => {
    if (!user) return;
    const q = query(
      collection(db, "users", user.uid, "transactions"), 
      where("gameId", "==", gameId),
      where("type", "==", "stake")
    );
    const snap = await getDocs(q);
    setActiveBets(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  const placeBet = async () => {
    if (!currentGame || placingBet || placeBetLockRef.current) return;
    if (selectedNumbers.length !== 2) {
      setBetError("Select 2 numbers before placing your bet.");
      return;
    }
    if (stake <= 0) {
      setBetError("Enter a valid stake amount.");
      return;
    }
    if (myWallet < stake) {
      const msg = `Insufficient balance. Stake: $${Number(stake).toFixed(2)} | Available: $${Number(myWallet || 0).toFixed(2)}`;
      setBetError(msg);
      showNotification("warning", "Low Balance", msg);
      return;
    }
    setBetError("");
    placeBetLockRef.current = true;
    setPlacingBet(true);
    try {
      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, "users", user.uid);
        const transRef = doc(collection(db, "users", user.uid, "transactions"));
        transaction.update(userRef, { wallet: increment(-stake) });
        transaction.set(transRef, {
            title: "Flyova Stake", 
            amount: stake, 
            picks: [...selectedNumbers].sort((a,b) => a-b),
            gameId: currentGame.id,
            type: "stake", 
            status: "pending", 
            timestamp: serverTimestamp()
        });
      });
      await fetchUserBets(currentGame.id);
    } catch (e) {
      console.error("Error placing bet:", e);
      showNotification("error", "Bet Failed", "Error placing bet. Please try again.");
    } finally {
      setPlacingBet(false);
      placeBetLockRef.current = false;
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center text-white italic font-black uppercase">
        <Loader2 className="animate-spin text-[#fc7952] mb-4" size={32} />
        Loading game...
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0f172a] text-white flex flex-col pb-24 relative overflow-hidden">
      <ToastNotification notification={notification} onClose={() => setNotification(null)} />
      
      {/* RESULT MODAL */}
      {showResultAlert && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center p-6 bg-black/75 backdrop-blur-md animate-in fade-in duration-300">
          <div className={`w-full max-w-sm rounded-3xl border-2 text-center shadow-2xl overflow-hidden ${resultType === 'win' ? 'bg-[#0d1f17] border-emerald-500/60 shadow-emerald-500/20' : 'bg-[#1a0f0f] border-red-500/60 shadow-red-500/20'}`}>
            <div className={`px-8 pt-10 pb-6 ${resultType === 'win' ? 'bg-emerald-500/5' : 'bg-red-500/5'}`}>
              <p className="text-5xl mb-4">{resultType === 'win' ? '🎉' : '😔'}</p>
              {resultType === 'win' ? (
                <>
                  <h2 className="text-3xl font-black italic uppercase text-emerald-400 mb-2">
                    YOU WON ${winAmount.toFixed(2)}!
                  </h2>
                  {lastWinningNumbers.length > 0 && (
                    <p className="text-sm font-bold text-white/60">
                      Winning numbers were: <span className="text-white font-black">{lastWinningNumbers.join(" & ")}</span>
                    </p>
                  )}
                </>
              ) : (
                <>
                  <h2 className="text-2xl font-black italic uppercase text-red-400 mb-2">
                    No Match This Draw
                  </h2>
                  {lastWinningNumbers.length > 0 && (
                    <p className="text-sm font-bold text-white/60">
                      Winning numbers were: <span className="text-white font-black">{lastWinningNumbers.join(" & ")}</span>
                    </p>
                  )}
                  <p className="text-xs text-white/30 font-bold mt-2">Better luck next round</p>
                </>
              )}
            </div>
            <button
              onClick={() => setShowResultAlert(false)}
              className="w-full py-4 text-[11px] font-black uppercase tracking-widest text-white/40 hover:text-white/70 transition-colors border-t border-white/5"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* SETTLING OVERLAY — shown between timer=0 and RTDB "settled" event */}
      {timeLeft <= 0 && gameStatus === "betting" && !showResultAlert && (
        <div className="absolute inset-0 z-90 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="flex flex-col items-center gap-4 bg-[#1e293b] border border-white/10 rounded-3xl px-10 py-8 shadow-2xl">
            <Loader2 size={36} className="animate-spin text-[#fc7952]" />
            <div className="text-center space-y-1">
              <p className="text-sm font-black italic uppercase tracking-widest text-white">Drawing Results...</p>
              <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Please wait</p>
            </div>
          </div>
        </div>
      )}

      {/* Header & Progress Bar */}
      <div className="p-8 text-center bg-[#1e293b] border-b border-white/5 relative">
        <div className="absolute top-0 left-0 h-1 bg-[#fc7952] transition-all duration-1000" style={{ width: `${(timeLeft/GAME_DURATION)*100}%` }} />
        <h1 className="text-sm font-black italic uppercase text-[#fc7952] mb-4">Flyova to Dollars</h1>
        <div className="inline-flex items-center space-x-3 bg-black/20 px-8 py-4 rounded-[2rem] border border-white/5 mt-4">
            <Timer size={24} className="text-[#613de6]" />
            <span className="text-4xl font-black italic font-mono">
                {gameStatus === "waiting" ? "00:00" : `${Math.floor(timeLeft / 60)}:${(timeLeft % 60).toString().padStart(2, '0')}`}
            </span>
        </div>
      </div>

      <div className="flex-1 p-6 flex flex-col items-center justify-center">
        {gameStatus === "waiting" ? (
            <div className="flex flex-col items-center justify-center w-full max-w-sm">
                <div className="grid grid-cols-4 gap-3 w-full mb-8">
                    {currentGame?.numbers?.map((num, idx) => (
                        <div key={`wait-num-${idx}`} className={`aspect-square rounded-2xl text-xl font-black italic flex items-center justify-center border-2 transition-all duration-500
                            ${lastWinningNumbers.includes(num) ? 'bg-green-500/20 border-green-500 shadow-[0_0_20px_rgba(34,197,94,0.4)] scale-110' : 'bg-[#1e293b] border-white/5 opacity-20'}`}>
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
                {/* Active Bets Display */}
                <div className="flex flex-wrap gap-2 mb-4 justify-center">
                    {activeBets.map((b, bIdx) => (
                        <div key={`active-bet-${b.id || bIdx}`} className="bg-green-500/10 border border-green-500/30 px-3 py-1 rounded-full flex items-center space-x-2">
                            <CheckCircle2 size={10} className="text-green-500" />
                            <span className="text-[10px] font-black italic">
                                {b.picks?.join(", ")} (${b.amount} = ${ (b.amount * WIN_MULTIPLIER).toFixed(1) })
                            </span>
                        </div>
                    ))}
                </div>

                {/* 1-90 Betting Grid */}
                <div className="grid grid-cols-4 gap-3 w-full max-w-sm mb-12">
                    {currentGame?.numbers?.map((num, idx) => (
                        <button key={`grid-num-${idx}`} onClick={() => {
                            if (selectedNumbers.includes(num)) setSelectedNumbers(selectedNumbers.filter(n => n !== num));
                            else if (selectedNumbers.length < 2) setSelectedNumbers([...selectedNumbers, num]);
                        }}
                        className={`aspect-square rounded-2xl text-xl font-black italic transition-all border-2 
                            ${selectedNumbers.includes(num) ? 'bg-[#613de6] border-[#fc7952] scale-105 shadow-lg' : 'bg-[#1e293b] border-white/5'}`}
                        >{num}</button>
                    ))}
                </div>

                {/* Stake Panel */}
                <div className="w-full max-w-xs bg-[#1e293b] p-6 rounded-[2.5rem] border border-white/5">
                    <div className="flex items-center justify-between mb-6 bg-black/20 p-4 rounded-2xl">
                        <button onClick={() => { setStake(Math.max(1, stake - 1)); setBetError(""); }} className="w-10 h-10 bg-[#613de6] rounded-xl font-bold">-</button>
                        <div className="flex items-center text-[#fc7952]">
                            <span className="text-2xl font-black italic mr-1">$</span>
                            <input
                              type="number"
                              value={stake}
                              onChange={(e) => {
                                setStake(parseInt(e.target.value) || 1);
                                setBetError("");
                              }}
                              className="bg-transparent text-2xl font-black italic w-12 text-center outline-none"
                            />
                        </div>
                        <button onClick={() => { setStake(stake + 1); setBetError(""); }} className="w-10 h-10 bg-[#613de6] rounded-xl font-bold">+</button>
                    </div>
                    {betError && (
                      <p className="mb-3 text-[10px] font-black uppercase tracking-wider text-rose-400 text-center">
                        {betError}
                      </p>
                    )}
                   <button 
    onClick={placeBet} 
    disabled={selectedNumbers.length !== 2 || timeLeft <= 0 || gameStatus === "waiting" || placingBet}
    className="w-full bg-[#fc7952] py-4 rounded-2xl font-black uppercase italic shadow-lg active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
>
    {timeLeft <= 0 ? "BETTING CLOSED" : placingBet ? "PLACING..." : "PLACE BET"}
</button>
                </div>
            </>
        )}
      </div>

      {/* History */}
      <div className="bg-black/20 p-6 border-t border-white/5">
        <div className="flex items-center space-x-2 mb-4 opacity-40">
            <History size={14} /><span className="text-[10px] font-black uppercase">Draw History</span>
        </div>
        <div className="flex space-x-4 overflow-x-auto pb-2 no-scrollbar">
            {pastGames.map((pg, pgIdx) => (
                <div key={`history-game-${pg.id || pgIdx}`} className="bg-[#1e293b] px-4 py-3 rounded-2xl border border-white/5 flex-shrink-0">
                    <div className="flex space-x-2">
                        {pg.winners?.map((w, wIdx) => (
                          <span key={`history-win-${pgIdx}-${wIdx}`} className="text-[#fc7952] font-black italic">{w}</span>
                        ))}
                    </div>
                </div>
            ))}
        </div>
      </div>
    </div>
  );
}
