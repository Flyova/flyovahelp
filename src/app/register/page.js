"use client";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { X, Gift, CheckCircle2, Globe, Calendar, Lock, UserCheck, Loader2 } from "lucide-react";
// FIREBASE IMPORTS
import { auth, db } from "@/lib/firebase";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { 
  doc, setDoc, serverTimestamp, getDoc, 
  collection, query, where, getDocs 
} from "firebase/firestore";

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const referralCode = searchParams.get("ref");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [claimBonus, setClaimBonus] = useState(true);
  const [referrerName, setReferrerName] = useState("");
  
  const [countries, setCountries] = useState([]);
  const [selectedCountry, setSelectedCountry] = useState({
    name: "United Kingdom",
    flag: "🇬🇧",
    code: "+44"
  });

  const [formData, setFormData] = useState({
    fullName: "",
    username: "",
    email: "",
    phone: "",
    dob: "",
    password: "",
    confirmPassword: "",
  });

  const generateUserPin = () => {
    return Math.floor(10000000 + Math.random() * 90000000).toString();
  };

  useEffect(() => {
    fetch("https://restcountries.com/v3.1/all?fields=name,flags,idd,flag")
      .then(res => res.json())
      .then(data => {
        const sorted = data.map(c => ({
          name: c.name.common,
          flag: c.flag,
          code: c.idd.root + (c.idd.suffixes ? c.idd.suffixes[0] : "")
        })).sort((a, b) => a.name.localeCompare(b.name));
        setCountries(sorted);
      })
      .catch(err => console.error("Country API Error:", err));
  }, []);

  // FIXED: Specific lookup for the referrer using referralCode as Document ID
  useEffect(() => {
    const fetchReferrer = async () => {
        if (referralCode) {
            try {
                const refSnap = await getDoc(doc(db, "users", referralCode));
                if (refSnap.exists()) {
                    const data = refSnap.data();
                    // Explicitly use fullName field
                    setReferrerName(data.fullName || data.username || "Flyova Member");
                } else {
                    setReferrerName("Flyova Member");
                }
            } catch (e) {
                console.error("Error fetching referrer:", e);
                setReferrerName("Flyova Member");
            }
        }
    };
    fetchReferrer();
  }, [referralCode]);

  const handleCountryChange = (e) => {
    const country = countries.find(c => c.name === e.target.value);
    if (country) setSelectedCountry(country);
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (formData.password !== formData.confirmPassword) {
        setError("Passwords do not match.");
        setLoading(false);
        return;
    }

    const birthDate = new Date(formData.dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    if (age < 18) {
      setError("Access Denied. You must be 18 years or older.");
      setLoading(false);
      return;
    }

    try {
      const usernameQuery = query(
        collection(db, "users"), 
        where("username", "==", formData.username)
      );
      const querySnapshot = await getDocs(usernameQuery);
      
      if (!querySnapshot.empty) {
        setError("This username is already taken. Please choose another.");
        setLoading(false);
        return;
      }

      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

      const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
      const user = userCredential.user;
      await updateProfile(user, { displayName: formData.username });

      const userPin = generateUserPin();
      
      // SAVING: Capture both Referrer Name and Referrer UID for tracking
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        fullName: formData.fullName,
        username: formData.username,
        email: formData.email,
        country: selectedCountry.name,
        phone: `${selectedCountry.code}${formData.phone}`,
        dob: formData.dob,
        pin: userPin,
        status: "online",
        wallet: claimBonus ? 3.00 : 0.00,
        bonusClaimed: claimBonus,
        createdAt: serverTimestamp(),
        verified: false,
        otp: otpCode,
        referredBy: referralCode ? referrerName : null,
        referrerUid: referralCode || null 
      });

      try {
        await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: formData.email,
            subject: "Welcome to Flyova - Verify Your Account",
            html: `<p>Hello ${formData.fullName}, your code is ${otpCode}</p>`
          })
        });
      } catch (e) { console.error("Email failed", e); }

      router.push(`/verify?email=${formData.email}`);
      
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col max-w-md mx-auto w-full">
      <div className="mb-8">
        <h2 className="text-3xl font-black italic tracking-tighter uppercase leading-tight">
          Create <span className="text-[#fc7952]">Account</span>
        </h2>
        <p className="text-gray-500 text-[10px] font-black uppercase tracking-[0.2em] mt-1 text-white">Join the Flyova Help</p>
      </div>

      {error && <p className="bg-red-500/10 border border-red-500/50 text-red-500 p-3 rounded-xl text-xs font-bold mb-4">{error}</p>}

      <form onSubmit={handleRegister} className="space-y-4">
        {referralCode && (
          <div className="relative group animate-in slide-in-from-top duration-500">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#fc7952]">
              <UserCheck size={18} />
            </div>
            <input 
              type="text" 
              readOnly 
              value={referrerName ? `Referred by: ${referrerName}` : "Identifying Referrer..."}
              className="w-full bg-[#fc7952]/5 border-2 border-[#fc7952]/20 p-4 pl-12 rounded-xl font-black text-[11px] uppercase tracking-wider text-[#fc7952] cursor-not-allowed outline-none"
            />
          </div>
        )}

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

        <div className="grid grid-cols-2 gap-4">
            <div className="relative group">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center space-x-2">
                <span className="text-lg">{selectedCountry.flag}</span>
            </div>
            <select 
                className="w-full bg-[#1e293b] border-2 border-transparent focus:border-[#613de6] p-4 pl-12 rounded-xl outline-none transition-all font-bold text-white appearance-none cursor-pointer text-xs"
                onChange={handleCountryChange}
                value={selectedCountry.name}
            >
                {countries.map((c, i) => (
                    <option key={i} value={c.name}>{c.name}</option>
                ))}
            </select>
            </div>

            <div className="relative group">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-gray-500 border-r border-gray-700 pr-2">
                {selectedCountry.code}
            </div>
            <input 
                type="tel" placeholder="Mobile" required
                className="w-full bg-[#1e293b] border-2 border-transparent focus:border-[#613de6] p-4 pl-14 rounded-xl outline-none transition-all font-bold text-white placeholder:text-gray-600 text-xs"
                onChange={(e) => setFormData({...formData, phone: e.target.value})}
            />
            </div>
        </div>

        <div className="relative group">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
            <Calendar size={18} />
          </div>
          <input 
            type="date" required
            className="w-full bg-[#1e293b] border-2 border-transparent focus:border-[#613de6] p-4 pl-12 rounded-xl outline-none transition-all font-bold text-white placeholder:text-gray-600 block"
            onChange={(e) => setFormData({...formData, dob: e.target.value})}
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[9px] font-black uppercase text-gray-500 pointer-events-none">Date of Birth</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative">
                <Lock size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600" />
                <input 
                    type="password" placeholder="Password" required
                    className="w-full bg-[#1e293b] border-2 border-transparent focus:border-[#613de6] p-4 pl-12 rounded-xl outline-none transition-all font-bold text-white text-sm"
                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                />
            </div>
            <div className="relative">
                <CheckCircle2 size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600" />
                <input 
                    type="password" placeholder="Confirm" required
                    className="w-full bg-[#1e293b] border-2 border-transparent focus:border-[#613de6] p-4 pl-12 rounded-xl outline-none transition-all font-bold text-white text-sm"
                    onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})}
                />
            </div>
        </div>

        <div 
          onClick={() => setClaimBonus(!claimBonus)}
          className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between ${
            claimBonus ? 'bg-[#613de6]/10 border-[#613de6]' : 'bg-[#1e293b] border-transparent'
          }`}
        >
          <div className="flex items-center space-x-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${claimBonus ? 'bg-[#613de6] text-white' : 'bg-gray-800 text-gray-500'}`}>
              <Gift size={20} />
            </div>
            <div>
              <p className="text-[11px] font-black uppercase italic leading-none text-white">Claim $3.00 Bonus</p>
              <p className="text-[9px] font-bold text-gray-500 mt-1 uppercase">Start betting for free!</p>
            </div>
          </div>
          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
            claimBonus ? 'bg-[#fc7952] border-[#fc7952]' : 'border-gray-700'
          }`}>
            {claimBonus && <CheckCircle2 size={14} className="text-white" />}
          </div>
        </div>

        <button 
          type="submit"
          disabled={loading}
          className="w-full py-5 bg-[#613de6] text-white rounded-2xl font-black transition-all active:scale-[0.98] shadow-lg shadow-[#613de6]/20 mt-4 uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? <><Loader2 className="animate-spin" size={18}/> Creating Profile...</> : "Create Account"}
        </button>
      </form>
    </div>
  );
}

export default function RegisterPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#0f172a] text-white flex flex-col p-6 pb-12">
      <div className="flex justify-end items-center mb-6">
        <button onClick={() => router.push('/')} className="text-gray-500 hover:text-white transition-colors">
          <X size={28} />
        </button>
      </div>

      <Suspense fallback={<div className="flex-1 flex items-center justify-center font-black italic opacity-20 text-white">INITIALIZING...</div>}>
        <RegisterForm />
      </Suspense>

      <div className="mt-8 text-center">
        <p className="text-gray-500 text-xs font-bold uppercase tracking-tight text-white">
          Already a player? <Link href="/login" className="text-[#fc7952] hover:underline ml-1 italic font-black">Log In</Link>
        </p>
      </div>
    </div>
  );
}