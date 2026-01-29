"use client";
import { useState } from "react";
import Sidebar from "@/components/admin/Sidebar";
import { Menu, X } from "lucide-react";

export default function AdminLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#f8fafc] flex text-slate-900">
      {/* Mobile Toggle */}
      <button 
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="lg:hidden fixed bottom-6 right-6 z-[60] bg-[#613de6] text-white p-4 rounded-full shadow-2xl"
      >
        {sidebarOpen ? <X /> : <Menu />}
      </button>

      {/* Sidebar Component */}
      <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 overflow-auto h-screen">
        <div className="p-4 md:p-8 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}