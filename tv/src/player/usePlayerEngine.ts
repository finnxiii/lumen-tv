import {useRef, useState, useCallback, useEffect} from 'react';
import {
  VideoPlayer,
  type EventListener as W3CEventListener,
} from '@amazon-devices/react-native-w3cmedia';
import {MEDIA_BASE_URL} from '../config';
import reelData from '../data/reel.json';
import {MODES} from '../data/modes';
import type {VariantId, ClipId} from '../session/types';

const SEG_S = reelData.segmentSeconds;

interface ReelSegment {
  clip: string;
  variant: string;
  start: number;
}

const REEL: ReelSegment[] = reelData.order;

function findSeg(clip: string, variant: string): ReelSegment | undefined {
  return REEL.find(s => s.clip === clip && s.variant === variant);
}

export interface DebugInfo {
  readyState: number;
  paused: boolean;
  rawTime: number;
  segStart: number;
  lastEvent: string;
  hasSurface: boolean;
  intent: 'playing' | 'paused';
  retries: number;
}

export interface PlayerState {
  playing: boolean;
  positionInSegment: number;
  segmentDuration: number;
  clip: ClipId;
  mode: VariantId;
  ready: boolean;
  error: string | null;
  debug: DebugInfo;
}

export interface PlayerEngine {
  onSurfaceViewCreated: (handle: string) => void;
  onSurfaceViewDestroyed: (handle: string) => void;
  state: PlayerState;
  setClipAndMode: (clip: ClipId, mode: VariantId) => void;
  play: () => void;
  pause: () => void;
  seekBy: (seconds: number) => void;
  modeOverlay: {visible: boolean; text: string};
  toast: {visible: boolean; text: string};
}

