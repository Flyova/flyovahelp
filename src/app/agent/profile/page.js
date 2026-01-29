"use client";
import { useState, useEffect } from "react";
import { db, auth } from "@/lib/firebase";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import { 
  ChevronLeft, 
  User, 
  Building2, 
  CreditCard, 
  MapPin, 
  Save, 
  Loader2,
  Lock
} from "lucide-react";

export default function AgentProfile() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [profile, setProfile] = useState({
    fullName: "", // We'll map full_name to this for the state
    country: "",
    bankName: "",
    accountName: "",
    accountNumber: "",
  });

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      if (!u) return router.push("/login");

      const agentRef = doc(db, "agents", u.uid);
      const unsubProfile = onSnapshot(agentRef, (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setProfile({
            // Correcting the mapping: agent collection uses full_name
            fullName: data.full_name || "", 
            country: data.country || "",
            bankName: data.bankName || "",
            accountName: data.accountName || "",
            accountNumber: data.accountNumber || "",
          });
        }
        setLoading(false);
      });

      return () => unsubProfile();
    });
    return () => unsubAuth();
  }, [router]);

  const handleUpdate = async (e) => {
    e.preventDefault();
    setUpdating(true);
    try {
      const agentRef = doc(db, "agents", auth.currentUser.uid);
      // Only updating bank-related fields
      await updateDoc(agentRef, {
        bankName: profile.bankName,
        accountName: profile.accountName,
        accountNumber: profile.accountNumber
      });
      alert("Bank details updated successfully!");
    } catch (error) {
      console.error(error);
      alert("Failed to update bank details.");
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <Loader2 className="text-[#613de6] animate-spin" size={40} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f172a] text-white pb-10">
      {/* Header */}
      <div className="p-6 pt-12 flex items-center gap-4">
        <button 
          onClick={() => router.back()}
          className="p-3 bg-[#1e293b] rounded-2xl border border-white/5"
        >
          <ChevronLeft size={20} />
        </button>
        <h1 className="text-xl font-black italic uppercase">Merchant Profile</h1>
      </div>

      <form onSubmit={handleUpdate} className="p-6 space-y-8">
        
        {/* PERSONAL INFORMATION (NON-EDITABLE) */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 px-2">
            <User size={14} className="text-[#613de6]" />
            <h2 className="text-[10px] font-black uppercase tracking-widest text-gray-500">Identity (Verified)</h2>
          </div>

          <div className="bg-[#1e293b]/50 p-6 rounded-[2.5rem] border border-white/5 space-y-4 shadow-inner">
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-gray-600 ml-2 tracking-tighter">Full Name</label>
              <div className="w-full bg-[#0f172a]/80 p-4 rounded-2xl border border-white/5 font-black text-sm text-gray-400 italic">
                {profile.fullName || "Name Not Found"}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-gray-600 ml-2 tracking-tighter">Country</label>
              <div className="relative">
                <MapPin size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-700" />
                <div className="w-full bg-[#0f172a]/80 p-4 pl-12 rounded-2xl border border-white/5 font-black text-sm text-gray-400">
                  {profile.country || "Not Set"}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* BANK DETAILS (EDITABLE) */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 px-2">
            <Building2 size={14} className="text-[#fc7952]" />
            <h2 className="text-[10px] font-black uppercase tracking-widest text-gray-500">Bank Settlement</h2>
          </div>

          <div className="bg-[#1e293b] p-6 rounded-[2.5rem] border border-white/5 space-y-4 shadow-xl">
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-[#fc7952] ml-2">Bank Name</label>
              <input 
                type="text"
                required
                placeholder="e.g. OPay, Kuda, Zenith"
                value={profile.bankName}
                onChange={(e) => setProfile({...profile, bankName: e.target.value})}
                className="w-full bg-[#0f172a] p-4 rounded-2xl border border-white/5 outline-none focus:border-[#fc7952] transition-all font-bold text-sm"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-[#fc7952] ml-2">Account Holder Name</label>
              <input 
                type="text"
                required
                placeholder="Exact name on bank app"
                value={profile.accountName}
                onChange={(e) => setProfile({...profile, accountName: e.target.value})}
                className="w-full bg-[#0f172a] p-4 rounded-2xl border border-white/5 outline-none focus:border-[#fc7952] transition-all font-bold text-sm"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-[#fc7952] ml-2">Account Number</label>
              <div className="relative">
                <CreditCard size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600" />
                <input 
                  type="text"
                  required
                  placeholder="0000000000"
                  value={profile.accountNumber}
                  onChange={(e) => setProfile({...profile, accountNumber: e.target.value})}
                  className="w-full bg-[#0f172a] p-4 pl-12 rounded-2xl border border-white/5 outline-none focus:border-[#fc7952] transition-all font-bold text-sm tracking-[0.2em]"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Info Footer */}
        <div className="px-4 flex gap-3 items-start opacity-40">
            <Lock size={14} className="mt-1 shrink-0" />
            <p className="text-[9px] font-bold uppercase leading-relaxed">
                Bank details are encrypted. Ensure accuracy to avoid delayed trade settlements.
            </p>
        </div>

        {/* Save Button */}
        <button 
          type="submit"
          disabled={updating}
          className="w-full bg-[#613de6] py-5 rounded-3xl font-black uppercase italic tracking-widest flex items-center justify-center gap-2 shadow-xl shadow-[#613de6]/20 active:scale-95 transition-all"
        >
          {updating ? <Loader2 className="animate-spin" /> : (
            <>
              <Save size={18} />
              Save Bank Details
            </>
          )}
        </button>

      </form>
    </div>
  );
}