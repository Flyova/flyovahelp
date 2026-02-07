"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ArrowRight, Star, ShieldCheck, Zap, Menu, Timer, Trophy, Wallet } from "lucide-react";

export default function LandingPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#613de6] text-white selection:bg-[#fc7952] overflow-x-hidden">
      {/* Navigation Header */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">
        <div className="flex items-center space-x-2">
          <Image src="/logo.svg" alt="Logo" width={120} height={40} className="rounded-full bg-white/10 p-1" />
          </div>
        
        <div className="hidden md:flex items-center space-x-8 text-sm font-bold uppercase tracking-wider">
          <a href="#" className="text-[#fc7952]">Home</a>
          <a href="#" className="hover:text-[#fc7952] transition">Features</a>
          <a href="#" className="hover:text-[#fc7952] transition">Reviews</a>
          <button onClick={() => router.push('/login')} className="hover:text-[#fc7952] transition">Login</button>
          <button onClick={() => router.push('/register')} className="hover:text-[#fc7952] transition">Register</button>
        </div>

        <button 
          onClick={() => router.push('/login')}
          className="bg-cyan-400 hover:bg-cyan-300 text-black px-6 py-2 rounded-full font-black text-sm transition-all flex items-center shadow-[0_0_20px_rgba(34,211,238,0.4)]"
        >
          Play Game <ArrowRight size={16} className="ml-2" />
        </button>
      </nav>

      {/* Hero Section */}
      <main className="relative max-w-7xl mx-auto px-6 pt-12 pb-24 flex flex-col md:flex-row items-center">
        {/* Floating Background Shapes */}
        <div className="absolute top-20 right-1/4 w-32 h-32 bg-cyan-400 rounded-full blur-[80px] opacity-30 animate-pulse" />
        <div className="absolute bottom-10 left-10 w-48 h-48 bg-[#fc7952] rounded-full blur-[100px] opacity-20" />

        {/* Left Column: Text Content */}
        <div className="flex-1 text-center md:text-left z-10 space-y-8">
          <div className="space-y-4">
            <h1 className="text-6xl md:text-8xl font-black italic leading-[0.9] tracking-tighter">
              Feeling Lucky? <br />
              <span className="text-white">Play Flyovhelp </span> <br /> 
              <span className="text-white">and Win Big</span>
            </h1>
            <p className="text-lg md:text-xl text-white/80 max-w-lg font-medium">
              Stake your bet, challenge your friends, and get a chance to win huge prizes. 
              It's simple, fun, and could turn your luck around in an instant.
            </p>
          </div>

          <button 
            onClick={() => router.push('/login')}
            className="group relative inline-flex items-center justify-center px-10 py-5 font-black text-white transition-all duration-200 bg-[#fc7952] rounded-full hover:bg-[#fd8a6a] active:scale-95 shadow-2xl"
          >
            Play Now <ArrowRight className="ml-2 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>

        {/* Right Column: Mobile UI Preview (Enhanced) */}
        <div className="flex-1 mt-16 md:mt-0 relative flex justify-center z-10">
          <div className="w-[310px] h-[630px] bg-[#0f172a] rounded-[3.5rem] p-3 shadow-[0_50px_100px_rgba(0,0,0,0.6)] border-[10px] border-white/10 relative overflow-hidden">
            
            {/* Real Game Simulation UI */}
            <div className="bg-[#0f172a] h-full rounded-[2.8rem] overflow-hidden flex flex-col text-white font-sans">
              
              {/* Status Bar */}
              <div className="pt-6 px-8 flex justify-between items-center opacity-40">
                <span className="text-[10px] font-bold">9:41</span>
                <div className="flex gap-1">
                  <div className="w-3 h-3 bg-white rounded-full scale-75" />
                  <div className="w-3 h-3 bg-white rounded-full scale-75" />
                </div>
              </div>

              {/* Game Header */}
              <div className="p-5 flex justify-between items-center">
                 <div className="bg-white/5 p-2 rounded-xl">
                    <Menu size={18} className="text-[#613de6]" />
                 </div>
                 <div className="flex flex-col items-center">
                    <span className="text-[8px] font-black uppercase tracking-[0.2em] text-gray-500 italic">Arena Live</span>
                    <span className="text-xs font-black italic">FLYODOLS</span>
                 </div>
                 <div className="bg-[#613de6]/20 p-2 rounded-xl border border-[#613de6]/30 text-[#613de6]">
                    <Wallet size={16} />
                 </div>
              </div>

              {/* Game Interface */}
              <div className="px-5 flex-1 flex flex-col space-y-5">
                 
                 {/* Live Result Card */}
                 <div className="bg-gradient-to-br from-[#1e293b] to-[#0f172a] p-5 rounded-3xl border border-white/5 shadow-inner">
                    <div className="flex justify-between items-center mb-4">
                      <span className="text-[9px] font-black uppercase text-[#fc7952] flex items-center gap-1">
                        <Trophy size={10} /> Winning Numbers
                      </span>
                      <span className="text-[8px] bg-white/5 px-2 py-1 rounded-lg text-gray-400 font-bold uppercase">ID: 88241</span>
                    </div>
                    <div className="flex justify-around gap-2">
                       <div className="w-14 h-14 rounded-2xl bg-[#613de6] flex items-center justify-center text-2xl font-black italic shadow-lg shadow-[#613de6]/40 border border-white/20 animate-pulse">42</div>
                       <div className="w-14 h-14 rounded-2xl bg-[#fc7952] flex items-center justify-center text-2xl font-black italic shadow-lg shadow-[#fc7952]/40 border border-white/20 animate-pulse">17</div>
                    </div>
                 </div>

                 {/* Timer Section */}
                 <div className="text-center space-y-1 py-2">
                    <div className="flex items-center justify-center gap-2 text-rose-500">
                      <Timer size={14} className="animate-spin-slow" />
                      <p className="font-black text-xl italic tracking-tighter">00:27</p>
                    </div>
                    <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">Next Draw Closing</p>
                 </div>

                 {/* Betting Input Simulation */}
                 <div className="space-y-3 pt-2">
                    <div className="grid grid-cols-2 gap-3">
                       <div className="bg-black/40 border border-white/5 p-3 rounded-2xl text-center">
                          <p className="text-[8px] font-black text-gray-500 uppercase mb-1">Your Pick 1</p>
                          <p className="font-black text-lg">08</p>
                       </div>
                       <div className="bg-black/40 border border-white/5 p-3 rounded-2xl text-center">
                          <p className="text-[8px] font-black text-gray-500 uppercase mb-1">Your Pick 2</p>
                          <p className="font-black text-lg">26</p>
                       </div>
                    </div>
                    
                    <div className="bg-black/40 border border-white/5 p-4 rounded-2xl flex justify-between items-center">
                       <span className="text-[10px] font-black text-gray-400 uppercase">Stake Amount</span>
                       <span className="text-sm font-black text-emerald-500">$10.00</span>
                    </div>

                    <button className="w-full bg-[#613de6] hover:bg-[#7251ed] text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl shadow-[#613de6]/20 transition-all active:scale-95">
                       Place Stake Now
                    </button>
                 </div>
              </div>

              {/* Fake Phone Nav */}
              <div className="p-6 pb-10 flex justify-around border-t border-white/5 bg-black/20">
                 <div className="w-2 h-2 bg-[#613de6] rounded-full" />
                 <div className="w-2 h-2 bg-gray-700 rounded-full" />
                 <div className="w-2 h-2 bg-gray-700 rounded-full" />
                 <div className="w-2 h-2 bg-gray-700 rounded-full" />
              </div>
            </div>
          </div>
          
          {/* Decorative floating 3D balls */}
          <div className="absolute -top-10 -right-4 w-16 h-16 bg-cyan-400 rounded-full shadow-inner animate-bounce pointer-events-none" />
          <div className="absolute bottom-10 -left-10 w-24 h-24 bg-[#fc7952] rounded-full shadow-inner animate-pulse pointer-events-none" />
        </div>
      </main>

      {/* Footer / Trust Section */}
      <footer className="max-w-7xl mx-auto px-6 py-12 border-t border-white/10 flex flex-col md:flex-row justify-between items-center opacity-70">
        <p className="text-sm font-bold tracking-widest">© 2026 FLYOVHELP ARENA. ALL RIGHTS RESERVED.</p>
        <div className="flex space-x-6 mt-4 md:mt-0">
          <ShieldCheck size={20} />
          <Star size={20} />
          <Zap size={20} />
        </div>
      </footer>
    </div>
  );
}