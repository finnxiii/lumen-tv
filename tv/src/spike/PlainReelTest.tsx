import React, {useCallback, useEffect, useRef, useState} from 'react';
import {StyleSheet, Text, TouchableHighlight, View} from 'react-native';
import {
  KeplerVideoSurfaceView,
  VideoPlayer,
  type EventListener as W3CEventListener,
} from '@amazon-devices/react-native-w3cmedia';
import {MEDIA_BASE_URL} from '../config';

const REEL_URL = `${MEDIA_BASE_URL}/lumen-reel.mp4`;

function waitForReady(player: VideoPlayer, ms: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let done = false;
    const settle = (ok: boolean, why?: string): void => {
      if (done) { return; }
      done = true;
      clearTimeout(tid);
      player.removeEventListener('loadedmetadata', onMeta);
      player.removeEventListener('canplay', onCan);
      player.removeEventListener('error', onErr);
      ok ? resolve() : reject(new Error(why ?? 'ready-fail'));
    };
    const onMeta: W3CEventListener = () => settle(true);
    const onCan: W3CEventListener  = () => settle(true);
    const onErr: W3CEventListener  = () => settle(false, `err:${player.error?.code ?? '?'}`);
    const tid = setTimeout(() => settle(false, 'timeout:ready'), ms);
    player.addEventListener('loadedmetadata', onMeta);
    player.addEventListener('canplay', onCan);
    player.addEventListener('error', onErr);
  });
}

function waitEvent(player: VideoPlayer, name: string, ms: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let done = false;
    const handler: W3CEventListener = () => {
      if (done) { return; }
      done = true;
      clearTimeout(tid);
      player.removeEventListener(name, handler);
      resolve();
    };
    const tid = setTimeout(() => {
      if (done) { return; }
      done = true;
      player.removeEventListener(name, handler);
      reject(new Error(`timeout:${name}`));
    }, ms);
    player.addEventListener(name, handler);
  });
}

interface DebugState {
  t: number;
  paused: boolean;
  rs: number;
  lastEvt: string;
  step: string;
}

