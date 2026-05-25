"use client";
import { useState, useEffect, Suspense, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  X, Gift, CheckCircle2, Calendar, Lock, UserCheck,
  Loader2, Mail, User, Phone, AlertCircle, Eye, EyeOff, ArrowRight
} from "lucide-react";
import { auth, db } from "@/lib/firebase";
import { createUserWithEmailAndPassword, updateProfile, signOut } from "firebase/auth";
import {
  doc, setDoc, serverTimestamp, getDoc,
  collection, query, where, getDocs
} from "firebase/firestore";

function SectionLabel({ children }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className="text-[9px] font-black uppercase tracking-[0.3em] text-gray-500">{children}</span>
      <div className="flex-1 h-px bg-white/5" />
    </div>
  );
}

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const referralCode = searchParams.get("ref");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [claimBonus, setClaimBonus] = useState(true);
  const [referrerName, setReferrerName] = useState("");
  const [resolvedReferrerUid, setResolvedReferrerUid] = useState(null);
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [countries, setCountries] = useState([]);
  const [selectedCountry, setSelectedCountry] = useState({ name: "United Kingdom", flag: "🇬🇧", code: "+44" });

  const [formData, setFormData] = useState({
    fullName: "", username: "", email: "",
    phone: "", dob: "", password: "", confirmPassword: "",
  });

  const generateUserPin = () => Math.floor(10000000 + Math.random() * 90000000).toString();

  useEffect(() => {
    fetch("https://restcountries.com/v3.1/all?fields=name,flags,idd,flag")
      .then((r) => r.json())
      .then((data) => {
        const sorted = data
          .map((c) => ({ name: c.name.common, flag: c.flag, code: c.idd.root + (c.idd.suffixes?.[0] ?? "") }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setCountries(sorted);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!referralCode) {
      setReferrerName("");
      setResolvedReferrerUid(null);
      return;
    }
    getDoc(doc(db, "users", referralCode))
      .then((snap) => {
        if (!snap.exists()) {
          setReferrerName("Invalid referral code");
          setResolvedReferrerUid(null);
          return;
        }
        const d = snap.data();
        setReferrerName(d.fullName || d.username || "Flyova Member");
        setResolvedReferrerUid(snap.id);
      })
      .catch(() => {
        setReferrerName("Invalid referral code");
        setResolvedReferrerUid(null);
      });
  }, [referralCode]);

  const handleCountryChange = (e) => {
    const c = countries.find((x) => x.name === e.target.value);
    if (c) setSelectedCountry(c);
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
    if (today.getFullYear() - birthDate.getFullYear() < 18) {
      setError("Access Denied. You must be 18 years or older.");
      setLoading(false);
      return;
    }

    try {
      const normalizedEmail = String(formData.email || "").trim().toLowerCase();
      const normalizedUsername = String(formData.username || "").trim();
      const normalizedFullName = String(formData.fullName || "").trim();

      if (!normalizedEmail) {
        setError("Email is required.");
        setLoading(false);
        return;
      }

      const usernameSnap = await getDocs(
        query(collection(db, "users"), where("username", "==", normalizedUsername))
      );
      if (!usernameSnap.empty) {
        setError("This username is already taken. Please choose another.");
        setLoading(false);
        return;
      }

      const normalizedPhone = `${selectedCountry.code}${formData.phone}`;
      const phoneSnap = await getDocs(
        query(collection(db, "users"), where("phone", "==", normalizedPhone))
      );
      if (!phoneSnap.empty) {
        setError("This phone number is already linked to another account.");
        setLoading(false);
        return;
      }

      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      const cred = await createUserWithEmailAndPassword(auth, normalizedEmail, formData.password);
      await updateProfile(cred.user, { displayName: normalizedUsername });
      const userPin = generateUserPin();

      await setDoc(doc(db, "users", cred.user.uid), {
        uid: cred.user.uid,
        fullName: normalizedFullName,
        username: normalizedUsername,
        email: normalizedEmail,
        emailLower: normalizedEmail,
        country: selectedCountry.name,
        phone: normalizedPhone,
        dob: formData.dob,
        pin: userPin,
        status: "offline",
        wallet: claimBonus ? 3.0 : 0.0,
        bonusClaimed: claimBonus,
        bonusDeducted: false,
        welcomeBonusClaimed: claimBonus,
        welcomeBonusPaid: claimBonus,
        welcomeBonusAmount: claimBonus ? 3.0 : 0.0,
        welcomeBonusStatus: claimBonus ? "paid" : "not_paid",
        ...(claimBonus && { welcomeBonusPaidAt: serverTimestamp() }),
        createdAt: serverTimestamp(),
        verified: false,
        otp: otpCode,
        referredBy: resolvedReferrerUid ? referrerName : null,
        referrerUid: resolvedReferrerUid || null,
      });

      try {
        const emailResponse = await fetch("/api/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: normalizedEmail,
            subject: "Welcome to Flyova - Verify Your Account",
            html: `<p>Hello ${normalizedFullName || normalizedUsername || "Player"}, your code is ${otpCode}</p>`,
          }),
        });
        if (!emailResponse.ok) {
          const emailPayload = await emailResponse.json().catch(() => ({}));
          console.error("Registration verification email failed:", emailPayload?.error || "Unknown error");
        }
      } catch (e) {
        console.error("Email failed", e);
      }

      // Prevent access to protected pages before verification is completed.
      try {
        await signOut(auth);
      } catch (e) {
        console.error("Auto sign-out after registration failed", e);
      }
      router.push(`/verify?email=${encodeURIComponent(normalizedEmail)}`);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-[460px]">
      {/* Heading */}
      <div className="mb-6 px-1">
        <h1 className="text-4xl font-black italic uppercase tracking-tighter leading-none">
          Create <span className="text-[#fc7952]">Account</span>
        </h1>
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-500 mt-2">
          Join the Flyovahelp Arena
        </p>
      </div>

      <div className="bg-[#1e293b] border border-white/5 rounded-3xl p-7 shadow-2xl shadow-black/50 space-y-6">
        {/* Referral banner */}
        {referralCode && (
          <div className="flex items-center gap-3 bg-[#fc7952]/10 border border-[#fc7952]/20 rounded-2xl px-4 py-3">
            <UserCheck size={16} className="text-[#fc7952] shrink-0" />
            <span className="text-xs font-black text-[#fc7952] uppercase tracking-wide">
              {!referrerName
                ? "Identifying referrer…"
                : resolvedReferrerUid
                  ? `Referred by: ${referrerName}`
                  : referrerName}
            </span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2.5 bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-2xl text-xs font-bold">
            <AlertCircle size={14} className="shrink-0" /> {error}
          </div>
        )}

        <form onSubmit={handleRegister} className="space-y-5">
          {/* Personal */}
          <div className="space-y-3">
            <SectionLabel>Personal Info</SectionLabel>
            <div className="relative">
              <User size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
              <input
                type="text" placeholder="Full Name" required
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                className="w-full bg-[#0f172a] border border-white/5 focus:border-[#613de6]/60 rounded-2xl pl-11 pr-4 py-3.5 text-sm font-bold text-white placeholder:text-gray-600 outline-none transition-colors"
              />
            </div>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[11px] font-black text-gray-500 pointer-events-none">@</span>
              <input
                type="text" placeholder="Username" required
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                className="w-full bg-[#0f172a] border border-white/5 focus:border-[#613de6]/60 rounded-2xl pl-11 pr-4 py-3.5 text-sm font-bold text-white placeholder:text-gray-600 outline-none transition-colors"
              />
            </div>
          </div>

          {/* Contact */}
          <div className="space-y-3">
            <SectionLabel>Contact</SectionLabel>
            <div className="relative">
              <Mail size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
              <input
                type="email" placeholder="Email Address" required
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full bg-[#0f172a] border border-white/5 focus:border-[#613de6]/60 rounded-2xl pl-11 pr-4 py-3.5 text-sm font-bold text-white placeholder:text-gray-600 outline-none transition-colors"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg pointer-events-none leading-none">{selectedCountry.flag}</span>
                <select
                  className="w-full bg-[#0f172a] border border-white/5 focus:border-[#613de6]/60 rounded-2xl pl-11 pr-4 py-3.5 text-xs font-bold text-white outline-none transition-colors appearance-none cursor-pointer"
                  onChange={handleCountryChange}
                  value={selectedCountry.name}
                >
                  {countries.map((c, i) => (
                    <option key={i} value={c.name} className="bg-[#1e293b]">{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-gray-500 border-r border-gray-700 pr-2 pointer-events-none">
                  {selectedCountry.code}
                </span>
                <input
                  type="tel" placeholder="Mobile" required
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full bg-[#0f172a] border border-white/5 focus:border-[#613de6]/60 rounded-2xl pl-14 pr-4 py-3.5 text-sm font-bold text-white placeholder:text-gray-600 outline-none transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Security */}
          <div className="space-y-3">
            <SectionLabel>Security</SectionLabel>
            <div className="relative">
              <Calendar size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
              <input
                type="date" required
                onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
                className="w-full bg-[#0f172a] border border-white/5 focus:border-[#613de6]/60 rounded-2xl pl-11 pr-4 py-3.5 text-sm font-bold text-white outline-none transition-colors"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[9px] font-black uppercase text-gray-600 pointer-events-none">
                Date of Birth
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="relative">
                <Lock size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                <input
                  type={showPw ? "text" : "password"} placeholder="Password" required
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full bg-[#0f172a] border border-white/5 focus:border-[#613de6]/60 rounded-2xl pl-11 pr-10 py-3.5 text-sm font-bold text-white placeholder:text-gray-600 outline-none transition-colors"
                />
                <button type="button" onClick={() => setShowPw((p) => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors">
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <div className="relative">
                <CheckCircle2 size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                <input
                  type={showConfirm ? "text" : "password"} placeholder="Confirm" required
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  className="w-full bg-[#0f172a] border border-white/5 focus:border-[#613de6]/60 rounded-2xl pl-11 pr-10 py-3.5 text-sm font-bold text-white placeholder:text-gray-600 outline-none transition-colors"
                />
                <button type="button" onClick={() => setShowConfirm((p) => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors">
                  {showConfirm ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
          </div>

          {/* Bonus toggle */}
          <button
            type="button"
            onClick={() => setClaimBonus(!claimBonus)}
            className={`w-full p-4 rounded-2xl border-2 transition-all flex items-center justify-between ${
              claimBonus ? "bg-[#613de6]/10 border-[#613de6]" : "bg-[#0f172a] border-white/5"
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${claimBonus ? "bg-[#613de6] text-white" : "bg-white/5 text-gray-500"}`}>
                <Gift size={18} />
              </div>
              <div className="text-left">
                <p className="text-[11px] font-black uppercase italic text-white leading-none">Claim $3.00 Sign-up Bonus</p>
                <p className="text-[9px] font-bold text-gray-500 mt-0.5 uppercase tracking-wide">Start betting for free</p>
              </div>
            </div>
            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all shrink-0 ${claimBonus ? "bg-[#fc7952] border-[#fc7952]" : "border-gray-700"}`}>
              {claimBonus && <CheckCircle2 size={12} className="text-white" />}
            </div>
          </button>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-[#613de6] hover:brightness-110 text-white py-4 rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-[#613de6]/25 active:scale-95 transition-all disabled:opacity-50"
          >
            {loading ? (
              <><Loader2 size={18} className="animate-spin" /> Creating Profile…</>
            ) : (
              <>Create Account <ArrowRight size={16} /></>
            )}
          </button>
        </form>
      </div>

      <p className="text-center mt-6 text-xs font-bold text-gray-500">
        Already a player?{" "}
        <Link href="/login" className="text-[#fc7952] font-black hover:brightness-110 transition-colors">
          Sign In
        </Link>
      </p>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <div className="min-h-screen bg-[#0f172a] text-white flex flex-col">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none select-none overflow-hidden">
        <div className="absolute -top-32 -right-32 w-[500px] h-[500px] bg-[#613de6] rounded-full opacity-[0.11] blur-[110px]" />
        <div className="absolute -bottom-40 -left-20 w-[400px] h-[400px] bg-[#fc7952] rounded-full opacity-[0.08] blur-[110px]" />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[22vw] font-black italic uppercase tracking-tighter text-white/[0.022] whitespace-nowrap leading-none">
            FLYOVAHELP
          </span>
        </div>
      </div>

      <div className="relative z-10 flex-1 flex flex-col items-center px-5 py-12">
        <Link href="/" className="mb-8">
          <Image src="/logo.svg" alt="Flyovahelp" width={130} height={34} />
        </Link>

        <Suspense
          fallback={
            <div className="flex items-center justify-center h-40">
              <Loader2 size={24} className="animate-spin text-[#613de6]" />
            </div>
          }
        >
          <RegisterForm />
        </Suspense>
      </div>

      <div className="relative z-10 pb-6 text-center">
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-700">
          Play Responsibly · 18+ Only
        </p>
      </div>
    </div>
  );
}
