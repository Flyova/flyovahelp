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
  const [activeTab, setActiveTab] = useState("pending"); // "pending" or "approved"
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

      await updateDoc(agentRef, {
        application_status: newStatus,
        reviewed_at: serverTimestamp(),
        rejected_at: newStatus === "rejected" ? serverTimestamp() : null,
        active: newStatus === "approved"
      });

      await updateDoc(userRef, {
        isAgent: newStatus === "approved",
        agentStatus: newStatus
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
      // Also sync to user profile for security
      await updateDoc(doc(db, "users", agentId), {
        banned: !currentBanStatus
      });
    } catch (error) {
      alert("Error updating ban status");
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-3xl font-black italic uppercase tracking-tighter text-slate-800">Agent Network</h1>
          <p className="text-slate-400 font-bold text-[10px] uppercase tracking-widest">Global Liquidity Control</p>
        </div>

        <div className="flex bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm w-full md:w-auto">
          <TabButton 
            active={activeTab === "pending"} 
            onClick={() => { setActiveTab("pending"); setSelectedAgent(null); }}
            icon={Clock} 
            label="Applications" 
            count={activeTab === "pending" ? agents.length : null}
          />
          <TabButton 
            active={activeTab === "approved"} 
            onClick={() => { setActiveTab("approved"); setSelectedAgent(null); }}
            icon={ShieldCheck} 
            label="Verified Agents" 
            count={activeTab === "approved" ? agents.length : null}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* List Sidebar */}
        <div className="lg:col-span-4 space-y-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
                type="text" 
                placeholder="Search by name or email..."
                className="w-full bg-white border border-slate-200 p-4 pl-12 rounded-2xl text-[11px] font-bold uppercase outline-none focus:border-[#613de6] shadow-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="space-y-2 overflow-y-auto max-h-[600px] pr-2 custom-scrollbar">
            {loading ? (
                [1,2,3].map(i => <div key={i} className="h-24 bg-white rounded-[2rem] border border-slate-100 animate-pulse" />)
            ) : filteredAgents.length === 0 ? (
                <div className="p-12 bg-white rounded-[2.5rem] border border-dashed border-slate-200 text-center">
                    <p className="text-[10px] font-black uppercase text-slate-400">No agents found</p>
                </div>
            ) : (
                filteredAgents.map((agent) => (
                    <div 
                        key={agent.id}
                        onClick={() => setSelectedAgent(agent)}
                        className={`p-5 rounded-[2rem] border-2 cursor-pointer transition-all flex items-center justify-between group ${
                            selectedAgent?.id === agent.id ? "border-[#613de6] bg-[#613de6]/5 shadow-lg" : "border-slate-100 bg-white hover:border-slate-200"
                        }`}
                    >
                        <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black italic text-sm ${agent.banned ? 'bg-rose-100 text-rose-500' : 'bg-slate-100 text-[#613de6]'}`}>
                                {agent.full_name?.charAt(0).toUpperCase()}
                            </div>
                            <div>
                                <h3 className="font-black uppercase italic text-xs text-slate-800">{agent.full_name}</h3>
                                <div className="flex items-center gap-2">
                                    <span className="text-[9px] text-slate-400 font-bold uppercase">{agent.country}</span>
                                    {agent.banned && <span className="text-[8px] bg-rose-500 text-white px-1.5 py-0.5 rounded font-black uppercase">Banned</span>}
                                </div>
                            </div>
                        </div>
                        <ChevronRight size={16} className={selectedAgent?.id === agent.id ? "text-[#613de6]" : "text-slate-300"} />
                    </div>
                ))
            )}
          </div>
        </div>

        {/* Details View */}
        <div className="lg:col-span-8">
          {selectedAgent ? (
              <div className="bg-white rounded-[3rem] border border-slate-200 shadow-sm overflow-hidden animate-in fade-in slide-in-from-right-4 duration-300">
                  {/* Profile Header */}
                  <div className="p-10 border-b border-slate-50 bg-slate-50/30">
                    <div className="flex flex-col md:flex-row justify-between items-start gap-8">
                        <div className="space-y-4">
                            <div className="flex items-center gap-3">
                                <span className="bg-[#613de6] text-white px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest">Agent Profile</span>
                                <span className="text-[9px] font-mono text-slate-400">UID: {selectedAgent.id}</span>
                            </div>
                            <h2 className="text-4xl font-black italic uppercase tracking-tighter text-slate-800 leading-none">
                                {selectedAgent.full_name}
                            </h2>
                            <div className="flex flex-wrap gap-4">
                                <InfoBadge icon={Globe} label={selectedAgent.country} />
                                <InfoBadge icon={Mail} label={selectedAgent.email} />
                                <InfoBadge icon={UserCheck} label={`Age: ${selectedAgent.age}`} />
                            </div>
                        </div>

                        <div className="flex gap-3 w-full md:w-auto">
                            {activeTab === "pending" ? (
                                <>
                                    <button onClick={() => updateStatus(selectedAgent.id, "rejected")} className="flex-1 bg-slate-100 text-slate-600 hover:bg-rose-50 hover:text-rose-600 px-6 py-4 rounded-2xl font-black uppercase text-[11px] transition-all">Reject</button>
                                    <button onClick={() => updateStatus(selectedAgent.id, "approved")} className="flex-1 bg-[#613de6] text-white px-8 py-4 rounded-2xl font-black uppercase text-[11px] shadow-lg shadow-[#613de6]/20 active:scale-95 transition-all">Approve Agent</button>
                                </>
                            ) : (
                                <button 
                                    onClick={() => toggleBan(selectedAgent.id, selectedAgent.banned)}
                                    className={`flex-1 px-8 py-4 rounded-2xl font-black uppercase text-[11px] flex items-center justify-center gap-2 transition-all shadow-lg ${selectedAgent.banned ? 'bg-emerald-500 text-white shadow-emerald-500/20' : 'bg-rose-500 text-white shadow-rose-500/20'}`}
                                >
                                    <Ban size={14}/> {selectedAgent.banned ? "Unban Agent" : "Restrict Agent"}
                                </button>
                            )}
                        </div>
                    </div>
                  </div>

                  <div className="p-10 space-y-10">
                      {/* Financial / Rate Stats */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                          <StatBox label="Wallet Status" value={selectedAgent.banned ? 'Locked' : 'Active'} color={selectedAgent.banned ? 'text-rose-500' : 'text-emerald-500'} />
                          <StatBox label="Exchange Rate" value={`${selectedAgent.exchange_rate || 0}`} sub="per 1 USD" />
                          <StatBox label="Withdraw Rate" value={`${selectedAgent.withdrawal_rate || 0}`} sub="per 1 USD" />
                          <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100">
                                <p className="text-[9px] font-black uppercase text-slate-400 mb-2">Liquidity</p>
                                <div className="flex items-center gap-1 text-[#613de6]">
                                    <Wallet size={12} />
                                    <p className="text-lg font-black italic leading-none">Ready</p>
                                </div>
                          </div>
                      </div>

                      {/* Documents Section */}
                      <div>
                        <div className="flex items-center gap-2 mb-6">
                            <Shield size={18} className="text-[#613de6]" />
                            <h3 className="font-black uppercase italic text-slate-700 tracking-tight">Verification Documents</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <DocumentCard label="Government Issued Passport" url={selectedAgent.passport_photo} />
                            <DocumentCard label="Identity Card / Driver's License" url={selectedAgent.identity_card} />
                        </div>
                      </div>
                  </div>
              </div>
          ) : (
              <div className="h-full min-h-[600px] bg-slate-50/50 border-2 border-dashed border-slate-100 rounded-[3.5rem] flex flex-col items-center justify-center p-12 text-center">
                  <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center shadow-sm mb-6">
                    <Shield size={32} className="text-slate-200" />
                  </div>
                  <h3 className="text-sm font-black uppercase italic text-slate-400 tracking-widest mb-2">Security Vault</h3>
                  <p className="text-[10px] font-bold text-slate-300 uppercase max-w-[200px]">Select an agent from the left to manage their permissions and documents</p>
              </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label, count }) {
    return (
        <button 
            onClick={onClick}
            className={`flex-1 md:flex-none px-6 py-3.5 rounded-xl text-[10px] font-black uppercase transition-all flex items-center justify-center gap-2 ${active ? "bg-[#613de6] text-white shadow-md shadow-[#613de6]/20" : "text-slate-400 hover:text-slate-600"}`}
        >
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
        <div className="space-y-3 group">
            <div className="flex justify-between items-end px-1">
                <p className="text-[9px] font-black uppercase text-slate-400">{label}</p>
                <a href={url} target="_blank" className="text-[9px] font-black text-[#613de6] flex items-center gap-1 hover:underline">
                    FULLSCREEN <ArrowRight size={10}/>
                </a>
            </div>
            <div className="h-56 bg-slate-100 rounded-[2rem] overflow-hidden border border-slate-100 relative shadow-inner">
                {url ? (
                    <>
                        <img src={url} className="w-full h-full object-cover opacity-90 group-hover:scale-105 transition-all duration-700" />
                        <div className="absolute inset-0 bg-[#613de6]/0 group-hover:bg-[#613de6]/10 transition-all pointer-events-none" />
                    </>
                ) : (
                    <div className="w-full h-full flex items-center justify-center flex-col gap-2">
                        <X size={20} className="text-slate-300" />
                        <span className="text-[8px] font-black text-slate-300 uppercase">No Document Provided</span>
                    </div>
                )}
            </div>
        </div>
    );
}