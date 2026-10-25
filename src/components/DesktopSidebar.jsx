"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { NAV_ITEMS, isNavActive } from "@/components/navItems";

export default function DesktopSidebar({ collapsed, onToggle }) {
  const pathname = usePathname();

  return (
    <aside
      className={`hidden md:flex fixed left-0 top-14 z-[90] h-[calc(100vh-3.5rem)] bg-[#0B1220] border-r border-[#F5F3EE]/10 flex-col transition-all duration-300 ease-in-out ${
        collapsed ? "w-20" : "w-64"
      }`}
    >
      <nav className="p-3 space-y-2 flex-1">
        {NAV_ITEMS.map((nav) => {
          const isActive = isNavActive(pathname, nav.path);
          const Icon = nav.icon;
          return (
            <Link
              key={nav.name}
              href={nav.path}
              className={`flex items-center gap-3 rounded-2xl px-3 py-3 transition-all ${
                isActive
                  ? "bg-[#2457D6] text-[#F5F3EE] shadow-lg shadow-[#2457D6]/20"
                  : "text-[#F5F3EE]/70 hover:bg-[#F5F3EE]/5 hover:text-[#F5F3EE]"
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
