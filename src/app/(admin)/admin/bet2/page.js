"use client";
import { useEffect, useMemo, useState } from "react";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { Loader2, Search } from "lucide-react";

const formatTime = (value) => {
  if (!value) return "N/A";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "N/A" : date.toLocaleString();
};

export default function PredictAndWinHistory() {
  const [rows, setRows] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;

    const fetchRows = async (user) => {
      if (!user) return;
      setLoading(true);
      setLoadError("");

      try {
        const requestHistory = async (forceRefresh = false) => {
          const token = await user.getIdToken(forceRefresh);
          return fetch("/api/admin/bet2-history", {
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
          throw new Error(payload?.error || "Could not load Predict & Win history.");
        }

        if (!active) return;
        setRows(Array.isArray(payload.rows) ? payload.rows : []);
      } catch (error) {
        console.error("Bet 2 history API error:", error);
        if (!active) return;
        setRows([]);
        setLoadError(error?.message || "Could not load Predict & Win history.");
      } finally {
        if (active) setLoading(false);
      }
    };

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setRows([]);
        setLoading(false);
        return;
      }
      fetchRows(user);
    });

    return () => {
      active = false;
      unsubAuth();
    };
  }, []);

  const search = searchTerm.toLowerCase().trim();

  const filtered = useMemo(() => {
    if (!search) return rows;
    return rows.filter((row) => {
      const profile = row.player || {};
      return (
        profile.name?.toLowerCase().includes(search) ||
        profile.email?.toLowerCase().includes(search) ||
        profile.pin?.toLowerCase().includes(search) ||
        profile.country?.toLowerCase().includes(search) ||
        row.plan?.toLowerCase().includes(search)
      );
    });
  }, [rows, search]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black italic uppercase text-slate-800">Predict & Win Log</h1>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
          Player subscriptions and rounds performance
        </p>
      </div>

      {loadError && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl text-xs font-bold">
          {loadError}
        </div>
      )}

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
                const profile = row.player || {};
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
