"use client";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { 
  collectionGroup, // <--- Key for searching all sub-collections
  collection,
  query, 
  onSnapshot, 
  orderBy, 
  where,
  limit, 
  startAfter, 
  getDocs,
  documentId
} from "firebase/firestore";
import { Send, Search, User, Hash, Loader2, ChevronDown } from "lucide-react";

export default function AdminTransfers() {
  const [transfers, setTransfers] = useState([]);
  const [userProfiles, setUserProfiles] = useState({}); // { userId: { pin, email, name } }
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);

  const PAGE_SIZE = 20;

  const fetchUserProfiles = async (userIds) => {
    const uniqueIds = [...new Set(userIds)].filter(id => id && !userProfiles[id]);
    if (uniqueIds.length === 0) return;

    const nextProfiles = { ...userProfiles };
    const chunks = [];
    for (let i = 0; i < uniqueIds.length; i += 10) {
      chunks.push(uniqueIds.slice(i, i + 10));
    }

    for (const chunk of chunks) {
      const q = query(collection(db, "users"), where(documentId(), "in", chunk));
      const snap = await getDocs(q);
      snap.forEach((d) => {
        const data = d.data();
        nextProfiles[d.id] = {
          pin: data.pin || "",
          email: data.email || "",
          name: data.fullName || data.username || "",
        };
      });
    }

    setUserProfiles(nextProfiles);
  };

  useEffect(() => {
    // We use collectionGroup to find all "transactions" sub-collections
    // We filter by type "p2p_transfer" and direction "out" (to avoid duplicates)
    const q = query(
      collectionGroup(db, "transactions"), 
      where("type", "==", "p2p_transfer"),
      where("direction", "==", "out"), 
      orderBy("timestamp", "desc"),
      limit(PAGE_SIZE)
    );
    
    const unsub = onSnapshot(q, async (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const relatedUserIds = docs.flatMap((t) => [t.senderId, t.receiverId]);
      await fetchUserProfiles(relatedUserIds);
      setTransfers(docs);
      setLastDoc(snap.docs[snap.docs.length - 1]);
      setHasMore(snap.docs.length === PAGE_SIZE);
      setLoading(false);
    }, (err) => {
      console.error("Admin Group Query Error:", err);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const loadMore = async () => {
    if (!lastDoc || loadingMore) return;
    setLoadingMore(true);

    try {
      const q = query(
        collectionGroup(db, "transactions"),
        where("type", "==", "p2p_transfer"),
        where("direction", "==", "out"),
        orderBy("timestamp", "desc"),
        startAfter(lastDoc),
        limit(PAGE_SIZE)
      );

      const snap = await getDocs(q);
      if (!snap.empty) {
        const newDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const relatedUserIds = newDocs.flatMap((t) => [t.senderId, t.receiverId]);
        await fetchUserProfiles(relatedUserIds);
        setTransfers(prev => [...prev, ...newDocs]);
        setLastDoc(snap.docs[snap.docs.length - 1]);
        setHasMore(snap.docs.length === PAGE_SIZE);
      } else {
        setHasMore(false);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMore(false);
    }
  };

  const filtered = transfers.filter(tx => 
    tx.senderName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    tx.receiverName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    tx.txId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    tx.senderId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    tx.receiverId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (tx.senderPin || userProfiles[tx.senderId]?.pin || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (tx.receiverPin || userProfiles[tx.receiverId]?.pin || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black italic uppercase text-slate-800">Global Transfers</h1>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Fetched from User Transaction Nodes</p>
        </div>

        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text"
            placeholder="Search Name, TXID, ID or PIN..."
            className="bg-white border border-slate-200 pl-12 pr-6 py-3 rounded-2xl text-xs font-bold outline-none w-full md:w-80 transition-all shadow-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-tighter">Sender</th>
                <th className="p-6 text-center text-[10px] font-black uppercase text-slate-400">TXID</th>
                <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-tighter">Receiver</th>
                <th className="p-6 text-[10px] font-black uppercase text-slate-400">Amount & Fee</th>
                <th className="p-6 text-right text-[10px] font-black uppercase text-slate-400">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan="5" className="p-20 text-center">
                    <Loader2 className="animate-spin text-[#613de6] mx-auto mb-2" size={32} />
                    <p className="text-[10px] font-black text-slate-300 uppercase">Scanning User Nodes...</p>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan="5" className="p-20 text-center font-bold italic text-slate-300">
                    No p2p_transfer records found in any user history.
                  </td>
                </tr>
              ) : (
                filtered.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-400">
                           <User size={18} />
                        </div>
                        <div>
                          <p className="text-sm font-black text-slate-800">{tx.senderName}</p>
                          <p className="text-[9px] font-bold text-indigo-500 uppercase tracking-tighter">PIN: {tx.senderPin || userProfiles[tx.senderId]?.pin || '---'}</p>
                        </div>
                      </div>
                    </td>

                    <td className="p-6 text-center">
                      <div className="inline-flex max-w-[220px] flex-col items-center gap-1 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
                        <div className="flex items-center gap-1 text-[9px] font-black uppercase text-slate-400">
                          <Hash size={11} />
                          Transaction ID
                        </div>
                        <span className="max-w-full break-all font-mono text-[10px] font-black leading-tight text-slate-900" title={tx.txId || tx.id || ""}>
                          {tx.txId || tx.id || "---"}
                        </span>
                      </div>
                    </td>

                    <td className="p-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-400">
                           <Send size={16} />
                        </div>
                        <div>
                          <p className="text-sm font-black text-slate-800">{tx.receiverName}</p>
                          <p className="text-[9px] font-bold text-indigo-500 uppercase tracking-tighter">PIN: {tx.receiverPin || userProfiles[tx.receiverId]?.pin || '---'}</p>
                        </div>
                      </div>
                    </td>

                    <td className="p-6">
                      <p className="text-base font-black italic text-slate-800">${Math.abs(tx.amount || 0).toFixed(2)}</p>
                      <p className="text-[9px] font-bold text-rose-500 uppercase tracking-tighter">Fee: ${tx.fee || "0.00"}</p>
                    </td>

                    <td className="p-6 text-right">
                      <div className="inline-block px-3 py-1 bg-emerald-100 text-emerald-600 rounded-lg text-[8px] font-black uppercase mb-1">
                        {tx.status || 'COMPLETED'}
                      </div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">
                         {tx.timestamp?.toDate().toLocaleString() || '---'}
                      </p>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {hasMore && !loading && (
          <div className="p-6 bg-slate-50/50 border-t border-slate-100 flex justify-center">
            <button 
              onClick={loadMore}
              disabled={loadingMore}
              className="flex items-center gap-2 px-8 py-3 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-[#613de6] transition-all shadow-sm"
            >
              {loadingMore ? <Loader2 size={14} className="animate-spin" /> : <>Fetch Older Records <ChevronDown size={14} /></>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
