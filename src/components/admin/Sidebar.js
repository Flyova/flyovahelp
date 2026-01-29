"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import { 
  LayoutDashboard, 
  ArrowDownCircle, 
  UserCheck, 
  Wallet, 
  ArrowUpCircle, 
  Send, 
  Users, 
  History,
  X,
  LogOut,
  Gamepad2,
  ChevronLeft
} from "lucide-react";

export default function Sidebar({ isOpen, setIsOpen }) {
  const pathname = usePathname();
  const router = useRouter();

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
  ];

  const handleLogout = async () => {
    if (confirm("Are you sure you want to logout from Admin?")) {
      try {
        await signOut(auth);
        router.push("/login");
      } catch (error) {
        console.error("Logout Error:", error);
      }
    }
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-[#0f172a] text-white flex flex-col transform transition-transform duration-300 ease-in-out
        ${isOpen ? "translate-x-0" : "-translate-x-full"} 
        lg:translate-x-0 lg:static lg:inset-0
      `}>
        {/* Header */}
        <div className="p-6 flex justify-between items-center shrink-0">
          <div>
            <h2 className="text-xl font-black italic tracking-tighter text-[#613de6]">FLY OVA</h2>
            <p className="text-[10px] font-black uppercase opacity-40 tracking-widest text-white">Admin Engine</p>
          </div>
          <button onClick={() => setIsOpen(false)} className="lg:hidden text-slate-400">
            <X size={20} />
          </button>
        </div>
        
        {/* Navigation Items */}
        <nav className="flex-1 px-4 space-y-1 overflow-y-auto custom-scrollbar">
          <div className="pb-4">
            <p className="px-4 text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2">Management</p>
            {navItems.map((item) => {
              const isActive = pathname === item.path;
              return (
                <Link 
                  key={item.name}
                  href={item.path}
                  className={`
                    w-full flex items-center gap-3 px-4 py-3 text-[11px] font-black uppercase tracking-wider rounded-xl transition-all mb-1
                    ${isActive 
                      ? "bg-[#613de6] text-white shadow-lg shadow-[#613de6]/20" 
                      : "text-slate-400 hover:bg-white/5 hover:text-white"
                    }
                  `}
                  onClick={() => setIsOpen(false)}
                >
                  <item.icon size={18} />
                  {item.name}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Bottom Section */}
        <div className="p-4 bg-black/20 border-t border-white/5 space-y-2">
            <Link 
                href="/dashboard"
                className="w-full flex items-center gap-3 px-4 py-3 text-[11px] font-black uppercase tracking-wider rounded-xl text-emerald-400 hover:bg-emerald-500/10 transition-all"
            >
                <Gamepad2 size={18} />
                Return to Games
            </Link>

            <button 
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 text-[11px] font-black uppercase tracking-wider rounded-xl text-rose-400 hover:bg-rose-500/10 transition-all"
            >
                <LogOut size={18} />
                Sign Out
            </button>
        </div>
      </aside>
    </>
  );
}