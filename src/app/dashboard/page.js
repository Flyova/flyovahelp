"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Play, Loader2 } from "lucide-react";
// FIREBASE IMPORTS
import { auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";

export default function Dashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    // SECURITY GATE: Check if user is logged in
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        // If no user, boot them to login
        router.push("/login");
      } else {
        // User exists, allow access
        setUser(currentUser);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  // Updated paths to match your folder structure
  const topGames = [
    { 
      id: 1, 
      name: "Play with Friends", 
      img: "/play_friends.svg", 
      tag: "Hot",
      path: "/game/1" 
    },
    { 
      id: 2, 
      name: "Flyova To Dollars", 
      img: "/flytodols.svg", 
      tag: "Cash",
      path: "/game/flyova-to-dollars" // LINK UPDATED HERE
    },
    { 
      id: 3, 
      name: "Predict and Win", 
      img: "/predictwin.svg", 
      tag: "New",
      path: "/game" 
    }
  ];

  const handleNavigation = (path) => {
    if (path !== "#") {
      router.push(path);
    }
  };

  // Show a clean loading state while checking Auth
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center text-white">
        <Loader2 className="animate-spin text-[#613de6] mb-4" size={40} />
        <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-50">Loading...</p>
      </div>
    );
  }

  return (
    <main className="pb-24 bg-[#0f172a] min-h-screen animate-in fade-in duration-500">
    

      {/* Top Banner */}
      <div className="p-4">
        <div 
          onClick={() => handleNavigation('/game/1')}
          className="relative w-full h-44 rounded-3xl overflow-hidden bg-[#613de6] group cursor-pointer shadow-2xl border border-white/5"
        >
          <div className="absolute inset-0 opacity-40 group-hover:opacity-60 transition-opacity">
            <img src="/play_friends.svg" alt="Background" className="w-full h-full object-cover" />
          </div>
          <div className="absolute inset-0 bg-gradient-to-r from-black/60 to-transparent" />
          <div className="absolute bottom-6 left-6 z-10">
            <h2 className="text-2xl font-black text-white italic leading-tight tracking-tighter">
              CHALLENGE FRIENDS<br/>
              <span className="text-[#fc7952]">WIN INSTANTLY</span>
            </h2>
            <button className="mt-3 bg-[#fc7952] text-white px-6 py-2 rounded-full text-xs font-black uppercase shadow-lg group-hover:scale-105 transition-all">
              Play Now
            </button>
          </div>
        </div>
      </div>

      {/* Search Section */}
      <div className="px-4 mb-6">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
          <input 
            className="w-full bg-[#1e293b] border border-gray-800 p-4 pl-12 rounded-2xl text-sm focus:border-[#613de6] outline-none text-white font-bold transition-all" 
            placeholder="Search for games..." 
          />
        </div>
      </div>

      {/* Game Grid */}
      <div className="px-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-black text-white text-lg uppercase tracking-tighter italic">Featured Games</h3>
          <button className="text-[#fc7952] text-xs font-black uppercase tracking-widest hover:underline">View All</button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {topGames.map((game, index) => (
            <div 
              key={game.id} 
              onClick={() => handleNavigation(game.path)}
              className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-[#1e293b] border border-gray-800 active:scale-95 transition-all group cursor-pointer shadow-lg"
            >
              {/* Ranking Badge */}
              <div className="absolute top-0 left-0 bg-red-600 text-white font-black px-2.5 py-1 text-[10px] rounded-br-xl z-30 shadow-md italic">
                {index + 1}
              </div>
              
              {/* Card Background Image */}
              <div className="absolute inset-0 z-10 overflow-hidden">
                <img 
                  src={game.img} 
                  alt={game.name} 
                  className="w-full h-full object-cover opacity-50 group-hover:opacity-100 transition-all duration-500 group-hover:scale-110" 
                />
              </div>

              {/* Information Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent z-20" />
              
              <div className="absolute bottom-3 left-0 right-0 px-2 text-center z-30">
                <p className="text-[9px] font-black text-white uppercase truncate tracking-tighter mb-1">
                  {game.name}
                </p>
                <div className="text-[7px] inline-block px-2 py-0.5 rounded-full font-black uppercase shadow-sm bg-[#fc7952] text-white">
                  {game.tag}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}