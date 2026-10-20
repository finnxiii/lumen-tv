import {useCallback, useEffect, useRef, useState} from 'react';
import {
  VideoPlayer,
  type EventListener as W3CEventListener,
} from '@amazon-devices/react-native-w3cmedia';
import {MEDIA_BASE_URL} from '../config';
import {MODES} from '../data/modes';
import type {VariantId, ClipId} from '../session/types';

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const tid = setTimeout(() => reject(new Error(`timeout:${label}`)), ms);
    p.then(v => { clearTimeout(tid); resolve(v); },
           e => { clearTimeout(tid); reject(e instanceof Error ? e : new Error(String(e))); });
  });
}

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

function waitForEvent(player: VideoPlayer, name: string, ms: number): Promise<void> {
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

export interface DebugInfo {
  readyState: number;
  paused: boolean;
  lastEvent: string;
  hasSurface: boolean;
  swapCount: number;
}

export interface PlayerState {
  playing: boolean;
  positionInClip: number;
  clipDuration: number;
  clip: ClipId;
  mode: VariantId;
  ready: boolean;
  ended: boolean;
  error: string | null;
  debug: DebugInfo;
}

export interface PlayerEngine {
  onSurfaceViewCreated: (handle: string) => void;
  onSurfaceViewDestroyed: (handle: string) => void;
  showSurface: boolean;
  surfaceKey: number;
  state: PlayerState;
  load: (clip: ClipId, mode: VariantId) => void;
  play: () => void;
  pause: () => void;
  overlay: {visible: boolean; text: string};
}

export function usePlayerEngine(initialClip: ClipId = 'night'): PlayerEngine {
  const [showSurface, setShowSurface] = useState(true);
  const [surfaceKey, setSurfaceKey] = useState(0);
  const [overlay, setOverlay] = useState({visible: true, text: 'Loading…'});

  const [state, setState] = useState<PlayerState>({
    playing: false,
    positionInClip: 0,
    clipDuration: 45,
    clip: initialClip,
    mode: 'original',
    ready: false,
    ended: false,
    error: null,
    debug: {readyState: -1, paused: true, lastEvent: 'none', hasSurface: false, swapCount: 0},
  });

  const playerRef        = useRef(new VideoPlayer());
  const surfaceHandleRef = useRef<string | null>(null);
  const surfaceReadyRef  = useRef<(() => void) | null>(null);
  const swapCountRef     = useRef(0);
  const isSwappingRef    = useRef(false);
  const pendingRef       = useRef<{clip: ClipId; mode: VariantId} | null>(null);
  const lastEventRef     = useRef('none');
  const listenerCleanupRef = useRef<() => void>(() => {});
  const initialClipRef   = useRef(initialClip);

  // Stable ref so useCallbacks outside the effect can trigger a load
  const doLoadRef = useRef<(clip: ClipId, mode: VariantId) => void>(() => {});

  const onSurfaceViewCreated = useCallback((handle: string) => {
    if (surfaceHandleRef.current !== null) { return; }
    surfaceHandleRef.current = handle;
    playerRef.current.setSurfaceHandle(handle);
    surfaceReadyRef.current?.();
    surfaceReadyRef.current = null;
  }, []);

  const onSurfaceViewDestroyed = useCallback((_h: string) => {
    surfaceHandleRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const waitSurface = (ms: number): Promise<void> =>
      new Promise<void>((resolve, reject) => {
        if (surfaceHandleRef.current !== null) { resolve(); return; }
        const tid = setTimeout(() => { surfaceReadyRef.current = null; reject(new Error('timeout:surface')); }, ms);
        surfaceReadyRef.current = () => { clearTimeout(tid); resolve(); };
      });

    const doLoad = (clip: ClipId, mode: VariantId): void => {
      if (isSwappingRef.current) {
        pendingRef.current = {clip, mode};
        return;
      }
      isSwappingRef.current = true;

      const modeInfo = MODES.find(m => m.id === mode);
      const label = modeInfo?.label ?? (mode === 'original' ? 'Original' : mode);
      const isFirst = swapCountRef.current === 0;

      setOverlay({visible: true, text: isFirst ? 'Loading…' : `Applying ${label} mode…`});
      setState(s => ({...s, ended: false, error: null}));

      const run = async (): Promise<void> => {
        // ── Teardown previous player (skip on first load) ────────────────────
        if (!isFirst) {
          const old = playerRef.current;
          old.pause();
          listenerCleanupRef.current();
          listenerCleanupRef.current = () => {};

          try {
            await withTimeout(old.deinitialize(), 1_000, 'deinit');
          } catch (e) {
            console.warn('[player] deinit warn:', (e as Error)?.message ?? String(e));
          }
          if (cancelled) { return; }

          await new Promise<void>(r => setTimeout(r, 300));
          if (cancelled) { return; }

          if (surfaceHandleRef.current !== null) {
            old.clearSurfaceHandle(surfaceHandleRef.current);
          }
          surfaceHandleRef.current = null;
          setShowSurface(false);
        }

        // ── Mount new surface ─────────────────────────────────────────────────
        const p = new VideoPlayer();
        playerRef.current = p;
        swapCountRef.current += 1;
        const n = swapCountRef.current;
        console.log('[player] swap', n, clip, mode);

        if (!isFirst) {
          setSurfaceKey(k => k + 1);
          setShowSurface(true);
        }

        // ── Initialize ────────────────────────────────────────────────────────
        await waitSurface(5_000);
        if (cancelled) { return; }

        await withTimeout(p.initialize(), 5_000, 'init');
        if (cancelled) { return; }

        // ── Attach listeners ──────────────────────────────────────────────────
        const onPlaying: W3CEventListener = () => {
          lastEventRef.current = 'playing';
          if (!cancelled) { setState(s => ({...s, playing: true})); }
        };
        const onPause: W3CEventListener = () => {
          lastEventRef.current = 'pause';
          if (!cancelled) { setState(s => ({...s, playing: false})); }
        };
        const onEnded: W3CEventListener = () => {
          lastEventRef.current = 'ended';
          if (!cancelled) { setState(s => ({...s, playing: false, ended: true})); }
        };
        const onError: W3CEventListener = () => {
          const code = p.error?.code ?? '?';
          lastEventRef.current = `err:${code}`;
          if (!cancelled) { setState(s => ({...s, error: `err:${code}`})); }
        };
        p.addEventListener('playing', onPlaying);
        p.addEventListener('pause',   onPause);
        p.addEventListener('ended',   onEnded);
        p.addEventListener('error',   onError);
        listenerCleanupRef.current = () => {
          p.removeEventListener('playing', onPlaying);
          p.removeEventListener('pause',   onPause);
          p.removeEventListener('ended',   onEnded);
          p.removeEventListener('error',   onError);
        };

        // ── Load + play ───────────────────────────────────────────────────────
        const url = `${MEDIA_BASE_URL}/${clip}/${mode}.mp4`;
        console.log('[player] src=', url);
        p.src = url;

        await waitForReady(p, 15_000);
        if (cancelled) { return; }

        await p.play().catch(e => console.warn('[player] play err:', String(e)));
        if (cancelled) { return; }

        try {
          await waitForEvent(p, 'playing', 3_000);
        } catch {
          console.warn('[player] playing timeout after play()');
        }
        if (cancelled) { return; }

        setState(s => ({
          ...s, clip, mode, ready: true, ended: false, error: null,
          debug: {...s.debug, swapCount: n},
        }));
        setOverlay({visible: false, text: ''});
        console.log('[player] swap', n, 'done');
      };

      run()
        .catch(e => {
          if (cancelled) { return; }
          const msg = e instanceof Error ? e.message : String(e);
          console.warn('[player] load failed:', msg);
          setState(s => ({...s, error: msg}));
          setOverlay({visible: false, text: ''});
        })
        .finally(() => {
          isSwappingRef.current = false;
          if (!cancelled && pendingRef.current) {
            const next = pendingRef.current;
            pendingRef.current = null;
            doLoad(next.clip, next.mode);
          }
        });
    };

    doLoadRef.current = doLoad;

    // ── Debug poll ────────────────────────────────────────────────────────────
    const debugPoll = setInterval(() => {
      if (cancelled) { return; }
      const p = playerRef.current;
      const paused = (p as {paused?: boolean}).paused ?? true;
      const rs     = (p as {readyState?: number}).readyState ?? -1;
      const pos    = p.currentTime ?? 0;
      const dur    = p.duration ?? 45;
      setState(s => ({
        ...s,
        positionInClip: pos,
        clipDuration: dur > 0 ? dur : 45,
        debug: {
          readyState: rs,
          paused,
          lastEvent: lastEventRef.current,
          hasSurface: surfaceHandleRef.current !== null,
          swapCount: swapCountRef.current,
        },
      }));
    }, 500);

    // ── Initial load ──────────────────────────────────────────────────────────
    doLoad(initialClipRef.current, 'original');

    return () => {
      cancelled = true;
      clearInterval(debugPoll);
      listenerCleanupRef.current();
      const p = playerRef.current;
      const h = surfaceHandleRef.current;
      if (h !== null) { p.clearSurfaceHandle(h); }
      p.deinitialize().catch(() => {});
    };
  }, []);

  const load = useCallback((clip: ClipId, mode: VariantId) => {
    doLoadRef.current(clip, mode);
  }, []);

  const play = useCallback(() => {
    playerRef.current.play().catch(() => {});
  }, []);

  const pause = useCallback(() => {
    playerRef.current.pause();
  }, []);

  return {
    onSurfaceViewCreated,
    onSurfaceViewDestroyed,
    showSurface,
    surfaceKey,
    state,
    load,
    play,
    pause,
    overlay,
  };
}
