"use client";
import { useState, useEffect } from "react";
import { auth, db } from "@/lib/firebase";
import { collection, query, where, getDocs, addDoc, serverTimestamp, doc, getDoc } from "firebase/firestore";
import { Landmark, Globe, Star, ArrowRight, Loader2, ShieldCheck } from "lucide-react";
import Header from "@/components/Header";

export default function AgentWithdraw() {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userCountry, setUserCountry] = useState("");
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    async function fetchAgents() {
      const user = auth.currentUser;
      if (!user) return;

      // 1. Get User's Country
      const userSnap = await getDoc(doc(db, "users", user.uid));
      const country = userSnap.data()?.country || "Nigeria";
      setUserCountry(country);

      // 2. Fetch Approved, Unbanned Agents in that country
      const q = query(
        collection(db, "agents"),
        where("application_status", "==", "approved"),
        where("country", "==", country),
        where("banned", "==", false)
      );

      const querySnapshot = await getDocs(q);
      const agentList = querySnapshot.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(a => a.id !== user.uid); // Exclude self
      
      setAgents(agentList);
      setLoading(false);
    }
    fetchAgents();
  }, []);

  const initiateWithdrawal = async (agent) => {
    const amount = prompt(`Enter USD amount to withdraw via ${agent.full_name}:`);
    if (!amount || isNaN(amount)) return;

    setRequesting(true);
    try {
      await addDoc(collection(db, "trades"), {
        senderId: auth.currentUser.uid,
        agentId: agent.id,
        amount: parseFloat(amount),
        rate: agent.withdrawal_rate || 0,
        status: "pending", // Waiting for agent to accept
        type: "withdrawal",
        createdAt: serverTimestamp(),
      });
      alert("Withdrawal request sent to agent!");
    } catch (error) {
      alert("Error initiating trade.");
    } finally {
      setRequesting(false);
    }
  };

  if (loading) return <div className="min-h-screen bg-[#0f172a] flex items-center justify-center"><Loader2 className="animate-spin text-[#613de6]" /></div>;

  return (
    <div className="min-h-screen bg-[#0f172a] text-white pb-20">
      <Header />
      <main className="pt-28 px-6 max-w-2xl mx-auto">
        <header className="mb-10 flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-black italic uppercase tracking-tighter">Withdraw via Agent</h1>
            <p className="text-[10px] font-black text-[#613de6] uppercase tracking-widest flex items-center gap-1">
              <Globe size={12}/> Trusted Agents in {userCountry}
            </p>
          </div>
          <div className="bg-[#1e293b] p-3 rounded-2xl border border-white/5">
            <ShieldCheck className="text-green-500" />
          </div>
        </header>

        <div className="grid gap-4">
          {agents.length === 0 ? (
            <div className="bg-[#1e293b] p-10 rounded-[2.5rem] border border-dashed border-white/10 text-center">
              <p className="text-gray-500 font-bold uppercase text-xs">No agents available in your country yet.</p>
            </div>
          ) : (
            agents.map((agent) => (
              <div key={agent.id} className="bg-[#1e293b] p-6 rounded-[2rem] border border-white/5 flex items-center justify-between group hover:border-[#613de6]/50 transition-all">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-[#0f172a] rounded-2xl flex items-center justify-center font-black italic text-[#613de6] border border-white/5">
                    {agent.full_name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-black uppercase italic text-sm">{agent.full_name}</h3>
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-tighter">
                      Rate: <span className="text-[#fc7952]">{agent.withdrawal_rate || 0} / USD</span>
                    </p>
                  </div>
                </div>
                
                <button 
                  onClick={() => initiateWithdrawal(agent)}
                  className="bg-[#613de6] p-4 rounded-2xl shadow-lg shadow-[#613de6]/20 group-hover:scale-110 transition-transform"
                >
                  <ArrowRight size={20} />
                </button>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}