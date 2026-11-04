"use client";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { agentBankMatches, sameAccountName } from "@/lib/agentBank";
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  updateDoc
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
  ArrowRight,
  Cake,
  Landmark,
  Pencil,
  Trash2
} from "lucide-react";
import { authFetch } from "@/lib/authFetch";

export default function AdminAgentManagement() {
  const [activeTab, setActiveTab] = useState("pending");
  const [agents, setAgents] = useState([]);
  const [filteredAgents, setFilteredAgents] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [deciding, setDeciding] = useState(false);
  // The edit form's fields while editing the selected agent (null when not editing).
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const formatJoinedDate = (agent) => {
    const candidates = [agent?.createdAt, agent?.joinedAt, agent?.approvedAt, agent?.reviewed_at];
    for (const ts of candidates) {
      if (ts?.toDate) return ts.toDate().toLocaleDateString();
      if (typeof ts === "string" || typeof ts === "number") {
        const d = new Date(ts);
        if (!Number.isNaN(d.getTime())) return d.toLocaleDateString();
      }
    }
    return "N/A";
  };

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
      // The open agent shows its saved changes, and closes once it's deleted.
      setSelectedAgent((cur) => (cur ? docs.find((d) => d.id === cur.id) || null : null));
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

  // Approving takes the $50 application fee if the application didn't pay it (applied
  // before the fee); rejecting refunds it. The server (/api/agent decide) does both and
  // emails the applicant.
  const updateStatus = async (agentId, newStatus) => {
    if (!confirm(`Are you sure you want to ${newStatus === "approved" ? "approve" : "reject"} this application?`)) return;

    setDeciding(true);
    try {
      const res = await authFetch("/api/agent", { method: "POST", body: { action: "decide", agentId, decision: newStatus } });
      if (res?.error) throw new Error(res.error);
      if (newStatus === "rejected" && res?.refunded > 0) alert(`Application rejected. $${Number(res.refunded).toFixed(2)} fee refunded to the applicant's wallet.`);
      setSelectedAgent(null);
    } catch (error) {
      alert("Error: " + error.message);
    } finally {
      setDeciding(false);
    }
  };

  const selectAgent = (agent) => {
    setSelectedAgent(agent);
    setDraft(null);
  };

  const startEdit = (a) => setDraft({
    fullName: a.full_name || "", email: a.email || "", phone: a.phone_number || "", country: a.country || "", age: a.age || "",
    deposit_rate: String(a.deposit_rate ?? 0), withdrawal_rate: String(a.withdrawal_rate ?? 0),
    bankName: a.bankName || "", accountName: a.accountName || "", accountNumber: a.accountNumber || "",
  });

  // /api/agent adminEdit. The bank account may be left out of the agent's name; they then can't take new trades.
  const saveEdit = async () => {
    if (saving) return;
    if (draft.accountName && !sameAccountName(draft.fullName, draft.accountName)
      && !confirm(`The account name (${draft.accountName}) isn't the agent's name (${draft.fullName}), so they won't be able to take new trades. Save anyway?`)) return;
    setSaving(true);
    try {
      const res = await authFetch("/api/agent", { method: "POST", body: { action: "adminEdit", agentId: selectedAgent.id, ...draft } });
      if (res?.error) throw new Error(res.error);
      setDraft(null);
    } catch (error) {
      alert("Error: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  // /api/agent adminDelete: refused while a trade with them is open; their agent balance goes to their main wallet.
  const deleteAgent = async (a) => {
    const balance = Number(a.agent_balance) || 0;
    if (!confirm(`Delete ${a.full_name || "this agent"}? They stop being an agent and can apply again.${balance > 0 ? ` Their $${balance.toFixed(2)} agent balance goes to their main wallet.` : ""}`)) return;
    setDeleting(true);
    try {
      const res = await authFetch("/api/agent", { method: "POST", body: { action: "adminDelete", agentId: a.id } });
      if (res?.error) throw new Error(res.error);
      setSelectedAgent(null);
      setDraft(null);
      const back = [res.returned > 0 && `$${Number(res.returned).toFixed(2)} agent balance`, res.refunded > 0 && `$${Number(res.refunded).toFixed(2)} application fee`].filter(Boolean);
      alert(`Agent deleted.${back.length ? ` ${back.join(" and ")} moved to their main wallet.` : ""}`);
    } catch (error) {
      alert("Error: " + error.message);
    } finally {
      setDeleting(false);
    }
  };

  // UPDATED: Now toggles 'active' status between true/false when banning
  const toggleBan = async (agentId, currentBanStatus) => {
    const action = currentBanStatus ? "Unban" : "Ban";
    if (!confirm(`Are you sure you want to ${action} this agent?`)) return;

    try {
      // In agents collection: banned: true means active: false
      await updateDoc(doc(db, "agents", agentId), {
        banned: !currentBanStatus,
        active: !!currentBanStatus // If unbanning, set active to true. If banning, set active to false.
      });

      // Synchronize with users collection
      await updateDoc(doc(db, "users", agentId), {
        banned: !currentBanStatus
      });
    } catch (error) {
      alert("Error updating ban status: " + error.message);
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
          <TabButton active={activeTab === "pending"} onClick={() => { setActiveTab("pending"); selectAgent(null); }} icon={Clock} label="Applications" count={activeTab === "pending" ? agents.length : null} />
          <TabButton active={activeTab === "approved"} onClick={() => { setActiveTab("approved"); selectAgent(null); }} icon={ShieldCheck} label="Verified Agents" count={activeTab === "approved" ? agents.length : null} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 space-y-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input type="text" placeholder="Search..." className="w-full bg-white border border-slate-200 p-4 pl-12 rounded-2xl text-[11px] font-bold uppercase outline-none focus:border-[#2457D6] shadow-sm" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>

          <div className="space-y-2 overflow-y-auto max-h-[600px] pr-2 custom-scrollbar">
            {loading ? [1,2,3].map(i => <div key={i} className="h-24 bg-white rounded-[2rem] border border-slate-100 animate-pulse" />) : filteredAgents.map((agent) => (
                <div key={agent.id} onClick={() => selectAgent(agent)} className={`p-5 rounded-[2rem] border-2 cursor-pointer transition-all flex items-center justify-between group ${selectedAgent?.id === agent.id ? "border-[#2457D6] bg-[#2457D6]/5 shadow-lg" : "border-slate-100 bg-white hover:border-slate-200"}`}>
                    <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black italic text-sm ${agent.banned ? 'bg-rose-100 text-rose-500' : 'bg-slate-100 text-[#2457D6]'}`}>
                            {agent.full_name?.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <h3 className="font-black uppercase italic text-xs text-slate-800">{agent.full_name}</h3>
                            <span className="text-[9px] text-slate-400 font-bold uppercase">{agent.country}</span>
                            {!agentBankMatches(agent) && <BankNameBadge />}
                            <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">
                              Joined: {formatJoinedDate(agent)}
                            </p>
                        </div>
                    </div>
                    <ChevronRight size={16} className={selectedAgent?.id === agent.id ? "text-[#2457D6]" : "text-slate-300"} />
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
                                <InfoBadge icon={Clock} label={`Joined: ${formatJoinedDate(selectedAgent)}`} />
                                <InfoBadge icon={Cake} label={`Age: ${selectedAgent.age || "N/A"}`} />
                            </div>
                        </div>
                        <div className="flex gap-3 w-full md:w-auto">
                            {activeTab === "pending" ? (
                                <>
                                    <button disabled={deciding} onClick={() => updateStatus(selectedAgent.id, "rejected")} className="flex-1 bg-slate-100 px-6 py-4 rounded-2xl font-black uppercase text-[11px] disabled:opacity-50">Reject</button>
                                    <button disabled={deciding} onClick={() => updateStatus(selectedAgent.id, "approved")} className="flex-1 bg-[#2457D6] text-white px-8 py-4 rounded-2xl font-black uppercase text-[11px] shadow-lg disabled:opacity-50">{deciding ? "Working..." : "Approve Agent"}</button>
                                </>
                            ) : (
                                <button onClick={() => toggleBan(selectedAgent.id, selectedAgent.banned)} className={`flex-1 px-8 py-4 rounded-2xl font-black uppercase text-[11px] flex items-center justify-center gap-2 transition-all shadow-lg ${selectedAgent.banned ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}>
                                    <Ban size={14}/> {selectedAgent.banned ? "Unban Agent" : "Ban Agent"}
                                </button>
                            )}
                        </div>
                    </div>
                    {!draft && (
                      <div className="flex flex-wrap gap-3 mt-6">
                        <button onClick={() => startEdit(selectedAgent)} className="px-5 py-3 rounded-2xl bg-white border border-slate-200 font-black uppercase text-[10px] text-slate-700 flex items-center gap-2 hover:border-[#2457D6]">
                          <Pencil size={13} /> Edit details
                        </button>
                        {activeTab === "approved" && (
                          <button disabled={deleting} onClick={() => deleteAgent(selectedAgent)} className="px-5 py-3 rounded-2xl bg-white border border-rose-200 font-black uppercase text-[10px] text-rose-600 flex items-center gap-2 hover:bg-rose-50 disabled:opacity-50">
                            <Trash2 size={13} /> {deleting ? "Deleting..." : "Delete agent"}
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {draft ? (
                    <EditForm draft={draft} setDraft={setDraft} saving={saving} onSave={saveEdit} onCancel={() => setDraft(null)} />
                  ) : (
                  <div className="p-10 space-y-10">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                          <StatBox label="Business Balance" value={`$${selectedAgent.agent_balance || 0}`} color="text-[#2457D6]" />
                          <StatBox label="Deposit Rate" value={`${selectedAgent.deposit_rate || 0}`} sub="per 1 USD" />
                          <StatBox label="Withdraw Rate" value={`${selectedAgent.withdrawal_rate || 0}`} sub="per 1 USD" />
                          <StatBox label="Status" value={selectedAgent.banned ? 'Banned' : 'Active'} color={selectedAgent.banned ? 'text-rose-500' : 'text-emerald-500'} />
                      </div>
                      <FeeBox agent={selectedAgent} />
                      {(selectedAgent.deposit_tiers?.length > 0 || selectedAgent.withdrawal_tiers?.length > 0) && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <StatBox label="Deposit rates by amount" value={tiersText(selectedAgent.deposit_tiers)} />
                              <StatBox label="Withdrawal rates by amount" value={tiersText(selectedAgent.withdrawal_tiers)} />
                          </div>
                      )}
                      <div className="space-y-4">
                          <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2"><Landmark size={14} className="text-[#2457D6]" /> Bank Details {!agentBankMatches(selectedAgent) && <BankNameBadge />}</p>
                          {!agentBankMatches(selectedAgent) && (
                              <p className="text-xs font-bold text-rose-600">
                                {selectedAgent.accountName
                                  ? `The account name isn't the agent's approved name (${selectedAgent.full_name || "none"}), so they can't take new trades.`
                                  : "No bank account in the agent's name yet, so they can't take new trades."}
                              </p>
                          )}
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                              <StatBox label="Bank Name" value={selectedAgent.bankName || "Not Provided"} />
                              <StatBox label="Account Name" value={selectedAgent.accountName || "Not Provided"} />
                              <StatBox label="Account Number" value={selectedAgent.accountNumber || "Not Provided"} />
                          </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          <DocumentCard label="Passport" url={selectedAgent.passport_photo} />
                          <DocumentCard label="Identity Card" url={selectedAgent.identity_card} />
                      </div>
                  </div>
                  )}
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

const EDIT_FIELDS = [
  ["fullName", "Full name (approved agent name)"], ["email", "Email"], ["phone", "Phone number"], ["country", "Country"], ["age", "Age"],
  ["deposit_rate", "Deposit rate (per 1 USD)"], ["withdrawal_rate", "Withdraw rate (per 1 USD)"],
  ["bankName", "Bank name"], ["accountName", "Account name"], ["accountNumber", "Account number"],
];

/** Admin edit of an agent's details (/api/agent adminEdit). Balances and rates by amount aren't edited here. */
function EditForm({ draft, setDraft, saving, onSave, onCancel }) {
    const mismatch = draft.accountName && !sameAccountName(draft.fullName, draft.accountName);
    return (
        <div className="p-10 space-y-6">
            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2"><Pencil size={14} className="text-[#2457D6]" /> Edit agent details</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {EDIT_FIELDS.map(([key, label]) => (
                    <label key={key} className="block">
                        <span className="text-[9px] font-black uppercase text-slate-400 ml-1">{label}</span>
                        <input
                            value={draft[key]}
                            inputMode={["deposit_rate", "withdrawal_rate", "age"].includes(key) ? "decimal" : undefined}
                            onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                            className="mt-1 w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl text-sm font-bold text-slate-800 outline-none focus:border-[#2457D6]"
                        />
                    </label>
                ))}
            </div>
            {mismatch && (
                <p className="text-xs font-bold text-rose-600">The account name isn&apos;t the agent&apos;s full name, so they won&apos;t be able to take new trades.</p>
            )}
            <div className="flex gap-3">
                <button onClick={onSave} disabled={saving} className="bg-[#2457D6] text-white px-8 py-4 rounded-2xl font-black uppercase text-[11px] shadow-lg disabled:opacity-50">{saving ? "Saving..." : "Save changes"}</button>
                <button onClick={onCancel} disabled={saving} className="bg-slate-100 px-6 py-4 rounded-2xl font-black uppercase text-[11px] disabled:opacity-50">Cancel</button>
            </div>
        </div>
    );
}

const tiersText = (tiers) =>
  Array.isArray(tiers) && tiers.length ? tiers.map((t) => `From $${t.min}: ${t.rate}`).join(" · ") : "Same rate for all amounts";

/** The $50 agent application fee (/api/agent): paid, refunded, or (older applications) due on approval. */
function FeeBox({ agent }) {
    const fee = Number(agent.applicationFee || 50).toFixed(2);
    const paidAt = agent.applicationFeePaidAt?.toDate ? agent.applicationFeePaidAt.toDate().toLocaleString() : null;
    const [label, color] = agent.applicationFeeRefunded
        ? [`$${fee} refunded`, "text-amber-600"]
        : paidAt
            ? [`$${fee} paid`, "text-emerald-600"]
            : ["Not paid", "text-rose-500"];
    const sub = agent.applicationFeeRefunded
        ? "Returned when the application was declined"
        : paidAt
            ? `Paid ${paidAt}`
            : "Applied before the fee: approving takes $50 from their wallet";
    return <StatBox label="Application Fee" value={label} sub={sub} color={color} />;
}

function TabButton({ active, onClick, icon: Icon, label, count }) {
    return (
        <button onClick={onClick} className={`px-6 py-3.5 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-2 ${active ? "bg-[#2457D6] text-white" : "text-slate-400"}`}>
            <Icon size={14} /> {label} {count !== null && <span className="ml-1 opacity-60">({count})</span>}
        </button>
    );
}

/** The agent's bank account isn't in their approved name (lib/agentBank): no new trades. */
function BankNameBadge() {
  return <span className="ml-2 inline-block px-2 py-0.5 rounded-full bg-rose-100 text-rose-600 text-[8px] font-black uppercase tracking-wider align-middle">Bank name mismatch</span>;
}

function InfoBadge({ icon: Icon, label }) {
    return (
        <div className="flex items-center gap-2 bg-white border border-slate-100 px-3 py-1.5 rounded-full shadow-sm">
            <Icon size={12} className="text-[#2457D6]" />
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
