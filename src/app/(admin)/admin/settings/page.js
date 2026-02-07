"use client";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { doc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import { 
  Settings, 
  Wallet, 
  Banknote, 
  Loader2, 
  ToggleLeft, 
  ToggleRight,
  ShieldCheck,
  ShieldAlert
} from "lucide-react";

export default function AdminSettings() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "global"), (snap) => {
      if (snap.exists()) {
        setSettings(snap.data());
      } else {
        setDoc(doc(db, "settings", "global"), {
          depositEnabled: true,
          withdrawalEnabled: true
        });
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const toggleSetting = async (key, currentValue) => {
    setUpdating(true);
    try {
      await updateDoc(doc(db, "settings", "global"), {
        [key]: !currentValue
      });
    } catch (error) {
      alert("Error updating system status");
    } finally {
      setUpdating(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <Loader2 className="animate-spin text-[#613de6]" size={30} />
    </div>
  );

  return (
    <div className="max-w-3xl p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-black italic uppercase text-slate-800 flex items-center gap-2">
          <Settings size={24} className="text-[#613de6]" /> 
          Gateways
        </h1>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Enable or disable global financial transactions</p>
      </div>

      <div className="space-y-4">
        {/* Deposit Row */}
        <div className={`flex items-center justify-between p-6 rounded-[2rem] border-2 transition-all ${settings?.depositEnabled ? 'bg-white border-slate-100' : 'bg-slate-50 border-slate-200 opacity-60'}`}>
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-xl ${settings?.depositEnabled ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-400'}`}>
              <Wallet size={20} />
            </div>
            <div>
              <h3 className="text-sm font-black italic uppercase text-slate-800">Deposit System</h3>
              <div className="flex items-center gap-1">
                {settings?.depositEnabled ? <ShieldCheck size={10} className="text-emerald-500"/> : <ShieldAlert size={10} className="text-rose-500"/>}
                <span className={`text-[9px] font-black uppercase tracking-tighter ${settings?.depositEnabled ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {settings?.depositEnabled ? 'Accepting Payments' : 'Disabled'}
                </span>
              </div>
            </div>
          </div>
          <button 
            disabled={updating}
            onClick={() => toggleSetting('depositEnabled', settings?.depositEnabled)}
          >
            {settings?.depositEnabled ? (
              <ToggleRight size={44} className="text-emerald-500" />
            ) : (
              <ToggleLeft size={44} className="text-slate-300" />
            )}
          </button>
        </div>

        {/* Withdrawal Row */}
        <div className={`flex items-center justify-between p-6 rounded-[2rem] border-2 transition-all ${settings?.withdrawalEnabled ? 'bg-white border-slate-100' : 'bg-slate-50 border-slate-200 opacity-60'}`}>
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-xl ${settings?.withdrawalEnabled ? 'bg-[#613de6]/10 text-[#613de6]' : 'bg-slate-200 text-slate-400'}`}>
              <Banknote size={20} />
            </div>
            <div>
              <h3 className="text-sm font-black italic uppercase text-slate-800">Withdrawal System</h3>
              <div className="flex items-center gap-1">
                {settings?.withdrawalEnabled ? <ShieldCheck size={10} className="text-blue-500"/> : <ShieldAlert size={10} className="text-rose-500"/>}
                <span className={`text-[9px] font-black uppercase tracking-tighter ${settings?.withdrawalEnabled ? 'text-blue-500' : 'text-rose-500'}`}>
                    {settings?.withdrawalEnabled ? 'Payouts Enabled' : 'Disabled'}
                </span>
              </div>
            </div>
          </div>
          <button 
            disabled={updating}
            onClick={() => toggleSetting('withdrawalEnabled', settings?.withdrawalEnabled)}
          >
            {settings?.withdrawalEnabled ? (
              <ToggleRight size={44} className="text-[#613de6]" />
            ) : (
              <ToggleLeft size={44} className="text-slate-300" />
            )}
          </button>
        </div>
      </div>

      {updating && (
        <div className="flex items-center justify-center gap-2 text-[10px] font-black uppercase text-slate-300 tracking-[0.2em] animate-pulse">
            <Loader2 size={12} className="animate-spin" /> Syncing with server
        </div>
      )}
    </div>
  );
}