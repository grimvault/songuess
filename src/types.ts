export type GameMode = 'songName' | 'coverImage' | 'author';

export interface Track {
  id: number;
  name: string;
  artist: string;
  previewUrl: string;
  artworkUrl: string; // large artwork
}

export interface Lobby {
  hostId: string;
  password?: string;
  status: 'waiting' | 'starting' | 'playing' | 'roundFinished' | 'gameFinished';
  settings: {
    gameMode: GameMode;
    rounds: number;
    category: string;
  };
  currentRound: number;
  currentAnswers: string[]; // Options Array (4 usually)
  correctAnswer: string; // The correct one (matches one of currentAnswers)
  currentTrackPreview: string;
  currentTrackCover: string;
  roundStartTime: number; 
}

export interface Player {
  name: string;
  avatar: string;
  score: number;
  lastGuess: string;
  lastGuessTime: number;
  lastPointsEarned: number;
  hasGuessed: boolean;
}
