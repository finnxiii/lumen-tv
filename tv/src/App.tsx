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

// Owns the engine and mounts the video surface as the first absolute child
// (behind all React Native UI), matching the SwapSoakTest z-ordering.
const PlayerRoot: React.FC<PlayerRootProps> = ({initialClip, onBack}) => {
  const engine = usePlayerEngine();
  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Surface first → sits behind all subsequent absolute children */}
      <View
        style={[StyleSheet.absoluteFill, styles.surfaceWrapper]}
        onLayout={e =>
          console.log('[surface] layout', JSON.stringify(e.nativeEvent.layout))
        }
      >
        <KeplerVideoSurfaceView
          onSurfaceViewCreated={engine.onSurfaceViewCreated}
          onSurfaceViewDestroyed={engine.onSurfaceViewDestroyed}
          scalingmode="fill"
          style={StyleSheet.absoluteFill}
        />
      </View>
      {/* UI layer second → on top of surface, fully transparent background */}
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
  surfaceWrapper: {backgroundColor: 'transparent'},
  uiLayer: {backgroundColor: 'transparent'},
});
