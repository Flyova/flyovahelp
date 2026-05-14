"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { db } from "@/lib/firebase";
import { collection, doc, getDoc, onSnapshot, query, where } from "firebase/firestore";
import { Loader2, Search } from "lucide-react";

const EMPTY_PROFILE = { fullName: "", username: "", email: "" };

function toMillis(value) {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.toDate === "function") return value.toDate().getTime();
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.getTime();
  }
  return 0;
}

function getRowTimestamp(item) {
  return Math.max(
    toMillis(item?.finishedAt),
    toMillis(item?.completedAt),
    toMillis(item?.updatedAt),
    toMillis(item?.createdAt)
  );
}

function formatDate(item) {
  const ts = getRowTimestamp(item);
  if (!ts) return "N/A";
  return new Date(ts).toLocaleString();
}

export default function PlayWithFriendsHistory() {
  const [persistedMatches, setPersistedMatches] = useState([]);
  const [liveCompletedMatches, setLiveCompletedMatches] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const profileCacheRef = useRef({});

  useEffect(() => {
    let active = true;
    let persistedLoaded = false;
    let liveLoaded = false;

    const markLoaded = () => {
      if (persistedLoaded && liveLoaded && active) setLoading(false);
    };

    const getProfile = async (uid) => {
      if (!uid) return EMPTY_PROFILE;
      if (profileCacheRef.current[uid]) return profileCacheRef.current[uid];

      try {
        const snap = await getDoc(doc(db, "users", uid));
        const profile = snap.exists() ? snap.data() : EMPTY_PROFILE;
        profileCacheRef.current[uid] = profile;
        return profile;
      } catch (e) {
        console.error("Bet3 profile lookup failed:", e);
        profileCacheRef.current[uid] = EMPTY_PROFILE;
        return EMPTY_PROFILE;
      }
    };

    const persistedQ = query(collection(db, "completed_games"));
    const liveQ = query(collection(db, "games"), where("status", "==", "completed"));

    const unsubPersisted = onSnapshot(
      persistedQ,
      (snap) => {
        if (!active) return;
        setPersistedMatches(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        persistedLoaded = true;
        markLoaded();
      },
      (err) => {
        console.error("Bet3 completed_games listener error:", err);
        if (!active) return;
        setPersistedMatches([]);
        persistedLoaded = true;
        markLoaded();
      }
    );

    const unsubLive = onSnapshot(
      liveQ,
      async (snap) => {
        try {
          const hydrated = await Promise.all(
            snap.docs.map(async (d) => {
              const row = d.data();
              const [p1, p2] = await Promise.all([getProfile(row.player1), getProfile(row.player2)]);

              return {
                id: d.id,
                gameId: d.id,
                amount: Number(row?.stakePerRound || 0),
                player1Id: row?.player1 || "",
                player1Name: p1?.fullName || p1?.username || "Player 1",
                player1Email: p1?.email || "",
                player2Id: row?.player2 || "",
                player2Name: p2?.fullName || p2?.username || "Player 2",
                player2Email: p2?.email || "",
                p1RoundsPlayed: Number(row?.scores?.p1 || 0),
                p2RoundsPlayed: Number(row?.scores?.p2 || 0),
                totalRounds: Number(
                  row?.round || (Number(row?.scores?.p1 || 0) + Number(row?.scores?.p2 || 0))
                ),
                createdAt: row?.createdAt || null,
                finishedAt: row?.completedAt || row?.updatedAt || null,
              };
            })
          );

          if (!active) return;
          setLiveCompletedMatches(hydrated);
        } catch (err) {
          console.error("Bet3 live games listener hydration error:", err);
          if (!active) return;
          setLiveCompletedMatches([]);
        } finally {
          liveLoaded = true;
          markLoaded();
        }
      },
      (err) => {
        console.error("Bet3 games listener error:", err);
        if (!active) return;
        setLiveCompletedMatches([]);
        liveLoaded = true;
        markLoaded();
      }
    );

    return () => {
      active = false;
      unsubPersisted();
      unsubLive();
    };
  }, []);

  const matches = useMemo(() => {
    const byId = new Map();

    for (const row of liveCompletedMatches) {
      const key = row?.gameId || row?.id;
      if (key) byId.set(key, row);
    }

    for (const row of persistedMatches) {
      const key = row?.gameId || row?.id;
      if (key) {
        const fallback = byId.get(key) || {};
        byId.set(key, { ...fallback, ...row });
      }
    }

    return Array.from(byId.values()).sort((a, b) => getRowTimestamp(b) - getRowTimestamp(a));
  }, [persistedMatches, liveCompletedMatches]);

  const filtered = matches.filter((m) => {
    const s = searchTerm.toLowerCase();
    return (
      String(m.amount ?? "").toLowerCase().includes(s) ||
      (m.player1Name || "").toLowerCase().includes(s) ||
      (m.player1Id || "").toLowerCase().includes(s) ||
      (m.player1Email || "").toLowerCase().includes(s) ||
      (m.player2Name || "").toLowerCase().includes(s) ||
      (m.player2Id || "").toLowerCase().includes(s) ||
      (m.player2Email || "").toLowerCase().includes(s)
    );
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black italic uppercase text-slate-800">Play With Friends History</h1>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Match-level completed game records</p>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm relative">
        <Search className="absolute left-8 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <input
          type="text"
          placeholder="Search by player name, ID, or email..."
          className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none focus:border-[#613de6]"
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] text-left border-collapse">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest">Amount</th>
                <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest">Player1 / ID / Email</th>
                <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest">Player2 / ID / Email</th>
                <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">P1 Round Played</th>
                <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">P2 Round Played</th>
                <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest text-right">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan="6" className="p-12 text-center">
                    <Loader2 className="animate-spin mx-auto text-[#fc7952] mb-2" />
                    <p className="text-[10px] font-black uppercase text-slate-400">Loading Match History...</p>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan="6" className="p-12 text-center text-slate-300 font-black italic uppercase text-xs tracking-widest">
                    No match history found.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-6 text-sm font-black text-emerald-600">${Number(item.amount || 0).toFixed(2)}</td>
                    <td className="p-6">
                      <p className="text-sm font-black italic text-slate-800 uppercase">{item.player1Name || "Player 1"}</p>
                      <p className="text-[10px] font-mono text-slate-500">{item.player1Id || "N/A"}</p>
                      <p className="text-[10px] font-bold text-slate-400">{item.player1Email || "N/A"}</p>
                    </td>
                    <td className="p-6">
                      <p className="text-sm font-black italic text-slate-800 uppercase">{item.player2Name || "Player 2"}</p>
                      <p className="text-[10px] font-mono text-slate-500">{item.player2Id || "N/A"}</p>
                      <p className="text-[10px] font-bold text-slate-400">{item.player2Email || "N/A"}</p>
                    </td>
                    <td className="p-6 text-center text-sm font-black text-slate-700">{Number(item.p1RoundsPlayed || 0)}</td>
                    <td className="p-6 text-center text-sm font-black text-slate-700">{Number(item.p2RoundsPlayed || 0)}</td>
                    <td className="p-6 text-right text-[10px] font-black text-slate-500 uppercase">{formatDate(item)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
