import { useEffect, useState } from 'react';
import { useGameStore } from '../stores/useGameStore';
import { doc, onSnapshot, updateDoc, collection } from 'firebase/firestore';
import { db } from '../firebase';
import { Lobby, Player } from '../types';
import QRCode from 'react-qr-code';
import { Users, Settings, Play, Check, X, SkipForward, Music } from 'lucide-react';
import { searchItunes } from '../lib/itunes';

export function HostScreen() {
  const { lobbyId, reset } = useGameStore();
  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [categories, setCategories] = useState('pop'); // temp state for host editing
  const [gameMode, setGameMode] = useState<any>('songName');
  const [rounds, setRounds] = useState(5);
  const [loadingAudio, setLoadingAudio] = useState(false);
  
  // Timer state
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    if (!lobbyId) return;
    const unsubLobby = onSnapshot(doc(db, 'lobbies', lobbyId), (docSnap) => {
      if (docSnap.exists()) {
        setLobby(docSnap.data() as Lobby);
      } else {
        reset();
      }
    });

    const unsubPlayers = onSnapshot(collection(db, 'lobbies', lobbyId, 'players'), (snapshot) => {
      const p: Player[] = [];
      snapshot.forEach(d => p.push({ id: d.id, ...d.data() } as any));
      setPlayers(p);
    });

    return () => {
      unsubLobby();
      unsubPlayers();
    };
  }, [lobbyId, reset]);

  // Round Timer Logic
  useEffect(() => {
    if (lobby?.status === 'playing') {
      const updateTimer = () => {
        const elapsed = (Date.now() - lobby.roundStartTime) / 1000;
        const remaining = Math.max(0, 30 - elapsed);
        setTimeLeft(remaining);
        
        if (remaining <= 0) {
          // Time is up, finish round automatically
          finishRound();
        }
      };
      
      updateTimer();
      const interval = setInterval(updateTimer, 500);
      return () => clearInterval(interval);
    }
  }, [lobby?.status, lobby?.roundStartTime]);

  const startGame = async () => {
    if (!lobbyId) return;
    await updateDoc(doc(db, 'lobbies', lobbyId), {
      status: 'starting',
      settings: {
        gameMode,
        rounds,
        category: categories
      },
      currentRound: 0
    });
    nextRound();
  };

  const finishRound = async () => {
    if (!lobbyId || !lobby) return;
    
    // Calculate points for everyone who guessed
    const updates: any[] = [];
    players.forEach(p => {
      let pointsEarned = 0;
      if (p.hasGuessed && p.lastGuess === lobby.correctAnswer) {
        // Calculate points based on speed (max 1000)
        // 30 seconds max
        const guessTimeDiff = (p.lastGuessTime - lobby.roundStartTime) / 1000;
        const speedRatio = Math.max(0, 1 - (guessTimeDiff / 30));
        pointsEarned = Math.round(500 + (500 * speedRatio));
      }
      
      updates.push(updateDoc(doc(db, 'lobbies', lobbyId, 'players', (p as any).id), {
        score: p.score + pointsEarned,
        lastPointsEarned: pointsEarned
      }));
    });
    
    await Promise.all(updates);

    const isGameOver = lobby.currentRound >= lobby.settings.rounds;

    await updateDoc(doc(db, 'lobbies', lobbyId), {
      status: isGameOver ? 'gameFinished' : 'roundFinished',
    });
  };

  const nextRound = async () => {
    if (!lobbyId || !lobby) return;
    setLoadingAudio(true);
    
    try {
      const tracks = await searchItunes(lobby.settings.category);
      if (tracks.length < 4) throw new Error("Not enough tracks found");
      
      // Pick 4 random unique tracks
      const shuffled = tracks.sort(() => 0.5 - Math.random());
      const selected = shuffled.slice(0, 4);
      
      // Pick 1 as answer
      const answerTrack = selected[Math.floor(Math.random() * selected.length)];
      
      // Map to answers based on game mode
      let targetAnswers = [];
      let correctAnswer = "";
      
      if (lobby.settings.gameMode === 'author') {
        targetAnswers = selected.map(t => t.artist);
        correctAnswer = answerTrack.artist;
      } else {
        targetAnswers = selected.map(t => t.name);
        correctAnswer = answerTrack.name;
      }

      // Reset players guesses
      const pUpdates = players.map(p => updateDoc(doc(db, 'lobbies', lobbyId, 'players', (p as any).id), {
        hasGuessed: false,
        lastGuess: '',
        lastPointsEarned: 0
      }));
      await Promise.all(pUpdates);

      await updateDoc(doc(db, 'lobbies', lobbyId), {
        status: 'playing',
        currentRound: lobby.currentRound + 1,
        currentAnswers: targetAnswers.sort(() => 0.5 - Math.random()),
        correctAnswer,
        currentTrackPreview: answerTrack.previewUrl,
        currentTrackCover: answerTrack.artworkUrl,
        roundStartTime: Date.now()
      });
      
    } catch (e) {
      console.error("Failed to load tracks", e);
      alert("Failed to load tracks. Try changing the category.");
      await updateDoc(doc(db, 'lobbies', lobbyId), { status: 'waiting' });
    } finally {
      setLoadingAudio(false);
    }
  };

  if (!lobby) return <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">Loading lobby...</div>;

  const joinUrl = `${window.location.origin}/?lobby=${lobbyId}`;

  if (lobby.status === 'waiting' || lobby.status === 'starting') {
    return (
      <div className="min-h-screen bg-zinc-950 text-white p-8 font-sans flex text-center lg:text-left flex-col lg:flex-row gap-12">
        <div className="flex-1 space-y-8 flex flex-col justify-center max-w-xl mx-auto lg:mx-0">
          <div className="space-y-4">
            <h1 className="text-6xl font-bold tracking-tighter">Join the Party!</h1>
            <p className="text-2xl text-zinc-400">Scan the QR code or go to <span className="text-white font-mono">{window.location.host}</span> to join.</p>
          </div>
          
          <div className="bg-white p-6 rounded-3xl inline-block mx-auto lg:mx-0">
            <QRCode value={joinUrl} size={256} className="w-64 h-64" />
          </div>
          
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-6">
            <div className="flex items-center gap-3">
              <Settings className="w-6 h-6 text-purple-400" />
              <h2 className="text-2xl font-semibold">Game Settings</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm text-zinc-400">Game Mode</label>
                <select 
                  value={gameMode} 
                  onChange={e => setGameMode(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="songName">Guess Song Name (Audio)</option>
                  <option value="coverImage">Guess Song Name (By Cover)</option>
                  <option value="author">Guess Artist (Audio)</option>
                </select>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm text-zinc-400">Category / Playlist</label>
                <select 
                  value={categories} 
                  onChange={e => setCategories(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="pop">Pop Hits</option>
                  <option value="rock">Rock Classics</option>
                  <option value="hip-hop">Hip Hop</option>
                  <option value="electronic">Electronic / Dance</option>
                  <option value="k-pop">K-Pop</option>
                  <option value="country">Country</option>
                  <option value="2010s">2010s Throwbacks</option>
                  <option value="2000s">2000s Nostalgia</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm text-zinc-400">Total Rounds</label>
                <div className="flex gap-2">
                  {[5, 10, 15, 20].map(r => (
                    <button 
                      key={r}
                      onClick={() => setRounds(r)}
                      className={`flex-1 py-3 rounded-xl border font-medium ${rounds === r ? 'bg-purple-500 border-purple-500 text-white' : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-600'}`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={startGame}
              disabled={players.length === 0}
              className="w-full bg-white text-black text-xl font-bold rounded-xl py-4 flex items-center justify-center gap-3 hover:bg-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Play className="w-6 h-6 fill-current" />
              Start Game ({players.length} Players)
            </button>
          </div>
        </div>

        <div className="flex-1 max-w-xl mx-auto w-full lg:max-w-none">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 h-full min-h-[600px]">
            <div className="flex items-center gap-3 mb-8">
              <Users className="w-8 h-8 text-purple-400" />
              <h2 className="text-3xl font-bold tracking-tight">Lobby ({lobbyId})</h2>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
              {players.length === 0 && (
                <div className="col-span-full text-center text-zinc-500 py-12">
                  Waiting for players to join...
                </div>
              )}
              {players.map(p => (
                <div key={(p as any).id} className="bg-zinc-950 rounded-2xl p-4 flex flex-col items-center gap-3 border border-zinc-800">
                  <img src={p.avatar} alt={p.name} className="w-20 h-20 rounded-full bg-zinc-900" />
                  <span className="font-semibold truncate w-full text-center">{p.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (lobby.status === 'playing') {
    // If all players have guessed, finish early
    const allGuessed = players.length > 0 && players.every(p => p.hasGuessed);
    if (allGuessed && timeLeft > 0) {
      finishRound();
    }

    return (
      <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
        <div className="flex items-center justify-between p-6">
          <h2 className="text-3xl font-bold">Round {lobby.currentRound} / {lobby.settings.rounds}</h2>
          <div className="text-6xl font-mono tracking-tighter">
            00:{Math.ceil(timeLeft).toString().padStart(2, '0')}
          </div>
        </div>
        
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-12">
          
          {lobby.settings.gameMode !== 'coverImage' && lobby.currentTrackPreview && (
            <audio src={lobby.currentTrackPreview} autoPlay className="hidden" />
          )}

          {lobby.settings.gameMode === 'coverImage' ? (
            <img src={lobby.currentTrackCover} alt="Cover" className="w-[400px] h-[400px] rounded-3xl shadow-2xl object-cover transition-opacity duration-700" />
          ) : (
            <div className="w-[400px] h-[400px] rounded-full bg-purple-500/20 border-4 border-purple-500/30 flex items-center justify-center animate-pulse">
              <Music className="w-32 h-32 text-purple-400" />
            </div>
          )}
          
          <div className="grid grid-cols-2 gap-4 max-w-4xl w-full">
            {lobby.currentAnswers.map((ans, i) => (
              <div key={i} className="bg-zinc-900 border-2 border-zinc-800 text-3xl font-semibold py-8 px-6 rounded-3xl text-center shadow-lg">
                ??
              </div>
            ))}
          </div>

          <div className="flex flex-wrap justify-center gap-4 mt-8">
             {players.map(p => (
               <div key={(p as any).id} className={`w-16 h-16 rounded-full border-4 transition-colors ${p.hasGuessed ? 'border-green-500 opacity-100' : 'border-zinc-800 opacity-50'}`}>
                 <img src={p.avatar} alt={p.name} className="rounded-full w-full h-full object-cover" />
               </div>
             ))}
          </div>
        </div>

        <button onClick={finishRound} className="absolute bottom-6 right-6 p-4 bg-zinc-900 rounded-full hover:bg-zinc-800">
          <SkipForward className="w-8 h-8" />
        </button>
      </div>
    );
  }

  if (lobby.status === 'roundFinished' || lobby.status === 'gameFinished') {
    // Sort players by score
    const sorted = [...players].sort((a, b) => b.score - a.score);

    return (
      <div className="min-h-screen bg-zinc-950 text-white p-12 flex flex-col items-center">
        
        <div className="text-center space-y-6 mb-12">
          <h2 className="text-5xl font-bold tracking-tight">
            {lobby.status === 'gameFinished' ? 'Final Standings!' : 'Round Over'}
          </h2>
          
          <div className="flex items-center justify-center gap-8 mt-12 mb-16 transition-all duration-700">
            <img src={lobby.currentTrackCover} alt="Cover" className="w-64 h-64 rounded-3xl shadow-2xl object-cover" />
            <div className="text-left space-y-2 max-w-xl">
              <p className="text-2xl text-zinc-400 uppercase tracking-widest font-semibold">The correct answer was</p>
              <h3 className="text-5xl font-bold text-green-400 leading-tight">
                {lobby.correctAnswer}
              </h3>
            </div>
          </div>
        </div>

        <div className="w-full max-w-4xl space-y-4">
          {sorted.map((p, i) => (
            <div key={(p as any).id} className="bg-zinc-900 border border-zinc-800 rounded-2xl flex items-center p-4 px-6 gap-6 shadow-xl transition-opacity duration-300">
              <div className="text-4xl font-bold text-zinc-600 w-12">{i + 1}</div>
              <img src={p.avatar} alt={p.name} className="w-20 h-20 rounded-full bg-zinc-950" />
              <div className="flex-1">
                <div className="text-2xl font-bold">{p.name}</div>
                {p.lastPointsEarned > 0 ? (
                  <div className="text-green-400 font-medium flex items-center gap-1">
                    <Check className="w-5 h-5" /> +{p.lastPointsEarned} pts
                  </div>
                ) : (
                  <div className="text-red-400 font-medium flex items-center gap-1">
                    <X className="w-5 h-5" /> 0 pts
                  </div>
                )}
              </div>
              <div className="text-5xl font-bold font-mono tracking-tighter text-purple-400">
                {p.score}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-16">
          {lobby.status === 'roundFinished' ? (
            <button 
              onClick={nextRound}
              disabled={loadingAudio}
              className="bg-white text-black font-bold text-2xl px-12 py-5 rounded-2xl shadow-xl hover:bg-zinc-200 transition-colors disabled:opacity-50"
            >
              {loadingAudio ? 'Loading...' : 'Next Round'}
            </button>
          ) : (
            <button 
              onClick={() => updateDoc(doc(db, 'lobbies', lobbyId), { status: 'waiting', currentRound: 0 }).then(() => players.forEach(p => updateDoc(doc(db, 'lobbies', lobbyId, 'players', (p as any).id), { score: 0 })))}
              className="bg-purple-600 text-white font-bold text-2xl px-12 py-5 rounded-2xl shadow-xl hover:bg-purple-700 transition-colors"
            >
              Play Again
            </button>
          )}
        </div>
      </div>
    );
  }

  return null;
}
