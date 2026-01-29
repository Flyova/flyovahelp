"use client";
import { useState, useEffect, useRef } from "react";
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
  or,
  orderBy,
  limit
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { User, Zap, Wallet, ShieldCheck, Trophy, Ghost, MessageSquare, Send, X as CloseIcon } from "lucide-react";

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
  
  // Chat States
  const [showChat, setShowChat] = useState(false);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [hasNewMsg, setHasNewMsg] = useState(false);
  const chatEndRef = useRef(null);

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
    const myId = user.uid;
    const userRef = doc(db, "users", myId);
    setDoc(userRef, { status: "online", lastSeen: serverTimestamp() }, { merge: true });

    const unsubPlayers = onSnapshot(query(collection(db, "users"), where("status", "==", "online")), (snap) => {
      setOnlinePlayers(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.id !== myId));
    });

    const unsubIncoming = onSnapshot(query(collection(db, "challenges"), where("to", "==", myId), where("status", "==", "pending")), (snap) => {
      setIncomingChallenge(!snap.empty ? { id: snap.docs[0].id, ...snap.docs[0].data() } : null);
    });

    const gameQuery = query(collection(db, "games"), or(where("player1", "==", myId), where("player2", "==", myId)));
    const unsubGame = onSnapshot(gameQuery, (snap) => {
      if (!snap.empty) {
        const data = snap.docs[0].data();
        if (data) {
            setActiveGame({ id: snap.docs[0].id, ...data });
            if (data.numberPool && (numbers.length === 0 || data.round !== activeGame?.round || data.gameState !== activeGame?.gameState)) {
              setNumbers(data.numberPool);
              setSelectedNumber(null);
            }
        }
      } else {
        setActiveGame(null);
      }
    });

    return () => { 
        unsubPlayers(); 
        unsubIncoming(); 
        unsubGame(); 
        updateDoc(userRef, { status: "offline" }).catch(() => {}); 
    };
  }, [user, activeGame?.round, activeGame?.gameState]);

  useEffect(() => {
    if (!activeGame?.id) return;
    const q = query(collection(db, "games", activeGame.id, "messages"), orderBy("timestamp", "asc"), limit(50));
    const unsubChat = onSnapshot(q, (snap) => {
      const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setMessages(msgs);
      if (!showChat && msgs.length > 0 && msgs[msgs.length - 1].senderId !== user?.uid) {
        setHasNewMsg(true);
      }
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    });
    return () => unsubChat();
  }, [activeGame?.id, showChat, user?.uid]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeGame) return;
    const msg = newMessage;
    setNewMessage("");
    await addDoc(collection(db, "games", activeGame.id, "messages"), {
      text: msg,
      senderId: user.uid,
      senderName: user.displayName || "Player",
      timestamp: serverTimestamp()
    });
  };

  const initiateChallenge = async () => {
    const totalWager = (stakeAmount * 15);
    const totalCost = totalWager + GAME_FEE;
    if (myWallet < totalCost) return alert("Insufficient Balance!");
    await addDoc(collection(db, "challenges"), {
      from: user.uid, fromName: user.displayName || "Player", to: showStakeModal.id, status: "pending",
      stakePerRound: stakeAmount, totalWager, fee: GAME_FEE, timestamp: Date.now()
    });
    setShowStakeModal(null);
  };

  const acceptChallenge = async () => {
    const chal = incomingChallenge;
    if (!chal) return;
    const totalCost = chal.totalWager + chal.fee;
    if (myWallet < totalCost) return alert("Insufficient funds!");
    const gameId = `match_${Date.now()}`;
    try {
        await updateDoc(doc(db, "users", user.uid), { wallet: increment(-totalCost) });
        await updateDoc(doc(db, "users", chal.from), { wallet: increment(-totalCost) });
        
        await setDoc(doc(db, "games", gameId), {
          player1: chal.from, player2: user.uid, scores: { p1: 0, p2: 0 },
          turn: chal.from, round: 1, gameState: "picking", picker: chal.from, 
          stakePerRound: chal.stakePerRound, 
          wagerPool: { p1: chal.totalWager, p2: chal.totalWager },
          status: "active", numberPool: [Math.floor(Math.random() * 100), Math.floor(Math.random() * 100)], createdAt: Date.now()
        });

        const log = { title: "Match Stake", amount: totalCost, type: "stake", status: "loss", timestamp: serverTimestamp() };
        await addDoc(collection(db, "users", user.uid, "transactions"), log);
        await addDoc(collection(db, "users", chal.from, "transactions"), log);
        await deleteDoc(doc(db, "challenges", chal.id));
    } catch (e) { console.error(e); }
  };

  const handleGameMove = async (num) => {
    if (!activeGame || activeGame.turn !== user.uid || selectedNumber) return;
    setSelectedNumber(num);
    
    const isP1 = user.uid === activeGame.player1;
    const opponentId = isP1 ? activeGame.player2 : activeGame.player1;

    setTimeout(async () => {
      if (activeGame?.gameState === "picking") {
        await updateDoc(doc(db, "games", activeGame.id), {
          gameState: "guessing",
          turn: opponentId,
          hiddenPick: num
        });
      } else if (activeGame?.gameState === "guessing") {
        const wasCorrect = num === activeGame.hiddenPick;
        const scoreKey = isP1 ? "scores.p1" : "scores.p2";
        
        const pickerId = activeGame.picker;
        const pickerPoolKey = pickerId === activeGame.player1 ? "wagerPool.p1" : "wagerPool.p2";

        if (wasCorrect) {
          const winAmount = activeGame.stakePerRound;
          await updateDoc(doc(db, "users", user.uid), { wallet: increment(winAmount) });
          await updateDoc(doc(db, "games", activeGame.id), { [pickerPoolKey]: increment(-winAmount) });
          
          await addDoc(collection(db, "users", user.uid, "transactions"), {
            title: "Round Win", amount: winAmount, type: "win", status: "win", timestamp: serverTimestamp()
          });
        }

        const nextPicker = activeGame.picker === activeGame.player1 ? activeGame.player2 : activeGame.player1;
        const isGameOver = activeGame.round >= 30;

        await updateDoc(doc(db, "games", activeGame.id), {
          gameState: "picking",
          turn: nextPicker,
          picker: nextPicker,
          round: increment(1),
          [scoreKey]: wasCorrect ? increment(1) : increment(0),
          numberPool: [Math.floor(Math.random() * 100), Math.floor(Math.random() * 100)],
          status: isGameOver ? "completed" : "active"
        });
      }
    }, 800);
  };

  const finalizeAndRefund = async () => {
    if (!activeGame) return;
    const { player1, player2, wagerPool, id } = activeGame;

    const refund = async (uid, amt) => {
      if (amt > 0) {
        await updateDoc(doc(db, "users", uid), { wallet: increment(amt) });
        await addDoc(collection(db, "users", uid, "transactions"), {
          title: "Pool Refund", amount: amt, type: "finance", status: "win", timestamp: serverTimestamp()
        });
      }
    };

    await refund(player1, wagerPool.p1);
    await refund(player2, wagerPool.p2);
    await deleteDoc(doc(db, "games", id));
    setActiveGame(null);
    router.push('/dashboard');
  };

  if (loadingAuth) return <div className="min-h-screen bg-[#0f172a] flex items-center justify-center text-white italic font-black">SYNCING...</div>;

  if (activeGame?.status === "completed") {
    const isP1 = user.uid === activeGame.player1;
    const myScore = isP1 ? activeGame.scores?.p1 : activeGame.scores?.p2;
    return (
      <div className="min-h-screen bg-[#0f172a] text-white flex flex-col items-center justify-center p-6 text-center">
        <Trophy size={64} className="text-[#fc7952] mb-4" />
        <h1 className="text-4xl font-black italic uppercase mb-2">Game Over</h1>
        <div className="bg-[#1e293b] p-8 rounded-[2.5rem] w-full max-w-sm border border-white/5 mb-6">
            <div className="flex justify-between items-center mb-4">
                <span className="text-xs font-bold opacity-50 uppercase tracking-widest">Successful Guesses</span>
                <span className="text-2xl font-black italic">{myScore}</span>
            </div>
            <p className="text-[10px] text-green-500 font-black uppercase border-t border-white/10 pt-4">Returning remaining stakes to wallet...</p>
        </div>
        <button onClick={finalizeAndRefund} className="w-full max-w-sm bg-[#613de6] py-5 rounded-2xl font-black uppercase italic shadow-lg">Claim & Exit</button>
      </div>
    );
  }

  if (!activeGame) {
    return (
      <div className="min-h-screen bg-[#0f172a] text-white p-6">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-xl font-black italic uppercase">PLAY WITH FRIENDS</h1>
        
        </div>

        {showStakeModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-6">
            <div className="bg-[#1e293b] w-full max-w-xs rounded-[2.5rem] p-8 border border-white/10 shadow-2xl">
              <h2 className="text-center font-black italic uppercase mb-6 text-sm">Set Round Stake</h2>
              <div className="flex items-center justify-between mb-8 bg-black/20 p-4 rounded-2xl">
                <button onClick={() => setStakeAmount(Math.max(1, stakeAmount - 1))} className="w-10 h-10 bg-[#613de6] rounded-xl font-bold">-</button>
                <div className="text-center"><span className="text-3xl font-black text-[#fc7952] italic">${stakeAmount}</span></div>
                <button onClick={() => setStakeAmount(stakeAmount + 1)} className="w-10 h-10 bg-[#613de6] rounded-xl font-bold">+</button>
              </div>
              <div className="space-y-2 mb-8 px-2">
                <div className="flex justify-between text-[10px] font-black uppercase"><span className="opacity-40">Entry Wager (15x)</span><span>${stakeAmount * 15}</span></div>
                <div className="flex justify-between text-[10px] font-black uppercase"><span className="opacity-40">Admin Fee</span><span>$1.00</span></div>
              </div>
              <button onClick={initiateChallenge} className="w-full bg-[#fc7952] py-4 rounded-2xl font-black uppercase text-xs mb-3 shadow-lg">Send Challenge</button>
              <button onClick={() => setShowStakeModal(null)} className="w-full text-gray-500 font-black uppercase text-[10px]">Cancel</button>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-1">Online Friends</h3>
          {onlinePlayers.length === 0 ? (
            <div className="text-center py-20 bg-[#1e293b]/50 rounded-[2.5rem] border border-dashed border-white/10">
              <Ghost size={40} className="mx-auto mb-4 opacity-20" /><p className="text-[10px] font-black uppercase text-gray-500 italic">No online users</p>
            </div>
          ) : onlinePlayers.map(p => (
            <div key={p.id} className="bg-[#1e293b] p-5 rounded-[2rem] flex justify-between items-center border border-white/5">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-[#613de6] rounded-xl flex items-center justify-center font-black italic text-[#fc7952]">{p.username?.[0] || 'P'}</div>
                <span className="font-bold italic uppercase text-sm">{p.username}</span>
              </div>
              <button onClick={() => setShowStakeModal(p)} className="bg-[#fc7952] px-6 py-2 rounded-xl text-[10px] font-black uppercase">Challenge</button>
            </div>
          ))}
        </div>

        {incomingChallenge && (
          <div className="fixed bottom-10 left-6 right-6 bg-[#613de6] p-6 rounded-[2.5rem] shadow-2xl z-50 border-t-4 border-[#fc7952]">
            <p className="text-white font-black italic mb-2 uppercase text-center text-sm">{incomingChallenge.fromName} Challenges You!</p>
            <p className="text-center text-[10px] font-black opacity-60 mb-4 uppercase tracking-widest">Wager: ${(incomingChallenge.totalWager + 1).toFixed(2)}</p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={acceptChallenge} className="bg-white text-[#613de6] py-3 rounded-2xl font-black uppercase text-xs">Accept</button>
              <button onClick={() => deleteDoc(doc(db, "challenges", incomingChallenge.id))} className="bg-black/20 py-3 rounded-2xl font-black uppercase text-xs">Decline</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const isMyTurn = activeGame?.turn === user.uid;
  const isGuessing = activeGame?.gameState === "guessing";

  return (
    <div className="min-h-screen bg-[#0f172a] text-white flex flex-col relative overflow-hidden pb-[80px]">
      {/* Top Header */}
      <div className="bg-[#613de6] p-4 flex justify-between items-center shadow-lg relative z-20">
        <span className="font-black italic text-[10px] uppercase">TURN {activeGame?.round}/30</span>
        <div className="flex items-center space-x-2">
            <ShieldCheck size={14} className="text-[#fc7952]"/>
            <span className="font-black italic text-lg">${activeGame?.stakePerRound?.toFixed(2)}</span>
        </div>
        <button onClick={() => router.push('/dashboard')} className="text-[10px] font-black opacity-40 uppercase">Quit</button>
      </div>

      {/* Players Bar */}
      <div className="flex justify-between items-center p-8 bg-[#1e293b] border-b border-white/5 relative z-10">
        <div className={`text-center transition-all ${isMyTurn ? 'scale-110' : 'opacity-30'}`}>
          <div className="w-16 h-16 rounded-[2rem] bg-[#613de6] mx-auto flex items-center justify-center shadow-lg border-2 border-white/5"><User size={32}/></div>
          <p className="mt-2 text-2xl font-black text-[#fc7952] italic">{user.uid === activeGame?.player1 ? activeGame?.scores?.p1 : activeGame?.scores?.p2}</p>
        </div>
        <Zap className={`${isMyTurn ? 'text-[#fc7952] animate-pulse' : 'text-gray-700'}`} size={28} />
        <div className={`text-center transition-all ${!isMyTurn ? 'scale-110' : 'opacity-30'}`}>
          <div className="w-16 h-16 rounded-[2rem] bg-gray-800 mx-auto flex items-center justify-center shadow-lg border-2 border-white/5"><User size={32}/></div>
          <p className="mt-2 text-2xl font-black italic">{user.uid === activeGame?.player1 ? activeGame?.scores?.p2 : activeGame?.scores?.p1}</p>
        </div>
      </div>

      {/* Game Area */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <h2 className="text-3xl font-black italic mb-2 uppercase tracking-tighter">
          {isMyTurn ? (isGuessing ? "YOUR GUESS" : "PICK A NUMBER") : "OPPONENT'S MOVE"}
        </h2>
        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-12">
            {isMyTurn ? (isGuessing ? "MATCH THE TARGET" : "PICK A TARGET FOR THEM") : "WAITING..."}
        </p>

        <div className="grid grid-cols-2 gap-8 w-full max-w-xs">
          {numbers.map((num, i) => (
            <button key={i} disabled={!isMyTurn} onClick={() => handleGameMove(num)}
              className={`aspect-square rounded-[3.5rem] text-4xl font-black italic border-4 transition-all active:scale-95 ${
                selectedNumber === num ? 'bg-[#613de6] border-[#fc7952] shadow-[0_0_40px_rgba(97,61,230,0.3)]' : 'bg-[#1e293b] border-gray-800 disabled:opacity-20'
              }`}
            >{num}</button>
          ))}
        </div>
      </div>

      {/* Chat Trigger Button - Positioned specifically above nav */}
      <button 
        onClick={() => { setShowChat(true); setHasNewMsg(false); }}
        className="fixed bottom-[100px] right-6 w-14 h-14 bg-[#fc7952] rounded-2xl flex items-center justify-center shadow-2xl z-40 transition-transform active:scale-90"
      >
        <MessageSquare size={24} className="text-white" />
        {hasNewMsg && <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 border-2 border-[#0f172a] rounded-full animate-bounce"></span>}
      </button>

      {/* Chat Sidebar Panel - High Z-Index & Bottom Padding for Nav */}
      <div className={`fixed inset-y-0 right-0 w-80 bg-[#1e293b] shadow-2xl z-[500] transform transition-transform duration-300 ease-in-out border-l border-white/5 flex flex-col ${showChat ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="p-4 bg-[#613de6] flex justify-between items-center shadow-md">
          <span className="font-black italic uppercase text-xs tracking-widest">Match Chat</span>
          <button onClick={() => setShowChat(false)} className="opacity-60 hover:opacity-100 transition-opacity">
            <CloseIcon size={20} />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center opacity-20 space-y-2">
              <MessageSquare size={40} />
              <p className="text-[10px] font-black uppercase">Say something...</p>
            </div>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={`flex flex-col ${m.senderId === user.uid ? 'items-end' : 'items-start'}`}>
                <span className="text-[8px] font-black uppercase opacity-40 mb-1">{m.senderName}</span>
                <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-xs font-bold leading-relaxed ${
                  m.senderId === user.uid ? 'bg-[#613de6] text-white rounded-tr-none shadow-lg shadow-[#613de6]/20' : 'bg-white/5 text-gray-300 rounded-tl-none border border-white/5'
                }`}>
                  {m.text}
                </div>
              </div>
            ))
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input area with padding-bottom to avoid nav bar overlap */}
        <div className="p-4 pb-[100px] border-t border-white/5 bg-[#161e2e]">
          <form onSubmit={sendMessage} className="flex space-x-2">
            <input 
              type="text" 
              value={newMessage} 
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type here..."
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#fc7952] text-white placeholder:opacity-30"
            />
            <button type="submit" className="w-12 h-12 bg-[#fc7952] rounded-xl flex items-center justify-center text-white shadow-lg active:scale-95 transition-transform">
              <Send size={18} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}