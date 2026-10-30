"use client";
import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase";
import { collection, doc, limit, onSnapshot, orderBy, query, updateDoc, where } from "firebase/firestore";
import { Ban, CheckCircle2, Flag, Globe, Loader2, Lock, Users } from "lucide-react";

// Admin → Chat Activity: reports (chat_reports), blocks (chat_blocks) and groups
// (conversations of type "group": who made them, when, how many members). Only
// what the conversations record says about a group; private chats and messages
// are never read here.

const TABS = [["reports", "Reports"], ["blocks", "Blocked"], ["groups", "Groups"]];
const ms = (ts) => (ts?.toMillis ? ts.toMillis() : 0);
const when = (ts) => (ts?.toDate ? ts.toDate().toLocaleString() : "-");

export default function AdminChatActivity() {
  const [tab, setTab] = useState("reports");
  const [reports, setReports] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loaded, setLoaded] = useState({});
  const [showResolved, setShowResolved] = useState(false);

  useEffect(() => {
    const done = (key) => () => setLoaded((l) => ({ ...l, [key]: true }));
    const unsubs = [
      onSnapshot(query(collection(db, "chat_reports"), orderBy("createdAt", "desc"), limit(300)), (snap) => {
        setReports(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        done("reports")();
      }, done("reports")),
      onSnapshot(query(collection(db, "chat_blocks"), orderBy("createdAt", "desc"), limit(500)), (snap) => {
        setBlocks(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        done("blocks")();
      }, done("blocks")),
      // Every group (no ordering in the query, so no extra index); newest first below.
      onSnapshot(query(collection(db, "conversations"), where("type", "==", "group")), (snap) => {
        setGroups(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => ms(b.createdAt) - ms(a.createdAt)));
        done("groups")();
      }, done("groups")),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  const openReports = useMemo(() => reports.filter((r) => r.status !== "resolved"), [reports]);
  const liveGroups = useMemo(() => groups.filter((g) => (g.participants || []).length > 0), [groups]);
  const members = useMemo(() => liveGroups.reduce((s, g) => s + (g.participants || []).length, 0), [liveGroups]);
  const shownReports = showResolved ? reports : openReports;

  const resolve = async (r, status) => {
    try {
      await updateDoc(doc(db, "chat_reports", r.id), { status });
    } catch (err) {
      alert("Couldn't update the report: " + err.message);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-6 md:p-12">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-5 bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100">
          <div className="p-4 bg-violet-100 text-violet-600 rounded-3xl">
            <Users size={32} />
          </div>
          <div>
            <h1 className="text-3xl font-black uppercase italic tracking-tighter">Chat Activity</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
              Reports, blocks and groups · private chats aren&apos;t shown
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Open reports" value={openReports.length} />
          <Stat label="Blocks" value={blocks.length} />
          <Stat label="Groups" value={liveGroups.length} />
          <Stat label="Group members" value={members} />
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          {TABS.map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-4 py-2 rounded-full text-[10px] font-black uppercase border transition-all ${tab === key ? "bg-slate-900 border-slate-900 text-white" : "bg-white border-slate-200 text-slate-500 hover:border-slate-400"}`}>
              {label}
            </button>
          ))}
          {tab === "reports" && (
            <label className="ml-auto flex items-center gap-2 text-[10px] font-black uppercase text-slate-500">
              <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} /> Show resolved
            </label>
          )}
        </div>

        <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
          {!loaded[tab] ? (
            <div className="flex justify-center py-20 text-slate-400"><Loader2 className="animate-spin" /></div>
          ) : tab === "reports" ? (
            shownReports.length === 0 ? <Empty text="No open reports." /> : (
              <div className="divide-y divide-slate-100">
                {shownReports.map((r) => (
                  <div key={r.id} className="p-5 flex flex-col md:flex-row md:items-center gap-3">
                    <span className="p-2 rounded-xl bg-rose-100 text-rose-600 self-start"><Flag size={14} /></span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black">@{r.reporter || "?"} reported @{r.reported || "?"}</p>
                      <p className="text-[11px] font-bold text-slate-500 mt-0.5">
                        {r.reason || "No reason"}{r.messageId ? " · about a message" : ""}{r.room ? " · in the Chatroom" : r.convoId ? " · in a chat" : ""}
                      </p>
                      <p className="text-[10px] font-bold text-slate-400 mt-0.5">{when(r.createdAt)}</p>
                    </div>
                    {r.status === "resolved" ? (
                      <button onClick={() => resolve(r, "open")} className="px-3 py-2 rounded-xl bg-slate-100 text-slate-600 text-[10px] font-black uppercase">Reopen</button>
                    ) : (
                      <button onClick={() => resolve(r, "resolved")} className="px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase inline-flex items-center gap-1 hover:bg-emerald-100">
                        <CheckCircle2 size={12} /> Resolve
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )
          ) : tab === "blocks" ? (
            blocks.length === 0 ? <Empty text="Nobody has blocked anyone." /> : (
              <div className="divide-y divide-slate-100">
                {blocks.map((b) => (
                  <div key={b.id} className="p-4 flex items-center gap-3">
                    <span className="p-2 rounded-xl bg-slate-100 text-slate-600"><Ban size={14} /></span>
                    <p className="flex-1 text-xs font-black">@{b.blocker} blocked @{b.blocked}</p>
                    <p className="text-[10px] font-bold text-slate-400">{when(b.createdAt)}</p>
                  </div>
                ))}
              </div>
            )
          ) : groups.length === 0 ? <Empty text="No groups yet." /> : (
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-[9px] font-black uppercase tracking-widest text-slate-400">
                <tr><th className="p-4">Group</th><th className="p-4">Created by</th><th className="p-4">Members</th><th className="p-4">Created</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {groups.map((g) => {
                  const count = (g.participants || []).length;
                  return (
                    <tr key={g.id} className={`text-xs font-bold ${count ? "" : "opacity-50"}`}>
                      <td className="p-4">
                        <span className="flex items-center gap-2">
                          {g.visibility === "public" ? <Globe size={12} className="text-emerald-600" /> : <Lock size={12} className="text-slate-400" />}
                          <span className="font-black">{g.groupName || "Untitled group"}</span>
                          {!count && <span className="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-black uppercase">Empty</span>}
                        </span>
                        {g.description && <span className="block text-[10px] text-slate-400 mt-0.5 truncate max-w-xs">{g.description}</span>}
                      </td>
                      <td className="p-4">@{g.createdBy || g.owner || "?"}</td>
                      <td className="p-4">{count}{(g.admins || []).length ? <span className="text-slate-400"> · {(g.admins || []).length} admin{(g.admins || []).length === 1 ? "" : "s"}</span> : null}</td>
                      <td className="p-4 text-slate-500">{when(g.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-white p-5 rounded-[1.5rem] border border-slate-100 shadow-sm">
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className="text-2xl font-black italic mt-1">{Number(value || 0).toLocaleString()}</p>
    </div>
  );
}

function Empty({ text }) {
  return <div className="p-12 text-center text-[11px] font-black uppercase tracking-widest text-slate-400">{text}</div>;
}
