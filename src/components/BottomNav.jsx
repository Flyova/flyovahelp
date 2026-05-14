"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Home,
  History,
  Wallet,
  Settings,
  BookOpen,
  Ellipsis,
  CircleHelp,
  MessageCircle,
  Megaphone,
  Info,
} from "lucide-react";
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
    { name: "Blog Post", icon: BookOpen, path: "/blog" },
    { name: "FAQ", icon: CircleHelp, path: "/faq" },
    { name: "Contact Support", icon: MessageCircle, path: "/support" },
    { name: "Advertise with Us", icon: Megaphone, path: "/advertise" },
    { name: "About Us", icon: Info, path: "/about" },
    { name: "Settings", icon: Settings, path: "/settings" },
  ];

  const isMoreActive = moreNavs.some((nav) =>
    nav.path === "/blog" ? pathname === "/blog" || pathname.startsWith("/blog/") : pathname === nav.path
  );

  return (
    <>
      {showMore && (
        <button
          type="button"
          aria-label="Close more menu"
          onClick={() => setShowMore(false)}
          className="fixed inset-0 z-[109] bg-[#020617]/70 backdrop-blur-[1px] md:hidden"
        />
      )}

      {showMore && (
        <div className="fixed inset-y-0 right-0 z-[120] w-[50vw] min-w-[220px] max-w-[380px] border-l border-white/10 bg-[#0b1228]/98 backdrop-blur-xl p-4 pt-8 shadow-[0_0_50px_rgba(0,0,0,0.55)] animate-in slide-in-from-right duration-300 md:hidden">
          <div className="mb-4 px-2">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/45">More</p>
          </div>
          <div className="space-y-1.5">
            {moreNavs.map((nav) => {
              const Icon = nav.icon;
              const isActive = nav.path === "/blog" ? pathname === "/blog" || pathname.startsWith("/blog/") : pathname === nav.path;
              return (
                <Link
                  key={nav.name}
                  href={nav.path}
                  onClick={() => setShowMore(false)}
                  className={`flex items-center gap-3 rounded-2xl px-4 py-4 transition-all ${
                    isActive
                      ? "bg-[#613de6]/25 text-[#d8ccff] border border-[#613de6]/35"
                      : "text-gray-100 hover:bg-white/10 hover:text-white border border-transparent"
                  }`}
                >
                  <Icon size={21} />
                  <span className="text-[13px] font-black uppercase tracking-[0.08em]">{nav.name}</span>
                </Link>
              );
            })}
          </div>
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
