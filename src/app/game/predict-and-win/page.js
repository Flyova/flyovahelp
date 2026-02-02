"use client";
import { useState, useEffect } from "react";
import { db, auth } from "@/lib/firebase";
import { 
  doc, onSnapshot, updateDoc, increment, collection, 
  query, addDoc, serverTimestamp, orderBy, 
  limit, getDoc, setDoc, Timestamp, runTransaction, where, getDocs 
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { Timer, CheckCircle2, Lock, Clock, Trophy, Wallet, XCircle, ArrowLeft, AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";

export default function PredictAndWin() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Game States
  const [currentGame, setCurrentGame] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [hasSubscribed, setHasSubscribed] = useState(false);
  const [subTimeLeft, setSubTimeLeft] = useState("");
  const [selectedChoice, setSelectedChoice] = useState(""); 
  const [hasBet, setHasBet] = useState(false);
  const [gameStatus, setGameStatus] = useState("betting");
  const [lastResult, setLastResult] = useState(null);
  
  // Alert States
  const [showResultAlert, setShowResultAlert] = useState(false);
  const [resultType, setResultType] = useState(null); // 'win' or 'lose'

  // Subscription Confirmation States
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingPlan, setPendingPlan] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const WIN_REWARD = 0.20;
  const ROUND_DURATION = 60; 

  const PLANS = [
    { id: "3h", name: "3 Hours", price: 10, duration: 3 * 60 * 60 * 1000 },
    { id: "5h", name: "5 Hours", price: 15, duration: 5 * 60 * 60 * 1000 },
    { id: "12h", name: "12 Hours", price: 20, duration: 12 * 60 * 60 * 1000 },
    { id: "1d", name: "1 Day", price: 35, duration: 24 * 60 * 60 * 1000 },
    { id: "1w", name: "1 Week", price: 220, duration: 7 * 24 * 60 * 60 * 1000 },
  ];

  // 1. Auth & Data Sync
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) return router.push("/login");
      setUser(u);
      const unsubUser = onSnapshot(doc(db, "users", u.uid), (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setUserData(data);
          const expiry = data.subscription_expires;
          setHasSubscribed(expiry ? expiry.toMillis() > Date.now() : false);
        }
        setLoading(false);
      });
      return () => unsubUser();
    });
    return () => unsub();
  }, [router]);

  // 2. Subscription Expiry Countdown
  useEffect(() => {
    if (!userData?.subscription_expires) return;
    const interval = setInterval(() => {
        const diff = userData.subscription_expires.toMillis() - Date.now();
        if (diff <= 0) {
            setSubTimeLeft("Expired");
            setHasSubscribed(false);
            clearInterval(interval);
        } else {
            const h = Math.floor(diff / (1000 * 60 * 60));
            const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const s = Math.floor((diff % (1000 * 60)) / 1000);
            setSubTimeLeft(`${h}h ${m}m ${s}s`);
        }
    }, 1000);
    return () => clearInterval(interval);
  }, [userData]);

  // 3. Global Round Listener
  useEffect(() => {
    if (!hasSubscribed || !user) return;
    const q = query(collection(db, "predict_games"), orderBy("createdAt", "desc"), limit(1));
    return onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const gameData = { id: snap.docs[0].id, ...snap.docs[0].data() };
        setCurrentGame(gameData);
        checkUserTransactionBet(gameData.id);
        
        if (gameStatus === "results" && Date.now() < gameData.endTime) {
            setGameStatus("betting");
            setLastResult(null);
            setShowResultAlert(false);
        }
      } else { createNewRound(); }
    });
  }, [hasSubscribed, user, gameStatus]);

  // 4. Timer Sync
  useEffect(() => {
    if (!currentGame) return;
    const interval = setInterval(() => {
      const diff = Math.max(0, Math.floor((currentGame.endTime - Date.now()) / 1000));
      setTimeLeft(diff);
      if (diff === 0 && gameStatus === "betting") processResults();
    }, 1000);
    return () => clearInterval(interval);
  }, [currentGame, gameStatus]);

  const checkUserTransactionBet = async (gameId) => {
    if (!user) return;
    const q = query(
        collection(db, "users", user.uid, "transactions"), 
        where("gameId", "==", gameId),
        limit(1)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
        setHasBet(true);
        setSelectedChoice(snap.docs[0].data().prediction);
    } else {
        setHasBet(false);
        setSelectedChoice("");
    }
  };

  const createNewRound = async () => {
    const conditions = ["Odd", "Even", "Both"];
    await addDoc(collection(db, "predict_games"), {
      condition: conditions[Math.floor(Math.random() * 3)],
      n1: Math.floor(Math.random() * 50) + 1,
      n2: Math.floor(Math.random() * 50) + 1,
      endTime: Date.now() + (ROUND_DURATION * 1000),
      createdAt: serverTimestamp(),
      status: "active"
    });
  };

  const handlePlanClick = (plan) => {
    setPendingPlan(plan);
    setShowConfirmModal(true);
  };

  const buySubscription = async () => {
    if (!pendingPlan || !user) return;
    if (userData.wallet < pendingPlan.price) {
        alert("Insufficient Balance");
        setShowConfirmModal(false);
        return;
    }

    setSubmitting(true);
    try {
        await runTransaction(db, async (transaction) => {
            const userRef = doc(db, "users", user.uid);
            transaction.update(userRef, { 
              wallet: increment(-pendingPlan.price),
              subscription_expires: Timestamp.fromDate(new Date(Date.now() + pendingPlan.duration))
            });
        });
        await addDoc(collection(db, "users", user.uid, "transactions"), {
            title: `Predict Stake: ${pendingPlan.name}`, 
            amount: pendingPlan.price, 
            type: "stake", 
            status: "loss", 
            timestamp: serverTimestamp()
        });
        setShowConfirmModal(false);
    } catch (e) { 
        console.error(e);
        alert("Transaction failed. Please try again.");
    } finally {
        setSubmitting(false);
    }
  };

  const placePrediction = async () => {
    if (!selectedChoice || hasBet || !currentGame) return;
    await addDoc(collection(db, "users", user.uid, "transactions"), {
        title: "Predict and Win",
        gameId: currentGame.id,
        prediction: selectedChoice,
        amount: 0, 
        type: "prediction",
        status: "pending",
        timestamp: serverTimestamp()
    });
    setHasBet(true);
  };

  const processResults = async () => {
    setGameStatus("results");
    setLastResult({ n1: currentGame.n1, n2: currentGame.n2, condition: currentGame.condition });

    if (hasBet && user) {
        try {
            const q = query(
                collection(db, "users", user.uid, "transactions"), 
                where("gameId", "==", currentGame.id),
                where("status", "==", "pending")
            );
            const querySnapshot = await getDocs(q);
            
            if (!querySnapshot.empty) {
                const transDoc = querySnapshot.docs[0];
                const userChoice = transDoc.data().prediction;

                if (userChoice === currentGame.condition) {
                    setResultType('win');
                    await updateDoc(doc(db, "users", user.uid), { wallet: increment(WIN_REWARD) });
                    await updateDoc(doc(db, "users", user.uid, "transactions", transDoc.id), {
                        title: "Predict Win", amount: WIN_REWARD, status: "win", type: "win", timestamp: serverTimestamp()
                    });
                } else {
                    setResultType('lose');
                    await updateDoc(doc(db, "users", user.uid, "transactions", transDoc.id), {
                        status: "loss", timestamp: serverTimestamp()
                    });
                }
                setShowResultAlert(true);
            }
        } catch (err) { console.error("Permission or Payout Error:", err); }
    }
    
    setTimeout(() => { setShowResultAlert(false); }, 7000);
    setTimeout(() => { if (user) createNewRound(); }, 10000);
  };

  if (loading) return <div className="min-h-screen bg-[#0f172a] flex items-center justify-center text-white italic font-black uppercase tracking-tighter">Syncing...</div>;

  if (!hasSubscribed) {
    return (
      <div className="min-h-screen bg-[#0f172a] text-white p-6 relative">
        <div className="text-center mt-10 mb-10">
            <Lock size={48} className="mx-auto text-[#613de6] mb-4" />
            <h1 className="text-3xl font-black italic uppercase">Predict & Win</h1>
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mt-2">Choose a plan to start betting</p>
        </div>
        <div className="grid grid-cols-1 gap-3 max-w-sm mx-auto">
            {PLANS.map(plan => (
                <button key={plan.id} onClick={() => handlePlanClick(plan)}
                    className="w-full bg-[#1e293b] border border-white/5 p-5 rounded-2xl flex justify-between items-center active:scale-95 transition-all group hover:border-[#613de6]/50">
                    <div className="flex items-center space-x-3">
                        <Clock size={18} className="text-[#613de6] group-hover:animate-pulse"/>
                        <p className="font-black italic uppercase text-sm tracking-tight">{plan.name}</p>
                    </div>
                    <span className="text-lg font-black italic text-[#fc7952]">${plan.price}</span>
                </button>
            ))}
        </div>

        {/* Confirmation Modal */}
        {showConfirmModal && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-[#0f172a]/90 backdrop-blur-sm animate-in fade-in duration-300">
                <div className="bg-[#1e293b] w-full max-w-xs rounded-[2.5rem] border border-white/10 p-8 shadow-2xl space-y-6 text-center">
                    <div className="w-16 h-16 bg-[#613de6]/20 text-[#613de6] rounded-3xl flex items-center justify-center mx-auto">
                        <AlertCircle size={32} />
                    </div>
                    <div>
                        <h2 className="text-xl font-black uppercase italic tracking-tighter mb-2">Confirm Stake</h2>
                        <p className="text-[11px] text-gray-400 font-bold leading-relaxed uppercase">
                            You are about to stake <span className="text-[#fc7952]">${pendingPlan?.price}</span> for the <span className="text-white">{pendingPlan?.name}</span> access plan.
                        </p>
                    </div>
                    <div className="space-y-3">
                        <button 
                            onClick={buySubscription} 
                            disabled={submitting}
                            className="w-full bg-[#613de6] py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-all"
                        >
                            {submitting ? "Processing..." : "CONFIRM & PAY"}
                        </button>
                        <button 
                            onClick={() => setShowConfirmModal(false)} 
                            className="w-full py-4 rounded-2xl bg-white/5 font-black uppercase text-[10px] tracking-widest text-gray-500"
                        >
                            CANCEL
                        </button>
                    </div>
                </div>
            </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f172a] text-white flex flex-col relative overflow-hidden pb-24">
      {/* Result Alert */}
      {showResultAlert && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-in fade-in zoom-in duration-300">
          <div className={`w-full max-w-xs p-8 rounded-[2.5rem] border-2 text-center shadow-[0_0_50px_rgba(0,0,0,0.5)] ${resultType === 'win' ? 'bg-[#1e293b] border-green-500' : 'bg-[#1e293b] border-red-500'}`}>
            {resultType === 'win' ? (
              <>
                <Trophy size={60} className="mx-auto text-green-500 mb-4 animate-bounce" />
                <h2 className="text-3xl font-black italic uppercase text-white mb-2">You WON!</h2>
                <p className="text-[#fc7952] text-2xl font-black italic tracking-tighter">${WIN_REWARD.toFixed(2)}</p>
              </>
            ) : (
              <>
                <XCircle size={60} className="mx-auto text-red-500 mb-4 animate-pulse" />
                <h2 className="text-xl font-black italic uppercase text-white mb-2 leading-tight">You lose,<br/>Better luck next time!</h2>
              </>
            )}
          </div>
        </div>
      )}

      {/* Progress Bar & Timer */}
      <div className="relative p-8 text-center bg-[#1e293b] border-b border-white/5">
        <h1 className="text-xl font-black italic uppercase text-[#fc7952] mb-1">Predict and Win</h1>
        <div className="absolute top-0 left-0 w-full h-1 bg-white/5 overflow-hidden">
            <div className="h-full bg-[#fc7952] transition-all duration-1000 ease-linear" style={{ width: `${(timeLeft / ROUND_DURATION) * 100}%` }} />
        </div>
        <div className="inline-flex items-center space-x-3 bg-black/20 px-8 py-4 rounded-[2rem] border border-white/5 mt-4">
            <Timer size={24} className="text-[#613de6]" />
            <span className="text-4xl font-black italic font-mono">0:{timeLeft.toString().padStart(2, '0')}</span>
        </div>
      </div>

      {/* Gameplay */}
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        {gameStatus === "results" ? (
            <div className="text-center animate-in zoom-in">
                <div className="flex space-x-4 mb-6">
                    <div className="w-20 h-20 bg-[#613de6] rounded-3xl flex items-center justify-center text-4xl font-black border-4 border-white shadow-xl">{lastResult?.n1}</div>
                    <div className="w-20 h-20 bg-[#613de6] rounded-3xl flex items-center justify-center text-4xl font-black border-4 border-white shadow-xl">{lastResult?.n2}</div>
                </div>
                <h2 className="text-2xl font-black italic text-[#fc7952] uppercase tracking-tighter">RESULT: {lastResult?.condition}</h2>
            </div>
        ) : (
            <>
                <p className="text-[#fc7952] font-black italic uppercase text-m mb-8 tracking-tighter">Choose Next Outcome</p>
                <div className="grid grid-cols-3 gap-3 w-full max-w-sm mb-10">
                    {["Odd", "Even", "Both"].map(choice => (
                        <button key={choice} disabled={hasBet} onClick={() => setSelectedChoice(choice)}
                            className={`py-8 rounded-3xl font-black italic uppercase transition-all border-2
                                ${selectedChoice === choice ? 'bg-[#613de6] border-[#fc7952] scale-105' : 'bg-[#1e293b] border-white/5 opacity-40'}
                                ${hasBet && selectedChoice !== choice ? 'opacity-10 scale-95' : ''}`}>
                            {choice}
                        </button>
                    ))}
                </div>
                {!hasBet ? (
                    <button onClick={placePrediction} disabled={!selectedChoice}
                        className="w-full max-w-xs bg-[#fc7952] py-4 rounded-2xl font-black italic uppercase shadow-xl disabled:opacity-20">
                        Place bet
                    </button>
                ) : (
                    <div className="text-center bg-black/20 px-8 py-4 rounded-2xl border border-white/5 flex items-center space-x-3">
                        <CheckCircle2 size={20} className="text-green-500" />
                        <span className="font-black italic uppercase text-xs">Please wait for draws.</span>
                    </div>
                )}
            </>
        )}
      </div>

      {/* Footer */}
      <div className="fixed bottom-0 left-0 w-full bg-black/40 backdrop-blur-md p-5 border-t border-white/10 flex items-center justify-between px-8">
        <span className="text-[10px] font-black italic text-white/50 uppercase">Session Active</span>
        <div className="text-right">
            <p className="text-[9px] font-black italic text-white/30 uppercase mb-1">Ends In</p>
            <p className="text-lg font-black italic text-[#fc7952] font-mono tracking-tighter leading-none">{subTimeLeft}</p>
        </div>
      </div>
    </div>
  );
}"use client";
import { useState, useEffect } from "react";
import { db, auth } from "@/lib/firebase";
import { 
  doc, onSnapshot, updateDoc, increment, collection, 
  query, addDoc, serverTimestamp, orderBy, 
  limit, getDoc, setDoc, Timestamp, runTransaction, where, getDocs 
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { Timer, CheckCircle2, Lock, Clock, Trophy, Wallet, XCircle, ArrowLeft, AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";

export default function PredictAndWin() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Game States
  const [currentGame, setCurrentGame] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [hasSubscribed, setHasSubscribed] = useState(false);
  const [subTimeLeft, setSubTimeLeft] = useState("");
  const [selectedChoice, setSelectedChoice] = useState(""); 
  const [hasBet, setHasBet] = useState(false);
  const [gameStatus, setGameStatus] = useState("betting");
  const [lastResult, setLastResult] = useState(null);
  
  // Alert States
  const [showResultAlert, setShowResultAlert] = useState(false);
  const [resultType, setResultType] = useState(null); // 'win' or 'lose'

  // Subscription Confirmation States
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingPlan, setPendingPlan] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const WIN_REWARD = 0.20;
  const ROUND_DURATION = 60; 

  const PLANS = [
    { id: "3h", name: "3 Hours", price: 10, duration: 3 * 60 * 60 * 1000 },
    { id: "5h", name: "5 Hours", price: 15, duration: 5 * 60 * 60 * 1000 },
    { id: "12h", name: "12 Hours", price: 20, duration: 12 * 60 * 60 * 1000 },
    { id: "1d", name: "1 Day", price: 35, duration: 24 * 60 * 60 * 1000 },
    { id: "1w", name: "1 Week", price: 220, duration: 7 * 24 * 60 * 60 * 1000 },
  ];

  // 1. Auth & Data Sync
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) return router.push("/login");
      setUser(u);
      const unsubUser = onSnapshot(doc(db, "users", u.uid), (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setUserData(data);
          const expiry = data.subscription_expires;
          setHasSubscribed(expiry ? expiry.toMillis() > Date.now() : false);
        }
        setLoading(false);
      });
      return () => unsubUser();
    });
    return () => unsub();
  }, [router]);

  // 2. Subscription Expiry Countdown
  useEffect(() => {
    if (!userData?.subscription_expires) return;
    const interval = setInterval(() => {
        const diff = userData.subscription_expires.toMillis() - Date.now();
        if (diff <= 0) {
            setSubTimeLeft("Expired");
            setHasSubscribed(false);
            clearInterval(interval);
        } else {
            const h = Math.floor(diff / (1000 * 60 * 60));
            const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const s = Math.floor((diff % (1000 * 60)) / 1000);
            setSubTimeLeft(`${h}h ${m}m ${s}s`);
        }
    }, 1000);
    return () => clearInterval(interval);
  }, [userData]);

  // 3. Global Round Listener
  useEffect(() => {
    if (!hasSubscribed || !user) return;
    const q = query(collection(db, "predict_games"), orderBy("createdAt", "desc"), limit(1));
    return onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const gameData = { id: snap.docs[0].id, ...snap.docs[0].data() };
        setCurrentGame(gameData);
        checkUserTransactionBet(gameData.id);
        
        if (gameStatus === "results" && Date.now() < gameData.endTime) {
            setGameStatus("betting");
            setLastResult(null);
            setShowResultAlert(false);
        }
      } else { createNewRound(); }
    });
  }, [hasSubscribed, user, gameStatus]);

  // 4. Timer Sync
  useEffect(() => {
    if (!currentGame) return;
    const interval = setInterval(() => {
      const diff = Math.max(0, Math.floor((currentGame.endTime - Date.now()) / 1000));
      setTimeLeft(diff);
      if (diff === 0 && gameStatus === "betting") processResults();
    }, 1000);
    return () => clearInterval(interval);
  }, [currentGame, gameStatus]);

  const checkUserTransactionBet = async (gameId) => {
    if (!user) return;
    const q = query(
        collection(db, "users", user.uid, "transactions"), 
        where("gameId", "==", gameId),
        limit(1)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
        setHasBet(true);
        setSelectedChoice(snap.docs[0].data().prediction);
    } else {
        setHasBet(false);
        setSelectedChoice("");
    }
  };

  const createNewRound = async () => {
    const conditions = ["Odd", "Even", "Both"];
    await addDoc(collection(db, "predict_games"), {
      condition: conditions[Math.floor(Math.random() * 3)],
      n1: Math.floor(Math.random() * 50) + 1,
      n2: Math.floor(Math.random() * 50) + 1,
      endTime: Date.now() + (ROUND_DURATION * 1000),
      createdAt: serverTimestamp(),
      status: "active"
    });
  };

  const handlePlanClick = (plan) => {
    setPendingPlan(plan);
    setShowConfirmModal(true);
  };

  const buySubscription = async () => {
    if (!pendingPlan || !user) return;
    if (userData.wallet < pendingPlan.price) {
        alert("Insufficient Balance");
        setShowConfirmModal(false);
        return;
    }

    setSubmitting(true);
    try {
        await runTransaction(db, async (transaction) => {
            const userRef = doc(db, "users", user.uid);
            transaction.update(userRef, { 
              wallet: increment(-pendingPlan.price),
              subscription_expires: Timestamp.fromDate(new Date(Date.now() + pendingPlan.duration))
            });
        });
        await addDoc(collection(db, "users", user.uid, "transactions"), {
            title: `Predict Stake: ${pendingPlan.name}`, 
            amount: pendingPlan.price, 
            type: "stake", 
            status: "loss", 
            timestamp: serverTimestamp()
        });
        setShowConfirmModal(false);
    } catch (e) { 
        console.error(e);
        alert("Transaction failed. Please try again.");
    } finally {
        setSubmitting(false);
    }
  };

  const placePrediction = async () => {
    if (!selectedChoice || hasBet || !currentGame) return;
    await addDoc(collection(db, "users", user.uid, "transactions"), {
        title: "Predict and Win",
        gameId: currentGame.id,
        prediction: selectedChoice,
        amount: 0, 
        type: "prediction",
        status: "pending",
        timestamp: serverTimestamp()
    });
    setHasBet(true);
  };

  const processResults = async () => {
    setGameStatus("results");
    setLastResult({ n1: currentGame.n1, n2: currentGame.n2, condition: currentGame.condition });

    if (hasBet && user) {
        try {
            const q = query(
                collection(db, "users", user.uid, "transactions"), 
                where("gameId", "==", currentGame.id),
                where("status", "==", "pending")
            );
            const querySnapshot = await getDocs(q);
            
            if (!querySnapshot.empty) {
                const transDoc = querySnapshot.docs[0];
                const userChoice = transDoc.data().prediction;

                if (userChoice === currentGame.condition) {
                    setResultType('win');
                    await updateDoc(doc(db, "users", user.uid), { wallet: increment(WIN_REWARD) });
                    await updateDoc(doc(db, "users", user.uid, "transactions", transDoc.id), {
                        title: "Predict Win", amount: WIN_REWARD, status: "win", type: "win", timestamp: serverTimestamp()
                    });
                } else {
                    setResultType('lose');
                    await updateDoc(doc(db, "users", user.uid, "transactions", transDoc.id), {
                        status: "loss", timestamp: serverTimestamp()
                    });
                }
                setShowResultAlert(true);
            }
        } catch (err) { console.error("Permission or Payout Error:", err); }
    }
    
    setTimeout(() => { setShowResultAlert(false); }, 7000);
    setTimeout(() => { if (user) createNewRound(); }, 10000);
  };

  if (loading) return <div className="min-h-screen bg-[#0f172a] flex items-center justify-center text-white italic font-black uppercase tracking-tighter">Syncing...</div>;

  if (!hasSubscribed) {
    return (
      <div className="min-h-screen bg-[#0f172a] text-white p-6 relative">
        <div className="text-center mt-10 mb-10">
            <Lock size={48} className="mx-auto text-[#613de6] mb-4" />
            <h1 className="text-3xl font-black italic uppercase">Predict & Win</h1>
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mt-2">Choose a plan to start betting</p>
        </div>
        <div className="grid grid-cols-1 gap-3 max-w-sm mx-auto">
            {PLANS.map(plan => (
                <button key={plan.id} onClick={() => handlePlanClick(plan)}
                    className="w-full bg-[#1e293b] border border-white/5 p-5 rounded-2xl flex justify-between items-center active:scale-95 transition-all group hover:border-[#613de6]/50">
                    <div className="flex items-center space-x-3">
                        <Clock size={18} className="text-[#613de6] group-hover:animate-pulse"/>
                        <p className="font-black italic uppercase text-sm tracking-tight">{plan.name}</p>
                    </div>
                    <span className="text-lg font-black italic text-[#fc7952]">${plan.price}</span>
                </button>
            ))}
        </div>

        {/* Confirmation Modal */}
        {showConfirmModal && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-[#0f172a]/90 backdrop-blur-sm animate-in fade-in duration-300">
                <div className="bg-[#1e293b] w-full max-w-xs rounded-[2.5rem] border border-white/10 p-8 shadow-2xl space-y-6 text-center">
                    <div className="w-16 h-16 bg-[#613de6]/20 text-[#613de6] rounded-3xl flex items-center justify-center mx-auto">
                        <AlertCircle size={32} />
                    </div>
                    <div>
                        <h2 className="text-xl font-black uppercase italic tracking-tighter mb-2">Confirm Stake</h2>
                        <p className="text-[11px] text-gray-400 font-bold leading-relaxed uppercase">
                            You are about to stake <span className="text-[#fc7952]">${pendingPlan?.price}</span> for the <span className="text-white">{pendingPlan?.name}</span> access plan.
                        </p>
                    </div>
                    <div className="space-y-3">
                        <button 
                            onClick={buySubscription} 
                            disabled={submitting}
                            className="w-full bg-[#613de6] py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-all"
                        >
                            {submitting ? "Processing..." : "CONFIRM & PAY"}
                        </button>
                        <button 
                            onClick={() => setShowConfirmModal(false)} 
                            className="w-full py-4 rounded-2xl bg-white/5 font-black uppercase text-[10px] tracking-widest text-gray-500"
                        >
                            CANCEL
                        </button>
                    </div>
                </div>
            </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f172a] text-white flex flex-col relative overflow-hidden pb-24">
      {/* Result Alert */}
      {showResultAlert && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-in fade-in zoom-in duration-300">
          <div className={`w-full max-w-xs p-8 rounded-[2.5rem] border-2 text-center shadow-[0_0_50px_rgba(0,0,0,0.5)] ${resultType === 'win' ? 'bg-[#1e293b] border-green-500' : 'bg-[#1e293b] border-red-500'}`}>
            {resultType === 'win' ? (
              <>
                <Trophy size={60} className="mx-auto text-green-500 mb-4 animate-bounce" />
                <h2 className="text-3xl font-black italic uppercase text-white mb-2">You WON!</h2>
                <p className="text-[#fc7952] text-2xl font-black italic tracking-tighter">${WIN_REWARD.toFixed(2)}</p>
              </>
            ) : (
              <>
                <XCircle size={60} className="mx-auto text-red-500 mb-4 animate-pulse" />
                <h2 className="text-xl font-black italic uppercase text-white mb-2 leading-tight">You lose,<br/>Better luck next time!</h2>
              </>
            )}
          </div>
        </div>
      )}

      {/* Progress Bar & Timer */}
      <div className="relative p-8 text-center bg-[#1e293b] border-b border-white/5">
        <h1 className="text-xl font-black italic uppercase text-[#fc7952] mb-1">Predict and Win</h1>
        <div className="absolute top-0 left-0 w-full h-1 bg-white/5 overflow-hidden">
            <div className="h-full bg-[#fc7952] transition-all duration-1000 ease-linear" style={{ width: `${(timeLeft / ROUND_DURATION) * 100}%` }} />
        </div>
        <div className="inline-flex items-center space-x-3 bg-black/20 px-8 py-4 rounded-[2rem] border border-white/5 mt-4">
            <Timer size={24} className="text-[#613de6]" />
            <span className="text-4xl font-black italic font-mono">0:{timeLeft.toString().padStart(2, '0')}</span>
        </div>
      </div>

      {/* Gameplay */}
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        {gameStatus === "results" ? (
            <div className="text-center animate-in zoom-in">
                <div className="flex space-x-4 mb-6">
                    <div className="w-20 h-20 bg-[#613de6] rounded-3xl flex items-center justify-center text-4xl font-black border-4 border-white shadow-xl">{lastResult?.n1}</div>
                    <div className="w-20 h-20 bg-[#613de6] rounded-3xl flex items-center justify-center text-4xl font-black border-4 border-white shadow-xl">{lastResult?.n2}</div>
                </div>
                <h2 className="text-2xl font-black italic text-[#fc7952] uppercase tracking-tighter">RESULT: {lastResult?.condition}</h2>
            </div>
        ) : (
            <>
                <p className="text-[#fc7952] font-black italic uppercase text-m mb-8 tracking-tighter">Choose Next Outcome</p>
                <div className="grid grid-cols-3 gap-3 w-full max-w-sm mb-10">
                    {["Odd", "Even", "Both"].map(choice => (
                        <button key={choice} disabled={hasBet} onClick={() => setSelectedChoice(choice)}
                            className={`py-8 rounded-3xl font-black italic uppercase transition-all border-2
                                ${selectedChoice === choice ? 'bg-[#613de6] border-[#fc7952] scale-105' : 'bg-[#1e293b] border-white/5 opacity-40'}
                                ${hasBet && selectedChoice !== choice ? 'opacity-10 scale-95' : ''}`}>
                            {choice}
                        </button>
                    ))}
                </div>
                {!hasBet ? (
                    <button onClick={placePrediction} disabled={!selectedChoice}
                        className="w-full max-w-xs bg-[#fc7952] py-4 rounded-2xl font-black italic uppercase shadow-xl disabled:opacity-20">
                        Place bet
                    </button>
                ) : (
                    <div className="text-center bg-black/20 px-8 py-4 rounded-2xl border border-white/5 flex items-center space-x-3">
                        <CheckCircle2 size={20} className="text-green-500" />
                        <span className="font-black italic uppercase text-xs">Please wait for draws.</span>
                    </div>
                )}
            </>
        )}
      </div>

      {/* Footer */}
      <div className="fixed bottom-0 left-0 w-full bg-black/40 backdrop-blur-md p-5 border-t border-white/10 flex items-center justify-between px-8">
        <span className="text-[10px] font-black italic text-white/50 uppercase">Session Active</span>
        <div className="text-right">
            <p className="text-[9px] font-black italic text-white/30 uppercase mb-1">Ends In</p>
            <p className="text-lg font-black italic text-[#fc7952] font-mono tracking-tighter leading-none">{subTimeLeft}</p>
        </div>
      </div>
    </div>
  );
}