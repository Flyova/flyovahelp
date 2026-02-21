"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { 
  LayoutDashboard, ArrowDownCircle, UserCheck, Wallet, 
  ArrowUpCircle, Send, Delete, Users, History, Trophy, 
  MessageCircle, X, LogOut, Gamepad2, Menu, Loader2 
} from "lucide-react";

export default function AdminLayout({ children }) {
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === "/admin/login") {
      setLoading(false);
      setAuthorized(true);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, "users", user.uid));
          if (userDoc.exists() && userDoc.data().role === "admin") {
            setAuthorized(true);
          } else {
            await signOut(auth);
            router.push("/admin/login");
          }
        } catch (error) {
          router.push("/admin/login");
        }
      } else {
        router.push("/admin/login");
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [router, pathname]);

  const handleLogout = async () => {
    if (confirm("Logout from Admin Engine?")) {
      await signOut(auth);
      router.push("/admin/login");
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center text-white text-center">
      <Loader2 className="animate-spin text-[#613de6] mb-4" size={40} />
      <p className="text-[10px] font-black uppercase tracking-[0.3em] animate-pulse">
        Verifying Credentials...
      </p>
    </div>
  );

  // Don't wrap Login Page in the Sidebar layout
  if (pathname === "/admin/login") return <>{children}</>;
  if (!authorized) return null;

  const navItems = [
    { name: "Dashboard", icon: LayoutDashboard, path: "/admin" },
    { name: "Deposit Approvals", icon: ArrowDownCircle, path: "/admin/deposits" },
    { name: "Agent List", icon: UserCheck, path: "/admin/agents" },
    { name: "Agent Transactions", icon: Wallet, path: "/admin/agent-tx" },
    { name: "Transfers", icon: Send, path: "/admin/transfers" },
    { name: "Withdrawals", icon: ArrowUpCircle, path: "/admin/withdrawals" },
    { name: "Announcements", icon: Send, path: "/admin/broadcast" },
    { name: "User Directory", icon: Users, path: "/admin/users" },
    { name: "Bet 1 History", icon: History, path: "/admin/bet1" },
    { name: "Bet 2 History", icon: History, path: "/admin/bet2" },
    { name: "Bet 3 History", icon: History, path: "/admin/bet3" },
    { name: "Settings", icon: UserCheck, path: "/admin/settings" },
    { name: "Live Chat", icon: MessageCircle, path: "/admin/support" },
    { name: "Send Jackpot", icon: Trophy, path: "/admin/jackpot" },
     { name: "Account Deletioin", icon: Delete, path: "/admin/deletions" },
  ];

  return (
    <div className="flex min-h-screen bg-[#f8fafc]">
      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm" 
          onClick={() => setIsSidebarOpen(false)} 
        />
      )}

      {/* Admin Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-72 bg-[#0f172a] text-white flex flex-col transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        {/* Sidebar Header */}
        <div className="p-8 flex justify-between items-center shrink-0">
          <div>
            <h2 className="text-2xl font-black italic tracking-tighter text-[#613de6]">FLY OVA</h2>
            <p className="text-[10px] font-black uppercase opacity-40 tracking-widest text-white">Admin Engine</p>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden text-slate-400">
            <X size={24} />
          </button>
        </div>
        
        {/* Main Navigation */}
        <nav className="flex-1 px-4 space-y-1 overflow-y-auto custom-scrollbar">
          <p className="px-4 text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4">Core Management</p>
          {navItems.map((item) => {
            const isActive = pathname === item.path;
            return (
              <Link 
                key={item.name} 
                href={item.path} 
                onClick={() => setIsSidebarOpen(false)}
                className={`w-full flex items-center gap-3 px-5 py-3.5 text-[11px] font-black uppercase tracking-wider rounded-2xl transition-all mb-1 ${isActive ? "bg-[#613de6] text-white shadow-xl shadow-[#613de6]/30" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}
              >
                <item.icon size={18} /> {item.name}
              </Link>
            );
          })}
        </nav>

        {/* Action Footer */}
        <div className="p-6 bg-black/20 border-t border-white/5 space-y-2">
            
            <button 
                onClick={handleLogout} 
                className="w-full flex items-center gap-3 px-5 py-4 text-[11px] font-black uppercase tracking-wider rounded-2xl text-rose-500 hover:bg-rose-500/10 transition-all font-black"
            >
                <LogOut size={18} /> 
                Sign Out
            </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile Header Bar */}
        <header className="lg:hidden bg-white border-b border-slate-200 p-4 flex justify-between items-center shrink-0">
          <h1 className="font-black italic text-[#613de6]">FLY OVA</h1>
          <button 
            onClick={() => setIsSidebarOpen(true)} 
            className="p-2 bg-slate-100 rounded-xl text-slate-600"
          >
            <Menu size={20} />
          </button>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-10">
          {children}
        </main>
      </div>
    </div>
  );
}