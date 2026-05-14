"use client";
import { useEffect } from "react";
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from "lucide-react";

const THEMES = {
  error: {
    icon: AlertCircle,
    bg: "bg-[#3a1020]/95",
    border: "border-rose-400/40",
    iconBg: "bg-rose-500/20",
    iconColor: "text-rose-300",
    title: "text-rose-200",
    body: "text-rose-100/90",
  },
  success: {
    icon: CheckCircle2,
    bg: "bg-[#112c2a]/95",
    border: "border-emerald-400/40",
    iconBg: "bg-emerald-500/20",
    iconColor: "text-emerald-300",
    title: "text-emerald-200",
    body: "text-emerald-100/90",
  },
  warning: {
    icon: TriangleAlert,
    bg: "bg-[#3a2a12]/95",
    border: "border-amber-400/40",
    iconBg: "bg-amber-500/20",
    iconColor: "text-amber-300",
    title: "text-amber-200",
    body: "text-amber-100/90",
  },
  info: {
    icon: Info,
    bg: "bg-[#15233e]/95",
    border: "border-blue-400/40",
    iconBg: "bg-blue-500/20",
    iconColor: "text-blue-300",
    title: "text-blue-200",
    body: "text-blue-100/90",
  },
};

export default function ToastNotification({ notification, onClose, duration = 3600 }) {
  useEffect(() => {
    if (!notification || !onClose || duration <= 0) return undefined;
    const timer = setTimeout(() => onClose(), duration);
    return () => clearTimeout(timer);
  }, [notification, onClose, duration]);

  if (!notification) return null;

  const theme = THEMES[notification.type] || THEMES.info;
  const Icon = theme.icon;

  return (
    <div className="fixed inset-x-0 top-4 z-[800] flex justify-center px-4 pointer-events-none">
      <div className={`pointer-events-auto w-full max-w-md rounded-2xl border shadow-2xl backdrop-blur-md ${theme.bg} ${theme.border}`}>
        <div className="flex items-start gap-3 p-4">
          <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${theme.iconBg}`}>
            <Icon size={16} className={theme.iconColor} />
          </div>
          <div className="min-w-0 flex-1">
            <p className={`text-[11px] font-black uppercase tracking-[0.18em] ${theme.title}`}>
              {notification.title || "Notice"}
            </p>
            <p className={`mt-1 text-xs font-semibold leading-relaxed ${theme.body}`}>
              {notification.message}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-white/50 transition hover:bg-white/10 hover:text-white"
            aria-label="Close notification"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
