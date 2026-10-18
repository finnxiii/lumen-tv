import React, {useState, useEffect, useRef, useCallback} from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {
  VideoPlayer,
  KeplerVideoSurfaceView,
  type EventListener as W3CEventListener,
} from '@amazon-devices/react-native-w3cmedia';

// Serve via: cloudflared tunnel --url http://localhost:8000
// python3 -m http.server 8000 --directory /tmp/spike-media
const TUNNEL = 'https://strength-direction-maria-machine.trycloudflare.com';

const SOURCES: Array<{label: string; url: string}> = [
  {label: 'T',  url: `${TUNNEL}/test.mp4`},
  {label: 'T2', url: `${TUNNEL}/test2.mp4`},
];

const TOTAL_CYCLES   = 10;
const CYCLE_INTERVAL = 15_000; // ms between swaps

const fmt = (s: number): string => {
  if (!isFinite(s) || isNaN(s)) { return '--:--'; }
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

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
      player.removeEventListener('canplay',        onCan);
      player.removeEventListener('error',          onErr);
      ok ? resolve() : reject(new Error(why ?? 'waitForReady'));
    };
    const onMeta: W3CEventListener = () => settle(true);
    const onCan:  W3CEventListener = () => settle(true);
    const onErr:  W3CEventListener = () => settle(false, `err:${player.error?.code ?? '?'}`);
    const tid = setTimeout(() => settle(false, 'timeout:ready'), ms);
    player.addEventListener('loadedmetadata', onMeta);
    player.addEventListener('canplay',        onCan);
    player.addEventListener('error',          onErr);
  });
}

