"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X, ChevronRight } from "lucide-react";
// FIREBASE IMPORTS
import { auth, db } from "@/lib/firebase";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    fullName: "",
    username: "",
    email: "",
    country: "Nigeria",
    phone: "",
    password: "",
    agreeTerms: true
  });

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      // 1. Create User in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(
        auth, 
        formData.email, 
        formData.password
      );
      const user = userCredential.user;

      // 2. Update Auth Profile with Username
      await updateProfile(user, { displayName: formData.username });

      // 3. Create Real-Time User Document in Firestore
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        fullName: formData.fullName,
        username: formData.username,
        email: formData.email,
        country: formData.country,
        phone: `+234${formData.phone}`,
        status: "online",
        wallet: 0.00,
        winRate: 0,
        createdAt: serverTimestamp(),
        lastSeen: serverTimestamp()
      });

      router.push("/dashboard");
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-white flex flex-col p-6">
      <div className="flex justify-end items-center mb-6">
        <button onClick={() => router.push('/')} className="text-gray-500 hover:text-white">
          <X size={28} />
        </button>
      </div>

      <div className="flex-1 flex flex-col max-w-md mx-auto w-full">
        <div className="mb-8">
          <h2 className="text-3xl font-black italic tracking-tighter uppercase leading-tight">
            Create <span className="text-[#fc7952]">Account</span>
          </h2>
          <p className="text-gray-500 text-[10px] font-black uppercase tracking-[0.2em] mt-1">Join the global arena</p>
        </div>

        {error && <p className="bg-red-500/10 border border-red-500/50 text-red-500 p-3 rounded-xl text-xs font-bold mb-4">{error}</p>}

        <form onSubmit={handleRegister} className="space-y-4">
          <input 
            type="text" placeholder="Full Name" required
            className="w-full bg-[#1e293b] border-2 border-transparent focus:border-[#613de6] p-4 rounded-xl outline-none transition-all font-bold text-white placeholder:text-gray-600"
            onChange={(e) => setFormData({...formData, fullName: e.target.value})}
          />

          <input 
            type="text" placeholder="Username" required
            className="w-full bg-[#1e293b] border-2 border-transparent focus:border-[#613de6] p-4 rounded-xl outline-none transition-all font-bold text-white placeholder:text-gray-600"
            onChange={(e) => setFormData({...formData, username: e.target.value})}
          />

          <input 
            type="email" placeholder="Email Address" required
            className="w-full bg-[#1e293b] border-2 border-transparent focus:border-[#613de6] p-4 rounded-xl outline-none transition-all font-bold text-white placeholder:text-gray-600"
            onChange={(e) => setFormData({...formData, email: e.target.value})}
          />

          <div className="relative group">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center space-x-2"><span className="text-lg">🇳🇬</span></div>
            <select 
              className="w-full bg-[#1e293b] border-2 border-transparent focus:border-[#613de6] p-4 pl-14 rounded-xl outline-none transition-all font-bold text-white appearance-none cursor-pointer"
              onChange={(e) => setFormData({...formData, country: e.target.value})}
              value={formData.country}
            >
              <option value="Nigeria">Nigeria</option>
              <option value="Ghana">Ghana</option>
              <option value="Global">Worldwide</option>
            </select>
          </div>

          <div className="relative group">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center space-x-2 text-gray-400 border-r border-gray-700 pr-3">
              <span className="font-bold text-sm">+234</span>
            </div>
            <input 
              type="tel" placeholder="Mobile Number" required
              className="w-full bg-[#1e293b] border-2 border-transparent focus:border-[#613de6] p-4 pl-20 rounded-xl outline-none transition-all font-bold text-white placeholder:text-gray-600"
              onChange={(e) => setFormData({...formData, phone: e.target.value})}
            />
          </div>

          <input 
            type="password" placeholder="Password" required
            className="w-full bg-[#1e293b] border-2 border-transparent focus:border-[#613de6] p-4 rounded-xl outline-none transition-all font-bold text-white placeholder:text-gray-600"
            onChange={(e) => setFormData({...formData, password: e.target.value})}
          />

          <button 
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-[#613de6] text-white rounded-xl font-black transition-all active:scale-[0.98] shadow-lg shadow-[#613de6]/20 mt-4 uppercase tracking-widest disabled:opacity-50"
          >
            {loading ? "Creating Profile..." : "Create Account"}
          </button>
        </form>

        <div className="mt-8 text-center">
          <p className="text-gray-500 text-xs font-bold uppercase">
            Already a player? <Link href="/login" className="text-[#fc7952] hover:underline ml-1 italic">Log In</Link>
          </p>
        </div>
      </div>
    </div>
  );
}