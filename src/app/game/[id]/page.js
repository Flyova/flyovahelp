"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
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
  deleteDoc,
  serverTimestamp,
  or
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { User, Zap, X, Timer, AlertCircle, Wallet, ShieldCheck, Trophy, RotateCcw } from "lucide-react";

export default function GamePage() {
  const { id } = useParams();
  const router = useRouter();
  
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [myWallet, setMyWallet] = useState(0);

  const [activeGame, setActiveGame] = useState(null);
  const [numbers, setNumbers] = useState([]);
  const [selectedNumber, setSelectedNumber] = useState(null);
  const [onlinePlayers, setOnlinePlayers] = useState([]);
  const [incomingChallenge, setIncomingChallenge] = useState(null);
  const [sentChallenge, setSentChallenge] = useState(null);
  
  const [showStakeModal, setShowStakeModal] = useState(null);
  const [stakeAmount, setStakeAmount] = useState(1);
  const GAME_FEE = 1.00;

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      if (!u) {
        router.push("/login");
      } else {
        setUser(u);
        const unsubWallet = onSnapshot(doc(db, "users", u.uid), (snap) => {
          if (snap.exists()) setMyWallet(snap.data().wallet || 0);
        });
        setLoadingAuth(false);
        return () => unsubWallet();
      }
    });
    return () => unsubAuth();
  }, [router]);

  useEffect(() => {
    if (!user) return;
    const userRef = doc(db, "users", user.uid);
    setDoc(userRef, { 
      username: user.displayName || user.email?.split('@')[0] || "Player", 
      status: "online", 
      lastSeen: serverTimestamp() 
    }, { merge: true });
    return () => { updateDoc(userRef, { status: "offline" }).catch(() => {}); };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const myId = user.uid;

    const unsubPlayers = onSnapshot(query(collection(db, "users"), where("status", "==", "online")), (snap) => {
      setOnlinePlayers(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.id !== myId));
    });

    const unsubIncoming = onSnapshot(query(collection(db, "challenges"), where("to", "==", myId), where("status", "==", "pending")), (snap) => {
      setIncomingChallenge(!snap.empty ? { id: snap.docs[0].id, ...snap.docs[0].data() } : null);
    });

    const unsubSent = onSnapshot(query(collection(db, "challenges"), where("from", "==", myId), where("status", "==", "pending")), (snap) => {
      setSentChallenge(!snap.empty ? { id: snap.docs[0].id, ...snap.docs[0].data() } : null);
    });

    const gameQuery = query(collection(db, "games"), or(where("player1", "==", myId), where("player2", "==", myId)));

    const unsubGame = onSnapshot(gameQuery, (snap) => {
      if (!snap.empty) {
        const gameDoc = snap.docs[0];
        const data = gameDoc.data();
        setActiveGame({ id: gameDoc.id, ...data });

        if (data.numberPool && (numbers.length === 0 || data.round !== activeGame?.round || data.gameState !== activeGame?.gameState)) {
          setNumbers(data.numberPool);
          setSelectedNumber(null);
        }
      } else {
        setActiveGame(null);
      }
    });

    return () => { unsubPlayers(); unsubIncoming(); unsubSent(); unsubGame(); };
  }, [user, activeGame?.round, activeGame?.gameState, numbers.length]);

  const initiateChallenge = async () => {
    const totalCost = (stakeAmount * 15) + GAME_FEE;
    if (myWallet < totalCost) return alert("Insufficient Balance!");
    await addDoc(collection(db, "challenges"), {
      from: user.uid,
      fromName: user.displayName || "Player",
      to: showStakeModal.id,
      status: "pending",
      stakePerRound: stakeAmount,
      totalStake: stakeAmount * 15,
      fee: GAME_FEE,
      timestamp: Date.now()
    });
    setShowStakeModal(null);
  };

  const acceptChallenge = async () => {
    const data = incomingChallenge;
    if (!data) return;
    const totalCost = data.totalStake + data.fee;
    if (myWallet < totalCost) return alert("Insufficient funds!");

    const gameId = `match_${Date.now()}`;
    try {
        // Create Game
        await setDoc(doc(db, "games", gameId), {
            player1: data.from,
            player2: user.uid,
            scores: { p1: 0, p2: 0 },
            turn: data.from,
            round: 1,
            gameState: "picking",
            picker: data.from,
            stakePerRound: data.stakePerRound,
            status: "active",
            numberPool: [Math.floor(Math.random() * 100), Math.floor(Math.random() * 100)],
            createdAt: Date.now()
        });

        // Wallet Updates
        await updateDoc(doc(db, "users", user.uid), { wallet: increment(-totalCost) });
        await updateDoc(doc(db, "users", data.from), { wallet: increment(-totalCost) });

        // --- NEW: LOG HISTORY FOR BOTH PLAYERS ---
        await addDoc(collection(db, "users", user.uid, "transactions"), {
          title: "Match Stake",
          amount: totalCost,
          type: "stake",
          status: "loss",
          timestamp: serverTimestamp()
        });
        await addDoc(collection(db, "users", data.from, "transactions"), {
          title: "Match Stake",
          amount: totalCost,
          type: "stake",
          status: "loss",
          timestamp: serverTimestamp()
        });

        await deleteDoc(doc(db, "challenges", data.id));
    } catch (err) { console.error(err); }
  };

  const handleGameMove = async (num) => {
    if (!activeGame || activeGame.turn !== user.uid || selectedNumber) return;
    setSelectedNumber(num);
    
    const isP1 = user.uid === activeGame.player1;
    const opponentId = isP1 ? activeGame.player2 : activeGame.player1;

    setTimeout(async () => {
      if (activeGame.gameState === "picking") {
        await updateDoc(doc(db, "games", activeGame.id), {
          gameState: "guessing",
          turn: opponentId,
          hiddenPick: num
        });
      } else {
        const wasCorrect = num === activeGame.hiddenPick;
        const scoreKey = isP1 ? "scores.p1" : "scores.p2";

        if (wasCorrect) {
          const winAmount = activeGame.stakePerRound * 2;
          await updateDoc(doc(db, "users", user.uid), { wallet: increment(winAmount) });
          
          // --- NEW: LOG VICTORY HISTORY ---
          await addDoc(collection(db, "users", user.uid, "transactions"), {
            title: "Round Victory",
            amount: winAmount,
            type: "win",
            status: "win",
            timestamp: serverTimestamp()
          });
        }

        const nextPicker = activeGame.picker === activeGame.player1 ? activeGame.player2 : activeGame.player1;
        const isRoundEnding = activeGame.picker === activeGame.player2;
        const isGameOver = activeGame.round === 15 && isRoundEnding;

        await updateDoc(doc(db, "games", activeGame.id), {
          gameState: "picking",
          turn: nextPicker,
          picker: nextPicker,
          round: isRoundEnding ? increment(1) : activeGame.round,
          [scoreKey]: wasCorrect ? increment(1) : increment(0),
          numberPool: [Math.floor(Math.random() * 100), Math.floor(Math.random() * 100)],
          status: isGameOver ? "completed" : "active"
        });
      }
    }, 800);
  };

  if (loadingAuth) return <div className="min-h-screen bg-[#0f172a] flex items-center justify-center text-white italic font-black">SYNCING...</div>;

  // --- GAME OVER VIEW ---
  if (activeGame?.status === "completed") {
    const isP1 = user.uid === activeGame.player1;
    const myScore = isP1 ? (activeGame.scores?.p1 || 0) : (activeGame.scores?.p2 || 0);
    const totalWon = myScore * ((activeGame.stakePerRound || 0) * 2);

    return (
      <div className="min-h-screen bg-[#0f172a] text-white flex flex-col items-center justify-center p-6 text-center">
        <Trophy size={64} className="text-[#fc7952] mb-4" />
        <h1 className="text-4xl font-black italic uppercase mb-2">Final Score</h1>
        <div className="bg-[#1e293b] p-8 rounded-[2.5rem] w-full max-w-sm border border-white/5 mb-6">
            <div className="flex justify-between items-center mb-4">
                <span className="text-xs font-bold opacity-50 uppercase">Your Correct Guesses</span>
                <span className="text-2xl font-black italic">{myScore}/15</span>
            </div>
            <div className="flex justify-between items-center border-t border-white/10 pt-4">
                <span className="text-xs font-bold opacity-50 uppercase">Total Earnings</span>
                <span className="text-2xl font-black italic text-green-400">${totalWon.toFixed(2)}</span>
            </div>
        </div>
        <button onClick={async () => { await deleteDoc(doc(db, "games", activeGame.id)); setActiveGame(null); }} className="w-full max-w-sm bg-[#613de6] py-5 rounded-2xl font-black uppercase italic">Play Again</button>
      </div>
    );
  }

  // --- LOBBY VIEW ---
  if (!activeGame) {
    return (
      <div className="min-h-screen bg-[#0f172a] text-white p-6">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-xl font-black italic uppercase">Play with Friends</h1>
          <div className="bg-white/5 px-4 py-2 rounded-full flex items-center space-x-2">
            <Wallet size={14} className="text-[#fc7952]"/>
            <span className="font-mono text-xs font-bold">${(myWallet || 0).toFixed(2)}</span>
          </div>
        </div>

        {showStakeModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-6">
            <div className="bg-[#1e293b] w-full max-w-xs rounded-[2.5rem] p-8 border border-white/10">
              <h2 className="text-center font-black italic uppercase mb-6 text-sm">Set Stake</h2>
              <div className="flex items-center justify-between mb-8 bg-black/20 p-4 rounded-2xl">
                <button onClick={() => setStakeAmount(Math.max(1, stakeAmount - 1))} className="w-10 h-10 bg-[#613de6] rounded-xl font-bold">-</button>
                <span className="text-3xl font-black text-[#fc7952]">${stakeAmount}</span>
                <button onClick={() => setStakeAmount(stakeAmount + 1)} className="w-10 h-10 bg-[#613de6] rounded-xl font-bold">+</button>
              </div>
              <p className="text-[9px] text-gray-500 uppercase font-black text-center mb-6 tracking-widest">30 TURNS TOTAL (15 PER PLAYER)</p>
              <button onClick={initiateChallenge} className="w-full bg-[#fc7952] py-4 rounded-2xl font-black uppercase text-xs mb-3">Send Challenge</button>
              <button onClick={() => setShowStakeModal(null)} className="w-full text-gray-500 font-black uppercase text-[10px]">Cancel</button>
            </div>
          </div>
        )}

        <div className="space-y-4">
          {onlinePlayers.map(p => (
            <div key={p.id} className="bg-[#1e293b] p-4 rounded-2xl flex justify-between items-center border border-white/5">
              <span className="font-bold italic uppercase text-sm">{p.username}</span>
              <button onClick={() => setShowStakeModal(p)} className="bg-[#fc7952] px-6 py-2 rounded-xl text-[10px] font-black uppercase">Challenge</button>
            </div>
          ))}
        </div>

        {incomingChallenge && (
          <div className="fixed bottom-10 left-6 right-6 bg-[#613de6] p-6 rounded-[2.5rem] shadow-2xl z-50 border-t-4 border-[#fc7952]">
            <p className="text-white font-black italic mb-2 uppercase text-center text-sm">{incomingChallenge.fromName} Challenged You!</p>
            <p className="text-center text-[10px] font-black opacity-60 mb-4 uppercase">Stake: ${incomingChallenge.stakePerRound}/Round</p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={acceptChallenge} className="bg-white text-[#613de6] py-3 rounded-2xl font-black uppercase text-xs">Accept</button>
              <button onClick={() => deleteDoc(doc(db, "challenges", incomingChallenge.id))} className="bg-black/20 py-3 rounded-2xl font-black uppercase text-xs">Decline</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- ARENA VIEW ---
  const isMyTurn = activeGame.turn === user.uid;
  const isGuessing = activeGame.gameState === "guessing";

  return (
    <div className="min-h-screen bg-[#0f172a] text-white flex flex-col">
      <div className="bg-[#613de6] p-4 flex justify-between items-center">
        <span className="font-black italic text-[10px] uppercase">ROUND {activeGame.round}/15</span>
        <div className="flex items-center space-x-2">
            <ShieldCheck size={14} className="text-[#fc7952]"/>
            <span className="font-black italic text-lg">${activeGame.stakePerRound.toFixed(2)}</span>
        </div>
        <button onClick={() => router.push('/dashboard')} className="text-[10px] font-black opacity-40 uppercase">Quit</button>
      </div>

      <div className="flex justify-between items-center p-8 bg-[#1e293b]">
        <div className={`text-center transition-all ${isMyTurn ? 'scale-110' : 'opacity-30'}`}>
          <div className="w-16 h-16 rounded-3xl bg-[#613de6] mx-auto flex items-center justify-center shadow-lg"><User size={32}/></div>
          <p className="mt-2 text-2xl font-black text-[#fc7952] italic">{user.uid === activeGame.player1 ? activeGame.scores?.p1 : activeGame.scores?.p2}</p>
        </div>
        <Zap className={`${isMyTurn ? 'text-[#fc7952] animate-pulse' : 'text-gray-700'}`} size={28} />
        <div className={`text-center transition-all ${!isMyTurn ? 'scale-110' : 'opacity-30'}`}>
          <div className="w-16 h-16 rounded-3xl bg-gray-800 mx-auto flex items-center justify-center shadow-lg"><User size={32}/></div>
          <p className="mt-2 text-2xl font-black italic">{user.uid === activeGame.player1 ? activeGame.scores?.p2 : activeGame.scores?.p1}</p>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <h2 className="text-2xl font-black italic mb-2 uppercase">
          {isMyTurn ? (isGuessing ? "YOUR GUESS" : "PICK A NUMBER") : "OPPONENT'S TURN"}
        </h2>
        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-10">
            {isMyTurn ? (isGuessing ? "Match their secret number" : "Choose a number for them to guess") : "Waiting for move..."}
        </p>

        <div className="grid grid-cols-2 gap-8 w-full max-w-sm">
          {numbers.map((num, i) => (
            <button
              key={i}
              disabled={!isMyTurn}
              onClick={() => handleGameMove(num)}
              className={`aspect-square rounded-[3rem] text-4xl font-black italic border-4 transition-all ${
                selectedNumber === num ? 'bg-[#613de6] border-[#fc7952]' : 'bg-[#1e293b] border-gray-800'
              }`}
            >
              {num}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}