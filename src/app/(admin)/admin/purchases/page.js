"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { db } from "@/lib/firebase";
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { AtSign, Loader2, MessagesSquare, ShoppingBag, UserPen } from "lucide-react";

// Admin → Purchases: chat usernames bought, account username changes and groups created,
// paid from players' main wallets. Since this page shipped each one is recorded in
// purchases/{id} (lib/purchases). Older ones are found where they were left: paid
// usernames (usernames.pricePaid), accounts with usernameChangedAt and their
// "username_change" transactions, and the creators' "group_create" transactions for
// groups made since groups started costing money. A username that was deleted and freed
// before this page shipped isn't listed.

const GROUPS_PAID_SINCE = Date.UTC(2026, 10, 1); // groups were free before 2026-11-01
const KINDS = {
  username: { label: "Chat username", plural: "Chat usernames", icon: AtSign, tone: "bg-sky-100 text-sky-700" },
  username_change: { label: "Username change", plural: "Username changes", icon: UserPen, tone: "bg-violet-100 text-violet-700" },
  group: { label: "Group", plural: "Groups", icon: MessagesSquare, tone: "bg-emerald-100 text-emerald-700" },
};
const FREE = {
  first: "Free · first username",
  agent: "Free · agent's free usernames",
  old_account: "Free · 8+ month account's free usernames",
};
const PERIODS = [["all", "All time"], ["today", "Today"], ["7", "7 days"], ["30", "30 days"]];
const usd = (n) => `$${Number(n || 0).toFixed(2)}`;
const millis = (ts) => (ts?.toMillis ? ts.toMillis() : ts?.toDate ? ts.toDate().getTime() : ts ? new Date(ts).getTime() : 0);

function describe(r) {
  if (r.kind === "username") return `@${r.username}`;
  if (r.kind === "group") return `${r.item || "Group"}${r.username ? ` (as @${r.username})` : ""}`;
  return r.item || "Account username";
}

/** Purchases before purchases/{id} existed, keyed like the new records so neither is listed twice. */
async function olderPurchases() {
  const rows = [];
  const [names, changed, groups] = await Promise.all([
    getDocs(query(collection(db, "usernames"), where("pricePaid", ">", 0))),
    getDocs(query(collection(db, "users"), orderBy("usernameChangedAt", "desc"), limit(300))),
    getDocs(query(collection(db, "conversations"), where("type", "==", "group"))),
  ]);
  for (const d of names.docs) {
    const n = d.data();
    rows.push({ id: `u-${d.id}:${n.uid}`, kind: "username", uid: n.uid, amount: Number(n.pricePaid), username: d.id, at: millis(n.createdAt) });
  }
  await Promise.all(changed.docs.map(async (u) => {
    const tx = await getDocs(query(collection(db, "users", u.id, "transactions"), where("type", "==", "username_change")));
    for (const t of tx.docs) {
      rows.push({ id: `t-${t.id}`, txId: t.id, kind: "username_change", uid: u.id, amount: Math.abs(Number(t.data().amount || 0)), item: t.data().description || "", at: millis(t.data().timestamp) });
    }
  }));
  await Promise.all(groups.docs.filter((g) => millis(g.data().createdAt) >= GROUPS_PAID_SINCE).map(async (g) => {
    const by = g.data().createdBy;
    const owner = by ? await getDoc(doc(db, "usernames", by)).catch(() => null) : null;
    const uid = owner?.exists() ? owner.data().uid : null;
    if (!uid) return;
    const tx = await getDocs(query(collection(db, "users", uid, "transactions"), where("convoId", "==", g.id)));
    const t = tx.docs.find((x) => x.data().type === "group_create");
    if (!t) return;
    rows.push({ id: `t-${t.id}`, txId: t.id, kind: "group", uid, amount: Math.abs(Number(t.data().amount || 0)), username: by, item: g.data().groupName, convoId: g.id, at: millis(t.data().timestamp) });
  }));
  return rows;
}

