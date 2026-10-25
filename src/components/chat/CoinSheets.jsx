"use client";
import { useEffect, useState } from "react";
import { collection, doc, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { ArrowDownLeft, ArrowUpRight, Coins, Loader2, Plus, Wallet } from "lucide-react";
import { db } from "@/lib/firebase";
import { authFetch } from "@/lib/authFetch";
import {
  COIN_BUY_FEE, COIN_CENTS, COIN_WITHDRAW_FEE, MAX_COINS_PER_ACTION,
  coinBuyQuote, coinWithdrawQuote, formatCents, formatCoins, isCoinAmount,
} from "@/lib/chat";
import Avatar from "@/components/Avatar";
import ChatSheet from "@/components/chat/ChatSheet";

const coinsApi = (body) => authFetch("/api/chat/coins", { method: "POST", body });
const pct = (fee) => `${Math.round(fee * 100)}%`;

/** Gold coin badge. */
export function CoinIcon({ size = 18, className = "" }) {
  return (
    <span className={`shrink-0 rounded-full bg-gradient-to-br from-[#F6C453] to-[#D18E1F] text-[#2B1800] flex items-center justify-center ${className}`} style={{ width: size + 10, height: size + 10 }}>
      <Coins size={size} />
    </span>
  );
}

/** Preset amounts plus a number box. `value` is a whole number of coins (0 = none chosen). */
function AmountPicker({ presets, value, onChange, max }) {
  const [custom, setCustom] = useState("");
  return (
    <div>
      <div className="grid grid-cols-5 gap-1.5">
        {presets.map((p) => {
          const amount = p === "all" ? max : p;
          const disabled = max !== undefined && (amount > max || amount < 1);
          return (
            <button
              key={p}
              type="button"
              disabled={disabled}
              onClick={() => {
                setCustom("");
                onChange(amount);
              }}
              className={`h-10 rounded-xl text-[13px] font-black transition-colors disabled:opacity-30 ${!custom && value === amount ? "bg-[#F6C453] text-[#2B1800]" : "bg-white/[0.06] hover:bg-white/10"}`}
            >
              {p === "all" ? "All" : formatCoins(p)}
            </button>
          );
        })}
      </div>
      <input
        value={custom}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").slice(0, 6);
          setCustom(digits);
          onChange(Number(digits) || 0);
        }}
        inputMode="numeric"
        placeholder="Or type an amount"
        aria-label="Number of coins"
        className="mt-2 w-full bg-black/40 border border-white/10 focus:border-[#F6C453] rounded-xl px-3 py-2.5 text-base md:text-sm outline-none"
      />
    </div>
  );
}

function QuoteRow({ label, value, strong = false }) {
  return (
    <p className={`flex items-center justify-between text-[13px] ${strong ? "font-black text-white pt-1.5 border-t border-white/10" : "text-white/60"}`}>
      <span>{label}</span>
      <span>{value}</span>
    </p>
  );
}

function activityLine(a) {
  if (a.kind === "buy") return { text: `Bought ${formatCoins(a.coins)} coins`, sub: `${formatCents(a.cents)} incl. ${formatCents(a.feeCents)} fee`, delta: a.coins };
  if (a.kind === "withdraw") return { text: `Withdrew ${formatCoins(a.coins)} coins`, sub: `${formatCents(a.cents)} to main balance`, delta: -a.coins };
  if (a.kind === "sent") return { text: `Sent to @${a.to}`, sub: "", delta: -a.coins };
  return { text: `From @${a.from}`, sub: "", delta: a.coins };
}

/**
 * Your coin wallet: balance, buy coins from the main balance (7% fee), withdraw
 * them back (12% fee) and recent activity. Sending happens from a player in the
 * Chatroom or a group.
 */
