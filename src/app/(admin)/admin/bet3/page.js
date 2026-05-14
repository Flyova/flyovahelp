"use client";
import { useEffect, useMemo, useState } from "react";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { Loader2, Search } from "lucide-react";

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
  const [matches, setMatches] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const fetchHistory = async (user) => {
      if (!user) return;
      setLoading(true);
      setError("");

      try {
        const requestHistory = async (forceRefresh = false) => {
          const token = await user.getIdToken(forceRefresh);
          return fetch("/api/admin/bet3-history", {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          });
        };

        let response = await requestHistory(true);
        if (response.status === 401) {
          response = await requestHistory(true);
        }

        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(payload?.error || "Could not load match history.");
        }

        if (!active) return;
        setMatches(Array.isArray(payload.matches) ? payload.matches : []);
      } catch (err) {
        console.error("Bet3 history API error:", err);
        if (!active) return;
        setMatches([]);
        setError(err?.message || "Could not load match history.");
      } finally {
        if (active) setLoading(false);
      }
    };

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setMatches([]);
        setLoading(false);
        return;
      }
      fetchHistory(user);
    });

    return () => {
      active = false;
      unsubAuth();
    };
  }, []);

  const filtered = useMemo(() => {
    const s = searchTerm.toLowerCase();
    return matches.filter((m) => (
      String(m.amount ?? "").toLowerCase().includes(s) ||
      (m.player1Name || "").toLowerCase().includes(s) ||
      (m.player1Id || "").toLowerCase().includes(s) ||
      (m.player1Email || "").toLowerCase().includes(s) ||
      (m.player2Name || "").toLowerCase().includes(s) ||
      (m.player2Id || "").toLowerCase().includes(s) ||
      (m.player2Email || "").toLowerCase().includes(s)
    ));
  }, [matches, searchTerm]);

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
              ) : error ? (
                <tr>
                  <td colSpan="6" className="p-12 text-center text-rose-400 font-black italic uppercase text-xs tracking-widest">
                    {error}
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
                  <tr key={item.id || item.gameId} className="hover:bg-slate-50/50 transition-colors">
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
