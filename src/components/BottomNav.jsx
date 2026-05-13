"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Home, History, Wallet, Settings, BookOpen, Ellipsis } from "lucide-react";
import { usePathname } from "next/navigation";

export default function BottomNav() {
  const pathname = usePathname();
  const [showMore, setShowMore] = useState(false);

  useEffect(() => {
    setShowMore(false);
  }, [pathname]);

  const primaryNavs = [
    { name: "Home", icon: Home, path: "/dashboard" },
    { name: "History", icon: History, path: "/history" },
    { name: "Deposit", icon: Wallet, path: "/deposit" },
  ];

  const moreNavs = [
    { name: "Settings", icon: Settings, path: "/settings" },
    { name: "Blog", icon: BookOpen, path: "/blog" },
  ];

  const isMoreActive = pathname === "/settings" || pathname === "/blog" || pathname.startsWith("/blog/");

  return (
    <>
      {showMore && (
        <button
          type="button"
          aria-label="Close more menu"
          onClick={() => setShowMore(false)}
          className="fixed inset-0 z-[99] bg-black/20 md:hidden"
        />
      )}

      {showMore && (
        <div className="fixed bottom-20 right-3 z-[110] w-44 rounded-2xl border border-white/10 bg-[#111827]/95 backdrop-blur-md p-2 shadow-2xl md:hidden">
          {moreNavs.map((nav) => {
            const Icon = nav.icon;
            const isActive = pathname === nav.path || (nav.path === "/blog" && pathname.startsWith("/blog/"));
            return (
              <Link
                key={nav.name}
                href={nav.path}
                onClick={() => setShowMore(false)}
                className={`flex items-center gap-2 rounded-xl px-3 py-2.5 transition-all ${
                  isActive ? "bg-[#613de6]/20 text-[#a78bfa]" : "text-gray-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon size={16} />
                <span className="text-[10px] font-black uppercase tracking-wide">{nav.name}</span>
              </Link>
            );
          })}
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 h-16 bg-[#1e293b] border-t border-gray-800 flex items-center justify-around z-[100] px-2 md:hidden">
        {primaryNavs.map((nav) => {
          const Icon = nav.icon;
          const isActive = pathname === nav.path;
          return (
            <Link
              key={nav.name}
              href={nav.path}
              className={`flex flex-col items-center justify-center space-y-1 transition-all ${
                isActive ? "text-[#fc7952]" : "text-gray-500 hover:text-gray-300"
              }`}
            >
              <Icon size={20} />
              <span className="text-[10px] font-bold uppercase tracking-tight">{nav.name}</span>
              {isActive && <div className="w-1 h-1 rounded-full bg-[#fc7952]" />}
            </Link>
          );
        })}

        <button
          type="button"
          onClick={() => setShowMore((prev) => !prev)}
          className={`flex flex-col items-center justify-center space-y-1 transition-all ${
            isMoreActive || showMore ? "text-[#fc7952]" : "text-gray-500 hover:text-gray-300"
          }`}
        >
          <Ellipsis size={20} />
          <span className="text-[10px] font-bold uppercase tracking-tight">More</span>
          {(isMoreActive || showMore) && <div className="w-1 h-1 rounded-full bg-[#fc7952]" />}
        </button>
      </nav>
    </>
  );
}
