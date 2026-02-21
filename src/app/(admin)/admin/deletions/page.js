"use client";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { 
  collection, onSnapshot, doc, deleteDoc, updateDoc 
} from "firebase/firestore";
import { Trash2, ShieldAlert, Loader2, CheckCircle, XCircle } from "lucide-react";

export default function AdminDeletions() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "deletion_requests"), (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setRequests(docs);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleFinalDelete = async (requestId, uid) => {
    if (!confirm("CRITICAL: This action cannot be undone. The user's login and all data will be permanently deleted. Continue?")) return;
    
    setProcessingId(requestId);
    try {
      const res = await fetch("/api/admin/delete-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid })
      });

      const result = await res.json();

      if (res.ok) {
        await deleteDoc(doc(db, "deletion_requests", requestId));
        alert("Success: Account and Authentication records purged.");
      } else {
        throw new Error(result.error || "Failed to delete");
      }
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const cancelRequest = async (requestId, uid) => {
    try {
      // Remove request and reset the flag on the user document
      await deleteDoc(doc(db, "deletion_requests", requestId));
      await updateDoc(doc(db, "users", uid), { deletionRequested: false });
      alert("Request rejected. User access restored.");
    } catch (err) { 
      alert(err.message); 
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center text-slate-900 font-black italic uppercase tracking-widest">
        <Loader2 className="animate-spin mr-2" /> Loading Requests...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-6 md:p-12 font-sans">
      <div className="max-w-5xl mx-auto">
        
        {/* Header Area */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12 bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100">
          <div className="flex items-center gap-5">
            <div className="p-4 bg-red-50 text-red-600 rounded-3xl border border-red-100">
              <ShieldAlert size={32} />
            </div>
            <div>
              <h1 className="text-3xl font-black uppercase italic leading-none tracking-tighter">Account Purge</h1>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-2">Manage Deletion Requests</p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-full text-[10px] font-black uppercase text-slate-500">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
            {requests.length} Pending Requests
          </div>
        </div>

        {/* Requests List */}
        <div className="space-y-4">
          {requests.length === 0 ? (
            <div className="bg-white p-20 rounded-[3rem] text-center border border-slate-100 shadow-sm">
              <div className="w-20 h-20 bg-green-50 text-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle size={40} />
              </div>
              <h3 className="text-xl font-black italic uppercase text-slate-300">Queue is Clear</h3>
              <p className="text-slate-400 text-xs font-bold uppercase mt-2">No users are currently requesting deletion</p>
            </div>
          ) : (
            requests.map((req) => (
              <div 
                key={req.id} 
                className="group bg-white p-8 rounded-[2.5rem] border border-slate-100 flex flex-col md:flex-row justify-between items-center gap-8 hover:shadow-xl hover:shadow-slate-200/50 transition-all duration-300"
              >
                <div className="flex items-center gap-6 w-full md:w-auto">
                  <div className="w-16 h-16 bg-slate-900 text-white rounded-[1.5rem] flex items-center justify-center text-2xl font-black italic shadow-lg transform group-hover:rotate-3 transition-transform">
                    {req.username?.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-xl font-black italic uppercase text-slate-900 leading-tight">
                      {req.username}
                    </h3>
                    <div className="flex flex-col gap-1 mt-1">
                      <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">{req.email}</p>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-[10px] font-black bg-red-50 text-red-600 px-3 py-1 rounded-full border border-red-100">
                          WALLET: ${req.walletBalance?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                        <span className="text-[10px] font-bold text-slate-300 uppercase">
                          ID: {req.uid?.substring(0, 8)}...
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto border-t md:border-t-0 pt-6 md:pt-0 border-slate-50">
                  <button 
                    onClick={() => cancelRequest(req.id, req.uid)}
                    className="flex-1 md:flex-none px-8 py-4 bg-slate-100 text-slate-600 rounded-2xl text-[11px] font-black uppercase hover:bg-slate-200 transition-colors flex items-center justify-center gap-2"
                  >
                    <XCircle size={16} /> Reject
                  </button>
                  <button 
                    onClick={() => handleFinalDelete(req.id, req.uid)}
                    disabled={processingId === req.id}
                    className="flex-1 md:flex-none px-8 py-4 bg-red-600 text-white rounded-2xl text-[11px] font-black uppercase flex items-center justify-center gap-3 shadow-lg shadow-red-200 hover:bg-red-700 transition-all active:scale-95 disabled:opacity-50"
                  >
                    {processingId === req.id ? (
                      <Loader2 className="animate-spin" size={16} />
                    ) : (
                      <>
                        <Trash2 size={16} /> Final Erase
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer Info */}
        <div className="mt-12 text-center">
          <p className="text-[10px] font-black uppercase text-slate-300 tracking-[0.3em]">
            Flyova Global Security Protocol &copy; 2026
          </p>
        </div>
      </div>
    </div>
  );
}