export function CoinWalletSheet({ uid, coins, onClose }) {
  const [tab, setTab] = useState("buy");
  const [amount, setAmount] = useState(0);
  const [mainCents, setMainCents] = useState(null);
  const [activity, setActivity] = useState([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState({ type: "", msg: "" });

  useEffect(() => {
    if (!uid) return;
    const offUser = onSnapshot(doc(db, "users", uid), (s) => setMainCents(Math.round(Number(s.data()?.wallet || 0) * 100)), () => {});
    const offActivity = onSnapshot(
      query(collection(db, "coin_wallets", uid, "activity"), orderBy("createdAt", "desc"), limit(15)),
      (s) => setActivity(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => {}
    );
    return () => {
      offUser();
      offActivity();
    };
  }, [uid]);

  const buying = tab === "buy";
  const valid = isCoinAmount(amount);
  const buyQ = coinBuyQuote(amount || 0);
  const withdrawQ = coinWithdrawQuote(amount || 0);
  const short = buying
    ? valid && mainCents !== null && buyQ.total > mainCents
    : valid && amount > coins;

  const switchTab = (t) => {
    setTab(t);
    setAmount(0);
    setNote({ type: "", msg: "" });
  };

  const submit = async () => {
    if (!valid || short || busy) return;
    setBusy(true);
    setNote({ type: "", msg: "" });
    const r = await coinsApi({ action: buying ? "buy" : "withdraw", coins: amount }).catch((e) => ({ error: e.message }));
    setBusy(false);
    if (r.error) return setNote({ type: "error", msg: r.error });
    setNote({
      type: "success",
      msg: buying
        ? `Added ${formatCoins(amount)} coins.`
        : `${formatCents(withdrawQ.payout)} is now in your main balance.`,
    });
    setAmount(0);
  };

  return (
    <ChatSheet label="Coin wallet" onClose={onClose}>
      <div className="p-5 pt-7">
        <div className="flex flex-col items-center text-center">
          <CoinIcon size={30} />
          <p className="mt-3 text-[11px] font-black uppercase tracking-wider text-white/45">Coin wallet</p>
          <p className="text-3xl font-black leading-tight">{formatCoins(coins)} <span className="text-lg text-white/60">coins</span></p>
          <p className="text-xs text-white/45 mt-0.5">1 coin = {formatCents(COIN_CENTS)} · worth {formatCents(coins * COIN_CENTS)}</p>
        </div>

        <div className="mt-5 grid grid-cols-2 bg-black/25 rounded-2xl p-1" role="tablist">
          {[["buy", "Buy coins", Plus], ["withdraw", "Withdraw", Wallet]].map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => switchTab(key)}
              className={`h-9 rounded-xl flex items-center justify-center gap-1.5 text-xs font-black uppercase transition-colors ${tab === key ? "bg-[#F6C453] text-[#2B1800]" : "text-white/55 hover:text-white"}`}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        <div className="mt-4">
          <AmountPicker
            key={tab}
            presets={buying ? [10, 50, 100, 500, 1000] : [10, 50, 100, 500, "all"]}
            value={amount}
            onChange={(n) => {
              setAmount(n);
              setNote({ type: "", msg: "" });
            }}
            max={buying ? undefined : coins}
          />
        </div>

        {valid && (
          <div className="mt-3 space-y-1 bg-black/20 rounded-2xl p-3.5">
            {buying ? (
              <>
                <QuoteRow label={`${formatCoins(amount)} coins`} value={formatCents(buyQ.value)} />
                <QuoteRow label={`Fee (${pct(COIN_BUY_FEE)})`} value={formatCents(buyQ.fee)} />
                <QuoteRow label="You pay from main balance" value={formatCents(buyQ.total)} strong />
              </>
            ) : (
              <>
                <QuoteRow label={`${formatCoins(amount)} coins`} value={formatCents(withdrawQ.value)} />
                <QuoteRow label={`Fee (${pct(COIN_WITHDRAW_FEE)})`} value={`−${formatCents(withdrawQ.fee)}`} />
                <QuoteRow label="You get in main balance" value={formatCents(withdrawQ.payout)} strong />
              </>
            )}
          </div>
        )}
        {amount > MAX_COINS_PER_ACTION && <p className="mt-2 text-xs text-red-300">At most {formatCoins(MAX_COINS_PER_ACTION)} coins at a time.</p>}
        {short && (
          <p className="mt-2 text-xs text-red-300">
            {buying ? `Your main balance is ${formatCents(mainCents)}.` : `You have ${formatCoins(coins)} coins.`}
          </p>
        )}
        {note.msg && (
          <p className={`mt-3 text-xs font-bold p-2.5 rounded-xl ${note.type === "error" ? "bg-red-500/10 text-red-300" : "bg-emerald-500/10 text-emerald-300"}`}>{note.msg}</p>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={!valid || short || busy}
          className="mt-4 w-full h-12 rounded-xl bg-gradient-to-br from-[#F6C453] to-[#D18E1F] text-[#2B1800] text-sm font-black uppercase disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {busy && <Loader2 size={16} className="animate-spin" />}
          {buying
            ? valid ? `Buy ${formatCoins(amount)} coins · ${formatCents(buyQ.total)}` : "Choose how many coins"
            : valid ? `Withdraw ${formatCoins(amount)} coins` : "Choose how many coins"}
        </button>
        <p className="mt-2 text-center text-[11px] text-white/40">
          {buying ? `Main balance: ${mainCents === null ? "…" : formatCents(mainCents)}` : "Withdrawn coins go to your main balance."} To send coins, tap a player in the Chatroom or a group.
        </p>

        {activity.length > 0 && (
          <div className="mt-5">
            <p className="text-[10px] font-black uppercase text-white/40 mb-1.5 px-1">Recent</p>
            <ul className="rounded-2xl bg-black/20 divide-y divide-white/5">
              {activity.map((a) => {
                const line = activityLine(a);
                return (
                  <li key={a.id} className="flex items-center gap-3 px-3 py-2.5">
                    <span className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center ${line.delta > 0 ? "bg-emerald-500/15 text-emerald-300" : "bg-white/[0.06] text-white/60"}`}>
                      {line.delta > 0 ? <ArrowDownLeft size={15} /> : <ArrowUpRight size={15} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-bold truncate">{line.text}</span>
                      <span className="block text-[11px] text-white/40 truncate">
                        {[line.sub, a.createdAt?.toDate?.().toLocaleString([], { dateStyle: "medium", timeStyle: "short" })].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className={`shrink-0 text-[13px] font-black ${line.delta > 0 ? "text-emerald-300" : "text-white/70"}`}>
                      {line.delta > 0 ? "+" : "−"}{formatCoins(Math.abs(line.delta))}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </ChatSheet>
  );
}

/**
 * Send coins to a player, free. `convoId` = the group it happens in (none = the
 * Chatroom); a coin card is posted there. `as` is the username you send as.
 */
export function SendCoinsSheet({ to, as, convoId, coins, onClose, onTopUp }) {
  const [amount, setAmount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const valid = isCoinAmount(amount);
  const short = valid && amount > coins;

  const send = async () => {
    if (!valid || short || busy) return;
    setBusy(true);
    setError("");
    const r = await coinsApi({ action: "send", as, to, coins: amount, ...(convoId ? { convoId } : {}) }).catch((e) => ({ error: e.message }));
    setBusy(false);
    if (r.error) return setError(r.error);
    onClose();
  };

  return (
    <ChatSheet label={`Send coins to @${to}`} onClose={onClose}>
      <div className="p-5 pt-7">
        <div className="flex flex-col items-center text-center">
          <div className="relative">
            <Avatar username={to} size={72} rounded="rounded-full" />
            <CoinIcon size={14} className="absolute -right-1 -bottom-1 ring-4 ring-[#142036]" />
          </div>
          <h2 className="mt-3 text-lg font-black leading-tight">Send coins to @{to}</h2>
          <p className="text-xs text-white/50 mt-0.5">No fee. Everyone in the {convoId ? "group" : "Chatroom"} will see it.</p>
        </div>

        <div className="mt-4 flex items-center justify-between bg-black/20 rounded-2xl px-3.5 py-2.5">
          <span className="flex items-center gap-2 text-sm font-bold"><CoinIcon size={12} /> You have {formatCoins(coins)}</span>
          <button type="button" onClick={onTopUp} className="text-[11px] font-black uppercase text-[#F6C453] hover:underline">Add coins</button>
        </div>

        <div className="mt-4">
          <AmountPicker presets={[10, 50, 100, 500, 1000]} value={amount} onChange={(n) => { setAmount(n); setError(""); }} max={coins} />
        </div>
        {short && <p className="mt-2 text-xs text-red-300">You have {formatCoins(coins)} coins. Add more to send this many.</p>}
        {error && <p className="mt-3 text-xs font-bold p-2.5 rounded-xl bg-red-500/10 text-red-300">{error}</p>}

        <button
          type="button"
          onClick={send}
          disabled={!valid || short || busy || !as}
          className="mt-4 w-full h-12 rounded-xl bg-gradient-to-br from-[#F6C453] to-[#D18E1F] text-[#2B1800] text-sm font-black uppercase disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {busy && <Loader2 size={16} className="animate-spin" />}
          {valid ? `Send ${formatCoins(amount)} coin${amount === 1 ? "" : "s"}` : "Choose how many coins"}
        </button>
      </div>
    </ChatSheet>
  );
}
