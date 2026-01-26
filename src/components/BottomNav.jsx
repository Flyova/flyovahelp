"use client";
import Link from "next/link";
import { Home, History, Wallet, Settings } from "lucide-react";
import { usePathname } from "next/navigation";

export default function BottomNav() {
  const pathname = usePathname();

  const navs = [
    { name: "Home", icon: <Home size={20} />, path: "/dashboard" },
    { name: "Bet History", icon: <History size={20} />, path: "/history" },
    { name: "Deposit", icon: <Wallet size={20} />, path: "/deposit" },
    { name: "Settings", icon: <Settings size={20} />, path: "/settings" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 h-16 bg-[#1e293b] border-t border-gray-800 flex items-center justify-around z-[100] px-2">
      {navs.map((nav) => {
        const isActive = pathname === nav.path;
        return (
          <Link 
            key={nav.name} 
            href={nav.path}
            className={`flex flex-col items-center justify-center space-y-1 transition-all ${
              isActive ? 'text-[#fc7952]' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {nav.icon}
            <span className="text-[10px] font-bold uppercase tracking-tight">{nav.name}</span>
            {isActive && <div className="w-1 h-1 rounded-full bg-[#fc7952]" />}
          </Link>
        );
      })}
    </nav>
  );
}