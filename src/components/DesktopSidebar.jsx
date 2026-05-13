"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, History, Wallet, Settings, BookOpen, ChevronLeft, ChevronRight } from "lucide-react";

export default function DesktopSidebar({ collapsed, onToggle }) {
  const pathname = usePathname();

  const navs = [
    { name: "Home", icon: Home, path: "/dashboard" },
    { name: "History", icon: History, path: "/history" },
    { name: "Deposit", icon: Wallet, path: "/deposit" },
    { name: "Blog", icon: BookOpen, path: "/blog" },
    { name: "Settings", icon: Settings, path: "/settings" },
  ];

  return (
    <aside
      className={`hidden md:flex fixed left-0 top-14 z-[90] h-[calc(100vh-3.5rem)] bg-[#111827] border-r border-white/10 flex-col transition-all duration-300 ease-in-out ${
        collapsed ? "w-20" : "w-64"
      }`}
    >
      <nav className="p-3 space-y-2 flex-1">
        {navs.map((nav) => {
          const isActive = pathname === nav.path;
          const Icon = nav.icon;
          return (
            <Link
              key={nav.name}
              href={nav.path}
              className={`flex items-center gap-3 rounded-2xl px-3 py-3 transition-all ${
                isActive
                  ? "bg-[#613de6] text-white shadow-lg shadow-[#613de6]/20"
                  : "text-gray-300 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon size={20} />
              <span
                className={`text-sm font-bold whitespace-nowrap transition-all duration-200 ${
                  collapsed ? "opacity-0 w-0 overflow-hidden" : "opacity-100 w-auto"
                }`}
              >
                {nav.name}
              </span>
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t border-white/10 flex items-center justify-end">
        <button
          onClick={onToggle}
          className="h-9 w-9 rounded-2xl bg-white/5 hover:bg-white/10 text-gray-300 transition-colors flex items-center justify-center"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>
    </aside>
  );
}
