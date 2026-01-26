// src/app/layout.js
"use client";
import { usePathname } from 'next/navigation';
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import "./globals.css";

export default function RootLayout({ children }) {
  const pathname = usePathname();
  
  // Define pages where we DON'T want the header/nav (like landing, login, register)
  const isAuthPage = pathname === "/" || pathname === "/login" || pathname === "/register";

  return (
    <html lang="en">
      <body className="bg-[#0f172a] antialiased">
        {!isAuthPage && <Header />}
        <main>{children}</main>
        {!isAuthPage && <BottomNav />}
      </body>
    </html>
  );
}