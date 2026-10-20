import React, {useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {KeplerVideoSurfaceView} from '@amazon-devices/react-native-w3cmedia';
import {SessionProvider} from './session/SessionContext';
import {PairingScreen} from './screens/PairingScreen';
import {PlayerScreen} from './screens/PlayerScreen';
import {usePlayerEngine} from './player/usePlayerEngine';
import type {ClipId} from './session/types';

type Screen = 'pairing' | 'player';

interface PlayerRootProps {
  initialClip: ClipId;
  onBack: () => void;
}

const PlayerRoot: React.FC<PlayerRootProps> = ({initialClip, onBack}) => {
  const engine = usePlayerEngine(initialClip);
  return (
    <View style={StyleSheet.absoluteFill}>
      {engine.showSurface && (
        <KeplerVideoSurfaceView
          key={engine.surfaceKey}
          onSurfaceViewCreated={engine.onSurfaceViewCreated}
          onSurfaceViewDestroyed={engine.onSurfaceViewDestroyed}
          scalingmode="fill"
          style={StyleSheet.absoluteFill}
        />
      )}
      <View style={[StyleSheet.absoluteFill, styles.uiLayer]}>
        <PlayerScreen initialClip={initialClip} onBack={onBack} engine={engine} />
      </View>
    </View>
  );
};

export const App: React.FC = () => {
  const [screen, setScreen] = useState<Screen>('pairing');
  const [clip, setClip] = useState<ClipId>('night');

  return (
    <SessionProvider>
      <View style={styles.root}>
        {screen === 'pairing' ? (
          <PairingScreen
            onStart={selectedClip => {
              setClip(selectedClip);
              setScreen('player');
            }}
          />
        ) : (
          <PlayerRoot
            initialClip={clip}
            onBack={() => setScreen('pairing')}
          />
        )}
      </View>
    </SessionProvider>
  );
};

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: 'transparent'},
  uiLayer: {backgroundColor: 'transparent'},
});
