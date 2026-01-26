"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ArrowRight, Star, ShieldCheck, Zap, Menu } from "lucide-react";

export default function LandingPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#613de6] text-white selection:bg-[#fc7952] overflow-x-hidden">
      {/* Navigation Header */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">
        <div className="flex items-center space-x-2">
          <Image src="/logo.svg" alt="Logo" width={40} height={40} className="rounded-full bg-white/10 p-1" />
          <span className="text-2xl font-black tracking-tighter italic">FLYOVHELP</span>
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
          Play Lotto <ArrowRight size={16} className="ml-2" />
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
              <span className="text-white">Arena and </span> <br />
              <span className="text-white">Win Big</span>
            </h1>
            <p className="text-lg md:text-xl text-white/80 max-w-lg font-medium">
              Stake your bet, challenge your friends, and get a chance to win huge prizes. 
              It's simple, fun, and could turn your luck around in an instant.
            </p>
          </div>

          <button 
            onClick={() => router.push('/register')}
            className="group relative inline-flex items-center justify-center px-10 py-5 font-black text-white transition-all duration-200 bg-[#fc7952] rounded-full hover:bg-[#fd8a6a] active:scale-95 shadow-2xl"
          >
            Play Now <ArrowRight className="ml-2 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>

        {/* Right Column: Mobile UI Preview */}
        <div className="flex-1 mt-16 md:mt-0 relative flex justify-center z-10">
          <div className="w-[300px] h-[600px] bg-white rounded-[3rem] p-3 shadow-[0_50px_100px_rgba(0,0,0,0.4)] border-[8px] border-white/10 relative overflow-hidden">
            {/* Phone Content Simulation */}
            <div className="bg-white h-full rounded-[2rem] overflow-hidden flex flex-col text-[#613de6]">
              {/* Fake Phone Header */}
              <div className="p-4 flex justify-between items-center border-b">
                 <div className="flex items-center space-x-1">
                    <Image src="/logo.svg" alt="logo" width={20} height={20} />
                    <span className="font-black text-xs">flyovhelp</span>
                 </div>
                 <div className="flex space-x-2">
                    <Zap size={14} />
                    <Menu size={14} />
                 </div>
              </div>

              {/* Fake Game Interface */}
              <div className="p-4 flex-1 flex flex-col space-y-4">
                 <h3 className="font-black text-sm uppercase text-center mt-2">Live Betting</h3>
                 <div className="bg-orange-100 p-3 rounded-lg text-[10px] text-orange-700 font-bold text-center">
                    Pick 2 random numbers, enter stake amount, click on place bet and wait for results.
                 </div>

                 <div className="text-center">
                    <p className="text-[10px] font-bold opacity-60">Current Round: 1574</p>
                    <p className="text-red-500 font-black text-lg">Time remaining: 27 seconds</p>
                 </div>

                 {/* Number Grid */}
                 <div className="grid grid-cols-2 gap-2">
                    {[29, 42, 8, 26].map((n, i) => (
                      <div key={i} className={`h-10 rounded flex items-center justify-center font-bold border-2 ${i === 1 || i === 2 ? 'bg-[#613de6] text-white border-[#613de6]' : 'border-gray-200 text-gray-400'}`}>
                        {n}
                      </div>
                    ))}
                 </div>
                 <div className="flex justify-center">
                    <div className="w-1/2 h-10 border-2 border-gray-200 rounded flex items-center justify-center text-gray-400 font-bold">16</div>
                 </div>

                 <button className="w-full bg-[#613de6] text-white py-3 rounded-xl font-black text-xs uppercase shadow-lg">
                    Place Bet
                 </button>
              </div>

              {/* Fake Phone Nav */}
              <div className="p-4 flex justify-around border-t opacity-40">
                 <div className="w-4 h-4 bg-gray-300 rounded" />
                 <div className="w-4 h-4 bg-gray-300 rounded" />
                 <div className="w-4 h-4 bg-gray-300 rounded" />
                 <div className="w-4 h-4 bg-gray-300 rounded" />
              </div>
            </div>
          </div>
          
          {/* Decorative floating 3D balls like your screenshot */}
          <div className="absolute -top-10 -right-4 w-16 h-16 bg-cyan-400 rounded-full shadow-inner animate-bounce" />
          <div className="absolute bottom-10 -left-10 w-24 h-24 bg-[#fc7952] rounded-full shadow-inner" />
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