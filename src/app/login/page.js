"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X } from "lucide-react";
// FIREBASE IMPORTS
import { auth, db } from "@/lib/firebase";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, updateDoc, getDoc, serverTimestamp } from "firebase/firestore";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: "", 
    password: "",
  });

  // Helper to generate a unique 8-digit PIN
  const generateUserPin = () => {
    return Math.floor(10000000 + Math.random() * 90000000).toString();
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const userCredential = await signInWithEmailAndPassword(auth, formData.email, formData.password);
      const userRef = doc(db, "users", userCredential.user.uid);
      
      // Fetch user data to check for existing PIN and Role
      const userSnap = await getDoc(userRef);
      const userData = userSnap.data();
      
      let updateData = {
        status: "online",
        lastSeen: serverTimestamp()
      };

      // logic: If user doesn't have a PIN, assign one now
      if (userSnap.exists() && !userData?.pin) {
        updateData.pin = generateUserPin();
      }

      await updateDoc(userRef, updateData);

      // REDIRECT LOGIC: Check for admin role
      if (userData?.role === "admin") {
        router.push("/admin");
      } else {
        router.push("/dashboard");
      }

    } catch (err) {
      setError("Invalid email or password.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-white flex flex-col p-6">
      <div className="flex justify-end items-center mb-10">
        <button onClick={() => router.push('/')} className="text-gray-500 hover:text-white">
          <X size={24} />
        </button>
      </div>

      <div className="flex-1 flex flex-col max-w-md mx-auto w-full">
        {error && <p className="bg-red-500/10 border border-red-500/50 text-red-500 p-3 rounded-xl text-xs font-bold mb-4">{error}</p>}
        
        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-1">
             <input 
                type="email"
                placeholder="Email Address"
                required
                className="w-full bg-[#1e293b] border-2 border-transparent focus:border-[#613de6] p-4 rounded-xl outline-none transition-all font-bold text-white placeholder:text-gray-600"
                onChange={(e) => setFormData({...formData, email: e.target.value})}
              />
          </div>

          <div className="space-y-1">
              <input 
                type="password"
                placeholder="Password"
                required
                className="w-full bg-[#1e293b] border-2 border-transparent focus:border-[#613de6] p-4 rounded-xl outline-none transition-all font-bold text-white placeholder:text-gray-600"
                onChange={(e) => setFormData({...formData, password: e.target.value})}
              />
          </div>

          <button 
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-[#613de6] hover:bg-[#724fff] text-white rounded-xl font-black transition-all active:scale-[0.98] shadow-lg shadow-[#613de6]/20 disabled:opacity-50"
          >
            {loading ? "Authenticating..." : "Login"}
          </button>
        </form>

        <div className="mt-8 flex justify-between px-2">
          <Link href="/forgot-password" text-size={14} className="text-[#fc7952] text-xs font-bold hover:brightness-110">
            Forgot Password?
          </Link>
          <Link href="/register" className="text-[#fc7952] text-xs font-bold hover:brightness-110">
            Create New Account
          </Link>
        </div>
      </div>
    </div>
  );
}