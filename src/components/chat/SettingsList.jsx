"use client";
import { isValidElement, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronRight, Loader2, Search, X } from "lucide-react";
import MobileNavMenu from "@/components/MobileNavMenu";
import { useChat } from "@/components/chat/ChatProvider";

/**
 * Chat settings pages, laid out like a phone's settings: a back arrow and title,
 * then sections of plain rows (icon, title, a line of detail, a value and an
 * arrow) that each open a page of their own.
 */
export function SettingsPage({ title, back = "/chat/settings", children }) {
  const router = useRouter();
  return (
    <div className="max-w-2xl -mx-4 sm:mx-0 pb-8">
      <div className="flex items-center gap-3 px-2 sm:px-0 mb-2">
        <button
          type="button"
          onClick={() => (window.history.length > 1 ? router.back() : router.push(back))}
          aria-label="Back"
          className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-white hover:bg-white/[0.06]"
        >
          <ArrowLeft size={22} />
        </button>
        <h1 className="min-w-0 flex-1 text-[19px] font-bold truncate">{title}</h1>
        <MobileNavMenu className="md:hidden" />
      </div>
      <div className="sm:bg-[#101B2F] sm:rounded-[1.75rem] sm:border sm:border-white/5 sm:overflow-hidden">{children}</div>
    </div>
  );
}

/** The search box at the top of a settings list. */
export function SettingsSearch({ value, onChange }) {
  return (
    <div className="px-4 pt-3 pb-2">
      <label className="flex items-center gap-2.5 h-11 px-3.5 rounded-xl bg-white/[0.07] focus-within:bg-white/[0.1] transition-colors">
        <Search size={18} className="shrink-0 text-white/50" />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          type="search"
          placeholder="Search"
          aria-label="Search settings"
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-base md:text-[15px] outline-none placeholder:text-white/45 [&::-webkit-search-cancel-button]:hidden"
        />
        {value && (
          <button type="button" onClick={() => onChange("")} aria-label="Clear search" className="text-white/50 hover:text-white">
            <X size={16} />
          </button>
        )}
      </label>
    </div>
  );
}

/** A titled group of rows; sections after the first get a divider band above them. */
export function SettingsSection({ title, aside = null, note = null, children }) {
  return (
    <section className="[&+&]:border-t-[6px] [&+&]:border-white/[0.04] py-1">
      {(title || aside) && (
        <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-1">
          {title && <h2 className="text-[13px] font-semibold text-white/50">{title}</h2>}
          {aside && <span className="text-[13px] font-semibold text-white/60 truncate">{aside}</span>}
        </div>
      )}
      {children}
      {note && <p className="px-4 pt-1 pb-3 text-[12px] leading-relaxed text-white/45">{note}</p>}
    </section>
  );
}

const rowClass = (disabled) =>
  `w-full flex items-center gap-3.5 px-4 py-3 min-h-[56px] text-left transition-colors ${disabled ? "opacity-40 pointer-events-none" : "hover:bg-white/[0.04] active:bg-white/[0.06]"}`;

/**
 * One row. Give it `href` (a page) or `onClick` (an action); `value` is shown
 * on the right before the arrow. `icon` is a lucide icon or an element (e.g. an avatar).
 */
