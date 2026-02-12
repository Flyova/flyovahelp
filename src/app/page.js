"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { 
  ArrowRight, Star, ShieldCheck, Zap, Menu, Timer, Trophy, Wallet, 
  Instagram, Facebook, Twitter 
} from "lucide-react";

export default function LandingPage() {
  const router = useRouter();
  const [activeTestimonial, setActiveTestimonial] = useState(0);

  const testimonials = [
    { name: "John D.", text: "Turned my lucky $10 into $500 in one afternoon. The withdrawals are instant!", rating: 5 },
    { name: "Sarah K.", text: "Finally a platform that is transparent and fun. Flyova is the real deal.", rating: 5 },
    { name: "Mike R.", text: "The interface is beautiful and the community is amazing. Highly recommended!", rating: 4 },
    { name: "Elena V.", text: "I love the Jackpots! Every draw feels like an event. Best gaming site out there.", rating: 5 },
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveTestimonial((prev) => (prev + 1) % testimonials.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [testimonials.length]);

  return (
    <div className="min-h-screen bg-[#613de6] text-white selection:bg-[#fc7952] overflow-x-hidden">
      {/* Navigation Header */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto relative z-50">
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
        
        {/* Floating Background Shapes (THE BUBBLES) */}
        <div className="absolute top-20 right-1/4 w-32 h-32 bg-cyan-400 rounded-full blur-[80px] opacity-30 animate-pulse" />
        <div className="absolute bottom-10 left-10 w-48 h-48 bg-[#fc7952] rounded-full blur-[100px] opacity-20" />

        {/* Left Column: Text Content */}
        <div className="flex-1 text-center md:text-left z-10 space-y-8">
          <div className="space-y-4">
            <h1 className="text-5xl md:text-8xl font-black italic leading-[0.9] tracking-tighter">
              Feeling Lucky? <br />
              <span className="text-white">Play Flyovhelp </span> <br /> 
              <span className="text-white">and Win Big</span>
            </h1>
            <p className="text-md md:text-xl text-white/80 max-w-lg font-medium mx-auto md:mx-0">
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

          {/* Testimonials - Responsive & Integrated */}
          <div className="mt-12 max-w-sm mx-auto md:mx-0">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-400 mb-4 text-center md:text-left">Player Testimonials</p>
            <div className="bg-black/20 backdrop-blur-md border border-white/5 p-6 rounded-[2rem] min-h-[140px] flex flex-col justify-center relative overflow-hidden text-left shadow-2xl">
              <div className="flex gap-1 mb-2">
                {[...Array(testimonials[activeTestimonial].rating)].map((_, i) => (
                  <Star key={i} size={12} className="fill-yellow-400 text-yellow-400" />
                ))}
              </div>
              <p className="text-sm font-bold italic text-white/90 leading-relaxed mb-3">
                "{testimonials[activeTestimonial].text}"
              </p>
              <p className="text-[10px] font-black uppercase text-[#fc7952] tracking-widest">
                — {testimonials[activeTestimonial].name}
              </p>
              
              <div className="absolute right-6 bottom-6 flex gap-1">
                {testimonials.map((_, i) => (
                  <div key={i} className={`w-1 h-1 rounded-full transition-all duration-500 ${activeTestimonial === i ? 'bg-white w-4' : 'bg-white/20'}`} />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Mobile UI Preview */}
        <div className="flex-1 mt-16 md:mt-0 relative flex justify-center z-10">
          <div className="w-[300px] md:w-[310px] h-[610px] md:h-[630px] bg-[#0f172a] rounded-[3.5rem] p-3 shadow-[0_50px_100px_rgba(0,0,0,0.6)] border-[10px] border-white/10 relative overflow-hidden">
            
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

                 <div className="text-center space-y-1 py-2">
                    <div className="flex items-center justify-center gap-2 text-rose-500">
                      <Timer size={14} className="animate-spin-slow" />
                      <p className="font-black text-xl italic tracking-tighter">00:27</p>
                    </div>
                    <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">Next Draw Closing</p>
                 </div>

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
                    <button className="w-full bg-[#613de6] hover:bg-[#7251ed] text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl transition-all active:scale-95">
                       Place Stake Now
                    </button>
                 </div>
              </div>

              <div className="p-6 pb-10 flex justify-around border-t border-white/5 bg-black/20">
                 <div className="w-2 h-2 bg-[#613de6] rounded-full" />
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

      {/* Footer Section */}
      <footer className="max-w-7xl mx-auto px-6 py-12 border-t border-white/10 flex flex-col items-center md:flex-row md:justify-between">
        <div className="text-center md:text-left">
          <p className="text-[10px] font-black tracking-widest opacity-60">© 2026 FLYOVHELP ARENA. ALL RIGHTS RESERVED.</p>
        </div>
        
        {/* Social Icons with Brand Colors */}
        <div className="flex items-center space-x-4 mt-8 md:mt-0">
          <a href="https://www.facebook.com/share/1D5ScZvv82/" className="w-10 h-10 rounded-full bg-[#1877F2] flex items-center justify-center hover:scale-110 transition-transform shadow-lg shadow-[#1877F2]/20">
            <Facebook size={18} fill="currentColor" />
          </a>
          <a href="https://www.instagram.com/flyovahelp" className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#f9ce34] via-[#ee2a7b] to-[#6228d7] flex items-center justify-center hover:scale-110 transition-transform shadow-lg shadow-[#ee2a7b]/20">
            <Instagram size={18} />
          </a>
          <a href="https://www.instagram.com/flyovahelp" className="w-10 h-10 rounded-full bg-[#1DA1F2] flex items-center justify-center hover:scale-110 transition-transform shadow-lg shadow-[#1DA1F2]/20">
            <Twitter size={18} fill="currentColor" />
          </a>
          <a href="https://x.com/Flyovahelp" className="w-10 h-10 rounded-full bg-black border border-white/10 flex items-center justify-center hover:scale-110 transition-transform shadow-lg shadow-black/20">
            <svg size={18} className="fill-current w-4.5 h-4.5" viewBox="0 0 24 24"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.04-.1z"/></svg>
          </a>
          
        </div>
      </footer>
    </div>
  );
}