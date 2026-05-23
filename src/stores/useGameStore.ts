import { create } from 'zustand';

interface GameState {
  role: 'host' | 'player' | null;
  lobbyId: string | null;
  playerId: string | null;
  playerName: string;
  setRole: (role: 'host' | 'player' | null) => void;
  setLobbyId: (id: string | null) => void;
  setPlayerInfo: (id: string, name: string) => void;
  reset: () => void;
}

export const useGameStore = create<GameState>((set) => ({
  role: null,
  lobbyId: null,
  playerId: null,
  playerName: '',
  setRole: (role) => set({ role }),
  setLobbyId: (lobbyId) => set({ lobbyId }),
  setPlayerInfo: (playerId, playerName) => set({ playerId, playerName }),
  reset: () => set({ role: null, lobbyId: null, playerId: null, playerName: '' }),
}));
