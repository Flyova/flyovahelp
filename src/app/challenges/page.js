"use client";
import { useState } from "react";
import { Search, Swords, User, ShieldCheck } from "lucide-react";

export default function ChallengeList() {
  const [searchTerm, setSearchTerm] = useState("");
  
  // Mock Data for Players - This will eventually come from Firebase
  const [players] = useState([
    { id: 1, username: "ShadowMaster", balance: 45.00, status: "active", country: "USA" },
    { id: 2, username: "ProGamer99", balance: 12.00, status: "busy", country: "UK" },
    { id: 3, username: "FlvaovaKing", balance: 150.50, status: "active", country: "NG" },
    { id: 4, username: "CryptoQueen", balance: 5.00, status: "busy", country: "CAN" },
  ]);

  const filteredPlayers = players.filter(p => 
    p.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleChallenge = (player) => {
    if (player.status === 'busy') {
      alert("This player is currently in a match!");
      return;
    }
    // We'll build the Stake Selection Modal next!
    alert(`Challenging ${player.username}...`);
  };

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#0f172a] p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        
        {/* Search & Stats Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-black text-white flex items-center">
              PLAY WITH FRIENDS <Swords className="ml-3 text-[#fc7952]" />
            </h1>
            <p className="text-gray-400">Challenge online players and win rewards.</p>
          </div>
          
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
            <input 
              type="text"
              placeholder="Search username..."
              className="w-full bg-[#1e293b] border-gray-700 border p-3 pl-10 rounded-xl focus:ring-2 focus:ring-[#613de6] outline-none text-white text-sm"
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Players List */}
        <div className="grid gap-4">
          {filteredPlayers.length > 0 ? (
            filteredPlayers.map((player) => (
              <div 
                key={player.id}
                className="bg-[#1e293b] border border-gray-800 p-5 rounded-2xl flex items-center justify-between transition-all hover:border-[#613de6]/50 group"
              >
                <div className="flex items-center space-x-4">
                  <div className="relative">
                    <div className="w-14 h-14 bg-[#0f172a] rounded-full flex items-center justify-center border-2 border-gray-700">
                      <User size={28} className="text-gray-400" />
                    </div>
                    {/* Status Indicator */}
                    <div className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-[#1e293b] ${
                      player.status === 'active' ? 'bg-green-500' : 'bg-yellow-500'
                    }`} />
                  </div>
                  
                  <div>
                    <h3 className="font-bold text-lg text-white group-hover:text-[#fc7952] transition-colors">
                      {player.username}
                    </h3>
                    <div className="flex items-center space-x-2 text-xs text-gray-500">
                      <span>{player.country}</span>
                      <span>•</span>
                      <span className={player.status === 'active' ? 'text-green-400' : 'text-yellow-400'}>
                        {player.status === 'active' ? 'Active now' : 'Busy in-game'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-4">
                  <div className="hidden md:block text-right mr-4">
                    <p className="text-xs text-gray-500 uppercase font-bold">Balance</p>
                    <p className="text-white font-mono font-bold">${player.balance.toFixed(2)}</p>
                  </div>
                  
                  <button 
                    onClick={() => handleChallenge(player)}
                    className={`px-6 py-3 rounded-xl font-bold text-sm transition-all flex items-center space-x-2 shadow-lg ${
                      player.status === 'active' 
                      ? 'bg-[#613de6] text-white active:scale-95' 
                      : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    <Swords size={16} />
                    <span>CHALLENGE</span>
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-20 bg-[#1e293b] rounded-3xl border border-dashed border-gray-700">
              <p className="text-gray-500">No players found in the arena...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}