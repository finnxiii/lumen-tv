// Reference copy of the multi-strategy playback spike (not rendered).
// See SwapSoakTest.tsx for the current active test.
import React, {useState, useEffect, useRef, useCallback} from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {useTVEventHandler, type HWEvent} from '@amazon-devices/react-native-kepler';
import {
  VideoPlayer,
  KeplerVideoSurfaceView,
  type EventListener as W3CEventListener,
} from '@amazon-devices/react-native-w3cmedia';

const TUNNEL = 'https://strength-direction-maria-machine.trycloudflare.com';

const SOURCES = [
  {label: 'T',  name: 'test.mp4',  url: `${TUNNEL}/test.mp4`},
  {label: 'T2', name: 'test2.mp4', url: `${TUNNEL}/test2.mp4`},
] as const;

type Source = {label: string; name: string; url: string};
const SOURCES_LIST: Source[] = [...SOURCES];

const MEDIA_EVENTS = [
  'loadstart', 'progress', 'suspend', 'abort', 'error',
  'emptied', 'stalled', 'loadedmetadata', 'loadeddata',
  'canplay', 'canplaythrough', 'playing', 'waiting',
  'seeking', 'seeked', 'ended', 'durationchange',
  'timeupdate', 'play', 'pause', 'ratechange', 'volumechange',
  'playbackstarted', 'audiofocusgranted', 'audiofocuspaused', 'audiofocuslost',
];

const ERR_NAMES: Record<number, string> = {
  1: 'ABORTED', 2: 'NETWORK', 3: 'DECODE', 4: 'SRC_NOT_SUPPORTED',
};

const READY_STATE_NAMES: Record<number, string> = {
  0: 'NONE', 1: 'META', 2: 'CURR', 3: 'FUTURE', 4: 'ENOUGH',
};

