"use client";
import { useState, useEffect } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Swords,
  History,
  Trophy,
  Coins,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Send,
  RefreshCw
} from "lucide-react";
// FIREBASE IMPORTS
import { auth, db } from "@/lib/firebase";
import { collection, query, onSnapshot, orderBy, where } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

export default function HistoryPage() {
  const [filter, setFilter] = useState("all");
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  const getDayKey = (date) => `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  const isPredictRoundTx = (item) =>
    item.category === "games" &&
    (item.type === "prediction" || (item.type === "win" && String(item.title || "").toLowerCase().includes("predict")));

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        // 1. STAKES, WINS & USDT WITHDRAWALS (Sub-collection)
        const transRef = collection(db, "users", user.uid, "transactions");
        const qTrans = query(transRef, orderBy("timestamp", "desc"));

        // 2. DIRECT DEPOSITS
        const depositRef = collection(db, "deposits");
        const qDepo = query(depositRef, where("userId", "==", user.uid), orderBy("createdAt", "desc"));

        // 3. AGENT TRADES (Deposits and Withdrawals)
        const tradeRef = collection(db, "trades");
        const qTrade = query(tradeRef, where("senderId", "==", user.uid), orderBy("createdAt", "desc"));

        const unsubscribes = [];
        let streamStorage = { trans: [], depo: [], trade: [] };

        const updateState = (newData, streamKey) => {
          streamStorage[streamKey] = newData;
          const combined = [...streamStorage.trans, ...streamStorage.depo, ...streamStorage.trade]
            .sort((a, b) => b.date - a.date);
          
          setTransactions(combined);
          setLoading(false);
        };

        const syncData = () => {
          setLoading(true);
          
          const unsubTrans = onSnapshot(qTrans, (snap) => {
            const normalizeAddress = (value) => String(value || "").trim().toLowerCase();
            const toMillis = (value) => {
              if (!value) return 0;
              if (typeof value === "number") return value;
              if (typeof value?.toMillis === "function") return value.toMillis();
              if (typeof value?.toDate === "function") return value.toDate().getTime();
              return 0;
            };

            const rows = snap.docs.map((row) => ({ id: row.id, data: row.data() }));
            const completedWithdrawalIds = new Set(
              rows
                .filter((row) =>
                  row.data.type === "withdrawal" &&
                  (row.data.status === "completed" || row.data.status === "approved") &&
                  Boolean(row.data.withdrawalId)
                )
                .map((row) => row.data.withdrawalId)
            );

            const data = rows.map(({ id, data: docData }) => {
              const isAgentWithdrawalMirror =
                docData.type === "withdrawal" &&
                docData.method === "agent" &&
                Boolean(docData.tradeId);

              // Agent withdrawals are rendered from the `trades` stream as "P2P Agent Debit".
              // Hide mirrored `transactions` rows to prevent duplicate history cards.
              if (isAgentWithdrawalMirror) return null;

              const isUsdtWithdrawal = docData.type === "withdrawal" && (docData.method === "usdt" || !docData.method);
              const isPendingUsdt = isUsdtWithdrawal && docData.status === "pending";
              const isLinkedDuplicate =
                Boolean(docData.withdrawalId) &&
                completedWithdrawalIds.has(docData.withdrawalId);

              // Backward compatibility: old admin flow created a second "Withdrawal Approved" row.
              // Hide the stale pending twin when a matching approved/completed row exists.
              const hasLegacyTwin = isPendingUsdt && rows.some(({ id: otherId, data: other }) => {
                if (otherId === id) return false;
                if (other.type !== "withdrawal") return false;
                if (!(other.status === "completed" || other.status === "approved")) return false;
                if (other.title !== "Withdrawal Approved") return false;

                const sameAmount =
                  Math.abs(Number(other.amount || 0)) === Math.abs(Number(docData.amount || 0));
                if (!sameAmount) return false;

                const pendingAddress = normalizeAddress(docData.details?.usdtAddress);
                const approvedAddress = normalizeAddress(other.details?.usdtAddress);
                if (pendingAddress && approvedAddress && pendingAddress !== approvedAddress) return false;

                const timeGap = Math.abs(toMillis(other.timestamp) - toMillis(docData.timestamp));
                return timeGap > 0 && timeGap <= 24 * 60 * 60 * 1000;
              });

              if (isPendingUsdt && (isLinkedDuplicate || hasLegacyTwin)) return null;
              
              const isTransfer = docData.type === 'p2p_transfer';
              const isFinance = docData.type === 'withdrawal' || docData.category === 'finance' || isTransfer;
              
              let mainTitle = "";
              let subDetail = docData.title || "";

              const isPlayWithFriends =
                docData.title === "Match Stake" || docData.title === "Match Settlement";
              // Old cron settled partial refunds by setting status:"refunded" without updating title
              const isLegacyRefund = docData.title === "Flyova Stake" && docData.status === "refunded";
              const isFlyovaStake = docData.title === "Flyova Stake" && !isLegacyRefund;
              const isFlyovaWin = docData.title === "Flyova Win";
              const isFlyovaPartial = docData.title === "Flyova Partial Refund" || isLegacyRefund;
              const isFlyovaLoss = docData.title === "Flyova Loss" || docData.type === "loss";
              const isFlyova = isFlyovaStake || isFlyovaWin || isFlyovaPartial || isFlyovaLoss;

              // Stakes and losses are debits — negate so they display as -$X (red)
              // Legacy refunds: use stored payout field if available, otherwise calculate 80%
              const displayAmount = isLegacyRefund
                ? Number(docData.payout || (docData.amount * 0.8) || 0)
                : (isFlyovaStake || isFlyovaLoss || isFlyovaPartial) ? -(Math.abs(Number(docData.amount || 0))) : docData.amount;

              if (isTransfer) {
                mainTitle = "P2P TRANSFER";
                subDetail = docData.direction === 'in'
                  ? `From ${docData.senderName || 'User'}`
                  : `To ${docData.receiverName || 'User'}`;
              } else if (isPlayWithFriends) {
                mainTitle = "PLAY WITH FRIENDS";
                subDetail = docData.title;
              } else if (isFlyovaStake) {
                mainTitle = "FLYOVA TO DOLLARS";
                subDetail = "Round Stake";
              } else if (isFlyovaWin) {
                mainTitle = "FLYOVA TO DOLLARS";
                subDetail = "Win · +30%";
              } else if (isFlyovaPartial) {
                mainTitle = "FLYOVA TO DOLLARS";
                subDetail = "Partial Refund";
              } else if (isFlyovaLoss) {
                mainTitle = "FLYOVA TO DOLLARS";
                subDetail = "Loss · 0%";
              } else if (docData.type === 'win') {
                mainTitle = "GAME VICTORY";
                subDetail = "Round Victory";
              } else if (docData.type === 'stake') {
                mainTitle = "GAME STAKE";
                subDetail = "Match Entry";
              } else if (docData.type === 'withdrawal') {
                mainTitle = "WITHDRAWAL";
                subDetail = "USDT Payout";
              } else {
                mainTitle = "TRANSACTION";
              }

              return {
                id,
                ...docData,
                amount: displayAmount,
                mainTitle,
                subDetail,
                category: isFlyova ? 'games' : isFinance ? 'finance' : 'games',
                date: docData.timestamp?.toDate() || new Date()
              };
            }).filter(Boolean);
            updateState(data, 'trans');
          });

          const unsubDepo = onSnapshot(qDepo, (snap) => {
            const data = snap.docs.map(doc => ({
              id: doc.id,
              ...doc.data(),
              mainTitle: "DIRECT DEPOSIT",
              subDetail: "Account Credit",
              type: "deposit",
              category: 'finance',
              date: doc.data().createdAt?.toDate() || new Date()
            }));
            updateState(data, 'depo');
          });

          const unsubTrade = onSnapshot(qTrade, (snap) => {
            const data = snap.docs.map(doc => ({
              id: doc.id,
              ...doc.data(),
              mainTitle: doc.data().type === 'deposit' ? "AGENT DEPOSIT" : "AGENT WITHDRAWAL",
              subDetail: doc.data().type === 'deposit' ? "P2P Agent Credit" : "P2P Agent Debit",
              category: 'finance',
              date: doc.data().createdAt?.toDate() || new Date()
            }));
            updateState(data, 'trade');
          });

          unsubscribes.push(unsubTrans, unsubDepo, unsubTrade);
        };

        syncData();
        return () => unsubscribes.forEach(unsub => unsub());
      } else {
        setLoading(false);
      }
    });
    return () => unsubscribeAuth();
  }, []);

  const filteredData = transactions.filter(item => {
    if (filter === "all") return true;
    if (filter === "games") return item.category === "games";
    if (filter === "finance") return item.category === "finance";
    return true;
  });

  const predictSummaryByDay = new Map();
  filteredData.forEach((item) => {
    if (!isPredictRoundTx(item)) return;
    const dayKey = getDayKey(item.date);
    const current = predictSummaryByDay.get(dayKey) || {
      count: 0,
      wins: 0,
      losses: 0,
      pending: 0,
      net: 0,
      latestDate: item.date,
    };

    current.count += 1;
    current.net += Number(item.amount || 0);
    if (item.status === "pending") current.pending += 1;
    else if (item.status === "loss") current.losses += 1;
    else if (item.status === "win" || item.status === "completed") current.wins += 1;

    if (item.date > current.latestDate) current.latestDate = item.date;
    predictSummaryByDay.set(dayKey, current);
  });

  const renderedData = [];
  const injectedPredictGroups = new Set();

  filteredData.forEach((item) => {
    if (!isPredictRoundTx(item)) {
      renderedData.push(item);
      return;
    }

    const dayKey = getDayKey(item.date);
    const summary = predictSummaryByDay.get(dayKey);

    if (!summary || summary.count <= 1) {
      renderedData.push(item);
      return;
    }

    if (injectedPredictGroups.has(dayKey)) return;
    injectedPredictGroups.add(dayKey);

    const groupStatus =
      summary.pending > 0
        ? "pending"
        : summary.wins > 0 && summary.losses === 0
          ? "win"
          : summary.wins === 0 && summary.losses > 0
            ? "loss"
            : "completed";

    renderedData.push({
      id: `predict-group-${dayKey}`,
      type: "predict_group",
      category: "games",
      status: groupStatus,
      amount: summary.net,
      date: summary.latestDate,
      mainTitle: "PREDICT & WIN",
      subDetail: `${summary.count} Rounds · W${summary.wins} L${summary.losses}${summary.pending ? ` P${summary.pending}` : ""}`,
    });
  });

  return (
    <div className="min-h-screen bg-[#0f172a] pb-24 text-white">
      {/* Header Section */}
      <div className="bg-[#613de6] p-8 rounded-b-[3.5rem] shadow-2xl text-center border-b-4 border-[#fc7952] relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
            <History size={300} className="absolute -top-20 -left-20 rotate-12" />
        </div>
        <h1 className="relative z-10 text-3xl font-black italic tracking-tighter flex items-center justify-center space-x-3 text-white">
          <History size={28} className="animate-pulse" />
          <span>HISTORY</span>
        </h1>
        <p className="relative z-10 text-white/60 text-[10px] font-black uppercase mt-2 tracking-[0.3em]">Ledger & Performance</p>
      </div>

      <div className="p-4 max-w-2xl lg:max-w-4xl mx-auto mt-4">
        {/* Filters */}
        <div className="flex space-x-2 mb-8 overflow-x-auto pb-2 no-scrollbar px-2 md:px-0 relative z-20 md:justify-center">
          {["all", "games", "finance"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-8 py-3 rounded-2xl text-[10px] font-black uppercase transition-all whitespace-nowrap border-2 ${
                filter === f 
                ? 'bg-[#fc7952] border-[#fc7952] text-white shadow-[0_10px_20px_rgba(252,121,82,0.3)]' 
                : 'bg-[#1e293b] border-white/5 text-gray-500 hover:text-white'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Transaction List */}
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-20">
              <Loader2 className="w-12 h-12 text-[#613de6] animate-spin mx-auto mb-4" />
              <p className="text-gray-500 font-black uppercase text-[10px] tracking-widest">Syncing Nodes...</p>
            </div>
          ) : renderedData.map((item) => {
            const rawAmount = Number(item.amount || 0);
            // Losses and partial refunds are always debits — enforce negative at render time
            const amountValue = (item.type === 'loss' || item.type === 'refund') ? -Math.abs(rawAmount) : rawAmount;
            const isPositive = item.type === "p2p_transfer" ? item.direction === "in" : amountValue > 0;
            const isNegative = item.type === "p2p_transfer" ? item.direction !== "in" : amountValue < 0;
            const iconTone = isPositive ? "bg-green-500/10 text-green-500" : isNegative ? "bg-red-500/10 text-red-500" : "bg-slate-500/10 text-slate-400";
            const dateStr = item.date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            // Loss records have status "completed" in DB — override to show red "loss" badge
            // Partial refund records may have status "win" from old code — always show "partial"
            const displayStatus = item.type === 'loss' ? 'loss'
              : item.type === 'refund' ? 'partial'
              : item.status;
            
            return (
              <div 
                key={item.id} 
                className="bg-[#1e293b] border border-white/5 p-5 rounded-[2.5rem] flex items-center justify-between group hover:border-[#613de6]/50 transition-all duration-300 shadow-xl"
              >
                <div className="flex items-center space-x-4">
                  <div className={`p-4 rounded-2xl shadow-inner ${iconTone}`}>
                    {item.type === 'refund' ? <RefreshCw size={20}/> :
                     item.type === 'loss' ? <XCircle size={20}/> :
                     item.type === 'win' ? <Trophy size={20}/> :
                     item.type === 'stake' ? <Swords size={20}/> :
                     item.type === 'predict_group' ? <Swords size={20}/> :
                     item.type === 'p2p_transfer' ? <Send size={20}/> :
                     item.type === 'deposit' ? <ArrowDownLeft size={20}/> : <ArrowUpRight size={20}/>}
                  </div>

                  <div>
                    {/* GRAY Main Category Label */}
                    <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-0.5">
                      {(item.type === 'loss' || item.type === 'win' || item.type === 'refund') && item.mainTitle === 'TRANSACTION'
                        ? 'FLYOVA TO DOLLARS'
                        : item.mainTitle}
                    </p>

                    {/* WHITE Original Title (Larger/Bold) */}
                    <h4 className="font-black text-xs text-white uppercase tracking-tight leading-tight">
                      {item.type === 'loss' && item.subDetail === item.title ? 'Loss · 0%' : item.subDetail}
                    </h4>
                    
                    <div className="flex items-center gap-2 mt-1">
                        <p className="text-[9px] text-gray-500 font-bold uppercase">{dateStr}</p>
                        {displayStatus && (
                            <div className={`flex items-center gap-1 text-[8px] font-black uppercase px-2 py-0.5 rounded-md ${
                                displayStatus === 'completed' || displayStatus === 'win' ? 'bg-green-500/20 text-green-400' :
                                displayStatus === 'pending' ? 'bg-orange-500/20 text-orange-400' :
                                displayStatus === 'partial' ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400'
                            }`}>
                                {displayStatus === 'completed' || displayStatus === 'win' ? <CheckCircle2 size={10}/> : displayStatus === 'pending' ? <Clock size={10}/> : displayStatus === 'partial' ? <RefreshCw size={10}/> : <XCircle size={10}/>}
                                {displayStatus}
                            </div>
                        )}
                    </div>
                    {/* Account pin / reference details */}
                    {item.type === 'withdrawal' && item.details?.usdtAddress && (
                      <p className="text-[8px] font-bold text-[#613de6]/80 mt-1 font-mono tracking-wider">
                        {item.details.usdtAddress.slice(0, 6)}...{item.details.usdtAddress.slice(-4)}
                      </p>
                    )}
                    {(item.mainTitle === 'AGENT WITHDRAWAL' || item.mainTitle === 'AGENT DEPOSIT') && item.agentId && (
                      <p className="text-[8px] font-bold text-[#613de6]/80 mt-1 font-mono tracking-wider">
                        Trade #{(item.id || '').slice(-6).toUpperCase()}
                      </p>
                    )}
                    {item.type === 'deposit' && item.addressUsed && (
                      <p className="text-[8px] font-bold text-[#613de6]/80 mt-1 font-mono tracking-wider">
                        {item.addressUsed.slice(0, 6)}...{item.addressUsed.slice(-4)}
                      </p>
                    )}
                  </div>
                </div>

                <div className="text-right">
                  <p className={`font-black text-xl italic tracking-tighter ${
                    isPositive ? 'text-green-400' : isNegative ? 'text-red-400' : 'text-slate-400'
                  }`}>
                    {isPositive ? '+' : isNegative ? '-' : ''}${Math.abs(amountValue).toFixed(2)}
                  </p>
                  <span className="text-[8px] font-black uppercase opacity-30 tracking-widest">
                    {item.type === 'p2p_transfer' ? 'P2P Transfer' : item.type === 'predict_group' ? 'Prediction Summary' : (item.type || 'Transaction')}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {!loading && renderedData.length === 0 && (
          <div className="text-center py-24 bg-[#1e293b] rounded-[3rem] border border-dashed border-white/5 opacity-50">
            <Coins size={48} className="mx-auto mb-4 text-gray-700" />
            <p className="font-black uppercase text-[10px] tracking-[0.2em] text-gray-500">No History found in {filter}</p>
          </div>
        )}
      </div>
    </div>
  );
}
