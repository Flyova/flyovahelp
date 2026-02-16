"use client";
import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { db, auth } from "@/lib/firebase";
import { 
  doc, onSnapshot, updateDoc, increment, collection, 
  query, where, setDoc, addDoc, deleteDoc, 
  serverTimestamp, or, and, orderBy, limit, runTransaction 
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { User, Zap, Wallet, ShieldCheck, Trophy, Ghost, MessageSquare, Send, X as CloseIcon, Search, Users, Timer as TimerIcon, Clock } from "lucide-react";

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
  const [activeMatches, setActiveMatches] = useState([]); 
  const [searchQuery, setSearchQuery] = useState("");
  const [incomingChallenge, setIncomingChallenge] = useState(null);
  
  // Game States
  const [gameTimer, setGameTimer] = useState(60);
  const [showChat, setShowChat] = useState(false);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [hasNewMsg, setHasNewMsg] = useState(false);
  const [showStakeModal, setShowStakeModal] = useState(null);
  const [stakeAmount, setStakeAmount] = useState(10);

  const chatEndRef = useRef(null);

  // 1. AUTH & WALLET
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) {
        setUser(u);
        const userRef = doc(db, "users", u.uid);
        onSnapshot(userRef, (snap) => {
          if (snap.exists()) setMyWallet(snap.data().wallet || 0);
        });
      } else {
        router.push("/login");
      }
      setLoadingAuth(false);
    });
    return () => unsub();
  }, [router]);

  // 2. PRESENCE, BUSY LOGIC & CHALLENGES
  useEffect(() => {
    if (!user) return;
    const myId = user.uid;
    const userRef = doc(db, "users", myId);

    const heartbeat = setInterval(() => {
      updateDoc(userRef, { 
        status: "online", 
        lastSeen: serverTimestamp() 
      }).catch(() => {});
    }, 30000);

    updateDoc(userRef, { status: "online", lastSeen: serverTimestamp() }).catch(() => {});

    const unsubActiveGames = onSnapshot(query(collection(db, "games"), where("status", "==", "active")), (snap) => {
      const busyIds = [];
      snap.forEach(doc => {
        const data = doc.data();
        busyIds.push(data.player1, data.player2);
      });
      setActiveMatches(busyIds);
    });

    const unsubPlayers = onSnapshot(
      query(collection(db, "users"), and(where("status", "==", "online"))), 
      (snap) => {
        const now = Date.now();
        const sixtySecondsAgo = now - (60 * 1000);

        setOnlinePlayers(
          snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(u => {
              const lastSeenMillis = u.lastSeen?.toMillis() || 0;
              return u.id !== myId && u.role !== "admin" && lastSeenMillis > sixtySecondsAgo;
            })
        );
      }
    );

    // CHALLENGE REQUEST FIX: Added 3-minute expiration check
    const unsubIncoming = onSnapshot(
      query(collection(db, "challenges"), where("to", "==", myId), where("status", "==", "pending")),
      (snap) => {
        if (!snap.empty) {
            const data = { id: snap.docs[0].id, ...snap.docs[0].data() };
            const now = Date.now();
            // If the challenge is older than 3 minutes (180,000ms), ignore it
            if (data.expiresAt && now > data.expiresAt) {
                deleteDoc(doc(db, "challenges", data.id));
                setIncomingChallenge(null);
            } else {
                setIncomingChallenge(data);
            }
        } else {
            setIncomingChallenge(null);
        }
      }
    );

    return () => { 
      clearInterval(heartbeat);
      unsubActiveGames();
      unsubPlayers(); 
      unsubIncoming();
      updateDoc(userRef, { status: "offline" }).catch(() => {});
    };
  }, [user]);

  // 3. GAME ENGINE LISTENER (WITH AUTO-WIN LOGIC)
  useEffect(() => {
    if (!user) return;
    const unsubGame = onSnapshot(query(
      collection(db, "games"),
      and(
        or(where("player1", "==", user.uid), where("player2", "==", user.uid)),
        where("status", "==", "active")
      ),
      limit(1)
    ), async (snap) => {
      if (!snap.empty) {
        const data = { id: snap.docs[0].id, ...snap.docs[0].data() };
        setActiveGame(data);
        setNumbers(data.numbers || []);
        
        const now = Date.now();
        const diff = Math.floor((data.endTime - now) / 1000);
        setGameTimer(diff > 0 ? diff : 0);

        // AUTO-WIN LOGIC: If timer is up and one player failed to play
        if (diff <= 0) {
            const p1Played = !!data.p1Choice;
            const p2Played = !!data.p2Choice;

            // If only one person played, they win automatically
            if (p1Played !== p2Played) {
                const winnerId = p1Played ? data.player1 : data.player2;
                const totalPrize = data.stake * 2;
                
                try {
                    await runTransaction(db, async (transaction) => {
                        const winnerRef = doc(db, "users", winnerId);
                        transaction.update(winnerRef, { wallet: increment(totalPrize) });
                        transaction.update(doc(db, "games", data.id), { 
                            status: "completed", 
                            winner: winnerId,
                            autoWin: true 
                        });
                    });
                    alert(winnerId === user.uid ? "Opponent timed out! You win!" : "You timed out! Opponent wins.");
                } catch (err) {
                    console.error("Auto-win transaction failed", err);
                }
            }
        }
      } else {
        setActiveGame(null);
        setSelectedNumber(null);
      }
    });

    return () => unsubGame();
  }, [user]);

  // 4. CHAT SYSTEM
  useEffect(() => {
    if (!activeGame) return;
    const unsubChat = onSnapshot(
      query(collection(db, `games/${activeGame.id}/messages`), orderBy("createdAt", "asc")),
      (snap) => {
        const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setMessages(msgs);
        if (showChat) {
          setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
        } else if (msgs.length > 0) {
          setHasNewMsg(true);
        }
      }
    );
    return () => unsubChat();
  }, [activeGame, showChat]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeGame) return;
    await addDoc(collection(db, `games/${activeGame.id}/messages`), {
      text: newMessage,
      senderId: user.uid,
      senderName: user.displayName || "Player",
      createdAt: serverTimestamp()
    });
    setNewMessage("");
  };

  const initiateChallenge = async () => {
    if (myWallet < stakeAmount) return alert("Insufficient Balance");
    try {
      await addDoc(collection(db, "challenges"), {
        from: user.uid,
        fromName: user.displayName || "User",
        to: showStakeModal.id,
        stake: Number(stakeAmount),
        status: "pending",
        createdAt: serverTimestamp(),
        expiresAt: Date.now() + (3 * 60 * 1000) // CHALLENGE EXPIRES IN 3 MINUTES
      });
      setShowStakeModal(null);
      alert("Challenge Sent! Valid for 3 minutes.");
    } catch (err) {
      console.error(err);
    }
  };

  const acceptChallenge = async () => {
    if (!incomingChallenge) return;
    if (myWallet < incomingChallenge.stake) return alert("Insufficient Balance to match stake");

    try {
      const gameId = incomingChallenge.id;
      const totalPossible = Array.from({ length: 20 }, (_, i) => i + 1).sort(() => Math.random() - 0.5).slice(0, 10);
      const winner = totalPossible[Math.floor(Math.random() * totalPossible.length)];

      await runTransaction(db, async (transaction) => {
        transaction.update(doc(db, "users", incomingChallenge.from), { wallet: increment(-incomingChallenge.stake) });
        transaction.update(doc(db, "users", user.uid), { wallet: increment(-incomingChallenge.stake) });

        const gameRef = doc(db, "games", gameId);
        transaction.set(gameRef, {
          player1: incomingChallenge.from,
          player2: user.uid,
          stake: incomingChallenge.stake,
          numbers: totalPossible,
          winningNumber: winner,
          status: "active",
          round: 1,
          startTime: Date.now(),
          endTime: Date.now() + 60000,
          p1Choice: null,
          p2Choice: null
        });

        transaction.delete(doc(db, "challenges", incomingChallenge.id));
      });
    } catch (err) {
      console.error(err);
    }
  };

  const selectNumber = async (num) => {
    if (!activeGame || selectedNumber) return;
    setSelectedNumber(num);
    const field = activeGame.player1 === user.uid ? "p1Choice" : "p2Choice";
    await updateDoc(doc(db, "games", activeGame.id), { [field]: num });
  };

  if (loadingAuth) return <div className="min-h-screen bg-[#0f172a] flex items-center justify-center text-white italic font-black animate-pulse">CONNECTING TO ENGINE...</div>;

  const filteredPlayers = onlinePlayers.filter(p => p.username?.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="min-h-screen bg-[#0f172a] text-white flex flex-col font-sans selection:bg-[#613de6]">
      
      {/* Header */}
      <div className="p-6 pt-12 flex justify-between items-center max-w-4xl mx-auto w-full">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-[#613de6] rounded-2xl shadow-lg shadow-[#613de6]/20">
            <Zap size={24} className="text-white fill-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black italic tracking-tighter leading-none">PLAY WITH FRIENDS</h1>
            <p className="text-[10px] font-black uppercase tracking-widest text-[#fc7952]">Live Peer-to-Peer Battle</p>
          </div>
        </div>
        <div className="bg-[#1e293b] px-4 py-2 rounded-2xl border border-white/5 flex items-center space-x-3">
          <Wallet size={16} className="text-gray-400" />
          <span className="font-black italic text-sm text-emerald-500">${myWallet.toLocaleString()}</span>
        </div>
      </div>

      <div className="flex-1 max-w-4xl mx-auto w-full p-6 space-y-6">
        
        {activeGame ? (
          <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
            <div className="bg-[#1e293b] rounded-[2.5rem] p-8 border border-white/5 relative overflow-hidden shadow-2xl">
                <div className="flex justify-between items-center mb-8">
                   <div className="flex items-center gap-2">
                      <TimerIcon size={18} className="text-[#fc7952]" />
                      <span className="text-3xl font-black italic tabular-nums">{gameTimer}s</span>
                   </div>
                   <div className="px-6 py-2 bg-[#613de6] rounded-full text-[10px] font-black uppercase tracking-widest">
                      Pool: ${(activeGame.stake * 2).toLocaleString()}
                   </div>
                </div>

                <div className="grid grid-cols-5 gap-3">
                  {numbers.map((num) => (
                    <button
                      key={num}
                      onClick={() => selectNumber(num)}
                      disabled={selectedNumber !== null}
                      className={`h-16 rounded-2xl font-black italic transition-all flex items-center justify-center text-xl
                        ${selectedNumber === num ? 'bg-[#fc7952] scale-90 shadow-none' : 'bg-white/5 hover:bg-white/10 border border-white/5 shadow-xl'}
                        ${selectedNumber && selectedNumber !== num ? 'opacity-20 cursor-not-allowed' : ''}
                      `}
                    >
                      {num}
                    </button>
                  ))}
                </div>
            </div>
            
            <button 
              onClick={() => { setShowChat(true); setHasNewMsg(false); }}
              className="w-full py-5 rounded-2xl bg-[#613de6] font-black uppercase italic tracking-widest flex items-center justify-center gap-3 relative"
            >
              <MessageSquare size={20} /> Open Match Chat
              {hasNewMsg && <div className="absolute top-0 right-0 w-4 h-4 bg-red-500 rounded-full border-2 border-[#0f172a] animate-bounce" />}
            </button>
          </div>
        ) : (
          <div className="space-y-6">
             <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={18} />
                <input 
                  type="text" 
                  placeholder="SEARCH ONLINE USERS..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[#1e293b] border border-white/5 rounded-2xl py-4 pl-12 pr-6 text-sm font-bold placeholder:text-white/10 outline-none focus:border-[#613de6]/50 transition-all"
                />
             </div>

             <div className="space-y-3">
                <div className="flex items-center space-x-2 px-2">
                   <Users size={14} className="text-emerald-500" />
                   <span className="text-[10px] font-black uppercase tracking-widest opacity-40">Players Available Now</span>
                </div>
                
                {filteredPlayers.length === 0 ? (
                  <div className="bg-white/5 border border-dashed border-white/10 rounded-[2rem] p-12 text-center">
                    <Ghost size={40} className="mx-auto mb-4 opacity-10" />
                    <p className="text-xs font-black uppercase tracking-widest opacity-20 italic">No one else is online right now</p>
                  </div>
                ) : (
                  filteredPlayers.map(p => {
                    const isBusy = activeMatches.includes(p.id);
                    return (
                      <div key={p.id} className={`bg-[#1e293b] p-5 rounded-[2.5rem] flex justify-between items-center border border-white/5 transition-all hover:border-white/10 ${isBusy ? 'opacity-50' : ''}`}>
                        <div className="flex items-center space-x-4">
                          <div className="relative">
                            <div className="w-12 h-12 bg-[#613de6] rounded-2xl flex items-center justify-center font-black italic text-xl border-2 border-white/10">
                              {p.username?.[0]?.toUpperCase() || 'P'}
                            </div>
                            <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-4 border-[#1e293b] ${isBusy ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                          </div>
                          <div>
                             <h4 className="font-black italic uppercase text-sm leading-none mb-1">{p.username}</h4>
                             <p className={`text-[8px] font-black uppercase tracking-widest ${isBusy ? 'text-amber-500' : 'text-emerald-500'}`}>
                                {isBusy ? 'Busy' : 'Available'}
                             </p>
                          </div>
                        </div>
                        <button 
                          disabled={isBusy}
                          onClick={() => !isBusy && setShowStakeModal(p)} 
                          className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${isBusy ? 'bg-white/5 text-white/20 cursor-not-allowed' : 'bg-[#fc7952] hover:bg-[#ff8a65] active:scale-90 shadow-lg shadow-[#fc7952]/20'}`}
                        >
                          {isBusy ? 'BUSY' : 'CHALLENGE'}
                        </button>
                      </div>
                    )
                  })
                )}
             </div>
          </div>
        )}

        {incomingChallenge && (
          <div className="fixed bottom-10 left-6 right-6 z-[150] animate-in slide-in-from-bottom-10 duration-500">
             <div className="bg-[#fc7952] rounded-3xl p-6 shadow-2xl flex items-center justify-between">
                <div className="flex items-center space-x-4">
                   <Clock className="text-black/40 animate-pulse" size={24} />
                   <div>
                      <p className="text-[10px] font-black uppercase tracking-tighter text-black/60 mb-1">Incoming Challenge!</p>
                      <h3 className="text-lg font-black italic uppercase text-white leading-tight">
                         {incomingChallenge.fromName} <span className="text-black/40">staked</span> ${incomingChallenge.stake}
                      </h3>
                   </div>
                </div>
                <div className="flex gap-2">
                   <button onClick={acceptChallenge} className="bg-white text-black px-6 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest active:scale-90 transition-all">Accept</button>
                   <button onClick={() => deleteDoc(doc(db, "challenges", incomingChallenge.id))} className="bg-black/20 text-white px-4 py-3 rounded-xl font-black uppercase text-[10px] active:scale-90">Decline</button>
                </div>
             </div>
          </div>
        )}

      </div>

      {showStakeModal && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-6 bg-[#0f172a]/90 backdrop-blur-md">
           <div className="bg-[#1e293b] w-full max-w-sm rounded-[3rem] border border-white/10 p-8 shadow-2xl space-y-6">
              <div className="text-center">
                 <h2 className="text-2xl font-black italic uppercase tracking-tighter mb-2">Challenge Stake</h2>
                 <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">To battle: {showStakeModal.username}</p>
              </div>
              
              <div className="grid grid-cols-3 gap-3">
                 {[10, 50, 100, 500, 1000].map(amt => (
                    <button 
                      key={amt} 
                      onClick={() => setStakeAmount(amt)}
                      className={`py-4 rounded-2xl font-black text-sm transition-all ${stakeAmount === amt ? 'bg-[#613de6] text-white' : 'bg-white/5 text-gray-400 border border-white/5'}`}
                    >
                      ${amt}
                    </button>
                 ))}
                 <div className="relative col-span-3">
                    <input 
                      type="number" 
                      placeholder="Custom Amount"
                      onChange={(e) => setStakeAmount(Number(e.target.value))}
                      className="w-full bg-black/20 border border-white/10 rounded-2xl px-6 py-4 text-center font-black text-lg focus:border-[#613de6] outline-none"
                    />
                 </div>
              </div>

              <div className="flex gap-3">
                <button onClick={initiateChallenge} className="flex-1 bg-[#fc7952] py-5 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-[#fc7952]/20">Send Challenge</button>
                <button onClick={() => setShowStakeModal(null)} className="px-8 bg-white/5 py-5 rounded-2xl font-black uppercase text-xs tracking-widest">Cancel</button>
              </div>
           </div>
        </div>
      )}

      {showChat && (
        <div className="fixed inset-0 z-[400] bg-[#0f172a] flex flex-col animate-in slide-in-from-right duration-300">
           <div className="p-6 pt-12 flex items-center justify-between border-b border-white/5">
              <div className="flex items-center gap-3">
                 <MessageSquare className="text-[#fc7952]" size={20} />
                 <h2 className="font-black italic uppercase tracking-tighter text-xl">Match Chat</h2>
              </div>
              <button onClick={() => setShowChat(false)} className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center">
                 <CloseIcon size={20} />
              </button>
           </div>
           
           <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages.map((m) => (
                <div key={m.id} className={`flex flex-col ${m.senderId === user.uid ? 'items-end' : 'items-start'}`}>
                  <span className="text-[8px] font-black uppercase opacity-30 mb-1 px-1">{m.senderName}</span>
                  <div className={`max-w-[85%] px-5 py-3 rounded-2xl font-bold text-sm ${m.senderId === user.uid ? 'bg-[#613de6] text-white rounded-tr-none' : 'bg-white/5 text-gray-300 rounded-tl-none'}`}>
                    {m.text}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
           </div>

           <div className="p-6 pb-12 bg-[#1e293b]/50 border-t border-white/5">
              <form onSubmit={sendMessage} className="flex gap-3">
                 <input 
                   type="text" 
                   value={newMessage} 
                   onChange={(e) => setNewMessage(e.target.value)} 
                   placeholder="TYPE A MESSAGE..." 
                   className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm font-bold outline-none focus:border-[#613de6]"
                 />
                 <button type="submit" className="w-14 h-14 bg-[#613de6] rounded-2xl flex items-center justify-center text-white shadow-lg shadow-[#613de6]/20">
                    <Send size={20} />
                 </button>
              </form>
           </div>
        </div>
      )}
    </div>
  );
}