export const PlainReelTest: React.FC = () => {
  const playerRef        = useRef(new VideoPlayer());
  const surfaceHandleRef = useRef<string | null>(null);
  const surfaceReadyRef  = useRef<(() => void) | null>(null);
  const seekingRef       = useRef(false);

  const [debug, setDebug] = useState<DebugState>({
    t: 0, paused: true, rs: -1, lastEvt: 'none', step: 'init',
  });

  const step = (s: string): void => {
    console.log('[plain] ' + s);
    setDebug(d => ({...d, step: s}));
  };

  const handleSurfaceCreated = useCallback((handle: string) => {
    if (surfaceHandleRef.current !== null) { return; }
    surfaceHandleRef.current = handle;
    playerRef.current.setSurfaceHandle(handle);
    surfaceReadyRef.current?.();
    surfaceReadyRef.current = null;
  }, []);

  const handleSurfaceDestroyed = useCallback((_h: string) => {
    surfaceHandleRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const player = playerRef.current;

    const waitSurface = (ms: number): Promise<void> =>
      new Promise<void>((resolve, reject) => {
        if (surfaceHandleRef.current !== null) { resolve(); return; }
        const tid = setTimeout(() => { surfaceReadyRef.current = null; reject(new Error('timeout:surface')); }, ms);
        surfaceReadyRef.current = () => { clearTimeout(tid); resolve(); };
      });

    const onPlaying: W3CEventListener = () => {
      setDebug(d => ({...d, lastEvt: 'playing', paused: false}));
    };
    const onPause: W3CEventListener = () => {
      setDebug(d => ({...d, lastEvt: 'pause', paused: true}));
    };
    const onSeeked: W3CEventListener = () => {
      setDebug(d => ({...d, lastEvt: 'seeked'}));
    };

    const poll = setInterval(() => {
      if (cancelled) { return; }
      const raw = player.currentTime ?? 0;
      const paused = (player as {paused?: boolean}).paused ?? true;
      const rs = (player as {readyState?: number}).readyState ?? -1;
      setDebug(d => ({...d, t: raw, paused, rs}));
    }, 500);

    const boot = async (): Promise<void> => {
      step('wait-surface');
      await waitSurface(10_000);
      if (cancelled) { return; }

      step('initialize');
      await player.initialize();
      if (cancelled) { return; }

      player.addEventListener('playing', onPlaying);
      player.addEventListener('pause', onPause);
      player.addEventListener('seeked', onSeeked);

      step('set-src');
      player.src = REEL_URL;

      step('wait-ready');
      await waitForReady(player, 15_000);
      if (cancelled) { return; }

      step('play');
      await player.play().catch(e => console.warn('[plain] play err:', String(e)));
      if (cancelled) { return; }

      step('playing');
    };

    boot().catch(e => {
      if (cancelled) { return; }
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[plain] boot failed:', msg);
      step('FAILED:' + msg);
    });

    return () => {
      cancelled = true;
      clearInterval(poll);
      player.removeEventListener('playing', onPlaying);
      player.removeEventListener('pause', onPause);
      player.removeEventListener('seeked', onSeeked);
      const h = surfaceHandleRef.current;
      if (h !== null) { player.clearSurfaceHandle(h); }
      player.deinitialize().catch(() => {});
    };
  }, []);

  const handlePlayPause = useCallback((): void => {
    const player = playerRef.current;
    const paused = (player as {paused?: boolean}).paused ?? true;
    console.log('[plain] btn play/pause paused=', paused);
    if (paused) {
      player.play().catch(() => {});
    } else {
      player.pause();
    }
  }, []);

  const handleSeek45 = useCallback((): void => {
    if (seekingRef.current) { return; }
    const player = playerRef.current;
    const wasPlaying = !((player as {paused?: boolean}).paused ?? true);
    const target = (player.currentTime ?? 0) + 45;
    seekingRef.current = true;
    step('seek+45');

    player.currentTime = target;
    waitEvent(player, 'seeked', 2_000)
      .catch(() => { console.warn('[plain] seeked timeout'); })
      .then(() => {
        if (wasPlaying) {
          player.play().catch(() => {});
        }
        seekingRef.current = false;
        step('playing');
      });
  }, []);

  return (
    <View style={styles.root}>
      {/* Surface first — same z-order as SwapSoakTest */}
      <KeplerVideoSurfaceView
        onSurfaceViewCreated={handleSurfaceCreated}
        onSurfaceViewDestroyed={handleSurfaceDestroyed}
        scalingmode="fill"
        style={StyleSheet.absoluteFill}
      />

      {/* Debug + buttons on top */}
      <View style={styles.panel}>
        <Text style={styles.dbg}>
          {`t:${debug.t.toFixed(2)} paused:${debug.paused} rs:${debug.rs} ev:${debug.lastEvt}`}
        </Text>
        <Text style={styles.stepTxt}>{debug.step}</Text>
        <View style={styles.btns}>
          <TouchableHighlight style={styles.btn} onPress={handlePlayPause} underlayColor="#333">
            <Text style={styles.btnTxt}>{debug.paused ? '▶ Play' : '⏸ Pause'}</Text>
          </TouchableHighlight>
          <TouchableHighlight style={styles.btn} onPress={handleSeek45} underlayColor="#333">
            <Text style={styles.btnTxt}>Seek +45 s</Text>
          </TouchableHighlight>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#000'},
  panel: {
    position: 'absolute',
    top: 52,
    left: 72,
    backgroundColor: 'rgba(0,0,0,0.78)',
    padding: 16,
    borderRadius: 8,
    zIndex: 20,
    minWidth: 420,
  },
  dbg: {color: '#0f0', fontSize: 18, fontFamily: 'monospace'},
  stepTxt: {color: '#afd', fontSize: 17, fontFamily: 'monospace', marginTop: 4},
  btns: {flexDirection: 'row', gap: 20, marginTop: 18},
  btn: {
    backgroundColor: '#222',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#555',
  },
  btnTxt: {color: '#fff', fontSize: 20},
});
