"use client";
import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { Loader2, Search, Copy, CheckCircle, Users } from "lucide-react";

const formatJoinedDate = (timestamp) => {
  if (!timestamp?.toDate) return "N/A";
  return timestamp.toDate().toLocaleDateString();
};

const formatMoney = (value) => `$${Number(value || 0).toFixed(2)}`;

const COLUMNS = [
  { key: "username", label: "Username" },
  { key: "fullName", label: "Full Name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "country", label: "Country" },
  { key: "wallet", label: "Wallet" },
  { key: "pin", label: "PIN" },
  { key: "status", label: "Status" },
  { key: "isban", label: "Banned" },
  { key: "joined", label: "Joined" },
];

export default function AdminContacts() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "users"), orderBy("username", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const rows = useMemo(() => {
    return users.map((u) => ({
      id: u.id,
      username: u.username || "",
      fullName: u.fullName || "",
      email: u.email || "",
      phone: u.phone || "",
      country: u.country || "",
      wallet: formatMoney(u.wallet),
      pin: u.pin || "",
      status: u.isban ? "Banned" : (u.status || "active"),
      isban: u.isban ? "Yes" : "No",
      joined: formatJoinedDate(u.createdAt),
    }));
  }, [users]);

  const filteredRows = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) =>
      [r.username, r.fullName, r.email, r.phone, r.country].some((v) =>
        String(v).toLowerCase().includes(term)
      )
    );
  }, [rows, searchTerm]);

  const handleCopy = async () => {
    const header = COLUMNS.map((c) => c.label).join("\t");
    const lines = filteredRows.map((r) => COLUMNS.map((c) => r[c.key] ?? "").join("\t"));
    const text = [header, ...lines].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      alert("Could not copy automatically — please select the table manually.");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-40">
        <Loader2 className="animate-spin text-[#613de6]" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black italic uppercase text-white tracking-tighter">Contact List</h1>
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mt-1">
            {filteredRows.length} Users
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search name, email, phone..."
              className="bg-[#0f172a] border border-white/5 rounded-2xl pl-11 pr-4 py-3 text-xs font-bold text-white outline-none focus:border-[#613de6]/50 w-64"
            />
          </div>
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 bg-[#613de6] px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white active:scale-95 transition-all"
          >
            {copied ? <CheckCircle size={14} /> : <Copy size={14} />}
            {copied ? "Copied" : "Copy List"}
          </button>
        </div>
      </div>

      <div className="bg-[#0f172a] border border-white/5 rounded-[2rem] overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-white/5">
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  className="px-5 py-4 text-[9px] font-black uppercase tracking-widest text-slate-500 whitespace-nowrap"
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} className="px-5 py-16 text-center text-slate-600">
                  <Users size={28} className="mx-auto mb-2" />
                  No users found.
                </td>
              </tr>
            ) : (
              filteredRows.map((r) => (
                <tr key={r.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                  {COLUMNS.map((c) => (
                    <td key={c.key} className="px-5 py-4 font-bold text-slate-300 whitespace-nowrap">
                      {r[c.key] || "—"}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
