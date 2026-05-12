"use client";
import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase";
import { collectionGroup, doc, getDoc, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { Loader2, Search } from "lucide-react";

const formatTime = (ts) => {
  if (!ts?.toDate) return "N/A";
  return ts.toDate().toLocaleString();
};

const parsePlanName = (title = "") => {
  if (!title.startsWith("Predict Stake:")) return "";
  return title.replace("Predict Stake:", "").trim() || "Unknown Plan";
};

export default function PredictAndWinHistory() {
  const [rows, setRows] = useState([]);
  const [userCache, setUserCache] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collectionGroup(db, "transactions"),
      orderBy("timestamp", "desc"),
      limit(2500)
    );

    const unsub = onSnapshot(q, async (snap) => {
      const raw = snap.docs.map((d) => {
        const data = d.data();
        const pathSegments = d.ref.path.split("/");
        const userIdFromPath = pathSegments[1];
        return { id: d.id, userId: userIdFromPath, ...data };
      });

      const uniqueUserIds = [...new Set(raw.map((r) => r.userId))].filter((uid) => uid && !userCache[uid]);
      if (uniqueUserIds.length > 0) {
        const lookups = await Promise.all(
          uniqueUserIds.map(async (uid) => {
            const snapUser = await getDoc(doc(db, "users", uid));
            if (!snapUser.exists()) {
              return {
                uid,
                profile: { name: "Unknown User", email: "", pin: "--------", country: "" },
              };
            }
            const d = snapUser.data();
            return {
              uid,
              profile: {
                name: d.fullName || d.username || "User",
                email: d.email || "",
                pin: d.pin || "--------",
                country: d.country || "",
              },
            };
          })
        );

        const next = {};
        lookups.forEach((u) => {
          next[u.uid] = u.profile;
        });
        setUserCache((prev) => ({ ...prev, ...next }));
      }

      const eventsByUser = new Map();

      for (const tx of raw) {
        const ts = tx.timestamp;
        const tsMs = ts?.toMillis ? ts.toMillis() : 0;
        if (!tx.userId || tsMs <= 0) continue;

        const title = tx.title || "";
        const planName = parsePlanName(title);
        const isPlanStake = Boolean(planName);
        const isPredictRound = title === "Predict and Win" || title === "Predict Win" || tx.type === "prediction";
        const isPredictWin = title === "Predict Win";

        if (!isPlanStake && !isPredictRound && !isPredictWin) continue;

        const list = eventsByUser.get(tx.userId) || [];
        list.push({
          type: isPlanStake ? "stake" : isPredictWin ? "win" : "round",
          planName,
          amount: Number(tx.amount || 0),
          timestamp: ts,
          tsMs,
        });
        eventsByUser.set(tx.userId, list);
      }

      const sessionRows = [];

      for (const [uid, events] of eventsByUser.entries()) {
        const sorted = [...events].sort((a, b) => a.tsMs - b.tsMs);
        let currentSession = null;

        for (const ev of sorted) {
          if (ev.type === "stake") {
            currentSession = {
              id: `${uid}_${ev.tsMs}`,
              userId: uid,
              plan: ev.planName,
              roundsPlayed: 0,
              amountEarned: 0,
              time: ev.timestamp,
            };
            sessionRows.push(currentSession);
            continue;
          }

          if (!currentSession) continue;

          if (ev.type === "round" || ev.type === "win") {
            currentSession.roundsPlayed += 1;
          }
          if (ev.type === "win") {
            currentSession.amountEarned += Number(ev.amount || 0);
          }
        }
      }

      sessionRows.sort((a, b) => (b.time?.toMillis?.() || 0) - (a.time?.toMillis?.() || 0));
      setRows(sessionRows);
      setLoading(false);
    });

    return () => unsub();
  }, [userCache]);

  const search = searchTerm.toLowerCase().trim();

  const filtered = useMemo(() => {
    if (!search) return rows;
    return rows.filter((r) => {
      const profile = userCache[r.userId] || {};
      return (
        profile.name?.toLowerCase().includes(search) ||
        profile.email?.toLowerCase().includes(search) ||
        profile.pin?.toLowerCase().includes(search) ||
        profile.country?.toLowerCase().includes(search) ||
        r.plan?.toLowerCase().includes(search)
      );
    });
  }, [rows, userCache, search]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black italic uppercase text-slate-800">Predict & Win Log</h1>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
          Player subscriptions and rounds performance
        </p>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm relative">
        <Search className="absolute left-8 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <input
          type="text"
          placeholder="Search player, email, PIN, country, or plan..."
          className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none focus:border-[#613de6]"
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest">Player</th>
              <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest">Subscription Plans</th>
              <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Rounds Played</th>
              <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Amount Earned</th>
              <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest text-right">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading && rows.length === 0 ? (
              <tr>
                <td colSpan="5" className="p-12 text-center">
                  <Loader2 className="animate-spin mx-auto text-[#613de6] mb-2" />
                  <p className="text-[10px] font-black uppercase text-slate-400">Loading Predict Sessions...</p>
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan="5" className="p-20 text-center text-slate-300 font-black italic uppercase tracking-widest">
                  No Predict Session Found
                </td>
              </tr>
            ) : (
              filtered.map((row) => {
                const profile = userCache[row.userId] || {};
                return (
                  <tr key={row.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-6">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-indigo-50 text-[#613de6] rounded-lg flex items-center justify-center font-black italic text-xs border border-indigo-100">
                          {(profile.name || "U").charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-black italic text-slate-800 uppercase leading-none mb-1">
                            {profile.name || "Unknown User"}
                          </p>
                          <p className="text-[9px] font-mono text-slate-400 uppercase tracking-tighter">
                            PIN: {profile.pin || "--------"} · {profile.email || "No Email"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="p-6">
                      <span className="px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 text-[10px] font-black uppercase">
                        {row.plan || "Unknown Plan"}
                      </span>
                    </td>
                    <td className="p-6 text-center">
                      <span className="text-sm font-black text-slate-800">{row.roundsPlayed}</span>
                    </td>
                    <td className="p-6 text-center">
                      <span className="text-sm font-black text-emerald-600">${Number(row.amountEarned || 0).toFixed(2)}</span>
                    </td>
                    <td className="p-6 text-right">
                      <p className="text-[10px] font-black text-slate-400 uppercase">{formatTime(row.time)}</p>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
