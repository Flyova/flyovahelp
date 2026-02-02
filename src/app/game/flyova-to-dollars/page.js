"use client";
import { useState, useEffect } from "react";
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
  getDocs,
  runTransaction,
  getDoc
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { Timer, CheckCircle2, Trophy, History, XCircle, Plus } from "lucide-react";
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
  const [activeBets, setActiveBets] = useState([]); 
  const [gameStatus, setGameStatus] = useState("betting"); 
  const [lastWinners, setLastWinners] = useState([]);
  
  // Alert States
  const [showResultAlert, setShowResultAlert] = useState(false);
  const [resultType, setResultType] = useState(null); 
  const [winAmount, setWinAmount] = useState(0);

  const WIN_MULTIPLIER = 1.3;
  const GAME_DURATION = 120; // 2 minutes

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

  // 2. Global Game & History Listener - Modified to wait for server-side "completed" status
  useEffect(() => {
    const qActive = query(collection(db, "timed_games"), orderBy("endTime", "desc"), limit(1));
    const unsubActive = onSnapshot(qActive, async (snap) => {
      if (!snap.empty) {
        const gameData = { id: snap.docs[0].id, ...snap.docs[0].data() };
        
        // When server marks game as completed, show the result alert
        if (gameData.status === "completed" && gameStatus !== "results") {
            setGameStatus("results");
            const winners = gameData.winners || [];
            setLastWinners(winners);

            // Check if current user had a winning bet
            if (user) {
                const betQ = query(
                    collection(db, "users", user.uid, "transactions"),
                    where("gameId", "==", gameData.id),
                    where("type", "==", "stake")
                );
                const betSnap = await getDocs(betQ);
                let totalWin = 0;
                let won = false;

                betSnap.forEach(doc => {
                    const data = doc.data();
                    if (data.status === "win") {
                        totalWin += (data.amount || 0);
                        won = true;
                    }
                });

                setWinAmount(totalWin);
                setResultType(won ? 'win' : 'lose');
                setShowResultAlert(true);
                setTimeout(() => setShowResultAlert(false), 7000);
            }
            return;
        }

        // Reset UI for a new active game
        if (gameData.status === "active") {
            setCurrentGame(gameData);
            fetchUserBetsFromTransactions(gameData.id); 
            
            if (gameStatus === "results") {
                setGameStatus("betting");
                setSelectedNumbers([]);
                setLastWinners([]);
                setActiveBets([]);
                setShowResultAlert(false); 
            }
        }
      }
    });

    const qHistory = query(collection(db, "timed_games"), where("status", "==", "completed"), orderBy("endTime", "desc"), limit(5));
    const unsubHistory = onSnapshot(qHistory, (snap) => {
        setPastGames(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsubActive(); unsubHistory(); };
  }, [user, gameStatus]);

  // 3. Countdown Timer Sync
  useEffect(() => {
    if (!currentGame || gameStatus === "results") return;
    const interval = setInterval(() => {
      const diff = Math.max(0, Math.floor((currentGame.endTime - Date.now()) / 1000));
      setTimeLeft(diff);
      // Removed revealResults() trigger; server now handles this
    }, 1000);
    return () => clearInterval(interval);
  }, [currentGame, gameStatus]);

  const fetchUserBetsFromTransactions = async (gameId) => {
    if (!user) return;
    const q = query(
      collection(db, "users", user.uid, "transactions"), 
      where("gameId", "==", gameId),
      where("status", "==", "pending"),
      where("type", "==", "stake")
    );
    const snap = await getDocs(q);
    const bets = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    setActiveBets(bets);
  };

  const placeBet = async () => {
    const finalStake = stake === "" ? 1 : stake;
    if (selectedNumbers.length !== 2 || myWallet < finalStake || !currentGame) return;
    
    try {
      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, "users", user.uid);
        const transRef = doc(collection(db, "users", user.uid, "transactions"));
        const sortedPicks = [...selectedNumbers].sort((a, b) => a - b);
        
        transaction.update(userRef, { wallet: increment(-finalStake) });
        transaction.set(transRef, {
            title: "Flyova Stake", 
            amount: finalStake, 
            picks: sortedPicks,
            gameId: currentGame.id,
            type: "stake", 
            status: "pending", 
            timestamp: serverTimestamp()
        });
      });
      
      fetchUserBetsFromTransactions(currentGame.id);
      setSelectedNumbers([]); 
    } catch (e) { 
      alert("Insufficient Balance"); 
    }
  };

  const handleStakeChange = (e) => {
    const val = e.target.value;
    if (val === "") { setStake(""); return; }
    const num = parseInt(val);
    if (!isNaN(num)) setStake(num);
  };

  const toggleNumber = (num) => {
    if (gameStatus === "results") return;
    if (selectedNumbers.includes(num)) {
      setSelectedNumbers(selectedNumbers.filter(n => n !== num));
    } else if (selectedNumbers.length < 2) {
      setSelectedNumbers([...selectedNumbers, num]);
    }
  };

  if (loading) return <div className="min-h-screen bg-[#0f172a] flex items-center justify-center text-white italic font-black uppercase">Syncing...</div>;

  return (
    <div className="min-h-screen bg-[#0f172a] text-white flex flex-col pb-24 relative overflow-hidden">
      {showResultAlert && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-in fade-in zoom-in duration-300">
          <div className={`w-full max-w-xs p-8 rounded-[2.5rem] border-2 text-center shadow-[0_0_50px_rgba(0,0,0,0.5)] ${resultType === 'win' ? 'bg-[#1e293b] border-green-500' : 'bg-[#1e293b] border-red-500'}`}>
            {resultType === 'win' ? (
              <>
                <Trophy size={60} className="mx-auto text-green-500 mb-4 animate-bounce" />
                <h2 className="text-3xl font-black italic uppercase mb-2">You WON!</h2>
                <p className="text-[#fc7952] text-2xl font-black italic tracking-tighter">${winAmount.toFixed(2)}</p>
              </>
            ) : (
              <>
                <XCircle size={60} className="mx-auto text-red-500 mb-4 animate-pulse" />
                <h2 className="text-xl font-black italic uppercase mb-2">Better luck next time!</h2>
              </>
            )}
          </div>
        </div>
      )}

      {/* Header & Timer Bar */}
      <div className="p-8 text-center bg-[#1e293b] border-b border-white/5 relative">
        <div className="absolute top-0 left-0 h-1 bg-[#fc7952] transition-all duration-1000" style={{ width: `${(timeLeft/GAME_DURATION)*100}%` }} />
        <h1 className="text-sm font-black italic uppercase text-[#fc7952] mb-4">Flyova to Dollars</h1>
        <div className="inline-flex items-center space-x-3 bg-black/20 px-8 py-4 rounded-[2rem] border border-white/5 mt-4">
            <Timer size={24} className="text-[#613de6]" />
            <span className="text-4xl font-black italic font-mono">{Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}</span>
        </div>
      </div>

      <div className="flex-1 p-6 flex flex-col items-center justify-center">
        <div className="flex flex-wrap gap-2 mb-4 justify-center">
            {activeBets.map((b) => (
                <div key={b.id} className="bg-green-500/20 border border-green-500/50 px-2 py-1 rounded-lg flex items-center space-x-2">
                    <CheckCircle2 size={10} className="text-green-500" />
                    <span className="text-[10px] font-black italic">{b.picks?.join(", ")} (${b.amount})</span>
                </div>
            ))}
        </div>

        <div className="grid grid-cols-5 gap-4 w-full max-w-sm mb-12">
            {currentGame?.numbers?.map((num) => {
                const isSelected = selectedNumbers.includes(num);
                const isWinner = lastWinners.includes(num) && gameStatus === "results";
                return (
                    <button key={num} disabled={gameStatus === "results"} onClick={() => toggleNumber(num)}
                        className={`aspect-square rounded-2xl text-xl font-black italic transition-all border-2 
                            ${isWinner ? 'bg-green-500 border-white scale-110 shadow-[0_0_25px_rgba(34,197,94,0.6)]' : 
                              isSelected ? 'bg-[#613de6] border-[#fc7952]' : 'bg-[#1e293b] border-white/5'}`}
                    >{num}</button>
                );
            })}
        </div>

        <div className="w-full max-w-xs bg-[#1e293b] p-6 rounded-[2.5rem] border border-white/5">
            {gameStatus === "betting" ? (
                <>
                    <div className="flex items-center justify-between mb-6 bg-black/20 p-4 rounded-2xl">
                        <button onClick={() => setStake(Math.max(1, (stake || 1) - 1))} className="w-10 h-10 bg-[#613de6] rounded-xl font-bold">-</button>
                        <div className="flex items-center">
                            <span className="text-2xl font-black italic text-[#fc7952] mr-0.5">$</span>
                            <input type="text" value={stake} onChange={handleStakeChange} className="bg-transparent text-2xl font-black italic text-[#fc7952] w-12 text-center outline-none" />
                        </div>
                        <button onClick={() => setStake((stake || 0) + 1)} className="w-10 h-10 bg-[#613de6] rounded-xl font-bold">+</button>
                    </div>
                    <button onClick={placeBet} disabled={selectedNumbers.length !== 2 || !stake}
                        className="w-full bg-[#fc7952] pt-4 pb-3 rounded-2xl font-black uppercase italic shadow-lg active:scale-95">
                        <span className="text-lg flex items-center justify-center"><Plus size={18} className="mr-2"/> PLACE BET</span>
                    </button>
                </>
            ) : (
                <div className="text-center py-2">
                    <CheckCircle2 size={32} className="mx-auto mb-2 text-green-500" />
                    <p className="font-black italic uppercase text-sm">Betting Closed</p>
                </div>
            )}
        </div>
      </div>

      <div className="bg-black/20 p-6 border-t border-white/5">
        <div className="flex items-center space-x-2 mb-4 opacity-40">
            <History size={14} /><span className="text-[10px] font-black uppercase">Recent Draws</span>
        </div>
        <div className="flex space-x-4 overflow-x-auto pb-2 no-scrollbar">
            {pastGames.map((pg) => (
                <div key={pg.id} className="bg-[#1e293b] px-4 py-3 rounded-2xl border border-white/5 flex-shrink-0">
                    <div className="flex space-x-2">
                        {pg.winners?.map(w => <span key={w} className="text-[#fc7952] font-black italic">{w}</span>)}
                    </div>
                    <p className="text-[8px] font-bold opacity-20 uppercase mt-1">Round #{pg.id?.slice(-4)}</p>
                </div>
            ))}
        </div>
      </div>
    </div>
  );
}