export function usePlayerEngine(): PlayerEngine {
  const playerRef = useRef(new VideoPlayer());
  const surfaceHandleRef = useRef<string | null>(null);
  const surfaceReadyRef = useRef<(() => void) | null>(null);
  const segRef = useRef<ReelSegment>(REEL[0]);

  const lastEventRef = useRef('none');
  const intentPlayingRef = useRef(false);
  const retriesRef = useRef(0);
  const lastLoopAtRef = useRef(0);
  // Wired up inside useEffect; stable ref so callbacks outside the effect can call it
  const seekAndResumeRef = useRef<(time: number) => Promise<void>>(async () => {});

  const [state, setState] = useState<PlayerState>({
    playing: false,
    positionInSegment: 0,
    segmentDuration: SEG_S,
    clip: 'night',
    mode: 'original',
    ready: false,
    error: null,
    debug: {
      readyState: -1, paused: true, rawTime: 0, segStart: 0,
      lastEvent: 'none', hasSurface: false, intent: 'paused', retries: 0,
    },
  });
  const [modeOverlay, setModeOverlay] = useState({visible: false, text: ''});
  const [toast, setToast] = useState({visible: false, text: ''});

  const overlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onSurfaceViewCreated = useCallback((handle: string) => {
    if (surfaceHandleRef.current !== null) { return; }
    surfaceHandleRef.current = handle;
    playerRef.current.setSurfaceHandle(handle);
    surfaceReadyRef.current?.();
    surfaceReadyRef.current = null;
  }, []);

  const onSurfaceViewDestroyed = useCallback((_handle: string) => {
    surfaceHandleRef.current = null;
  }, []);

  const setClipAndMode = useCallback((clip: ClipId, mode: VariantId) => {
    const seg = findSeg(clip, mode);
    if (!seg) { return; }

    const raw = playerRef.current.currentTime ?? 0;
    const offset = Math.max(0, Math.min(raw - segRef.current.start, SEG_S - 1));

    const modeInfo = MODES.find(m => m.id === mode);
    const label = modeInfo?.label ?? (mode === 'original' ? 'Original' : mode);

    setModeOverlay({visible: true, text: `Applying ${label} mode…`});

    retriesRef.current = 0;
    segRef.current = seg;
    const targetTime = seg.start + offset;

    seekAndResumeRef.current(targetTime)
      .then(() => { setState(s => ({...s, clip, mode})); })
      .catch(() => {});

    if (overlayTimerRef.current) { clearTimeout(overlayTimerRef.current); }
    overlayTimerRef.current = setTimeout(() => {
      setModeOverlay({visible: false, text: ''});
      setToast({visible: true, text: `${label} applied`});
      if (toastTimerRef.current) { clearTimeout(toastTimerRef.current); }
      toastTimerRef.current = setTimeout(() => {
        setToast({visible: false, text: ''});
      }, 2_500);
    }, 400);
  }, []);

  const play = useCallback(() => {
    intentPlayingRef.current = true;
    retriesRef.current = 0;
    playerRef.current.play().catch(() => {});
  }, []);

  const pause = useCallback(() => {
    intentPlayingRef.current = false;
    playerRef.current.pause();
  }, []);

  const seekBy = useCallback((seconds: number) => {
    const raw = playerRef.current.currentTime ?? 0;
    const seg = segRef.current;
    const clamped = Math.max(seg.start, Math.min(raw + seconds, seg.start + SEG_S - 1));
    retriesRef.current = 0;
    seekAndResumeRef.current(clamped).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    const player = playerRef.current;

    const waitSurface = (ms: number): Promise<void> =>
      new Promise((resolve, reject) => {
        if (surfaceHandleRef.current !== null) { resolve(); return; }
        const tid = setTimeout(() => {
          surfaceReadyRef.current = null;
          reject(new Error('timeout:surface'));
        }, ms);
        surfaceReadyRef.current = () => { clearTimeout(tid); resolve(); };
      });

    const waitReady = (ms: number): Promise<void> =>
      new Promise((resolve, reject) => {
        let done = false;
        const settle = (ok: boolean, errMsg?: string): void => {
          if (done) { return; }
          done = true;
          clearTimeout(tid);
          player.removeEventListener('loadedmetadata', onMeta);
          player.removeEventListener('canplay', onCan);
          player.removeEventListener('error', onErr);
          if (ok) { resolve(); }
          else { reject(new Error(errMsg ?? 'media-error')); }
        };
        const onMeta: W3CEventListener = () => settle(true);
        const onCan: W3CEventListener = () => settle(true);
        const onErr: W3CEventListener = (evt) => {
          const e = (evt as {error?: {code?: number; message?: string}}).error;
          const msg = e ? `code:${e.code ?? '?'} ${e.message ?? ''}`.trim() : 'media-error';
          console.warn('[player] media error:', msg);
          settle(false, msg);
        };
        const tid = setTimeout(() => settle(false, 'timeout:ready'), ms);
        player.addEventListener('loadedmetadata', onMeta);
        player.addEventListener('canplay', onCan);
        player.addEventListener('error', onErr);
      });

    // One-shot event listener with timeout
    const waitEvent = (name: string, ms: number): Promise<void> =>
      new Promise((resolve, reject) => {
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

    const track = (name: string): void => { lastEventRef.current = name; };

    // 'timeupdate' is not reliable on all Vega builds — position is driven by the
    // 500 ms poll below; this handler only tracks the last event name for debugging.
    const onTimeUpdate: W3CEventListener = () => { track('timeupdate'); };

    // 'playing' fires when the media actually starts — this is the authoritative source for state.playing
    const onPlaying: W3CEventListener = () => {
      track('playing');
      retriesRef.current = 0;
      if (!cancelled) { setState(s => ({...s, playing: true})); }
    };
    // 'play' fires when play() is called (intent) — track it for debugging only
    const onPlay: W3CEventListener = () => { track('play'); };
    const onPause: W3CEventListener = () => {
      track('pause');
      if (!cancelled) { setState(s => ({...s, playing: false})); }
    };

    // Seek to time, then re-play only if intent is still playing at the moment seeked fires.
    // Checking intentPlayingRef at resume time (not capture time) prevents a race where
    // the user pauses while a seek is in flight and the seek then re-starts playback.
    const seekAndResume = async (time: number): Promise<void> => {
      player.currentTime = time;
      try {
        await waitEvent('seeked', 2_000);
      } catch {
        // seeked timeout — Vega may not always fire it; continue
      }
      if (cancelled) { return; }
      const paused = (player as {paused?: boolean}).paused ?? true;
      if (intentPlayingRef.current && paused) {
        await player.play().catch(() => {});
        try {
          await waitEvent('playing', 2_000);
        } catch {
          // watchdog will retry if playback still doesn't start
        }
      }
    };

    seekAndResumeRef.current = seekAndResume;

    // Watchdog: fires only when intent=playing AND currentTime hasn't advanced for 2 s.
    // Using time-advancement (not paused===true) means deliberate pauses don't trigger it —
    // the user's pause sets intent=paused, so the early-return guard handles that path.
    let lastWatchdogTime = -1;
    let noAdvanceMs = 0;
    const watchdog = setInterval(() => {
      if (cancelled) { return; }
      if (!intentPlayingRef.current) {
        lastWatchdogTime = -1;
        noAdvanceMs = 0;
        return;
      }
      const currentTime = player.currentTime ?? 0;
      if (currentTime === lastWatchdogTime) {
        noAdvanceMs += 500;
        if (noAdvanceMs >= 2_000 && retriesRef.current < 3) {
          retriesRef.current += 1;
          noAdvanceMs = 0;
          console.log('[player] watchdog retry', retriesRef.current);
          player.play().catch(() => {});
        }
      } else {
        lastWatchdogTime = currentTime;
        noAdvanceMs = 0;
      }
    }, 500);

    const debugPoll = setInterval(() => {
      if (cancelled) { return; }
      const raw = player.currentTime ?? 0;
      const seg = segRef.current;
      const pos = Math.max(0, raw - seg.start);

      // Segment loop — fires when timeupdate is unreliable; debounced to avoid double-trigger
      if (pos >= SEG_S - 0.3 && Date.now() - lastLoopAtRef.current > 3_000) {
        lastLoopAtRef.current = Date.now();
        seekAndResumeRef.current(seg.start).catch(() => {});
      }

      setState(s => ({
        ...s,
        positionInSegment: pos,
        debug: {
          readyState: (player as {readyState?: number}).readyState ?? -1,
          paused: (player as {paused?: boolean}).paused ?? true,
          rawTime: raw,
          segStart: seg.start,
          lastEvent: lastEventRef.current,
          hasSurface: surfaceHandleRef.current !== null,
          intent: intentPlayingRef.current ? 'playing' : 'paused',
          retries: retriesRef.current,
        },
      }));
    }, 500);

    const boot = async (): Promise<void> => {
      try {
        console.log('[player] boot: waiting for surface');
        await waitSurface(10_000);
        if (cancelled) { return; }

        console.log('[player] boot: initialize()');
        await player.initialize();
        if (cancelled) { return; }

        player.addEventListener('timeupdate', onTimeUpdate);
        player.addEventListener('playing', onPlaying);
        player.addEventListener('play', onPlay);
        player.addEventListener('pause', onPause);

        console.log('[player] boot: src=', `${MEDIA_BASE_URL}/lumen-reel.mp4`);
        player.src = `${MEDIA_BASE_URL}/lumen-reel.mp4`;

        console.log('[player] boot: waiting for canplay');
        await waitReady(15_000);
        if (cancelled) { return; }

        // Play FIRST — before seeking — so the player enters playing state cleanly.
        // Seeking while paused on some Vega builds silently prevents play() from working.
        console.log('[player] boot: play()');
        intentPlayingRef.current = true;
        await player.play().catch(e => console.warn('[player] play() err:', String(e)));

        console.log('[player] boot: waiting for playing event');
        try {
          await waitEvent('playing', 3_000);
        } catch {
          console.warn('[player] boot: playing timeout — seeking anyway');
        }
        if (cancelled) { return; }

        // Now seek to the initial segment start (night/original = 0)
        const seg = segRef.current;
        console.log('[player] boot: seek to seg.start=', seg.start);
        player.currentTime = seg.start;

        try {
          await waitEvent('seeked', 2_000);
        } catch {
          console.warn('[player] boot: seeked timeout');
        }
        if (cancelled) { return; }

        const paused = (player as {paused?: boolean}).paused ?? true;
        if (paused) {
          console.log('[player] boot: paused after seek — play() again');
          await player.play().catch(() => {});
          try {
            await waitEvent('playing', 3_000);
          } catch {
            console.warn('[player] boot: second playing timeout');
          }
        }

        if (!cancelled) {
          setState(s => ({...s, ready: true, error: null}));
          console.log('[player] boot: done');
        }
      } catch (e) {
        if (cancelled) { return; }
        const msg = e instanceof Error ? e.message : String(e);
        const display = msg.startsWith('timeout:')
          ? 'Video unavailable — check media server / tunnel.'
          : `Video error: ${msg}`;
        console.warn('[player] boot failed:', msg);
        setState(s => ({...s, error: display}));
      }
    };

    boot();

    return () => {
      cancelled = true;
      clearInterval(watchdog);
      clearInterval(debugPoll);
      player.removeEventListener('timeupdate', onTimeUpdate);
      player.removeEventListener('playing', onPlaying);
      player.removeEventListener('play', onPlay);
      player.removeEventListener('pause', onPause);
      const handle = surfaceHandleRef.current;
      if (handle !== null) { player.clearSurfaceHandle(handle); }
      player.deinitialize().catch(() => {});
      if (overlayTimerRef.current) { clearTimeout(overlayTimerRef.current); }
      if (toastTimerRef.current) { clearTimeout(toastTimerRef.current); }
    };
  }, []);

  return {
    onSurfaceViewCreated,
    onSurfaceViewDestroyed,
    state,
    setClipAndMode,
    play,
    pause,
    seekBy,
    modeOverlay,
    toast,
  };
}