export default function AdminPurchases() {
  const [rows, setRows] = useState([]);
  const [accounts, setAccounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [kind, setKind] = useState("all");
  const [period, setPeriod] = useState("all");
  const [showFree, setShowFree] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [recorded, older] = await Promise.all([
          getDocs(query(collection(db, "purchases"), orderBy("createdAt", "desc"), limit(2000))),
          olderPurchases(),
        ]);
        const fresh = recorded.docs.map((d) => ({ id: d.id, ...d.data(), at: millis(d.data().createdAt) }));
        const seen = new Set(fresh.flatMap((r) => [r.txId && `t-${r.txId}`, r.kind === "username" && `u-${r.username}:${r.uid}`].filter(Boolean)));
        const all = [...fresh, ...older.filter((r) => !seen.has(r.id))].sort((a, b) => b.at - a.at);
        if (live) setRows(all);
      } catch (e) {
        console.error("Purchases load failed:", e);
        if (live) setError(e?.message || "Could not load purchases.");
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, []);

  // Each buyer's account (username, name, email), looked up once.
  useEffect(() => {
    const missing = [...new Set(rows.map((r) => r.uid).filter((uid) => uid && !(uid in accounts)))];
    if (!missing.length) return;
    let live = true;
    Promise.all(missing.map(async (uid) => {
      const s = await getDoc(doc(db, "users", uid)).catch(() => null);
      const u = s?.exists() ? s.data() : null;
      return [uid, u ? { username: u.username || "", name: u.fullName || "", email: u.email || "", isAgent: !!u.isAgent } : { gone: true }];
    })).then((found) => {
      if (live) setAccounts((a) => ({ ...a, ...Object.fromEntries(found) }));
    });
    return () => { live = false; };
  }, [rows, accounts]);

  const since = useMemo(() => {
    if (period === "all") return 0;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return period === "today" ? start.getTime() : start.getTime() - (Number(period) - 1) * 86400000;
  }, [period]);

  // Everything but the kind tab, so the tab counts follow the other filters.
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase().replace(/^@/, "");
    return rows.filter((r) => {
      if (!showFree && !(r.amount > 0)) return false;
      if (since && r.at < since) return false;
      if (!s) return true;
      const a = accounts[r.uid] || {};
      return [r.username, r.item, a.username, a.name, a.email, r.uid].some((v) => String(v || "").toLowerCase().includes(s));
    });
  }, [rows, accounts, search, showFree, since]);
  const shown = kind === "all" ? filtered : filtered.filter((r) => r.kind === kind);
  const totals = useMemo(() => {
    const t = { all: { n: 0, sum: 0 } };
    for (const k of Object.keys(KINDS)) t[k] = { n: 0, sum: 0 };
    for (const r of filtered) {
      for (const k of ["all", r.kind]) {
        t[k].n += 1;
        t[k].sum += Number(r.amount || 0);
      }
    }
    return t;
  }, [filtered]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-6 md:p-12">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100">
          <div className="flex items-center gap-5">
            <div className="p-4 bg-sky-100 text-sky-600 rounded-3xl">
              <ShoppingBag size={32} />
            </div>
            <div>
              <h1 className="text-3xl font-black uppercase italic tracking-tighter">Purchases</h1>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                Chat usernames, username changes and groups paid from players&apos; wallets
              </p>
            </div>
          </div>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search username, name, email or group"
            className="px-4 py-3 rounded-2xl border border-slate-200 text-xs font-bold outline-none focus:border-[#2457D6] md:w-80" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Total" n={totals.all.n} sum={totals.all.sum} />
          {Object.entries(KINDS).map(([k, v]) => <Stat key={k} label={v.plural} n={totals[k].n} sum={totals[k].sum} />)}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {[["all", "All"], ...Object.entries(KINDS).map(([k, v]) => [k, v.plural])].map(([k, label]) => (
            <button key={k} onClick={() => setKind(k)}
              className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest ${kind === k ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-500"}`}>
              {label} ({totals[k].n})
            </button>
          ))}
          <span className="flex-1" />
          <select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Period"
            className="px-3 py-2 rounded-2xl border border-slate-200 bg-white text-[10px] font-black uppercase tracking-widest text-slate-600 outline-none">
            {PERIODS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
          <label className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-white border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500 cursor-pointer">
            <input type="checkbox" checked={showFree} onChange={(e) => setShowFree(e.target.checked)} />
            Show free usernames
          </label>
        </div>

        <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-20 text-slate-400"><Loader2 className="animate-spin" /></div>
          ) : error ? (
            <p className="p-12 text-center text-xs font-bold text-rose-600">{error}</p>
          ) : shown.length === 0 ? (
            <p className="p-12 text-center text-[11px] font-black uppercase tracking-widest text-slate-400">No purchases.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {shown.map((r) => {
                const k = KINDS[r.kind] || KINDS.username;
                const Icon = k.icon;
                const a = accounts[r.uid];
                return (
                  <div key={r.id} data-purchase={r.kind} className="p-4 flex items-center gap-4">
                    <span className={`p-2.5 rounded-xl shrink-0 ${k.tone}`}><Icon size={16} /></span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-xs font-black text-slate-800 truncate">{k.label} · {describe(r)}</span>
                      <span className="block text-[10px] font-bold text-slate-400 truncate">
                        {a === undefined ? "…" : a.gone ? "Deleted account" : (
                          <Link href={`/admin/users/${r.uid}`} className="hover:text-[#2457D6]">
                            {a.username ? `@${a.username}` : a.name || r.uid.slice(0, 8)}{a.email ? ` · ${a.email}` : ""}{a.isAgent ? " · agent" : ""}
                          </Link>
                        )}
                        {" · "}{r.at ? new Date(r.at).toLocaleString() : "-"}
                      </span>
                    </span>
                    <span className={`text-sm font-black shrink-0 ${r.amount > 0 ? "text-emerald-600" : "text-slate-400"}`}>
                      {r.amount > 0 ? usd(r.amount) : FREE[r.free] || "Free"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, n, sum }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className="text-xl font-black mt-1">{usd(sum)}</p>
      <p className="text-[10px] font-bold text-slate-400">{n} purchase{n === 1 ? "" : "s"}</p>
    </div>
  );
}
