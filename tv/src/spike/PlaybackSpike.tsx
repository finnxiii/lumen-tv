import React, {useState, useEffect, useRef, useCallback} from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {useTVEventHandler, type HWEvent} from '@amazon-devices/react-native-kepler';
import {
  VideoPlayer,
  KeplerVideoSurfaceView,
  type EventListener as W3CEventListener,
} from '@amazon-devices/react-native-w3cmedia';

// Vega only accepts HTTPS. Serve via: cloudflared tunnel --url http://localhost:8000
// python3 -m http.server 8000 --directory /tmp/spike-media
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
  // ── player is held entirely in a ref; only playerKey drives view remount ──
  const playerRef = useRef<VideoPlayer>(new VideoPlayer());

  // Surface management refs
  const surfaceHandleRef       = useRef<string | null>(null);
  const surfaceOwnerRef        = useRef<VideoPlayer | null>(null);
  const surfaceReadyResolveRef = useRef<(() => void) | null>(null);
  const playerInitializedRef   = useRef(false);

  // Per-player listener map — kept so we can detach all listeners on player teardown
  const listenersRef = useRef<Map<string, W3CEventListener>>(new Map());

  // Swap state
  const swapPendingRef = useRef(false);
  const swapQueueRef   = useRef<number | null>(null);
  const doSwapRef      = useRef<((idx: number) => void) | null>(null);
  const srcIdxRef      = useRef(0);
  const strategyRef    = useRef<'A' | 'B'>('B');

  // Key repeat guard: set on first action=0, cleared on action=1
  const keyHeldRef = useRef<Set<string>>(new Set());

  // Auto-start (first launch only)
  const autoStartedRef = useRef(false);

  // ── display state ─────────────────────────────────────────────────────────
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
  const [probeResults, setProbeResults] = useState<Record<number, string>>({
    0: '…', 1: '…',
  });

  // ── surface callbacks ─────────────────────────────────────────────────────
  // Called when KeplerVideoSurfaceView mounts (key change forces unmount→mount).
  // Always call setSurfaceHandle immediately — initialize() may need it before completing.
  const handleSurfaceCreated = useCallback((handle: string) => {
    surfaceHandleRef.current = handle;
    surfaceOwnerRef.current = playerRef.current;
    playerRef.current.setSurfaceHandle(handle);
    console.log('[spike] surface created, setSurfaceHandle called');
    surfaceReadyResolveRef.current?.();
    surfaceReadyResolveRef.current = null;
  }, []);

  // Called when KeplerVideoSurfaceView unmounts. Uses surfaceOwnerRef so it
  // clears the handle on the OWNER player, not whatever playerRef is pointing to now.
  const handleSurfaceDestroyed = useCallback((handle: string) => {
    if (surfaceOwnerRef.current !== null) {
      surfaceOwnerRef.current.clearSurfaceHandle(handle);
      surfaceOwnerRef.current = null;
    }
    surfaceHandleRef.current = null;
  }, []);

  // ── listener management ───────────────────────────────────────────────────
  const attachListeners = useCallback((p: VideoPlayer): void => {
    const map = new Map<string, W3CEventListener>();
    MEDIA_EVENTS.forEach(evtType => {
      const handler: W3CEventListener = () => {
        console.log(`[spike] media:${evtType}`);
        setLastEvent(evtType);
        setReadyState(playerRef.current.readyState ?? 0);
        if (evtType === 'playing') { setPlaying(true); }
        if (evtType === 'pause')   { setPlaying(false); }
        if (evtType === 'error') {
          const err = playerRef.current.error;
          const code = err?.code ?? -1;
          const msg  = err?.message ?? '(no msg)';
          setErrCode(code);
          setErrMsg(msg);
          console.log(`[spike] ERROR code=${code} (${ERR_NAMES[code] ?? '?'}) msg="${msg}"`);
        }
      };
      p.addEventListener(evtType, handler);
      map.set(evtType, handler);
    });
    listenersRef.current = map;
  }, []);

  const detachListeners = useCallback((p: VideoPlayer): void => {
    listenersRef.current.forEach((handler, evtType) => {
      p.removeEventListener(evtType, handler);
    });
    listenersRef.current.clear();
  }, []);

  // ── main effect: init first player, define doSwap ─────────────────────────
  useEffect(() => {

    // ── Strategy A: reuse same player, reassign src ──────────────────────────
    const doSwapA = async (targetIdx: number): Promise<void> => {
      const fromLabel = SOURCES_LIST[srcIdxRef.current]?.label ?? '?';
      const toLabel   = SOURCES_LIST[targetIdx]?.label ?? '?';
      const savedTime  = playerRef.current.currentTime ?? 0;
      const wasPlaying = !playerRef.current.paused;
      const t0 = Date.now();

      setSwapMsg(`A: ${fromLabel}→${toLabel}…`);
      setSrcIdx(targetIdx);
      srcIdxRef.current = targetIdx;
      setErrCode(null);
      setErrMsg('—');

      playerRef.current.pause();
      // Explicit reload on same instance
      playerRef.current.src = SOURCES_LIST[targetIdx].url;
      playerRef.current.load();

      await waitForReady(playerRef.current, 10_000);

      playerRef.current.currentTime = savedTime;
      if (wasPlaying) {
        await playerRef.current.play().catch((e: unknown) => { throw new Error(`play:${String(e)}`); });
      }

      const elapsed = Date.now() - t0;
      setSwapMsg(`A: ${fromLabel}→${toLabel} ${wasPlaying ? 'resumed' : 'paused'} at ${fmt(savedTime)} in ${elapsed}ms`);
      setSwapCount(n => n + 1);
      console.log(`[spike] swapA complete in ${elapsed}ms`);
    };

    // ── Strategy B: deinit old, new player, remount surface ──────────────────
    const doSwapB = async (targetIdx: number): Promise<void> => {
      const fromLabel  = SOURCES_LIST[srcIdxRef.current]?.label ?? '?';
      const toLabel    = SOURCES_LIST[targetIdx]?.label ?? '?';
      const savedTime  = playerRef.current.currentTime ?? 0;
      const wasPlaying = !playerRef.current.paused;
      const old = playerRef.current;
      const t0 = Date.now();

      console.log(`[spike] swapB start ${fromLabel}→${toLabel} t=${fmt(savedTime)} wasPlaying=${wasPlaying}`);
      setSwapMsg(`B: ${fromLabel}→${toLabel}…`);
      setInitialized(false);
      setErrCode(null);
      setErrMsg('—');

      // 1. Detach all event listeners from old player (prevents memory/callback leaks)
      detachListeners(old);

      // 2. Clear surface handle on old player BEFORE deinitialize
      if (surfaceHandleRef.current !== null && surfaceOwnerRef.current === old) {
        old.clearSurfaceHandle(surfaceHandleRef.current);
        surfaceOwnerRef.current = null;
        // Keep surfaceHandleRef.current so handleSurfaceDestroyed can find it,
        // but mark owner null so it doesn't double-clear.
      }

      // 3. Pause + deinitialize old player (best-effort, 3 s)
      old.pause();
      try {
        await withTimeout(old.deinitialize(), 3000, 'deinit');
      } catch (e: unknown) {
        console.log(`[spike] deinit warn: ${(e as Error)?.message ?? String(e)}`);
      }

      // 4. Create + initialize new player — do this BEFORE remounting the view
      //    so KeplerVideoSurfaceView mounts against an already-initialized player.
      const newPlayer = new VideoPlayer();
      playerRef.current = newPlayer;
      playerInitializedRef.current = false;

      await withTimeout(newPlayer.initialize(), 5000, 'init');
      playerInitializedRef.current = true;
      attachListeners(newPlayer);
      setInitialized(true);

      // 5. Trigger KeplerVideoSurfaceView remount (key change → destroy old surface → create new)
      //    Set up promise BEFORE triggering remount so we never miss the callback.
      const surfaceReady = new Promise<void>((resolve) => {
        surfaceReadyResolveRef.current = resolve;
        // If the surface was already created (handleSurfaceCreated fired first),
        // resolve immediately because handleSurfaceCreated already resolved it.
        if (surfaceHandleRef.current !== null && surfaceOwnerRef.current === newPlayer) {
          resolve();
        }
      });

      setSrcIdx(targetIdx);
      srcIdxRef.current = targetIdx;
      setPlayerKey(k => k + 1);

      await withTimeout(surfaceReady, 5000, 'surface');
      console.log(`[spike] swapB surface ready`);

      // 6. Load video on the new player with the surface attached
      newPlayer.src = SOURCES_LIST[targetIdx].url;
      await waitForReady(newPlayer, 10_000);

      newPlayer.currentTime = savedTime;
      if (wasPlaying) {
        await newPlayer.play().catch((e: unknown) => { throw new Error(`play:${String(e)}`); });
      }

      const elapsed = Date.now() - t0;
      setSwapMsg(`B: ${fromLabel}→${toLabel} ${wasPlaying ? 'resumed' : 'paused'} at ${fmt(savedTime)} in ${elapsed}ms`);
      setSwapCount(n => n + 1);
      console.log(`[spike] swapB complete in ${elapsed}ms`);
    };

    // ── Dispatcher: reads strategyRef (component-level) at call time ─────────
    const doSwap = async (targetIdx: number): Promise<void> => {
      if (swapPendingRef.current) {
        swapQueueRef.current = targetIdx;
        console.log(`[spike] swap queued → ${SOURCES_LIST[targetIdx]?.label}`);
        return;
      }
      swapPendingRef.current = true;
      try {
        if (strategyRef.current === 'A') {
          await doSwapA(targetIdx);
        } else {
          await doSwapB(targetIdx);
        }
      } catch (e: unknown) {
        const step = (e as Error)?.message ?? String(e);
        setSwapMsg(`Swap: FAILED (${step})`);
        console.log(`[spike] swap FAILED: ${step}`);
      } finally {
        swapPendingRef.current = false;
        const queued = swapQueueRef.current;
        if (queued !== null) {
          swapQueueRef.current = null;
          doSwapRef.current?.(queued);
        }
      }
    };

    doSwapRef.current = (idx: number): void => { doSwap(idx).catch(() => {}); };

    // ── Initialize first player ───────────────────────────────────────────────
    playerRef.current.initialize().then(() => {
      playerInitializedRef.current = true;
      setInitialized(true);
      attachListeners(playerRef.current);
      console.log('[spike] initialized');

      // Probe + auto-start
      SOURCES_LIST.forEach((src, idx) => {
        probeUrl(src.url).then(status => {
          console.log(`[spike] probe ${src.label} → ${status}`);
          setProbeResults(prev => ({...prev, [idx]: status}));
          if (!autoStartedRef.current && status === '200') {
            autoStartedRef.current = true;
            setSrcIdx(idx);
            srcIdxRef.current = idx;
            setErrCode(null);
            setErrMsg('—');
            console.log(`[spike] auto-starting on ${src.label}`);

            const onCanPlay: W3CEventListener = () => {
              playerRef.current.removeEventListener('canplay', onCanPlay);
              playerRef.current.play().catch((e: unknown) => setErrMsg(String(e)));
            };
            playerRef.current.addEventListener('canplay', onCanPlay);
            playerRef.current.src = src.url;
          }
        });
      });
    }).catch((err: unknown) => setErrMsg(String(err)));

    const pollId = setInterval(() => {
      setCurrentTime(playerRef.current.currentTime ?? 0);
      setDuration(playerRef.current.duration ?? 0);
      setReadyState(playerRef.current.readyState ?? 0);
    }, 500);

    return () => {
      clearInterval(pollId);
      if (surfaceHandleRef.current !== null && surfaceOwnerRef.current !== null) {
        surfaceOwnerRef.current.clearSurfaceHandle(surfaceHandleRef.current);
        surfaceOwnerRef.current = null;
        surfaceHandleRef.current = null;
      }
      detachListeners(playerRef.current);
      playerRef.current.pause();
      playerRef.current.deinitialize().catch(() => {});
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // attachListeners/detachListeners are stable

  // Keep strategyRef in sync with strategy state
  useEffect(() => { strategyRef.current = strategy; }, [strategy]);

  // ── Remote control handler ────────────────────────────────────────────────
  const handleTVEvent = useCallback((evt: HWEvent) => {
    // Log every raw event — key action 0=down 1=up
    console.log(`[spike] key raw="${evt.eventType}" action=${evt.eventKeyAction}`);
    setLastKey(`${evt.eventType} (${evt.eventKeyAction})`);

    if (evt.eventKeyAction === 0) {
      // Ignore repeats: only act once per physical press
      if (keyHeldRef.current.has(evt.eventType)) {
        return;
      }
      keyHeldRef.current.add(evt.eventType);
    } else if (evt.eventKeyAction === 1) {
      keyHeldRef.current.delete(evt.eventType);
      return; // don't act on key-up
    } else {
      return;
    }

    const key = normalizeKey(evt.eventType);

    switch (key) {
      case 'playpause':
      case 'select': {
        if (playerRef.current.paused) {
          playerRef.current.play().catch((e: unknown) => setErrMsg(String(e)));
          setPlaying(true);
        } else {
          playerRef.current.pause();
          setPlaying(false);
        }
        break;
      }
      case 'left': {
        playerRef.current.currentTime =
          Math.max(0, (playerRef.current.currentTime ?? 0) - 10);
        break;
      }
      case 'right': {
        playerRef.current.currentTime = Math.min(
          playerRef.current.duration ?? Infinity,
          (playerRef.current.currentTime ?? 0) + 10,
        );
        break;
      }
      case 'up': {
        doSwapRef.current?.((srcIdxRef.current + 1) % SOURCES_LIST.length);
        break;
      }
      case 'rewind': {
        doSwapRef.current?.(0);
        break;
      }
      case 'fastforward': {
        doSwapRef.current?.(1);
        break;
      }
      case 'menu': {
        // Toggle A ↔ B
        setStrategy(s => {
          const next = s === 'A' ? 'B' : 'A';
          console.log(`[spike] strategy → ${next}`);
          return next;
        });
        break;
      }
      case 'down': {
        setShowTint(prev => !prev);
        break;
      }
      default:
        break;
    }
  }, []); // all access via stable refs

  useTVEventHandler(handleTVEvent);

  const src = SOURCES_LIST[srcIdx];
  const errName = errCode !== null ? ERR_NAMES[errCode] ?? `${errCode}` : null;
  const rsName  = READY_STATE_NAMES[readyState] ?? `${readyState}`;

  return (
    <View style={styles.root}>
      {/* key forces full unmount+remount so the new surface handle is set
          on an already-initialized player (strategy B) */}
      <KeplerVideoSurfaceView
        key={playerKey}
        onSurfaceViewCreated={handleSurfaceCreated}
        onSurfaceViewDestroyed={handleSurfaceDestroyed}
        scalingmode="fill"
        style={styles.fill}
      />

      {showTint && <View style={styles.tint} />}

      <View style={styles.debug}>
        {SOURCES_LIST.map((s, idx) => (
          <Text key={s.label} style={styles.sm}>
            {s.label} {s.name} → {probeResults[idx] ?? '…'}
          </Text>
        ))}
        <View style={styles.divider} />
        <Text style={styles.txt}>Strat: {strategy}  Swaps: {swapCount}</Text>
        <Text style={styles.txt}>[{src.label}] {src.name}</Text>
        <Text style={styles.txt}>Init: {initialized ? 'y' : 'n'}  {playing ? 'PLAY' : 'PAUSED'}</Text>
        <Text style={styles.txt}>RS: {rsName}  {fmt(currentTime)}/{fmt(duration)}</Text>
        <Text style={styles.txt}>evt: {lastEvent}</Text>
        <Text style={styles.key}>Key: {lastKey}</Text>
        {errCode !== null ? (
          <Text style={styles.err} numberOfLines={2}>
            Err {errCode} ({errName}) {errMsg}
          </Text>
        ) : (
          <Text style={styles.txt}>Err: none</Text>
        )}
        {swapMsg !== null && (
          <Text style={styles.swap} numberOfLines={2}>{swapMsg}</Text>
        )}
        <View style={styles.divider} />
        <Text style={styles.hint}>⏯/Sel=play  ◀▶=seek  Up=swap  ⏪=T  ⏩=T2  ☰=A↔B  ▼=tint</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#000'},
  fill: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0},
  tint: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(255,140,0,0.15)', zIndex: 10,
  },
  debug: {
    position: 'absolute', top: 52, left: 72,
    backgroundColor: 'rgba(0,0,0,0.78)',
    padding: 12, borderRadius: 5, zIndex: 20,
    maxWidth: 780, // ~40% of 1920
  },
  sm:   {color: '#7ef', fontSize: 20, lineHeight: 27, fontFamily: 'monospace'},
  divider: {height: 1, backgroundColor: 'rgba(255,255,255,0.2)', marginVertical: 4},
  txt:  {color: '#fff', fontSize: 21, lineHeight: 28, fontFamily: 'monospace'},
  key:  {color: '#ff0', fontSize: 21, lineHeight: 28, fontFamily: 'monospace'},
  err:  {color: '#f77', fontSize: 21, lineHeight: 28, fontFamily: 'monospace'},
  swap: {color: '#afd', fontSize: 20, lineHeight: 27, fontFamily: 'monospace'},
  hint: {color: '#888', fontSize: 17, lineHeight: 24, fontFamily: 'monospace'},
});
