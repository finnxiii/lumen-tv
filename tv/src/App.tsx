import React, {useState} from 'react';
import {SessionProvider} from './session/SessionContext';
import {PairingScreen} from './screens/PairingScreen';
import {PlayerScreen} from './screens/PlayerScreen';
import type {ClipId} from './session/types';

type Screen = 'pairing' | 'player';

export const App: React.FC = () => {
  const [screen, setScreen] = useState<Screen>('pairing');
  const [clip, setClip] = useState<ClipId>('night');

  return (
    <SessionProvider>
      {screen === 'pairing' ? (
        <PairingScreen
          onStart={selectedClip => {
            setClip(selectedClip);
            setScreen('player');
          }}
        />
      ) : (
        <PlayerScreen
          initialClip={clip}
          onBack={() => setScreen('pairing')}
        />
      )}
    </SessionProvider>
  );
};
