"use client";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  updateDoc, 
  getDoc,
  serverTimestamp 
} from "firebase/firestore";
import { 
  ChevronRight, 
  Check, 
  X, 
  Eye, 
  Shield, 
  Globe, 
  Search, 
  Mail, 
  ShieldCheck, 
  Ban, 
  Clock,
  UserCheck,
  Wallet,
  ArrowRight
} from "lucide-react";

export default function AdminAgentManagement() {
  const [activeTab, setActiveTab] = useState("pending");
  const [agents, setAgents] = useState([]);
  const [filteredAgents, setFilteredAgents] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    setLoading(true);
    const q = query(
      collection(db, "agents"),
      where("application_status", "==", activeTab)
    );

    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAgents(docs);
      setFilteredAgents(docs);
      setLoading(false);
    });

    return () => unsub();
  }, [activeTab]);

  useEffect(() => {
    const results = agents.filter(a => 
      a.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.email?.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredAgents(results);
  }, [searchTerm, agents]);

  const updateStatus = async (agentId, newStatus) => {
    if (!confirm(`Are you sure you want to ${newStatus} this application?`)) return;

    try {
      const agentRef = doc(db, "agents", agentId);
      const userRef = doc(db, "users", agentId);

      // Initialize mandatory fields for approved agents
      const approvalData = newStatus === "approved" ? {
        application_status: "approved",
        reviewed_at: serverTimestamp(),
        active: true,
        agent_balance: 0,        // Separate wallet balance for agents
        deposit_rate: 0,        // Rate set by agent for deposits
        withdrawal_rate: 0,     // Rate set by agent for withdrawals
        total_trades: 0
      } : {
        application_status: newStatus,
        reviewed_at: serverTimestamp(),
        rejected_at: newStatus === "rejected" ? serverTimestamp() : null,
        active: false
      };

      await updateDoc(agentRef, approvalData);

      await updateDoc(userRef, {
        isAgent: newStatus === "approved",
        agentStatus: newStatus,
        agentBalance: newStatus === "approved" ? 0 : null
      });

      setSelectedAgent(null);
    } catch (error) {
      alert("Error: " + error.message);
    }
  };

  const toggleBan = async (agentId, currentBanStatus) => {
    const action = currentBanStatus ? "Unban" : "Ban";
    if (!confirm(`Are you sure you want to ${action} this agent?`)) return;

    try {
      await updateDoc(doc(db, "agents", agentId), {
        banned: !currentBanStatus,
        active: !!currentBanStatus 
      });
      await updateDoc(doc(db, "users", agentId), {
        banned: !currentBanStatus
      });
    } catch (error) {
      alert("Error updating ban status");
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-3xl font-black italic uppercase tracking-tighter text-slate-800">Agent Network</h1>
          <p className="text-slate-400 font-bold text-[10px] uppercase tracking-widest">Global Liquidity Control</p>
        </div>

        <div className="flex bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm w-full md:w-auto">
          <TabButton active={activeTab === "pending"} onClick={() => { setActiveTab("pending"); setSelectedAgent(null); }} icon={Clock} label="Applications" count={activeTab === "pending" ? agents.length : null} />
          <TabButton active={activeTab === "approved"} onClick={() => { setActiveTab("approved"); setSelectedAgent(null); }} icon={ShieldCheck} label="Verified Agents" count={activeTab === "approved" ? agents.length : null} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 space-y-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input type="text" placeholder="Search..." className="w-full bg-white border border-slate-200 p-4 pl-12 rounded-2xl text-[11px] font-bold uppercase outline-none focus:border-[#613de6] shadow-sm" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>

          <div className="space-y-2 overflow-y-auto max-h-[600px] pr-2 custom-scrollbar">
            {loading ? [1,2,3].map(i => <div key={i} className="h-24 bg-white rounded-[2rem] border border-slate-100 animate-pulse" />) : filteredAgents.map((agent) => (
                <div key={agent.id} onClick={() => setSelectedAgent(agent)} className={`p-5 rounded-[2rem] border-2 cursor-pointer transition-all flex items-center justify-between group ${selectedAgent?.id === agent.id ? "border-[#613de6] bg-[#613de6]/5 shadow-lg" : "border-slate-100 bg-white hover:border-slate-200"}`}>
                    <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black italic text-sm ${agent.banned ? 'bg-rose-100 text-rose-500' : 'bg-slate-100 text-[#613de6]'}`}>
                            {agent.full_name?.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <h3 className="font-black uppercase italic text-xs text-slate-800">{agent.full_name}</h3>
                            <span className="text-[9px] text-slate-400 font-bold uppercase">{agent.country}</span>
                        </div>
                    </div>
                    <ChevronRight size={16} className={selectedAgent?.id === agent.id ? "text-[#613de6]" : "text-slate-300"} />
                </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-8">
          {selectedAgent ? (
              <div className="bg-white rounded-[3rem] border border-slate-200 shadow-sm overflow-hidden animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="p-10 border-b border-slate-50 bg-slate-50/30">
                    <div className="flex flex-col md:flex-row justify-between items-start gap-8">
                        <div className="space-y-4">
                            <h2 className="text-4xl font-black italic uppercase tracking-tighter text-slate-800">{selectedAgent.full_name}</h2>
                            <div className="flex flex-wrap gap-4">
                                <InfoBadge icon={Globe} label={selectedAgent.country} />
                                <InfoBadge icon={Mail} label={selectedAgent.email} />
                            </div>
                        </div>
                        <div className="flex gap-3 w-full md:w-auto">
                            {activeTab === "pending" ? (
                                <>
                                    <button onClick={() => updateStatus(selectedAgent.id, "rejected")} className="flex-1 bg-slate-100 px-6 py-4 rounded-2xl font-black uppercase text-[11px]">Reject</button>
                                    <button onClick={() => updateStatus(selectedAgent.id, "approved")} className="flex-1 bg-[#613de6] text-white px-8 py-4 rounded-2xl font-black uppercase text-[11px] shadow-lg">Approve Agent</button>
                                </>
                            ) : (
                                <button onClick={() => toggleBan(selectedAgent.id, selectedAgent.banned)} className={`flex-1 px-8 py-4 rounded-2xl font-black uppercase text-[11px] flex items-center justify-center gap-2 transition-all shadow-lg ${selectedAgent.banned ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}>
                                    <Ban size={14}/> {selectedAgent.banned ? "Unban Agent" : "Restrict Agent"}
                                </button>
                            )}
                        </div>
                    </div>
                  </div>

                  <div className="p-10 space-y-10">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                          <StatBox label="Business Balance" value={`$${selectedAgent.agent_balance || 0}`} color="text-[#613de6]" />
                          <StatBox label="Deposit Rate" value={`${selectedAgent.deposit_rate || 0}`} sub="per 1 USD" />
                          <StatBox label="Withdraw Rate" value={`${selectedAgent.withdrawal_rate || 0}`} sub="per 1 USD" />
                          <StatBox label="Status" value={selectedAgent.banned ? 'Banned' : 'Active'} color={selectedAgent.banned ? 'text-rose-500' : 'text-emerald-500'} />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          <DocumentCard label="Passport" url={selectedAgent.passport_photo} />
                          <DocumentCard label="Identity Card" url={selectedAgent.identity_card} />
                      </div>
                  </div>
              </div>
          ) : (
              <div className="h-full min-h-[600px] bg-slate-50/50 border-2 border-dashed border-slate-100 rounded-[3.5rem] flex flex-col items-center justify-center p-12 text-center text-slate-300">
                  <Shield size={32} className="mb-4" />
                  <p className="text-[10px] font-black uppercase tracking-widest">Select an agent to manage</p>
              </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Helper components (TabButton, InfoBadge, StatBox, DocumentCard) remain as provided in original code.
function TabButton({ active, onClick, icon: Icon, label, count }) {
    return (
        <button onClick={onClick} className={`px-6 py-3.5 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-2 ${active ? "bg-[#613de6] text-white" : "text-slate-400"}`}>
            <Icon size={14} /> {label} {count !== null && <span className="ml-1 opacity-60">({count})</span>}
        </button>
    );
}

function InfoBadge({ icon: Icon, label }) {
    return (
        <div className="flex items-center gap-2 bg-white border border-slate-100 px-3 py-1.5 rounded-full shadow-sm">
            <Icon size={12} className="text-[#613de6]" />
            <span className="text-[10px] font-black uppercase text-slate-600">{label}</span>
        </div>
    );
}

function StatBox({ label, value, sub, color = "text-slate-800" }) {
    return (
        <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100">
            <p className="text-[9px] font-black uppercase text-slate-400 mb-1">{label}</p>
            <p className={`text-lg font-black italic leading-none ${color}`}>{value}</p>
            {sub && <p className="text-[8px] font-bold text-slate-400 uppercase mt-1">{sub}</p>}
        </div>
    );
}

function DocumentCard({ label, url }) {
    return (
        <div className="space-y-3">
            <p className="text-[9px] font-black uppercase text-slate-400 ml-1">{label}</p>
            <div className="h-56 bg-slate-100 rounded-[2rem] overflow-hidden border border-slate-100">
                {url ? <img src={url} className="w-full h-full object-cover" /> : <div className="h-full flex items-center justify-center text-slate-300 font-black uppercase text-[8px]">No Document</div>}
            </div>
        </div>
    );
}