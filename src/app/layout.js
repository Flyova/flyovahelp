// src/app/layout.js
"use client";
import { usePathname } from 'next/navigation';
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import "./globals.css";

export default function RootLayout({ children }) {
  const pathname = usePathname();
  
  // Define pages where we DON'T want the header/nav
  // Added a check for any path starting with /admin
  const isAuthPage = 
    pathname === "/" || 
    pathname === "/login" || 
    pathname === "/register" || 
    pathname.startsWith("/admin");

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