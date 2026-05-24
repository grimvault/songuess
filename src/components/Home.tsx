import { useState, FormEvent } from 'react';
import { useGameStore } from '../stores/useGameStore';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db, auth, signIn } from '../firebase';
import { generateLobbyId, generateAvatarUrl } from '../lib/utils';
import { Music, ArrowRight, Plus } from 'lucide-react';

export function Home() {
  const { setRole, setLobbyId, setPlayerInfo, lobbyId: storeLobbyId } = useGameStore();
  
  const [joinCode, setJoinCode] = useState(storeLobbyId || '');
  const [playerName, setPlayerName] = useState(() => localStorage.getItem('playerName') || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreateGame = async () => {
    setLoading(true);
    setError('');
    try {
      if (!auth.currentUser) {
        await signIn();
      }
      if (!auth.currentUser) throw new Error("Could not authenticate");
      
      const newLobbyId = generateLobbyId();
      await setDoc(doc(db, 'lobbies', newLobbyId), {
        hostId: auth.currentUser.uid,
        status: 'waiting',
        currentRound: 0,
        currentAnswers: [],
        correctAnswer: '',
        currentTrackPreview: '',
        currentTrackCover: '',
        roundStartTime: 0,
        settings: {
          gameMode: 'songName',
          rounds: 5,
          category: 'all',
          numOptions: 4,
          answerStyle: 'mcq',
          autoAdvance: 'manual'
        }
      });
      setLobbyId(newLobbyId);
      setRole('host');
    } catch (e: any) {
      console.error(e);
      setError('Failed to create game. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinGame = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      if (!auth.currentUser) {
        await signIn();
      }
      if (!auth.currentUser || !joinCode || !playerName) {
        setLoading(false);
        return;
      }
      
      const lobbyCode = joinCode.toUpperCase().trim();
      const lobbySnap = await getDoc(doc(db, 'lobbies', lobbyCode));
      
      if (!lobbySnap.exists()) {
        setError('Lobby not found');
        setLoading(false);
        return;
      }
      
      const newPlayerId = auth.currentUser.uid;
      localStorage.setItem('playerName', playerName);
      
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
          <div className="inline-flex p-5 mx-auto bg-zinc-900 rounded-3xl mb-2 relative">
            <Music className="w-12 h-12 text-white relative" />
          </div>
          <h1 className="text-6xl font-bold tracking-tighter text-white">Songuess</h1>
          <p className="text-zinc-400 text-lg font-medium">The multiplayer music guessing party game.</p>
        </div>

        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl text-center text-sm font-medium">
            {error}
          </div>
        )}

        <div className="space-y-6">
          <form onSubmit={handleJoinGame} className="bg-zinc-900 border border-zinc-800 rounded-[2rem] p-8 space-y-6">
            <h2 className="text-2xl font-bold tracking-tight">Join a Game</h2>
            <div className="space-y-4">
              <input
                type="text"
                placeholder="Lobby Code (e.g. ABCD1234)"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-white focus:border-white uppercase placeholder:normal-case font-mono text-lg transition-all"
                maxLength={8}
                required
              />
              <input
                type="text"
                placeholder="Your Nickname"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-white focus:border-white text-lg transition-all"
                maxLength={16}
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading || !joinCode || !playerName}
              className="w-full bg-white text-black hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed font-bold text-lg rounded-2xl px-4 py-4 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
            >
              Ready to Play <ArrowRight className="w-5 h-5" />
            </button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-zinc-800/50" />
            </div>
            <div className="relative flex justify-center text-xs uppercase font-bold tracking-widest">
              <span className="bg-zinc-950 px-4 text-zinc-500">Or host your own</span>
            </div>
          </div>

          <button
            onClick={handleCreateGame}
            disabled={loading}
            className="w-full bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 hover:border-zinc-700 text-white rounded-2xl px-4 py-4 flex items-center justify-center gap-2 transition-all active:scale-[0.98] text-lg font-bold"
          >
            <Plus className="w-6 h-6" /> Create New Game
          </button>
        </div>
      </div>
    </div>
  );
}
