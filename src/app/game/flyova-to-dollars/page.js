"use client";
import { useState, useEffect } from "react";
import { db, auth } from "@/lib/firebase";
import { 
  doc, onSnapshot, increment, collection, query, where, 
  serverTimestamp, orderBy, limit, getDocs, runTransaction
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { Timer, CheckCircle2, Trophy, History, XCircle, Plus, Loader2 } from "lucide-react";
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
  
  // Alert States
  const [showResultAlert, setShowResultAlert] = useState(false);
  const [resultType, setResultType] = useState(null); 
  const [winAmount, setWinAmount] = useState(0);

  const GAME_DURATION = 120;

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

  // Handle showing the result modal
  const checkGameResult = async (userId, gameId) => {
    const q = query(
      collection(db, "users", userId, "transactions"),
      where("gameId", "==", gameId),
      limit(1)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      const betData = snap.docs[0].data();
      if (betData.status === "win") {
        setWinAmount(betData.amount);
        setResultType("win");
        setShowResultAlert(true);
      } else if (betData.status === "loss") {
        setResultType("loss");
        setShowResultAlert(true);
      }
    }
  };

  useEffect(() => {
    const qActive = query(collection(db, "timed_games"), orderBy("endTime", "desc"), limit(1));
    const unsubActive = onSnapshot(qActive, async (snap) => {
      if (!snap.empty) {
        const gameData = { id: snap.docs[0].id, ...snap.docs[0].data() };
        const isExpired = Date.now() > gameData.endTime;

        if (gameData.status === "completed" || isExpired) {
          // If we were just betting, check if we won before moving to waiting
          if (gameStatus === "betting" && user) {
            await checkGameResult(user.uid, gameData.id);
          }
          setGameStatus("waiting");
          return;
        }

        if (gameData.status === "active") {
          setCurrentGame(gameData);
          fetchUserBets(gameData.id); 
          
          if (gameStatus === "waiting" || !currentGame) {
            setGameStatus("betting");
            setSelectedNumbers([]);
            setActiveBets([]);
            setShowResultAlert(false); // Reset modal for new round
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

  useEffect(() => {
    if (!currentGame || gameStatus !== "betting") return;
    const interval = setInterval(() => {
      const diff = Math.max(0, Math.floor((currentGame.endTime - Date.now()) / 1000));
      setTimeLeft(diff);
    }, 1000);
    return () => clearInterval(interval);
  }, [currentGame, gameStatus]);

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
    if (selectedNumbers.length !== 2 || myWallet < stake || !currentGame) return;
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
      fetchUserBets(currentGame.id);
      setSelectedNumbers([]); 
    } catch (e) { alert("Error placing bet"); }
  };

  if (loading) return <div className="min-h-screen bg-[#0f172a] flex items-center justify-center text-white italic font-black uppercase">Syncing...</div>;

  return (
    <div className="min-h-screen bg-[#0f172a] text-white flex flex-col pb-24 relative overflow-hidden">
      
      {/* RESULT MODAL */}
      {showResultAlert && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className={`w-full max-w-xs p-8 rounded-[2.5rem] border-2 text-center shadow-2xl ${resultType === 'win' ? 'bg-[#1e293b] border-green-500' : 'bg-[#1e293b] border-red-500'}`}>
            {resultType === 'win' ? (
              <>
                <Trophy size={60} className="mx-auto text-green-400 mb-4 animate-bounce" />
                <h2 className="text-3xl font-black italic uppercase mb-2 text-white">You Won!</h2>
                <p className="text-[#fc7952] text-2xl font-black italic">+${winAmount.toFixed(2)}</p>
              </>
            ) : (
              <>
                <XCircle size={60} className="mx-auto text-red-500 mb-4" />
                <h2 className="text-xl font-black italic uppercase mb-2 text-white">No Luck!</h2>
                <p className="text-sm opacity-70">Try again next round</p>
              </>
            )}
            <button onClick={() => setShowResultAlert(false)} className="mt-6 text-[10px] font-bold uppercase tracking-widest opacity-50">Close</button>
          </div>
        </div>
      )}

      {/* Header */}
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
            <div className="flex flex-col items-center justify-center space-y-4">
                <Loader2 size={48} className="text-[#fc7952] animate-spin" />
                <div className="text-center">
                    <h2 className="text-2xl font-black italic uppercase">Starting Soon</h2>
                    <p className="text-sm opacity-50 font-bold uppercase">Preparing next draw...</p>
                </div>
            </div>
        ) : (
            <>
                <div className="flex flex-wrap gap-2 mb-4 justify-center">
                    {activeBets.map((b) => (
                        <div key={b.id} className="bg-green-500/10 border border-green-500/30 px-3 py-1 rounded-full flex items-center space-x-2">
                            <CheckCircle2 size={10} className="text-green-500" />
                            <span className="text-[10px] font-black italic">{b.picks?.join(", ")} (${b.amount})</span>
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-5 gap-3 w-full max-w-sm mb-12">
                    {currentGame?.numbers?.map((num) => (
                        <button key={num} onClick={() => {
                            if (selectedNumbers.includes(num)) setSelectedNumbers(selectedNumbers.filter(n => n !== num));
                            else if (selectedNumbers.length < 2) setSelectedNumbers([...selectedNumbers, num]);
                        }}
                        className={`aspect-square rounded-2xl text-xl font-black italic transition-all border-2 
                            ${selectedNumbers.includes(num) ? 'bg-[#613de6] border-[#fc7952] scale-105 shadow-lg' : 'bg-[#1e293b] border-white/5'}`}
                        >{num}</button>
                    ))}
                </div>

                <div className="w-full max-w-xs bg-[#1e293b] p-6 rounded-[2.5rem] border border-white/5">
                    <div className="flex items-center justify-between mb-6 bg-black/20 p-4 rounded-2xl">
                        <button onClick={() => setStake(Math.max(1, stake - 1))} className="w-10 h-10 bg-[#613de6] rounded-xl font-bold">-</button>
                        <div className="flex items-center text-[#fc7952]">
                            <span className="text-2xl font-black italic mr-1">$</span>
                            <input type="number" value={stake} onChange={(e) => setStake(parseInt(e.target.value) || 1)} className="bg-transparent text-2xl font-black italic w-12 text-center outline-none" />
                        </div>
                        <button onClick={() => setStake(stake + 1)} className="w-10 h-10 bg-[#613de6] rounded-xl font-bold">+</button>
                    </div>
                    <button onClick={placeBet} disabled={selectedNumbers.length !== 2}
                        className="w-full bg-[#fc7952] py-4 rounded-2xl font-black uppercase italic shadow-lg active:scale-95 disabled:opacity-50">
                        PLACE BET
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
        <div className="flex space-x-4 overflow-x-auto pb-2">
            {pastGames.map((pg) => (
                <div key={pg.id} className="bg-[#1e293b] px-4 py-3 rounded-2xl border border-white/5 flex-shrink-0">
                    <div className="flex space-x-2">
                        {pg.winners?.map(w => <span key={w} className="text-[#fc7952] font-black italic">{w}</span>)}
                    </div>
                </div>
            ))}
        </div>
      </div>
    </div>
  );
}