export const SwapSoakTest: React.FC = () => {
  const playerRef        = useRef<VideoPlayer>(new VideoPlayer());
  const surfaceHandleRef = useRef<string | null>(null);
  const surfaceReadyRef  = useRef<(() => void) | null>(null);
  const listenersRef     = useRef<Map<string, W3CEventListener>>(new Map());

  const [videoKey,  setVideoKey]  = useState(0);
  const [showSurf,  setShowSurf]  = useState(true);
  const [srcIdx,    setSrcIdx]    = useState(0);
  const [overlay,   setOverlay]   = useState(false);
  const [curTime,   setCurTime]   = useState(0);
  const [dur,       setDur]       = useState(0);

  const [cycle,    setCycle]    = useState(0);
  const [lastStep, setLastStep] = useState('boot');
  const [swapMs,   setSwapMs]   = useState<number | null>(null);
  const [result,   setResult]   = useState<'pass' | 'fail' | null>(null);
  const [failInfo, setFailInfo] = useState('');

  // initialize() on Vega requires a surface handle before it can resolve.
  // Guard against duplicate onSurfaceViewCreated calls (React 19 concurrent renders
  // can fire it twice on key-change remounts); only the first call per swap wins.
  const handleSurfaceCreated = useCallback((handle: string) => {
    if (surfaceHandleRef.current !== null) {
      console.log('[soak] surface-created (duplicate, ignored)');
      return;
    }
    surfaceHandleRef.current = handle;
    playerRef.current.setSurfaceHandle(handle);
    console.log('[soak] surface-created setSurfaceHandle');
    surfaceReadyRef.current?.();
    surfaceReadyRef.current = null;
  }, []);

  const handleSurfaceDestroyed = useCallback((_handle: string) => {
    surfaceHandleRef.current = null;
    console.log('[soak] surface-destroyed');
  }, []);

  useEffect(() => {
    let cancelled = false;
    let pollId: ReturnType<typeof setInterval> | undefined;

    const step = (s: string): void => {
      console.log(`[soak] ${s}`);
      setLastStep(s);
    };

    const detach = (p: VideoPlayer): void => {
      listenersRef.current.forEach((h, evt) => p.removeEventListener(evt, h));
      listenersRef.current.clear();
    };

    const attach = (p: VideoPlayer): void => {
      detach(p);
      const map = new Map<string, W3CEventListener>();
      const onTime: W3CEventListener = () => { setCurTime(p.currentTime ?? 0); setDur(p.duration ?? 0); };
      const onErr:  W3CEventListener = () => { console.log(`[soak] media-error code=${p.error?.code ?? '?'}`); };
      p.addEventListener('timeupdate', onTime);
      p.addEventListener('error',      onErr);
      map.set('timeupdate', onTime);
      map.set('error',      onErr);
      listenersRef.current = map;
    };

    // Resolves when a new surface handle is available.
    const waitSurface = (ms: number): Promise<void> =>
      new Promise<void>((resolve, reject) => {
        if (surfaceHandleRef.current !== null) { resolve(); return; }
        const tid = setTimeout(() => {
          surfaceReadyRef.current = null;
          reject(new Error('timeout:surface'));
        }, ms);
        surfaceReadyRef.current = () => { clearTimeout(tid); resolve(); };
      });

    const doSwap = async (toIdx: number, cycleNum: number): Promise<void> => {
      const t0    = Date.now();
      const toSrc = SOURCES[toIdx];

      // 1. Save position
      step(`c${cycleNum}/save-time`);
      const savedTime = playerRef.current.currentTime ?? 0;

      // 2. Show "Switching mode…" overlay
      step(`c${cycleNum}/overlay`);
      setOverlay(true);

      // 3. Pause
      step(`c${cycleNum}/pause`);
      playerRef.current.pause();

      // 4. Remove listeners from old player
      step(`c${cycleNum}/remove-listeners`);
      detach(playerRef.current);

      // 5. Deinitialize old player WHILE surface is still attached — clean decoder teardown.
      //    clearSurfaceHandle before deinit leaves the decoder half-released and
      //    can deadlock the JS thread on the next swap.
      step(`c${cycleNum}/deinit`);
      const old = playerRef.current;
      try {
        await withTimeout(old.deinitialize(), 3000, 'deinit');
      } catch (e: unknown) {
        console.log(`[soak] deinit-warn ${(e as Error)?.message ?? String(e)}`);
      }

      // 6. Wait 500 ms — let native teardown settle
      step(`c${cycleNum}/wait-500ms`);
      await new Promise<void>(r => setTimeout(r, 500));
      if (cancelled) { return; }

      // 7. Clear surface reference + unmount.
      //    Explicitly null surfaceHandleRef so waitSurface() below always blocks
      //    for a fresh onSurfaceViewCreated — even if React 19 batches
      //    setShowSurf(false)+true into one render and skips the unmount.
      step(`c${cycleNum}/clear+unmount`);
      if (surfaceHandleRef.current !== null) {
        old.clearSurfaceHandle(surfaceHandleRef.current);
      }
      surfaceHandleRef.current = null;
      setShowSurf(false);

      // 8. Create new player
      step(`c${cycleNum}/new-player`);
      const p = new VideoPlayer();
      playerRef.current = p;

      // 9. Mount new surface.
      //    handleSurfaceCreated will call p.setSurfaceHandle(handle), which
      //    is required before initialize() can resolve on Vega.
      step(`c${cycleNum}/mount`);
      setSrcIdx(toIdx);
      setVideoKey(k => k + 1);
      setShowSurf(true);

      // 10. Wait for surface — handleSurfaceCreated sets surfaceHandleRef + resolves.
      step(`c${cycleNum}/wait-surface`);
      await waitSurface(5000);
      if (cancelled) { return; }

      // 11. Initialize — surface already attached, resolves quickly.
      step(`c${cycleNum}/init`);
      await withTimeout(p.initialize(), 5000, 'init');
      if (cancelled) { return; }

      // 12. Set src + wait ready
      step(`c${cycleNum}/set-src`);
      p.src = toSrc.url;
      attach(p);

      step(`c${cycleNum}/wait-ready`);
      await waitForReady(p, 10_000);
      if (cancelled) { return; }

      // 13. Seek to saved position
      step(`c${cycleNum}/seek`);
      p.currentTime = savedTime;

      // 14. Play
      step(`c${cycleNum}/play`);
      await p.play().catch(() => {});

      // 15. Hide overlay
      setOverlay(false);

      const elapsed = Date.now() - t0;
      setSwapMs(elapsed);
      step(`c${cycleNum}/done(${elapsed}ms)`);
      console.log(`[soak] cycle-${cycleNum} complete ${elapsed}ms → playing ${toSrc.label}`);
    };

    const runSoak = async (): Promise<void> => {
      // Initial setup: wait for surface, then initialize first player.
      // Surface is rendered immediately (showSurf=true on mount).
      step('wait-initial-surface');
      await withTimeout(waitSurface(5000), 5000, 'initial-surface');

      step('init-first-player');
      await withTimeout(playerRef.current.initialize(), 5000, 'init-first');
      attach(playerRef.current);

      step('load-T');
      playerRef.current.src = SOURCES[0].url;
      setSrcIdx(0);
      await waitForReady(playerRef.current, 10_000);

      step('play-T');
      await playerRef.current.play().catch(() => {});

      pollId = setInterval(() => {
        setCurTime(playerRef.current.currentTime ?? 0);
        setDur(playerRef.current.duration ?? 0);
      }, 500);

      const swapTimes: number[] = [];

      for (let i = 0; i < TOTAL_CYCLES; i++) {
        if (cancelled) { break; }

        step(`wait-${CYCLE_INTERVAL / 1000}s`);
        await new Promise<void>(r => setTimeout(r, CYCLE_INTERVAL));
        if (cancelled) { break; }

        const toIdx = i % 2 === 0 ? 1 : 0; // T→T2→T→T2…
        const cycleNum = i + 1;
        setCycle(cycleNum);
        console.log(`[soak] === CYCLE ${cycleNum}/${TOTAL_CYCLES}: → ${SOURCES[toIdx].label} ===`);

        const t0 = Date.now();
        await doSwap(toIdx, cycleNum);
        swapTimes.push(Date.now() - t0);
      }

      if (!cancelled) {
        const avg = swapTimes.length > 0
          ? Math.round(swapTimes.reduce((a, b) => a + b, 0) / swapTimes.length)
          : 0;
        console.log(`[soak] === SOAK PASSED avg-swap=${avg}ms ===`);
        setResult('pass');
        setFailInfo(`avg swap ${avg}ms`);
      }
    };

    runSoak().catch((e: unknown) => {
      const msg = (e as Error)?.message ?? String(e);
      console.log(`[soak] === SOAK FAILED: ${msg} ===`);
      if (!cancelled) {
        setResult('fail');
        setFailInfo(msg);
      }
    });

    return () => {
      cancelled = true;
      if (pollId !== undefined) { clearInterval(pollId); }
      detach(playerRef.current);
      if (surfaceHandleRef.current !== null) {
        playerRef.current.clearSurfaceHandle(surfaceHandleRef.current);
      }
      playerRef.current.pause();
      playerRef.current.deinitialize().catch(() => {});
    };
  }, []);

  const src = SOURCES[srcIdx] ?? SOURCES[0];

  return (
    <View style={styles.root}>
      {showSurf && (
        <KeplerVideoSurfaceView
          key={videoKey}
          onSurfaceViewCreated={handleSurfaceCreated}
          onSurfaceViewDestroyed={handleSurfaceDestroyed}
          scalingmode="fill"
          style={styles.fill}
        />
      )}

      {overlay && (
        <View style={styles.overlay}>
          <Text style={styles.overlayTxt}>Switching mode…</Text>
        </View>
      )}

      <View style={styles.panel}>
        {result === 'pass' ? (
          <>
            <Text style={styles.pass}>SOAK PASSED</Text>
            <Text style={styles.passDetail}>{TOTAL_CYCLES}/{TOTAL_CYCLES} cycles</Text>
            <Text style={styles.passDetail}>{failInfo}</Text>
          </>
        ) : result === 'fail' ? (
          <>
            <Text style={styles.fail}>SOAK FAILED</Text>
            <Text style={styles.failDetail}>{failInfo}</Text>
          </>
        ) : (
          <>
            <Text style={styles.txt}>Cycle {cycle}/{TOTAL_CYCLES}</Text>
            <Text style={styles.txt}>Src: {src.label}</Text>
            <Text style={styles.txt}>{fmt(curTime)} / {fmt(dur)}</Text>
            <Text style={styles.step}>{lastStep}</Text>
            {swapMs !== null && (
              <Text style={styles.txt}>Last swap: {swapMs}ms</Text>
            )}
          </>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#000'},
  fill: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0},
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center', justifyContent: 'center', zIndex: 10,
  },
  overlayTxt: {color: '#fff', fontSize: 44, fontFamily: 'monospace'},
  panel: {
    position: 'absolute', top: 52, left: 72,
    backgroundColor: 'rgba(0,0,0,0.75)',
    padding: 14, borderRadius: 6, zIndex: 20,
    minWidth: 300,
  },
  txt:        {color: '#fff', fontSize: 22, lineHeight: 30, fontFamily: 'monospace'},
  step:       {color: '#afd', fontSize: 20, lineHeight: 28, fontFamily: 'monospace'},
  pass:       {color: '#0f0', fontSize: 30, lineHeight: 38, fontFamily: 'monospace'},
  passDetail: {color: '#8f8', fontSize: 20, lineHeight: 28, fontFamily: 'monospace'},
  fail:       {color: '#f44', fontSize: 28, lineHeight: 36, fontFamily: 'monospace'},
  failDetail: {color: '#fa0', fontSize: 20, lineHeight: 28, fontFamily: 'monospace'},
});