export function SettingsRow({ icon: Icon, title, text, value, href, onClick, danger = false, disabled = false, chevron, trailing = null, role, checked }) {
  const showChevron = chevron ?? !!href;
  const body = (
    <>
      {Icon && (
        <span className={`min-w-7 shrink-0 flex justify-center ${danger ? "text-[#FF8A9B]" : "text-white/90"}`}>
          {isValidElement(Icon) ? Icon : <Icon size={22} strokeWidth={1.8} />}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className={`block text-[15px] font-semibold leading-snug ${danger ? "text-[#FF8A9B]" : "text-white"}`}>{title}</span>
        {text && <span className="block text-[13px] text-white/50 leading-snug mt-0.5">{text}</span>}
      </span>
      {value != null && value !== "" && <span className="shrink-0 max-w-[45%] truncate text-[13px] text-white/50">{value}</span>}
      {trailing}
      {showChevron && <ChevronRight size={18} className="shrink-0 text-white/35" />}
    </>
  );
  const className = rowClass(disabled);
  if (href) return <Link href={href} className={className}>{body}</Link>;
  if (onClick) {
    return (
      <button type="button" onClick={onClick} disabled={disabled} role={role} aria-checked={role === "switch" || role === "radio" ? checked : undefined} className={className}>
        {body}
      </button>
    );
  }
  return <div className={className}>{body}</div>;
}

/** A row with an on/off switch. It flips at once; `disabled` only ignores taps while a change is saving. */
export function SettingsSwitch({ icon, title, text, on, onChange, disabled = false }) {
  return (
    <SettingsRow
      icon={icon}
      title={title}
      text={text}
      onClick={() => !disabled && onChange(!on)}
      chevron={false}
      role="switch"
      checked={on}
      trailing={(
        <span aria-hidden="true" className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${on ? "bg-[#2457D6]" : "bg-white/15"}`}>
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : ""}`} />
        </span>
      )}
    />
  );
}

/**
 * One choice of several (wrap them in role="radiogroup"). Like SettingsSwitch, `disabled` only ignores taps.
 * `onTap` runs on every tap, even of the chosen one (the sound picker plays the sound).
 */
export function SettingsRadio({ icon, title, text, on, onSelect, onTap, disabled = false }) {
  return (
    <SettingsRow
      icon={icon}
      title={title}
      text={text}
      onClick={() => {
        if (disabled) return;
        onTap?.();
        if (!on) onSelect();
      }}
      chevron={false}
      role="radio"
      checked={on}
      trailing={(
        <span aria-hidden="true" className={`shrink-0 w-[22px] h-[22px] rounded-full border-2 flex items-center justify-center transition-colors ${on ? "border-[#2457D6]" : "border-white/30"}`}>
          {on && <span className="w-3 h-3 rounded-full bg-[#2457D6]" />}
        </span>
      )}
    />
  );
}

/** Shown on a profile's settings page until its settings have loaded. */
export function SettingsLoading() {
  return (
    <div className="flex justify-center py-12 text-white/45" role="status" aria-label="Loading">
      <Loader2 size={22} className="animate-spin" />
    </div>
  );
}

/** Explanatory text under a page's title. */
export function SettingsIntro({ children }) {
  return <p className="px-4 pt-3 pb-2 text-[13px] leading-relaxed text-white/55">{children}</p>;
}

/** A labelled text box for settings forms. `prefix` (e.g. "@") sits inside on the left. */
export function SettingsInput({ label, prefix, ...props }) {
  return (
    <label className="block">
      {label && <span className="block text-[13px] font-semibold text-white/60 mb-1.5">{label}</span>}
      <span className="relative block">
        {prefix && <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px] text-white/40">{prefix}</span>}
        <input
          {...props}
          className={`w-full bg-white/[0.06] border border-white/10 focus:border-[#2457D6] rounded-xl ${prefix ? "pl-8" : "pl-3.5"} pr-3.5 py-3 text-base md:text-[15px] outline-none transition-colors placeholder:text-white/30`}
        />
      </span>
    </label>
  );
}

/** A full-width settings button. `tone`: "primary", "secondary" or "danger". */
export function SettingsButton({ busy = false, tone = "primary", className = "", children, ...props }) {
  const tones = {
    primary: "bg-[#8B1E3F] hover:bg-[#A62A4D] text-white",
    secondary: "bg-white/[0.07] hover:bg-white/[0.11] text-white",
    danger: "bg-white/[0.05] hover:bg-white/[0.09] text-[#FF8A9B]",
  };
  return (
    <button
      type="button"
      {...props}
      disabled={busy || props.disabled}
      className={`w-full h-11 rounded-xl text-[15px] font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-45 ${tones[tone]} ${className}`}
    >
      {busy && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  );
}

/** A success or error line under a form. */
export function SettingsMessage({ type = "error", children }) {
  if (!children) return null;
  return <p className={`text-[13px] font-semibold ${type === "error" ? "text-red-300" : "text-emerald-300"}`}>{children}</p>;
}

/**
 * Saving a setting of the chat profile Chat settings is showing. `busy` is the key
 * being saved; `after` runs once the server has it.
 */
export function useSaveSetting() {
  const { settingsName, updateSettings, setErr } = useChat();
  const [busy, setBusy] = useState("");
  const save = async (key, patch, after) => {
    setBusy(key);
    try {
      await updateSettings(settingsName, patch);
      await after?.();
    } catch (e) {
      setErr(`Could not save: ${e.message}`);
    }
    setBusy("");
  };
  return { busy, save };
}
