"use client";
import { useState } from "react";
import { auth, db } from "@/lib/firebase";
import { doc, writeBatch, serverTimestamp } from "firebase/firestore";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { Loader2, CheckCircle, AlertTriangle } from "lucide-react";
import usersData from "@/uploaded/users.json"; // Path to your uploaded JSON

export default function MigrationPage() {
  const [status, setStatus] = useState("idle");
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState([]);

  const startMigration = async () => {
    if (!confirm("Are you sure? This will create users in Firebase Auth and Firestore.")) return;
    
    setStatus("migrating");
    const batch = writeBatch(db);
    let count = 0;

    for (const oldUser of usersData) {
      try {
        // 1. Create the User in Firebase Authentication
        // NOTE: Firebase Auth requires a password of at least 6 characters.
        // If the old MySQL passwords are hashed, they won't work. 
        // We will set a temporary password: "ChangeMe123!" or use their email.
        const userCredential = await createUserWithEmailAndPassword(
          auth, 
          oldUser.email, 
          "ChangeMe123!" // Temporary password
        );

        const uid = userCredential.user.uid;

        // 2. Prepare the Firestore Document
        const userRef = doc(db, "users", uid);
        
        const newUserData = {
          uid: uid,
          email: oldUser.email,
          username: oldUser.username,
          fullName: oldUser.full_name,
          country: oldUser.country || "Nigeria",
          main: parseFloat(oldUser.balance || 0), // Mapping 'balance' to 'main'
          gameBalance: parseFloat(oldUser.game_balance || 0),
          referralBonus: parseFloat(oldUser.referral_bonus_balance || 0),
          mysql_id: oldUser.id,
          createdAt: new Date(oldUser.created_at),
          role: "user",
          status: "active",
          pin: "1234", // Default PIN for new system
          lastActivity: serverTimestamp()
        };

        batch.set(userRef, newUserData);
        count++;
        setProgress(Math.round((count / usersData.length) * 100));
        setLogs(prev => [`Migrated: ${oldUser.email}`, ...prev]);

        // Firebase batches have a limit of 500 operations. 
        // We commit every 400 to be safe.
        if (count % 400 === 0) {
          await batch.commit();
        }

      } catch (err) {
        setLogs(prev => [`Error on ${oldUser.email}: ${err.message}`, ...prev]);
        console.error(err);
      }
    }

    await batch.commit();
    setStatus("completed");
  };

  return (
    <div className="p-10 max-w-2xl mx-auto space-y-6">
      <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-xl">
        <h1 className="text-2xl font-black italic uppercase text-slate-800">Migration Engine</h1>
        <p className="text-xs font-bold text-slate-400 uppercase mb-6">MySQL to Firebase Auth & Firestore</p>

        {status === "idle" && (
          <button 
            onClick={startMigration}
            className="w-full bg-[#613de6] py-4 rounded-2xl font-black text-white uppercase italic hover:scale-105 transition-all"
          >
            Start Migration ({usersData.length} Users)
          </button>
        )}

        {status === "migrating" && (
          <div className="space-y-4">
            <div className="w-full bg-slate-100 h-4 rounded-full overflow-hidden">
              <div className="bg-[#613de6] h-full transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-center font-black text-slate-600">{progress}% Complete</p>
            <Loader2 className="animate-spin mx-auto text-[#613de6]" />
          </div>
        )}

        {status === "completed" && (
          <div className="text-center space-y-4">
             <CheckCircle className="mx-auto text-emerald-500" size={48} />
             <p className="font-black text-slate-800 uppercase">Migration Successful</p>
          </div>
        )}
      </div>

      <div className="bg-slate-900 p-6 rounded-3xl h-64 overflow-y-auto font-mono text-[10px] text-emerald-400">
        <p className="">{">"} Migration Logs System Initialized...</p>
        {logs.map((log, i) => <p key={i}>{">"} {log}</p>)}
      </div>
    </div>
  );
}