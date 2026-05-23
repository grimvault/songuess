import { useState, FormEvent } from 'react';
import { useGameStore } from '../stores/useGameStore';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { generateLobbyId, generateAvatarUrl } from '../lib/utils';
import { Music, ArrowRight, Plus } from 'lucide-react';

export function Home() {
  const { setRole, setLobbyId, setPlayerInfo, lobbyId: storeLobbyId } = useGameStore();
  
  const [joinCode, setJoinCode] = useState(storeLobbyId || '');
  const [playerName, setPlayerName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreateGame = async () => {
    if (!auth.currentUser) return;
    setLoading(true);
    const newLobbyId = generateLobbyId();
    try {
      await setDoc(doc(db, 'lobbies', newLobbyId), {
        hostId: auth.currentUser.uid,
        status: 'waiting',
        currentRound: 0,
        settings: {
          gameMode: 'songName',
          rounds: 5,
          category: 'pop' // Default category
        }
      });
      setLobbyId(newLobbyId);
      setRole('host');
    } catch (e) {
      console.error(e);
      setError('Failed to create game. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinGame = async (e: FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || !joinCode || !playerName) return;
    
    setLoading(true);
    setError('');
    
    try {
      const lobbyCode = joinCode.toUpperCase().trim();
      const lobbySnap = await getDoc(doc(db, 'lobbies', lobbyCode));
      
      if (!lobbySnap.exists()) {
        setError('Lobby not found');
        setLoading(false);
        return;
      }
      
      const newPlayerId = auth.currentUser.uid;
      
      await setDoc(doc(db, 'lobbies', lobbyCode, 'players', newPlayerId), {
        name: playerName,
        avatar: generateAvatarUrl(playerName + Math.random()),
        score: 0,
        lastGuess: '',
        lastGuessTime: 0,
        lastPointsEarned: 0,
        hasGuessed: false
      });
      
      setPlayerInfo(newPlayerId, playerName);
      setLobbyId(lobbyCode);
      setRole('player');
    } catch (e: any) {
      console.error(e);
      setError('Failed to join. ' + (e.message || ''));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 font-sans text-zinc-100">
      
      <div className="max-w-md w-full space-y-12">
        <div className="text-center space-y-4">
          <div className="inline-block p-4 bg-purple-500/10 rounded-full mb-2">
            <Music className="w-12 h-12 text-purple-400" />
          </div>
          <h1 className="text-5xl font-bold tracking-tight text-white">Songuess</h1>
          <p className="text-zinc-400 text-lg">The multiplayer music guessing party game.</p>
        </div>

        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-center text-sm">
            {error}
          </div>
        )}

        <div className="space-y-6">
          <form onSubmit={handleJoinGame} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
            <h2 className="text-xl font-semibold mb-4">Join a Game</h2>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Lobby Code (e.g. ABCD)"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500/50 uppercase placeholder:normal-case font-mono text-lg"
                maxLength={4}
                required
              />
              <input
                type="text"
                placeholder="Your Nickname"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500/50 text-lg"
                maxLength={16}
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading || !joinCode || !playerName}
              className="w-full bg-white text-black hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-lg rounded-xl px-4 py-3 flex items-center justify-center gap-2 transition-colors"
            >
              Ready to Play <ArrowRight className="w-5 h-5" />
            </button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-zinc-800" />
            </div>
            <div className="relative flex justify-center text-sm uppercase">
              <span className="bg-zinc-950 px-4 text-zinc-500">Or host your own</span>
            </div>
          </div>

          <button
            onClick={handleCreateGame}
            disabled={loading}
            className="w-full bg-zinc-900 hover:bg-zinc-800 text-white border border-zinc-800 rounded-xl px-4 py-4 flex items-center justify-center gap-2 transition-colors text-lg font-medium"
          >
            <Plus className="w-5 h-5" /> Create New Game
          </button>
        </div>
      </div>
    </div>
  );
}
