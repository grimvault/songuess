import { useEffect, useState, useRef } from 'react';
import { useGameStore } from '../stores/useGameStore';
import { doc, onSnapshot, updateDoc, collection, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Lobby, Player } from '../types';
import QRCode from 'react-qr-code';
import { 
  Users, Settings, Play, Check, X, SkipForward, Music, LogOut,
  Image, User, Disc, Calendar, Tag
} from 'lucide-react';
import { searchItunes } from '../lib/itunes';
import confetti from 'canvas-confetti';
import { motion } from 'motion/react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/Select";

function SmoothImage({ src, alt, className }: { src: string; alt: string; className: string }) {
  const [loaded, setLoaded] = useState(false);
  
  useEffect(() => {
    setLoaded(false);
  }, [src]);

  return (
    <div className={`relative overflow-hidden bg-zinc-900 ${className}`}>
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Music className="w-12 h-12 text-zinc-700 animate-pulse" />
        </div>
      )}
      <img
        src={src}
        alt={alt}
        onLoad={() => setLoaded(true)}
        className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
  );
}

export function HostScreen() {
  const { lobbyId, reset } = useGameStore();
  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [categories, setCategories] = useState('all'); // temp state for host editing
  const [gameMode, setGameMode] = useState<any>('songName');
  const [rounds, setRounds] = useState(5);
  const [numOptions, setNumOptions] = useState(4);
  const [answerStyle, setAnswerStyle] = useState<any>('mcq');
  const [autoAdvance, setAutoAdvance] = useState<string>('manual'); // 'manual', 'instant', '5s', '10s'
  const [loadingAudio, setLoadingAudio] = useState(false);
  
  // Timer states
  const [timeLeft, setTimeLeft] = useState(0);
  const [autoAdvanceTimeLeft, setAutoAdvanceTimeLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!lobbyId) return;
    const unsubLobby = onSnapshot(doc(db, 'lobbies', lobbyId), (docSnap) => {
      if (docSnap.exists()) {
        const u = docSnap.data() as Lobby;
        setLobby(u);
        // Sync temp settings from DB if already open / running
        if (u.settings) {
          if (u.settings.category) setCategories(u.settings.category);
          if (u.settings.gameMode) setGameMode(u.settings.gameMode);
          if (u.settings.rounds) setRounds(u.settings.rounds);
          if (u.settings.numOptions) setNumOptions(u.settings.numOptions);
          if (u.settings.answerStyle) setAnswerStyle(u.settings.answerStyle);
          if (u.settings.autoAdvance) setAutoAdvance(u.settings.autoAdvance);
        }
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

  useEffect(() => {
    if (lobby?.status === 'gameFinished') {
      const duration = 3 * 1000;
      const end = Date.now() + duration;

      const frame = () => {
        confetti({
          particleCount: 5,
          angle: 60,
          spread: 55,
          origin: { x: 0 },
          colors: ['#a855f7', '#60a5fa', '#34d399']
        });
        confetti({
          particleCount: 5,
          angle: 120,
          spread: 55,
          origin: { x: 1 },
          colors: ['#a855f7', '#60a5fa', '#34d399']
        });

        if (Date.now() < end) {
          requestAnimationFrame(frame);
        }
      };
      frame();
    }
  }, [lobby?.status]);

  // Round Timer Logic
  useEffect(() => {
    if (lobby?.status === 'playing') {
      const updateTimer = () => {
        const elapsed = (Date.now() - lobby.roundStartTime) / 1000;
        const remaining = Math.max(0, 30 - elapsed);
        setTimeLeft(remaining);
        
        if (remaining <= 0) {
          finishRound();
        }
      };
      
      updateTimer();
      const interval = setInterval(updateTimer, 500);
      return () => clearInterval(interval);
    }
  }, [lobby?.status, lobby?.roundStartTime]);

  // Auto Advance Logic after round ends
  useEffect(() => {
    if (lobby?.status === 'roundFinished' && lobby.settings.autoAdvance && lobby.settings.autoAdvance !== 'manual' && !loadingAudio) {
      const option = lobby.settings.autoAdvance;
      let duration = 0;
      if (option === 'instant') {
        nextRound();
        return;
      } else if (option === '5s') {
        duration = 5;
      } else if (option === '10s') {
        duration = 10;
      }

      setAutoAdvanceTimeLeft(duration);
      const startTime = Date.now();

      const interval = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        const remaining = Math.max(0, duration - elapsed);
        setAutoAdvanceTimeLeft(remaining);

        if (remaining <= 0) {
          clearInterval(interval);
          nextRound();
        }
      }, 100);

      return () => clearInterval(interval);
    } else {
      setAutoAdvanceTimeLeft(null);
    }
  }, [lobby?.status, lobby?.currentRound, lobby?.settings?.autoAdvance, loadingAudio]);

  const handleLeaveLobby = async () => {
    if (lobbyId) {
      await deleteDoc(doc(db, 'lobbies', lobbyId));
    }
    window.history.replaceState({}, '', window.location.pathname);
    reset();
  };

  const startGame = async () => {
    if (!lobbyId) return;
    const activeSettings = {
      gameMode,
      rounds,
      category: categories,
      numOptions,
      answerStyle,
      autoAdvance
    };

    await updateDoc(doc(db, 'lobbies', lobbyId), {
      status: 'starting',
      settings: activeSettings,
      currentRound: 0
    });
    nextRound(activeSettings);
  };

  const isFinishingRef = useRef(false);

  const finishRound = async () => {
    if (!lobbyId || !lobby || isFinishingRef.current || lobby.status !== 'playing') return;
    isFinishingRef.current = true;
    
    // Calculate points for everyone who guessed
    const updates: any[] = [];
    players.forEach(p => {
      let pointsEarned = 0;
      if (p.hasGuessed && p.lastGuess) {
        
        // Robust punctuation and case-insensitive check
        const normalize = (str: string) => {
          if (!str) return '';
          return str
            .toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents
            .replace(/[^\w\s-]/g, '') // remove punctuation count except spaces and hyphens
            .replace(/\s+/g, ' ') // replace multiple spaces with single space
            .trim();
        };

        const guessTimeDiff = (p.lastGuessTime - lobby.roundStartTime) / 1000;
        
        let isCorrect = false;
        if (lobby.settings.answerStyle === 'typing') {
          isCorrect = normalize(p.lastGuess) === normalize(lobby.correctAnswer);
        } else {
          isCorrect = p.lastGuess.trim() === lobby.correctAnswer.trim() || normalize(p.lastGuess) === normalize(lobby.correctAnswer);
        }
        
        if (isCorrect) {
          let speedRatio = 1;
          if (guessTimeDiff > 0 && guessTimeDiff < 30) {
            speedRatio = 1 - (guessTimeDiff / 30);
          } else if (guessTimeDiff >= 30) {
            speedRatio = 0;
          }
          pointsEarned = Math.round(500 + (500 * speedRatio));
        }
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
    
    isFinishingRef.current = false;
  };

  const nextRound = async (overrideSettings?: any) => {
    if (!lobbyId || !lobby) return;
    setLoadingAudio(true);
    
    const settings = overrideSettings || lobby.settings;
    
    try {
      const tracks = await searchItunes(settings.category === 'all' ? 'top hits' : settings.category);
      if (tracks.length === 0) throw new Error("No tracks found");
      
      const shuffled = tracks.sort(() => 0.5 - Math.random());
      
      // Select correct answer track
      const answerTrack = shuffled[Math.floor(Math.random() * Math.min(10, shuffled.length))];
      
      // Determine answers based on game mode
      const getValue = (t: any) => {
        if (settings.gameMode === 'author') return t.artist || "Unknown Artist";
        if (settings.gameMode === 'album') return t.album || "Unknown Album";
        if (settings.gameMode === 'releaseYear') return t.year || "Unknown Year";
        if (settings.gameMode === 'genre') return t.genre || "Unknown Genre";
        return t.name;
      };

      const correctVal = getValue(answerTrack);
      
      // Accumulate unique alternative option strings
      const otherVals = Array.from(new Set(shuffled.map(getValue).filter(v => v !== correctVal)));
      
      // Pick alternative values
      const pickedOthers = otherVals.slice(0, settings.numOptions - 1);
      
      // Combine alternatives and correct answer
      let targetAnswers = [correctVal, ...pickedOthers];
      
      // Shuffle target options
      targetAnswers = targetAnswers.sort(() => 0.5 - Math.random());

      // Reset players guesses AND lastPointsEarned to prevent stale highlights
      const pUpdates = players.map(p => updateDoc(doc(db, 'lobbies', lobbyId, 'players', (p as any).id), {
        hasGuessed: false,
        lastGuess: '',
        lastPointsEarned: 0
      }));
      await Promise.all(pUpdates);

      await updateDoc(doc(db, 'lobbies', lobbyId), {
        status: 'playing',
        currentRound: (overrideSettings ? 1 : lobby.currentRound + 1),
        currentAnswers: targetAnswers,
        correctAnswer: correctVal,
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

  const handlePlayAgain = async () => {
    if (!lobbyId || !lobby) return;
    setLoadingAudio(true);
    try {
      await updateDoc(doc(db, 'lobbies', lobbyId), {
        status: 'waiting',
        currentRound: 0,
        currentAnswers: [],
        correctAnswer: '',
        currentTrackPreview: '',
        currentTrackCover: '',
        roundStartTime: 0
      });
      const resets = players.map(p => 
        updateDoc(doc(db, 'lobbies', lobbyId, 'players', (p as any).id), {
          score: 0,
          hasGuessed: false,
          lastGuess: '',
          lastGuessTime: 0,
          lastPointsEarned: 0
        })
      );
      await Promise.all(resets);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingAudio(false);
    }
  };

  if (!lobby) return <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">Loading lobby...</div>;

  const joinUrl = `${window.location.origin}${window.location.pathname}?lobby=${lobbyId}`;

  const gameModesData = [
    { value: 'songName', label: 'Guess Song', icon: Music, desc: 'Listen and guess the title.' },
    { value: 'coverImage', label: 'Guess Cover', icon: Image, desc: 'Look at the image and guess.' },
    { value: 'author', label: 'Guess Artist', icon: User, desc: 'Guess the performing artist.' },
    { value: 'album', label: 'Guess Album', icon: Disc, desc: 'Listen and guess the album.' },
    { value: 'releaseYear', label: 'Guess Year', icon: Calendar, desc: 'Listen and guess the year.' },
    { value: 'genre', label: 'Guess Genre', icon: Tag, desc: 'Listen and guess the genre.' },
  ];

  if (lobby.status === 'waiting' || lobby.status === 'starting') {
    return (
      <div className="h-screen bg-zinc-950 text-white p-6 md:p-8 font-sans flex flex-col lg:flex-row gap-6 lg:gap-8 relative overflow-hidden">
        
        {/* Left Section - Settings Container */}
        <div className="flex-1 flex flex-col h-full overflow-hidden space-y-4 w-full">
          <div>
            <h1 className="text-4xl font-bold tracking-tighter text-white">Join the Party!</h1>
          </div>
          
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 flex-1 overflow-y-auto space-y-6 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <div className="flex items-center gap-3 border-b border-zinc-800 pb-4">
              <Settings className="w-5 h-5 text-white" />
              <h2 className="text-xl font-bold">Game Settings</h2>
            </div>
            
            <div className="space-y-6">
              {/* Game Mode - Beautiful Button Group Selection with Icons */}
              <div className="space-y-3">
                <label className="text-sm font-semibold text-zinc-300">Game Mode</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {gameModesData.map(opt => {
                    const IconComp = opt.icon;
                    const isSelected = gameMode === opt.value;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setGameMode(opt.value)}
                        className={`relative flex flex-col items-center justify-center p-3.5 rounded-2xl border text-center transition-all cursor-pointer overflow-hidden ${
                          isSelected 
                            ? 'bg-zinc-100 border-zinc-100 text-black font-bold' 
                            : 'bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:bg-zinc-900 hover:border-zinc-700 hover:text-zinc-200'
                        }`}
                      >
                        <IconComp className={`w-5.5 h-5.5 mb-2 relative z-10 ${isSelected ? 'text-black' : 'text-zinc-500'}`} />
                        <span className="text-xs relative z-10">{opt.label}</span>
                        <span className={`text-[10px] mt-1 line-clamp-2 leading-tight font-normal relative z-10 ${isSelected ? 'text-zinc-600' : 'text-zinc-500'}`}>{opt.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Category / Playlist Dropdown (Styled perfectly via Radix, scrollbar hidden) */}
              <div className="space-y-3">
                <label className="text-sm font-semibold text-zinc-300">Category / Genre</label>
                <Select value={categories} onValueChange={setCategories}>
                  <SelectTrigger className="border-zinc-800 text-zinc-200 bg-zinc-950 font-medium">
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Genres</SelectItem>
                    <SelectItem value="pop">Pop Hits</SelectItem>
                    <SelectItem value="rock">Rock Classics</SelectItem>
                    <SelectItem value="hip-hop">Hip Hop / Rap</SelectItem>
                    <SelectItem value="electronic">Electronic / Dance</SelectItem>
                    <SelectItem value="k-pop">K-Pop / J-Pop</SelectItem>
                    <SelectItem value="country">Country</SelectItem>
                    <SelectItem value="2010s">2010s Throwbacks</SelectItem>
                    <SelectItem value="2000s">2000s Nostalgia</SelectItem>
                    <SelectItem value="1990s">90s Classics</SelectItem>
                    <SelectItem value="1980s">80s Retro Hits</SelectItem>
                    <SelectItem value="1970s">70s Funk / Disco</SelectItem>
                    <SelectItem value="jazz">Jazz / Blues</SelectItem>
                    <SelectItem value="classical">Classical</SelectItem>
                    <SelectItem value="latin">Latin Heat</SelectItem>
                    <SelectItem value="rnb">R&B Hits</SelectItem>
                    <SelectItem value="anime">Anime Soundtracks</SelectItem>
                    <SelectItem value="gaming">Video Game Music</SelectItem>
                    <SelectItem value="indie">Indie / Alternative</SelectItem>
                    <SelectItem value="metal">Metal</SelectItem>
                    <SelectItem value="reggae">Reggae</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Total Rounds */}
                <div className="space-y-3">
                  <label className="text-sm font-semibold text-zinc-300">Total Rounds</label>
                  <div className="flex gap-1.5 bg-zinc-950 p-1 rounded-2xl border border-zinc-800">
                    {[5, 10, 15, 20].map(r => (
                      <button 
                        key={r}
                        onClick={() => setRounds(r)}
                        className={`relative flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${rounds === r ? 'text-black' : 'text-zinc-500 hover:text-zinc-300'}`}
                      >
                        {rounds === r && (
                          <motion.div layoutId="rounds-bg" className="absolute inset-0 bg-white rounded-xl" transition={{ type: "spring", bounce: 0.2, duration: 0.6 }} />
                        )}
                        <span className="relative z-10">{r}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Number of Options */}
                <div className={`space-y-3 transition-opacity duration-300 ${answerStyle === 'typing' ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
                  <label className="text-sm font-semibold text-zinc-300">Option Choices</label>
                  <div className="flex gap-1.5 bg-zinc-950 p-1 rounded-2xl border border-zinc-800">
                    {[2, 4, 6, 8].map(r => (
                      <button 
                        key={r}
                        onClick={() => setNumOptions(r)}
                        className={`relative flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${numOptions === r ? 'text-black' : 'text-zinc-500 hover:text-zinc-300'}`}
                      >
                        {numOptions === r && (
                          <motion.div layoutId="options-bg" className="absolute inset-0 bg-white rounded-xl" transition={{ type: "spring", bounce: 0.2, duration: 0.6 }} />
                        )}
                        <span className="relative z-10">{r}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Answer Style */}
              <div className="space-y-3">
                <label className="text-sm font-semibold text-zinc-300">Join Answer Style</label>
                <div className="flex gap-2 bg-zinc-950 p-1 rounded-2xl border border-zinc-800">
                  <button 
                    onClick={() => setAnswerStyle('mcq')}
                    className={`relative flex-1 py-3 rounded-xl text-sm font-semibold transition-all ${answerStyle === 'mcq' ? 'text-black' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    {answerStyle === 'mcq' && <motion.div layoutId="style-bg" className="absolute inset-0 bg-white rounded-xl" transition={{ type: "spring", bounce: 0.2, duration: 0.6 }} />}
                    <span className="relative z-10">Multiple Choice (MCQ)</span>
                  </button>
                  <button 
                    onClick={() => setAnswerStyle('typing')}
                    className={`relative flex-1 py-3 rounded-xl text-sm font-semibold transition-all ${answerStyle === 'typing' ? 'text-black' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    {answerStyle === 'typing' && <motion.div layoutId="style-bg" className="absolute inset-0 bg-white rounded-xl" transition={{ type: "spring", bounce: 0.2, duration: 0.6 }} />}
                    <span className="relative z-10">Typing (Free Input)</span>
                  </button>
                </div>
              </div>

              {/* Auto Next Round */}
              <div className="space-y-3">
                <label className="text-sm font-semibold text-zinc-300">Auto Next Round</label>
                <div className="flex gap-1.5 bg-zinc-950 p-1 rounded-2xl border border-zinc-800">
                  {[
                    { value: 'manual', label: 'Manual' },
                    { value: 'instant', label: 'Instantly' },
                    { value: '5s', label: '5 Seconds' },
                    { value: '10s', label: '10 Seconds' },
                  ].map(opt => (
                    <button 
                      key={opt.value}
                      onClick={() => setAutoAdvance(opt.value)}
                      className={`relative flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all ${autoAdvance === opt.value ? 'text-black' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                      {autoAdvance === opt.value && <motion.div layoutId="auto-bg" className="absolute inset-0 bg-white rounded-xl" transition={{ type: "spring", bounce: 0.2, duration: 0.6 }} />}
                      <span className="relative z-10">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={startGame}
              disabled={players.length === 0}
              className="w-full bg-white text-black text-lg font-bold rounded-2xl py-4 flex items-center justify-center gap-3 hover:bg-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <Play className="w-5 h-5 fill-current" />
              Start Game ({players.length} Players)
            </button>
          </div>
        </div>

          {/* Right Section - Players list & QR Code Area */}
        <div className="flex-1 flex flex-col h-full overflow-hidden space-y-4 w-full">
          
          <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-3xl flex flex-row items-center justify-around gap-6">
            <div className="bg-white p-2.5 rounded-xl shrink-0">
              <QRCode value={joinUrl} size={110} bgColor="#ffffff" fgColor="#09090b" style={{ borderRadius: '4px' }} />
            </div>
            <div className="flex flex-col items-start gap-1">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">Lobby Code</span>
              <div className="font-mono text-white bg-zinc-950 px-6 py-3 rounded-xl border border-zinc-800 tracking-[0.2em] text-2xl font-black">
                {lobbyId}
              </div>
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 flex-1 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-zinc-800">
              <button onClick={handleLeaveLobby} className="flex items-center gap-1.5 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white px-3 py-1.5 rounded-xl transition-all font-bold group text-xs">
                <LogOut className="w-3.5 h-3.5 group-hover:-translate-x-1 transition-transform rotate-180" /> <span>Close</span>
              </button>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold tracking-tight">Players ({players.length})</h2>
                <Users className="w-5 h-5 text-white" />
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto pr-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              {players.length === 0 && (
                <div className="text-center text-zinc-500 py-20 font-medium flex flex-col items-center gap-3">
                  <div className="w-16 h-16 rounded-full border-2 border-zinc-700 border-dashed flex items-center justify-center animate-[spin_10s_linear_infinite]">
                    <Users className="w-6 h-6 text-zinc-600 animate-[spin_10s_linear_infinite_reverse]" />
                  </div>
                  Waiting for players to join...
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {players.map(p => (
                  <div key={(p as any).id} className="bg-zinc-950 rounded-2xl p-3 flex flex-col items-center gap-2.5 border border-zinc-800/60">
                    <img src={p.avatar} alt={p.name} className="w-14 h-14 rounded-xl bg-zinc-900" />
                    <span className="font-semibold text-xs truncate w-full text-center text-zinc-200">{p.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (lobby.status === 'playing') {
    const allGuessed = players.length > 0 && players.every(p => p.hasGuessed);
    if (allGuessed && timeLeft > 0) {
      finishRound();
    }

    return (
      <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
        <div className="flex items-center justify-between p-6">
          <h2 className="text-2xl font-bold">Round {lobby.currentRound} / {lobby.settings.rounds}</h2>
          <div className="flex items-center gap-6">
            <div className="text-5xl font-mono tracking-tighter">
              00:{Math.ceil(timeLeft).toString().padStart(2, '0')}
            </div>
            <button onClick={handleLeaveLobby} className="flex items-center gap-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 p-3.5 rounded-xl transition-all font-bold group z-50">
              <LogOut className="w-6 h-6 group-hover:-translate-x-1 transition-transform" />
            </button>
          </div>
        </div>
        
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-12">
          
          {lobby.settings.gameMode !== 'coverImage' && lobby.currentTrackPreview && (
            <audio src={lobby.currentTrackPreview} autoPlay className="hidden" />
          )}

          {lobby.settings.gameMode === 'coverImage' ? (
            <SmoothImage src={lobby.currentTrackCover} alt="Cover" className="w-[320px] h-[320px] rounded-3xl" />
          ) : (
            <div className="w-[320px] h-[320px] rounded-full bg-zinc-900 border-4 border-zinc-800 flex items-center justify-center animate-pulse">
              <Music className="w-24 h-24 text-zinc-700" />
            </div>
          )}
          
          <div className={`grid ${lobby.settings.numOptions > 4 ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2'} gap-4 max-w-5xl w-full`}>
            {lobby.settings.answerStyle === 'typing' ? (
              <div className="col-span-full bg-zinc-900 border border-zinc-800 text-3xl font-semibold py-12 px-6 rounded-3xl text-center text-zinc-500">
                Players are typing...
              </div>
            ) : (
              lobby.currentAnswers.map((ans, i) => (
                <div key={i} className="bg-zinc-900 border border-zinc-800 text-xl font-bold py-7 px-5 rounded-2xl text-center flex items-center justify-center leading-tight">
                  {ans}
                </div>
              ))
            )}
          </div>

          <div className="flex flex-wrap justify-center gap-3 mt-8">
             {players.map(p => (
                <div key={(p as any).id} className={`w-14 h-14 rounded-xl border-4 transition-all ${p.hasGuessed ? 'border-white opacity-100 scale-105' : 'border-zinc-800 opacity-40'}`}>
                  <img src={p.avatar} alt={p.name} className="rounded-lg w-full h-full object-cover bg-zinc-900" />
                </div>
             ))}
          </div>
        </div>

        <button onClick={finishRound} className="absolute bottom-6 right-6 p-4 bg-zinc-900 hover:bg-zinc-800 rounded-full cursor-pointer">
          <SkipForward className="w-6 h-6" />
        </button>
      </div>
    );
  }

  if (lobby.status === 'roundFinished' || lobby.status === 'gameFinished') {
    const sorted = [...players].sort((a, b) => b.score - a.score);

    return (
      <div className="min-h-screen bg-zinc-950 text-white p-6 md:p-12 flex flex-col items-center relative overflow-hidden">
        <button onClick={handleLeaveLobby} className="absolute top-6 right-6 flex items-center gap-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 px-4 py-3 rounded-xl transition-all font-bold group z-50">
          <LogOut className="w-5 h-5 group-hover:-translate-x-1 transition-transform" /> <span className="hidden sm:inline">Close Lobby</span>
        </button>
        
        <div className="text-center space-y-6 mb-12 mt-8 w-full max-w-3xl">
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight">
            {lobby.status === 'gameFinished' ? 'Final Standings!' : 'Round Over'}
          </h2>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 mt-10 mb-10">
            <SmoothImage src={lobby.currentTrackCover} alt="Cover" className="w-48 h-48 rounded-2xl shrink-0" />
            <div className="text-center sm:text-left space-y-2">
              <p className="text-xs text-zinc-400 uppercase tracking-widest font-semibold">The correct answer was</p>
              <h3 className="text-3xl md:text-4xl font-black text-white leading-tight">
                {lobby.correctAnswer}
              </h3>
            </div>
          </div>
        </div>

        <div className="w-full max-w-3xl space-y-3">
          {sorted.map((p, i) => (
            <div key={(p as any).id} className="bg-zinc-900 border border-zinc-800 rounded-2xl flex items-center p-3.5 px-5 gap-5">
              <div className="text-3xl font-extrabold text-white w-8">{i + 1}</div>
              <img src={p.avatar} alt={p.name} className="w-14 h-14 rounded-xl bg-zinc-950 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-lg font-bold truncate">{p.name}</div>
                {p.lastPointsEarned > 0 ? (
                  <div className="text-zinc-400 text-sm font-semibold flex items-center gap-1">
                    <Check className="w-4 h-4" /> +{p.lastPointsEarned} pts
                  </div>
                ) : (
                  <div className="text-zinc-500 text-sm font-semibold flex items-center gap-1">
                    <X className="w-4 h-4" /> 0 pts
                  </div>
                )}
              </div>
              <div className="text-3xl font-black font-mono tracking-tighter text-white">
                {p.score}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12">
          {lobby.status === 'roundFinished' ? (
            <button 
              onClick={() => nextRound()}
              disabled={loadingAudio}
              className="bg-white text-black font-extrabold text-xl px-12 py-4.5 rounded-2xl hover:bg-zinc-200 transition-colors disabled:opacity-50 min-w-[220px] cursor-pointer"
            >
              {loadingAudio ? (
                'Loading...'
              ) : autoAdvanceTimeLeft !== null && autoAdvanceTimeLeft > 0 ? (
                `Next Round (${Math.ceil(autoAdvanceTimeLeft)}s)`
              ) : (
                'Next Round'
              )}
            </button>
          ) : (
            <button 
              onClick={handlePlayAgain}
              className="bg-white text-black font-extrabold text-xl px-12 py-4.5 rounded-2xl hover:bg-zinc-200 transition-colors cursor-pointer"
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