const fmt = (s: number): string => {
  if (!isFinite(s) || isNaN(s)) { return '--:--'; }
  const m = Math.floor(s / 60);
  return `${m}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
};

const probeUrl = async (url: string): Promise<string> => {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(url, {method: 'HEAD', signal: ctrl.signal});
    clearTimeout(tid);
    return `${res.status}`;
  } catch (e: unknown) {
    clearTimeout(tid);
    return (e as {name?: string}).name === 'AbortError' ? 'timeout' : `ERR`;
  }
};

function withTimeout<T>(p: Promise<T>, ms: number, step: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const tid = setTimeout(() => reject(new Error(`timeout:${step}`)), ms);
    p.then(
      v => { clearTimeout(tid); resolve(v); },
      e => { clearTimeout(tid); reject(e instanceof Error ? e : new Error(String(e))); },
    );
  });
}

function waitForReady(p: VideoPlayer, ms: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const done = (ok: boolean, reason?: string) => {
      if (settled) { return; }
      settled = true;
      clearTimeout(tid);
      p.removeEventListener('loadedmetadata', onReady);
      p.removeEventListener('canplay',        onReady);
      p.removeEventListener('error',          onError);
      ok ? resolve() : reject(new Error(reason ?? 'waitForReady'));
    };
    const onReady: W3CEventListener = () => done(true);
    const onError: W3CEventListener = () => done(false, `mediaerr:${p.error?.code ?? '?'}`);
    const tid = setTimeout(() => done(false, 'timeout:waitForReady'), ms);
    p.addEventListener('loadedmetadata', onReady);
    p.addEventListener('canplay',        onReady);
    p.addEventListener('error',          onError);
  });
}

type NormalizedKey =
  | 'playpause' | 'rewind' | 'fastforward' | 'menu'
  | 'select' | 'back' | 'up' | 'down' | 'left' | 'right' | 'unknown';

const normalizeKey = (raw: string): NormalizedKey => {
  switch (raw.toLowerCase()) {
    case 'play': case 'playpause':                                    return 'playpause';
    case 'rewind': case 'rewindkey': case 'mediarewind':
    case 'skip_backward': case 'skipbackward':                        return 'rewind';
    case 'fastforward': case 'forward': case 'mediafastforward':
    case 'skip_forward': case 'skipforward':                          return 'fastforward';
    case 'menu': case 'info': case 'browse': case 'settings':
    case 'options': case 'menukey': case 'extra_1':                   return 'menu';
    case 'select':  return 'select';
    case 'back':    return 'back';
    case 'up':      return 'up';
    case 'down':    return 'down';
    case 'left':    return 'left';
    case 'right':   return 'right';
    default:        return 'unknown';
  }
};

export const PlaybackSpike: React.FC = () => {
  const playerRef = useRef<VideoPlayer>(new VideoPlayer());
  const surfaceHandleRef       = useRef<string | null>(null);
  const surfaceOwnerRef        = useRef<VideoPlayer | null>(null);
  const surfaceReadyResolveRef = useRef<(() => void) | null>(null);
  const playerInitializedRef   = useRef(false);
  const listenersRef = useRef<Map<string, W3CEventListener>>(new Map());
  const swapPendingRef = useRef(false);
  const swapQueueRef   = useRef<number | null>(null);
  const doSwapRef      = useRef<((idx: number) => void) | null>(null);
  const srcIdxRef      = useRef(0);
  const strategyRef    = useRef<'A' | 'B'>('B');
  const keyHeldRef = useRef<Set<string>>(new Set());
  const autoStartedRef = useRef(false);

  const [playerKey, setPlayerKey] = useState(0);
  const [strategy, setStrategy]   = useState<'A' | 'B'>('B');
  const [initialized, setInitialized] = useState(false);
  const [playing, setPlaying]         = useState(false);
  const [srcIdx, setSrcIdx]           = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration]       = useState(0);
  const [readyState, setReadyState]   = useState(0);
  const [lastEvent, setLastEvent]     = useState('—');
  const [errCode, setErrCode]         = useState<number | null>(null);
  const [errMsg, setErrMsg]           = useState('—');
  const [swapMsg, setSwapMsg]         = useState<string | null>(null);
  const [swapCount, setSwapCount]     = useState(0);
  const [showTint, setShowTint]       = useState(false);
  const [lastKey, setLastKey]         = useState('—');
  const [probeResults, setProbeResults] = useState<Record<number, string>>({0: '…', 1: '…'});

  const handleSurfaceCreated = useCallback((handle: string) => {
    surfaceHandleRef.current = handle;
    surfaceOwnerRef.current = playerRef.current;
    playerRef.current.setSurfaceHandle(handle);
    surfaceReadyResolveRef.current?.();
    surfaceReadyResolveRef.current = null;
  }, []);

  const handleSurfaceDestroyed = useCallback((handle: string) => {
    if (surfaceOwnerRef.current !== null) {
      surfaceOwnerRef.current.clearSurfaceHandle(handle);
      surfaceOwnerRef.current = null;
    }
    surfaceHandleRef.current = null;
  }, []);

  const attachListeners = useCallback((p: VideoPlayer): void => {
    const map = new Map<string, W3CEventListener>();
    MEDIA_EVENTS.forEach(evtType => {
      const handler: W3CEventListener = () => {
        setLastEvent(evtType);
        setReadyState(playerRef.current.readyState ?? 0);
        if (evtType === 'playing') { setPlaying(true); }
        if (evtType === 'pause')   { setPlaying(false); }
        if (evtType === 'error') {
          const err = playerRef.current.error;
          setErrCode(err?.code ?? -1);
          setErrMsg(err?.message ?? '(no msg)');
        }
      };
      p.addEventListener(evtType, handler);
      map.set(evtType, handler);
    });
    listenersRef.current = map;
  }, []);

  const detachListeners = useCallback((p: VideoPlayer): void => {
    listenersRef.current.forEach((handler, evtType) => p.removeEventListener(evtType, handler));
    listenersRef.current.clear();
  }, []);

  useEffect(() => {
    const doSwapA = async (targetIdx: number): Promise<void> => {
      const fromLabel = SOURCES_LIST[srcIdxRef.current]?.label ?? '?';
      const toLabel   = SOURCES_LIST[targetIdx]?.label ?? '?';
      const savedTime = playerRef.current.currentTime ?? 0;
      const wasPlaying = !playerRef.current.paused;
      const t0 = Date.now();
      setSwapMsg(`A: ${fromLabel}→${toLabel}…`);
      setSrcIdx(targetIdx); srcIdxRef.current = targetIdx;
      playerRef.current.pause();
      playerRef.current.src = SOURCES_LIST[targetIdx].url;
      playerRef.current.load();
      await waitForReady(playerRef.current, 10_000);
      playerRef.current.currentTime = savedTime;
      if (wasPlaying) { await playerRef.current.play().catch(() => {}); }
      setSwapMsg(`A: ${fromLabel}→${toLabel} in ${Date.now() - t0}ms`);
      setSwapCount(n => n + 1);
    };

    const doSwapB = async (targetIdx: number): Promise<void> => {
      const fromLabel = SOURCES_LIST[srcIdxRef.current]?.label ?? '?';
      const toLabel   = SOURCES_LIST[targetIdx]?.label ?? '?';
      const savedTime = playerRef.current.currentTime ?? 0;
      const wasPlaying = !playerRef.current.paused;
      const old = playerRef.current;
      const t0 = Date.now();
      setSwapMsg(`B: ${fromLabel}→${toLabel}…`);
      setInitialized(false);
      detachListeners(old);
      if (surfaceHandleRef.current !== null && surfaceOwnerRef.current === old) {
        old.clearSurfaceHandle(surfaceHandleRef.current);
        surfaceOwnerRef.current = null;
      }
      old.pause();
      try { await withTimeout(old.deinitialize(), 3000, 'deinit'); } catch (_) { /* timeout: continue */ }
      const newPlayer = new VideoPlayer();
      playerRef.current = newPlayer;
      playerInitializedRef.current = false;
      await withTimeout(newPlayer.initialize(), 5000, 'init');
      playerInitializedRef.current = true;
      attachListeners(newPlayer);
      setInitialized(true);
      const surfaceReady = new Promise<void>(resolve => {
        surfaceReadyResolveRef.current = resolve;
        if (surfaceHandleRef.current !== null && surfaceOwnerRef.current === newPlayer) { resolve(); }
      });
      setSrcIdx(targetIdx); srcIdxRef.current = targetIdx;
      setPlayerKey(k => k + 1);
      await withTimeout(surfaceReady, 5000, 'surface');
      newPlayer.src = SOURCES_LIST[targetIdx].url;
      await waitForReady(newPlayer, 10_000);
      newPlayer.currentTime = savedTime;
      if (wasPlaying) { await newPlayer.play().catch(() => {}); }
      setSwapMsg(`B: ${fromLabel}→${toLabel} in ${Date.now() - t0}ms`);
      setSwapCount(n => n + 1);
    };

    const doSwap = async (targetIdx: number): Promise<void> => {
      if (swapPendingRef.current) { swapQueueRef.current = targetIdx; return; }
      swapPendingRef.current = true;
      try {
        strategyRef.current === 'A' ? await doSwapA(targetIdx) : await doSwapB(targetIdx);
      } catch (e: unknown) {
        setSwapMsg(`Swap: FAILED (${(e as Error)?.message ?? String(e)})`);
      } finally {
        swapPendingRef.current = false;
        const queued = swapQueueRef.current;
        if (queued !== null) { swapQueueRef.current = null; doSwapRef.current?.(queued); }
      }
    };

    doSwapRef.current = (idx: number): void => { doSwap(idx).catch(() => {}); };

    playerRef.current.initialize().then(() => {
      playerInitializedRef.current = true;
      setInitialized(true);
      attachListeners(playerRef.current);
      SOURCES_LIST.forEach((src, idx) => {
        probeUrl(src.url).then(status => {
          setProbeResults(prev => ({...prev, [idx]: status}));
          if (!autoStartedRef.current && status === '200') {
            autoStartedRef.current = true;
            setSrcIdx(idx); srcIdxRef.current = idx;
            const onCan: W3CEventListener = () => {
              playerRef.current.removeEventListener('canplay', onCan);
              playerRef.current.play().catch(() => {});
            };
            playerRef.current.addEventListener('canplay', onCan);
            playerRef.current.src = src.url;
          }
        });
      });
    }).catch(() => {});

    const pollId = setInterval(() => {
      setCurrentTime(playerRef.current.currentTime ?? 0);
      setDuration(playerRef.current.duration ?? 0);
      setReadyState(playerRef.current.readyState ?? 0);
    }, 500);

    return () => {
      clearInterval(pollId);
      detachListeners(playerRef.current);
      playerRef.current.pause();
      playerRef.current.deinitialize().catch(() => {});
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { strategyRef.current = strategy; }, [strategy]);

  const handleTVEvent = useCallback((evt: HWEvent) => {
    setLastKey(`${evt.eventType} (${evt.eventKeyAction})`);
    if (evt.eventKeyAction === 0) {
      if (keyHeldRef.current.has(evt.eventType)) { return; }
      keyHeldRef.current.add(evt.eventType);
    } else if (evt.eventKeyAction === 1) {
      keyHeldRef.current.delete(evt.eventType); return;
    } else { return; }
    switch (normalizeKey(evt.eventType)) {
      case 'up': doSwapRef.current?.((srcIdxRef.current + 1) % SOURCES_LIST.length); break;
      case 'rewind': doSwapRef.current?.(0); break;
      case 'fastforward': doSwapRef.current?.(1); break;
      case 'menu': setStrategy(s => s === 'A' ? 'B' : 'A'); break;
      case 'down': setShowTint(p => !p); break;
    }
  }, []);

  useTVEventHandler(handleTVEvent);

  const src = SOURCES_LIST[srcIdx];
  return (
    <View style={styles.root}>
      <KeplerVideoSurfaceView key={playerKey} onSurfaceViewCreated={handleSurfaceCreated}
        onSurfaceViewDestroyed={handleSurfaceDestroyed} scalingmode="fill" style={styles.fill} />
      {showTint && <View style={styles.tint} />}
      <View style={styles.debug}>
        {SOURCES_LIST.map((s, idx) => (
          <Text key={s.label} style={styles.sm}>{s.label} {s.name} → {probeResults[idx] ?? '…'}</Text>
        ))}
        <View style={styles.divider} />
        <Text style={styles.txt}>Strat: {strategy}  Swaps: {swapCount}</Text>
        <Text style={styles.txt}>[{src.label}] {src.name}</Text>
        <Text style={styles.txt}>Init: {initialized ? 'y' : 'n'}  {playing ? 'PLAY' : 'PAUSED'}</Text>
        <Text style={styles.txt}>RS: {READY_STATE_NAMES[readyState] ?? readyState}  {fmt(currentTime)}/{fmt(duration)}</Text>
        <Text style={styles.txt}>evt: {lastEvent}</Text>
        <Text style={styles.key}>Key: {lastKey}</Text>
        {errCode !== null
          ? <Text style={styles.err}>Err {errCode} ({ERR_NAMES[errCode] ?? errCode}) {errMsg}</Text>
          : <Text style={styles.txt}>Err: none</Text>}
        {swapMsg !== null && <Text style={styles.swap}>{swapMsg}</Text>}
        <View style={styles.divider} />
        <Text style={styles.hint}>Up=swap ⏪=T ⏩=T2 ☰=A↔B ▼=tint</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#000'},
  fill: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0},
  tint: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,140,0,0.15)', zIndex: 10},
  debug: {position: 'absolute', top: 52, left: 72, backgroundColor: 'rgba(0,0,0,0.78)', padding: 12, borderRadius: 5, zIndex: 20, maxWidth: 780},
  sm:      {color: '#7ef', fontSize: 20, lineHeight: 27, fontFamily: 'monospace'},
  divider: {height: 1, backgroundColor: 'rgba(255,255,255,0.2)', marginVertical: 4},
  txt:     {color: '#fff', fontSize: 21, lineHeight: 28, fontFamily: 'monospace'},
  key:     {color: '#ff0', fontSize: 21, lineHeight: 28, fontFamily: 'monospace'},
  err:     {color: '#f77', fontSize: 21, lineHeight: 28, fontFamily: 'monospace'},
  swap:    {color: '#afd', fontSize: 20, lineHeight: 27, fontFamily: 'monospace'},
  hint:    {color: '#888', fontSize: 17, lineHeight: 24, fontFamily: 'monospace'},
});
