"use client";
import { useState, useEffect } from "react";
import { db, auth } from "@/lib/firebase";
import { 
  doc, onSnapshot, increment, collection, query, where, 
  serverTimestamp, orderBy, limit, runTransaction
} from "firebase/firestore";
import { getDatabase, ref as rtdbRef, onValue } from "firebase/database"; 
import { onAuthStateChanged } from "firebase/auth";
import { Timer, Trophy, History, Loader2, PartyPopper, XCircle } from "lucide-react";

export default function FlyovaToDollars() {
  const [user, setUser] = useState(null);
  const [myWallet, setMyWallet] = useState(0);
  const [loading, setLoading] = useState(true);
  const [currentGame, setCurrentGame] = useState(null);
  const [pastGames, setPastGames] = useState([]);
  const [timeLeft, setTimeLeft] = useState(0);
  const [selectedNumbers, setSelectedNumbers] = useState([]);
  const [stake, setStake] = useState(1);
  const [activeBets, setActiveBets] = useState([]); 
  const [gameStatus, setGameStatus] = useState("betting"); 
  const [lastWinningNumbers, setLastWinningNumbers] = useState([]);
  
  // Win/Loss Alert States
  const [showResultAlert, setShowResultAlert] = useState(false);
  const [resultMessage, setResultMessage] = useState("");
  const [isWin, setIsWin] = useState(false);

  // 1. RTD LISTENER (The Engine)
  useEffect(() => {
    const rtdb = getDatabase();
    const gameRef = rtdbRef(rtdb, "active_game_flyova");

    const unsubscribe = onValue(gameRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setCurrentGame({ id: data.gameId, ...data });
        
        const remaining = Math.max(0, Math.floor((data.endTime - Date.now()) / 1000));
        setTimeLeft(remaining);
        
        if (data.status === "settled") {
          setGameStatus("settling");
          setLastWinningNumbers(data.winners || []);
          checkMyResults(data.gameId, data.winners); // Check if user won
        } else {
          setGameStatus("betting");
          setLastWinningNumbers([]);
          setShowResultAlert(false);
        }
      }
    });
    return () => unsubscribe();
  }, [activeBets]);

  // Logic to show Win/Loss Alert
  const checkMyResults = (gameId, winners) => {
    const myBet = activeBets.find(bet => bet.gameId === gameId);
    if (myBet) {
      const matchCount = myBet.picks.filter(num => winners.includes(num)).length;
      if (matchCount === 2) {
        setIsWin(true);
        setResultMessage(`YOU WON $${(myBet.amount * 1.3).toFixed(2)}!`);
      } else if (matchCount === 1) {
        setIsWin(true);
        setResultMessage(`PARTIAL WIN: $${(myBet.amount * 0.8).toFixed(2)} REFUNDED`);
      } else {
        setIsWin(false);
        setResultMessage("BET LOST - BETTER LUCK NEXT TIME!");
      }
      setShowResultAlert(true);
    }
  };

  // 2. FIRESTORE DATA (Wallets & History)
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        onSnapshot(doc(db, "users", u.uid), (d) => setMyWallet(d.data()?.wallet || 0));
        
        const qBets = query(collection(db, "users", u.uid, "transactions"), where("status", "==", "pending"));
        onSnapshot(qBets, (s) => setActiveBets(s.docs.map(d => ({ id: d.id, ...d.data() }))));
      }
      setLoading(false);
    });

    const qHist = query(collection(db, "timed_games"), where("status", "==", "completed"), orderBy("completedAt", "desc"), limit(10));
    const unsubHist = onSnapshot(qHist, (s) => setPastGames(s.docs.map(d => ({ id: d.id, ...d.data() }))));

    return () => { unsubAuth(); unsubHist(); };
  }, []);

  // Timer
  useEffect(() => {
    if (timeLeft <= 0) return;
    const interval = setInterval(() => setTimeLeft(prev => Math.max(0, prev - 1)), 1000);
    return () => clearInterval(interval);
  }, [timeLeft]);

  const placeBet = async () => {
    if (!user || selectedNumbers.length !== 2 || myWallet < stake) return;
    try {
      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, "users", user.uid);
        const userDoc = await transaction.get(userRef);
        if (userDoc.data().wallet < stake) throw "Insufficient funds";
        
        transaction.update(userRef, { wallet: increment(-stake) });
        transaction.set(doc(collection(db, "users", user.uid, "transactions")), {
          type: "stake",
          amount: stake,
          picks: selectedNumbers,
          gameId: currentGame.id,
          status: "pending",
          timestamp: serverTimestamp()
        });
      });
      setSelectedNumbers([]);
    } catch (e) { alert(e); }
  };

  if (loading) return <div className="min-h-screen bg-[#0f172a] flex items-center justify-center"><Loader2 className="animate-spin text-[#613de6]" /></div>;

  return (
    <div className="min-h-screen bg-[#0f172a] text-white p-6 pb-24">
      {/* Win/Loss Overlay */}
      {showResultAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm">
          <div className={`w-full max-w-sm rounded-[32px] p-8 text-center border-2 ${isWin ? 'border-green-500 bg-green-500/10' : 'border-red-500 bg-red-500/10'}`}>
            {isWin ? <PartyPopper className="mx-auto text-green-500 mb-4" size={64} /> : <XCircle className="mx-auto text-red-500 mb-4" size={64} />}
            <h2 className="text-2xl font-black italic mb-2">{isWin ? "CONGRATS!" : "OH NO!"}</h2>
            <p className="font-bold mb-6 opacity-80">{resultMessage}</p>
            <button onClick={() => setShowResultAlert(false)} className="w-full bg-white text-black py-4 rounded-2xl font-black italic">CLOSE</button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-black italic text-[#613de6]">FLY OVA</h1>
          <p className="text-[10px] font-bold opacity-40 uppercase">To Dollars</p>
        </div>
        <div className="bg-white/5 px-4 py-2 rounded-2xl border border-white/10 text-right">
          <p className="text-[10px] opacity-40 uppercase">Wallet</p>
          <p className="text-lg font-black italic">${myWallet.toFixed(2)}</p>
        </div>
      </div>

      {/* Game Card */}
      <div className="bg-[#1e293b] rounded-[40px] p-8 border border-white/5 shadow-2xl relative overflow-hidden">
        <div className="flex justify-between items-center mb-8">
          <div className={`flex items-center space-x-3 px-4 py-2 rounded-2xl border ${timeLeft < 10 ? 'border-red-500 text-red-500 animate-pulse' : 'border-white/10 text-[#613de6]'}`}>
            <Timer size={20} />
            <span className="text-2xl font-black italic">{Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}</span>
          </div>
          <span className="text-[10px] font-mono opacity-20">ID: {currentGame?.id?.slice(-6)}</span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((num) => (
            <button key={num} onClick={() => gameStatus === "betting" && (selectedNumbers.includes(num) ? setSelectedNumbers(selectedNumbers.filter(n => n !== num)) : selectedNumbers.length < 2 && setSelectedNumbers([...selectedNumbers, num]))}
              className={`h-28 rounded-[32px] text-4xl font-black italic transition-all 
              ${selectedNumbers.includes(num) ? 'bg-[#613de6] scale-95 shadow-lg' : 'bg-white/5 border border-white/5'}
              ${lastWinningNumbers.includes(num) ? 'ring-4 ring-green-500 ring-offset-4 ring-offset-[#1e293b]' : ''}`}>
              {num}
            </button>
          ))}
        </div>
      </div>

      {/* Betting Controls */}
      {gameStatus === "betting" ? (
        <div className="mt-6 space-y-4">
          <div className="bg-white/5 p-4 rounded-3xl border border-white/5 flex items-center justify-between">
            <button onClick={() => setStake(Math.max(1, stake - 1))} className="w-12 h-12 bg-white/5 rounded-2xl font-bold">-</button>
            <span className="text-3xl font-black italic">${stake}</span>
            <button onClick={() => setStake(stake + 1)} className="w-12 h-12 bg-[#613de6] rounded-2xl font-bold">+</button>
          </div>
          <button onClick={placeBet} disabled={selectedNumbers.length !== 2} className="w-full bg-[#fc7952] py-5 rounded-[32px] font-black italic text-xl shadow-xl disabled:opacity-50">
            PLACE ${stake} BET
          </button>
        </div>
      ) : (
        <div className="mt-6 bg-[#613de6]/20 border border-[#613de6]/40 p-6 rounded-[32px] text-center">
            <Loader2 className="animate-spin mx-auto mb-2 text-[#613de6]" />
            <p className="font-black italic text-[#613de6]">SETTLING RESULTS...</p>
        </div>
      )}

      {/* History */}
      <div className="mt-12">
        <div className="flex items-center space-x-2 opacity-30 mb-4">
          <History size={16} /><h3 className="text-xs font-black uppercase tracking-widest">Draw History</h3>
        </div>
        <div className="flex space-x-4 overflow-x-auto pb-4">
          {pastGames.map(pg => (
            <div key={pg.id} className="bg-white/5 p-4 rounded-2xl border border-white/5 flex-shrink-0">
              <div className="flex space-x-2">
                {pg.winners?.map(w => <span key={w} className="w-8 h-8 flex items-center justify-center bg-[#fc7952] rounded-full text-sm font-black italic">{w}</span>)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}