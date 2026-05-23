/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { useGameStore } from './stores/useGameStore';
import { signIn } from './firebase';
import { Home } from './components/Home';
import { HostScreen } from './components/HostScreen';
import { PlayerScreen } from './components/PlayerScreen';

export default function App() {
  const { role, lobbyId } = useGameStore();
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    // Check if lobby code in URL to auto-join
    const params = new URLSearchParams(window.location.search);
    const code = params.get('lobby');
    
    signIn().then(() => {
      setAuthReady(true);
      if (code && !role) {
        useGameStore.getState().setLobbyId(code);
      }
    }).catch((e) => {
      console.error(e);
      setAuthError(e.message || 'Failed to authenticate');
    });
  }, []);

  if (authError) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-zinc-400 space-y-4">
        <div className="text-red-400 font-bold text-xl">Connection Failed</div>
        <div className="max-w-md text-center">{authError}</div>
        <div className="text-sm mt-4 text-zinc-500">Make sure Anonymous Sign-in is enabled in your Firebase Console.</div>
      </div>
    );
  }

  if (!authReady) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-400">
        <div className="animate-pulse">Connecting to Songuess servers...</div>
      </div>
    );
  }

  if (role === 'host' && lobbyId) {
    return <HostScreen />;
  }

  if (role === 'player' && lobbyId) {
    return <PlayerScreen />;
  }

  return <Home />;
}
