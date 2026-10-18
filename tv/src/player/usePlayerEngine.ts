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

export interface PlayerState {
  playing: boolean;
  positionInSegment: number;
  segmentDuration: number;
  clip: ClipId;
  mode: VariantId;
  ready: boolean;
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

  const [state, setState] = useState<PlayerState>({
    playing: false,
    positionInSegment: 0,
    segmentDuration: SEG_S,
    clip: 'night',
    mode: 'original',
    ready: false,
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

    segRef.current = seg;
    playerRef.current.currentTime = seg.start + offset;
    setState(s => ({...s, clip, mode}));

    if (overlayTimerRef.current) { clearTimeout(overlayTimerRef.current); }
    overlayTimerRef.current = setTimeout(() => {
      setModeOverlay({visible: false, text: ''});
      setToast({visible: true, text: `${label} applied`});
      if (toastTimerRef.current) { clearTimeout(toastTimerRef.current); }
      toastTimerRef.current = setTimeout(() => {
        setToast({visible: false, text: ''});
      }, 2500);
    }, 400);
  }, []);

  const play = useCallback(() => {
    playerRef.current.play().catch(() => {});
  }, []);

  const pause = useCallback(() => {
    playerRef.current.pause();
  }, []);

  const seekBy = useCallback((seconds: number) => {
    const raw = playerRef.current.currentTime ?? 0;
    const seg = segRef.current;
    const clamped = Math.max(seg.start, Math.min(raw + seconds, seg.start + SEG_S - 1));
    playerRef.current.currentTime = clamped;
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
        const settle = (ok: boolean): void => {
          if (done) { return; }
          done = true;
          clearTimeout(tid);
          playerRef.current.removeEventListener('loadedmetadata', onMeta);
          playerRef.current.removeEventListener('canplay', onCan);
          playerRef.current.removeEventListener('error', onErr);
          ok ? resolve() : reject(new Error('media-error'));
        };
        const onMeta: W3CEventListener = () => settle(true);
        const onCan: W3CEventListener = () => settle(true);
        const onErr: W3CEventListener = () => settle(false);
        const tid = setTimeout(() => settle(false), ms);
        playerRef.current.addEventListener('loadedmetadata', onMeta);
        playerRef.current.addEventListener('canplay', onCan);
        playerRef.current.addEventListener('error', onErr);
      });

    const onTimeUpdate: W3CEventListener = () => {
      if (cancelled) { return; }
      const raw = playerRef.current.currentTime ?? 0;
      const seg = segRef.current;
      const pos = raw - seg.start;
      if (pos >= SEG_S - 0.3) {
        playerRef.current.currentTime = seg.start;
        return;
      }
      setState(s => ({...s, positionInSegment: Math.max(0, pos)}));
    };

    const onPlay: W3CEventListener = () => {
      if (!cancelled) { setState(s => ({...s, playing: true})); }
    };
    const onPause: W3CEventListener = () => {
      if (!cancelled) { setState(s => ({...s, playing: false})); }
    };

    const boot = async (): Promise<void> => {
      await waitSurface(10_000);
      if (cancelled) { return; }
      await playerRef.current.initialize();
      if (cancelled) { return; }

      playerRef.current.src = `${MEDIA_BASE_URL}/lumen-reel.mp4`;
      playerRef.current.addEventListener('timeupdate', onTimeUpdate);
      playerRef.current.addEventListener('play', onPlay);
      playerRef.current.addEventListener('pause', onPause);

      await waitReady(20_000);
      if (cancelled) { return; }

      playerRef.current.currentTime = 0;
      setState(s => ({...s, ready: true}));
      await playerRef.current.play().catch(() => {});
      if (!cancelled) { setState(s => ({...s, playing: true})); }
    };

    boot().catch(e => console.warn('[player] boot failed:', String(e)));

    return () => {
      cancelled = true;
      player.removeEventListener('timeupdate', onTimeUpdate);
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
