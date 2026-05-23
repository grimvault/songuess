import { useEffect, useState } from 'react';
import { useGameStore } from '../stores/useGameStore';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Lobby, Player } from '../types';
import { LogOut, Check, X, Clock } from 'lucide-react';

export function PlayerScreen() {
  const { lobbyId, playerId, reset } = useGameStore();
  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);

  useEffect(() => {
    if (!lobbyId || !playerId) return;
    const unsubLobby = onSnapshot(doc(db, 'lobbies', lobbyId), (docSnap) => {
      if (docSnap.exists()) {
        setLobby(docSnap.data() as Lobby);
      } else {
        reset();
      }
    });

    const unsubPlayer = onSnapshot(doc(db, 'lobbies', lobbyId, 'players', playerId), (docSnap) => {
      if (docSnap.exists()) {
        setPlayer(docSnap.data() as Player);
      }
    });

    return () => {
      unsubLobby();
      unsubPlayer();
    };
  }, [lobbyId, playerId, reset]);

  const handleGuess = async (answer: string) => {
    if (!lobbyId || !playerId || !player || player.hasGuessed || lobby?.status !== 'playing') return;
    
    await updateDoc(doc(db, 'lobbies', lobbyId, 'players', playerId), {
      hasGuessed: true,
      lastGuess: answer,
      lastGuessTime: Date.now()
    });
  };

  const handleLeave = () => {
    reset();
  };

  if (!lobby || !player) {
    return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-500">Loading...</div>;
  }

  const isPlaying = lobby.status === 'playing';
  const isFinished = lobby.status === 'roundFinished' || lobby.status === 'gameFinished';

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col font-sans selection:bg-purple-500/30">
      
      {/* Header */}
      <header className="bg-zinc-900 border-b border-zinc-800 p-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <img src={player.avatar} alt="Avatar" className="w-12 h-12 rounded-full border-2 border-zinc-700" />
          <div>
            <div className="font-bold text-lg leading-tight">{player.name}</div>
            <div className="text-zinc-400 text-sm font-mono">{player.score} pts</div>
          </div>
        </div>
        <button onClick={handleLeave} className="w-10 h-10 flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 rounded-full text-zinc-400 transition-colors">
          <LogOut className="w-5 h-5" />
        </button>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col p-4">
        
        {lobby.status === 'waiting' || lobby.status === 'starting' ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6">
            <div className="w-24 h-24 rounded-full bg-zinc-900 border-4 border-zinc-800 flex items-center justify-center animate-pulse">
              <Clock className="w-10 h-10 text-zinc-500" />
            </div>
            <h2 className="text-3xl font-bold">You're in!</h2>
            <p className="text-zinc-400 text-lg">Look at the main screen.<br/>The host will start soon.</p>
          </div>
        ) : null}

        {isPlaying ? (
          <div className="flex-1 flex flex-col">
            <div className="text-center mb-6">
              <span className="inline-block px-4 py-1.5 bg-purple-500/10 text-purple-400 font-semibold rounded-full text-sm">
                Round {lobby.currentRound}
              </span>
            </div>
            
            {player.hasGuessed ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4">
                <div className="w-20 h-20 bg-green-500/10 border border-green-500/20 text-green-400 rounded-full flex items-center justify-center mb-4">
                  <Check className="w-10 h-10" />
                </div>
                <h3 className="text-2xl font-bold">Guess sent!</h3>
                <p className="text-zinc-400">Waiting for others...</p>
              </div>
            ) : (
              <div className="flex-1 flex flex-col gap-4">
                {lobby.currentAnswers.map((ans, i) => (
                  <button
                    key={i}
                    onClick={() => handleGuess(ans)}
                    className="flex-1 bg-zinc-900 border border-zinc-800 rounded-3xl p-6 text-xl font-bold text-center transition-all hover:bg-zinc-800 focus:ring-4 focus:ring-purple-500/20 active:scale-[0.98] focus:outline-none flex items-center justify-center shadow-lg"
                  >
                    {ans}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {isFinished ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6">
            <div className="text-sm font-semibold uppercase tracking-widest text-zinc-500">
              {lobby.status === 'gameFinished' ? 'Final Results' : 'Round Over'}
            </div>
            
            {player.lastPointsEarned > 0 ? (
              <>
                <div className="w-32 h-32 bg-green-500 rounded-full flex items-center justify-center shadow-[0_0_60px_rgba(34,197,94,0.4)] transition-all duration-500 scale-110">
                  <Check className="w-16 h-16 text-white" />
                </div>
                <h2 className="text-4xl font-bold text-green-400">Correct!</h2>
                <div className="text-2xl font-mono text-white">+{player.lastPointsEarned} pts</div>
              </>
            ) : (
              <>
                <div className="w-32 h-32 bg-red-500 rounded-full flex items-center justify-center shadow-[0_0_60px_rgba(239,68,68,0.4)] transition-all duration-500 scale-110">
                  <X className="w-16 h-16 text-white" />
                </div>
                <h2 className="text-4xl font-bold text-red-400">Incorrect</h2>
                <div className="text-xl text-zinc-400">Better luck next time</div>
              </>
            )}
            
            <p className="mt-12 text-zinc-500 pt-8 border-t border-zinc-900 w-full">
              Look at the main screen for details.
            </p>
          </div>
        ) : null}

      </main>
    </div>
  );
}
