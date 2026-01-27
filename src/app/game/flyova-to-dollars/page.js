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
  setDoc, 
  addDoc,
  serverTimestamp,
  orderBy,
  limit,
  getDoc,
  runTransaction
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { Wallet, Timer, Info, CheckCircle2, Trophy, ArrowLeft, History, XCircle } from "lucide-react";
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
  const [hasBet, setHasBet] = useState(false);
  const [gameStatus, setGameStatus] = useState("betting"); 
  const [lastWinners, setLastWinners] = useState([]);
  
  // Alert States
  const [showResultAlert, setShowResultAlert] = useState(false);
  const [resultType, setResultType] = useState(null); // 'win' or 'lose'
  const [winAmount, setWinAmount] = useState(0);

  const WIN_MULTIPLIER = 1.3;

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

  // 2. Global Game & History Listener
  useEffect(() => {
    const qActive = query(collection(db, "timed_games"), orderBy("endTime", "desc"), limit(1));
    const unsubActive = onSnapshot(qActive, (snap) => {
      if (!snap.empty) {
        const gameData = { id: snap.docs[0].id, ...snap.docs[0].data() };
        setCurrentGame(gameData);
        checkIfUserBet(gameData.id);
        
        if (gameStatus === "results" && Date.now() < gameData.endTime) {
            setGameStatus("betting");
            setSelectedNumbers([]);
            setLastWinners([]);
            setShowResultAlert(false); 
        }
      } else {
        generateNewGame(); 
      }
    });

    const qHistory = query(collection(db, "timed_games"), where("status", "==", "completed"), orderBy("endTime", "desc"), limit(5));
    const unsubHistory = onSnapshot(qHistory, (snap) => {
        setPastGames(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsubActive(); unsubHistory(); };
  }, [user, gameStatus]);

  // 3. Sync Countdown
  useEffect(() => {
    if (!currentGame) return;
    const interval = setInterval(() => {
      const diff = Math.max(0, Math.floor((currentGame.endTime - Date.now()) / 1000));
      setTimeLeft(diff);
      if (diff === 0 && gameStatus === "betting") revealResults();
    }, 1000);
    return () => clearInterval(interval);
  }, [currentGame, gameStatus]);

  const checkIfUserBet = async (gameId) => {
    if (!user) return;
    const betRef = doc(db, "timed_games", gameId, "bets", user.uid);
    const snap = await getDoc(betRef);
    setHasBet(snap.exists());
    if (snap.exists()) setSelectedNumbers(snap.data().picks);
  };

  const generateNewGame = async () => {
    const numbers = [];
    while (numbers.length < 5) {
      const r = Math.floor(Math.random() * 50) + 1;
      if (!numbers.includes(r)) numbers.push(r);
    }
    const winners = [numbers[0], numbers[1]]; 
    const shuffled = [...numbers].sort(() => Math.random() - 0.5);

    await addDoc(collection(db, "timed_games"), {
      numbers: shuffled,
      winners: winners,
      endTime: Date.now() + 120000, 
      status: "active",
      createdAt: serverTimestamp()
    });
  };

  const revealResults = async () => {
    setGameStatus("results");
    setLastWinners(currentGame.winners);

    if (hasBet && user) {
      try {
        const betRef = doc(db, "timed_games", currentGame.id, "bets", user.uid);
        const betSnap = await getDoc(betRef);
        if (betSnap.exists()) {
          const { picks, stake: betStake } = betSnap.data();
          const isWinner = currentGame.winners.every(w => picks.includes(w));
          
          if (isWinner) {
            const calculatedWin = betStake * WIN_MULTIPLIER;
            setWinAmount(calculatedWin);
            setResultType('win');
            await updateDoc(doc(db, "users", user.uid), { wallet: increment(calculatedWin) });
            await addDoc(collection(db, "users", user.uid, "transactions"), {
              title: "Flyova Win", amount: calculatedWin, type: "win", status: "win", timestamp: serverTimestamp()
            });
          } else {
            setResultType('lose');
          }
          setShowResultAlert(true);
        }
      } catch (err) { console.error(err); }
    }

    await updateDoc(doc(db, "timed_games", currentGame.id), { status: "completed" });
    
    setTimeout(() => { setShowResultAlert(false); }, 7000);
    setTimeout(() => { generateNewGame(); }, 10000);
  };

  const placeBet = async () => {
    if (selectedNumbers.length !== 2 || myWallet < stake) return;
    try {
      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, "users", user.uid);
        const betRef = doc(db, "timed_games", currentGame.id, "bets", user.uid);
        transaction.update(userRef, { wallet: increment(-stake) });
        transaction.set(betRef, { picks: selectedNumbers, stake: stake, timestamp: serverTimestamp() });
      });
      setHasBet(true);
      await addDoc(collection(db, "users", user.uid, "transactions"), {
        title: "Flyova Stake", amount: stake, type: "stake", status: "loss", timestamp: serverTimestamp()
      });
    } catch (e) { alert("Transaction failed"); }
  };

  const toggleNumber = (num) => {
    if (hasBet || gameStatus === "results") return;
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
        <div className="absolute inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-in fade-in zoom-in duration-300">
          <div className={`w-full max-w-xs p-8 rounded-[2.5rem] border-2 text-center shadow-[0_0_50px_rgba(0,0,0,0.5)] ${resultType === 'win' ? 'bg-[#1e293b] border-green-500' : 'bg-[#1e293b] border-red-500'}`}>
            {resultType === 'win' ? (
              <>
                <Trophy size={60} className="mx-auto text-green-500 mb-4 animate-bounce" />
                <h2 className="text-3xl font-black italic uppercase text-white mb-2">You WON!</h2>
                <p className="text-[#fc7952] text-2xl font-black italic tracking-tighter">${winAmount.toFixed(2)}</p>
              </>
            ) : (
              <>
                <XCircle size={60} className="mx-auto text-red-500 mb-4 animate-pulse" />
                <h2 className="text-xl font-black italic uppercase text-white mb-2 leading-tight">YOUR BET LOSE,<br/>BETTER LUCK NEXT TIME!</h2>
              </>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-[#613de6] p-4 flex justify-between items-center shadow-lg relative z-20">
        <button onClick={() => router.push('/dashboard')} className="flex items-center space-x-2">
            <ArrowLeft size={16} /><span className="font-black italic text-[10px] uppercase">Lobby</span>
        </button>
        <div className="flex items-center space-x-2 bg-black/20 px-3 py-1 rounded-full border border-white/5">
            <Wallet size={12} className="text-[#fc7952]"/>
            <span className="font-black italic text-sm">${myWallet.toFixed(2)}</span>
        </div>
      </div>

      {/* Real-time Timer */}
      <div className="p-8 text-center bg-[#1e293b] border-b border-white/5 relative">
        <div className="absolute top-0 left-0 h-1 bg-[#fc7952] transition-all duration-1000" style={{ width: `${(timeLeft/120)*100}%` }} />
        <h1 className="text-xl font-black italic uppercase text-[#fc7952] mb-1">Flyova to Dollars</h1>
        <div className="inline-flex items-center space-x-3 bg-black/20 px-8 py-4 rounded-[2rem] border border-white/5 mt-4">
            <Timer size={24} className="text-[#613de6]" />
            <span className="text-4xl font-black italic font-mono">
                {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
            </span>
        </div>
      </div>

      {/* 5 Number Grid */}
      <div className="flex-1 p-6 flex flex-col items-center justify-center">
        {/* Instructional Text */}
        <p className="text-[#fc7952] font-black italic uppercase text-xs mb-4 tracking-tighter">
            Pick 2 Numbers and Enter Stake Amount
        </p>

        <div className="grid grid-cols-5 gap-4 w-full max-w-sm mb-12">
            {currentGame?.numbers.map((num) => {
                const isSelected = selectedNumbers.includes(num);
                const isWinner = lastWinners.includes(num) && gameStatus === "results";
                return (
                    <button key={num} disabled={hasBet || gameStatus === "results"} onClick={() => toggleNumber(num)}
                        className={`aspect-square rounded-2xl text-xl font-black italic transition-all border-2 
                            ${isWinner ? 'bg-green-500 border-white scale-110 shadow-[0_0_25px_rgba(34,197,94,0.6)]' : 
                              isSelected ? 'bg-[#613de6] border-[#fc7952]' : 'bg-[#1e293b] border-white/5'}
                            ${hasBet && !isSelected && !isWinner ? 'opacity-20' : ''}`}
                    >{num}</button>
                );
            })}
        </div>

        {/* Betting Panel */}
        <div className="w-full max-w-xs bg-[#1e293b] p-6 rounded-[2.5rem] border border-white/5">
            {!hasBet ? (
                <>
                    <div className="flex items-center justify-between mb-6 bg-black/20 p-4 rounded-2xl">
                        <button onClick={() => setStake(Math.max(1, stake - 1))} className="w-10 h-10 bg-[#613de6] rounded-xl font-bold">-</button>
                        <div className="text-center"><span className="text-2xl font-black italic text-[#fc7952]">${stake}</span></div>
                        <button onClick={() => setStake(stake + 1)} className="w-10 h-10 bg-[#613de6] rounded-xl font-bold">+</button>
                    </div>
                    <button onClick={placeBet} disabled={selectedNumbers.length !== 2}
                        className="w-full bg-[#fc7952] pt-4 pb-3 rounded-2xl font-black uppercase italic shadow-lg disabled:opacity-20 flex flex-col items-center">
                        <span className="text-lg">PLACE BET</span>
                        <span className="text-[10px] opacity-80 mt-1 italic tracking-tight">Potential Win: ${(stake * WIN_MULTIPLIER).toFixed(2)}</span>
                    </button>
                </>
            ) : (
                <div className="text-center py-2">
                    <CheckCircle2 size={32} className="mx-auto mb-2 text-green-500" />
                    <p className="font-black italic uppercase text-sm">Betting Closed</p>
                    <p className="text-[10px] font-bold opacity-30 mt-1">WAITING FOR RESULTS...</p>
                </div>
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
                <div key={pg.id} className="bg-[#1e293b] px-4 py-3 rounded-2xl border border-white/5 flex-shrink-0">
                    <div className="flex space-x-2">
                        {pg.winners.map(w => <span key={w} className="text-[#fc7952] font-black italic">{w}</span>)}
                    </div>
                    <p className="text-[8px] font-bold opacity-20 uppercase mt-1">Round #{pg.id.slice(-4)}</p>
                </div>
            ))}
        </div>
      </div>
    </div>
  );
}