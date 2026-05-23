"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import DesktopSidebar from "@/components/DesktopSidebar";

const ENGINE_HEARTBEAT_MS = 45000;
const ENGINE_HEARTBEAT_KEY = "flyova_engine_last_kick_at";

export default function ClientLayoutShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  const isAuthPage =
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/verify" ||
    pathname === "/forgot-password" ||
    pathname === "/advertise" ||
    pathname === "/partner" ||
    pathname === "/blog" ||
    pathname.startsWith("/blog/") ||
    pathname.startsWith("/admin");

  const sidebarNavPaths = ["/dashboard", "/history", "/deposit", "/settings", "/support", "/faq", "/about"];
  const showDesktopBack = !isAuthPage && !sidebarNavPaths.includes(pathname);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setHasSession(Boolean(user));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (isAuthPage || !hasSession) return;

    const maybeKickGameEngine = async (reason) => {
      const now = Date.now();

      try {
        const lastKick = Number(localStorage.getItem(ENGINE_HEARTBEAT_KEY) || 0);
        if (now - lastKick < ENGINE_HEARTBEAT_MS) return;
        localStorage.setItem(ENGINE_HEARTBEAT_KEY, String(now));
      } catch {
        // If localStorage is unavailable, continue without cross-tab throttling.
      }

      try {
        await fetch(`/api/cron/game-engine?r=${encodeURIComponent(reason)}&t=${now}`, {
          method: "GET",
          cache: "no-store",
          keepalive: true
        });
      } catch {
        // Ignore transient errors; next heartbeat retries.
      }
    };

    maybeKickGameEngine("shell-mount");
    const timer = setInterval(() => {
      maybeKickGameEngine("shell-heartbeat");
    }, ENGINE_HEARTBEAT_MS);

    return () => clearInterval(timer);
  }, [isAuthPage, hasSession]);

  return (
    <>
      {!isAuthPage && <Header />}
      {!isAuthPage && (
        <DesktopSidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((prev) => !prev)}
        />
      )}
      <main
        className={
          !isAuthPage
            ? `transition-[padding] duration-300 ease-in-out ${sidebarCollapsed ? "md:pl-20" : "md:pl-64"}`
            : ""
        }
      >
        {showDesktopBack && (
          <div className="hidden md:block fixed top-20 z-95">
            <button
              onClick={() => {
                if (window.history.length > 1) {
                  router.back();
                } else {
                  router.push("/dashboard");
                }
              }}
              className={`h-11 px-4 rounded-2xl bg-[#1e293b]/90 border border-white/10 text-white hover:bg-[#243348] transition-all flex items-center gap-2 shadow-lg ${
                sidebarCollapsed ? "ml-3" : "ml-4"
              }`}
            >
              <ArrowLeft size={16} />
              <span className="text-xs font-black uppercase tracking-wide">Back</span>
            </button>
          </div>
        )}
        {children}
      </main>
      {!isAuthPage && <BottomNav />}
    </>
  );
}
