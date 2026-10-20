import React, {useCallback, useEffect, useRef, useState} from 'react';
import {BackHandler, StyleSheet, Text, View} from 'react-native';
import {ScaledStage} from '../components/ScaledStage';
import {useTVEventHandler, type HWEvent} from '@amazon-devices/react-native-kepler';
import type {PlayerEngine} from '../player/usePlayerEngine';
import {useSessionContext} from '../session/SessionContext';
import {FocusButton} from '../components/FocusButton';
import {
  PlayIcon, PauseIcon, ReplayIcon,
  ModesIcon, SparkleIcon, CompareIcon, FilmIcon,
} from '../components/icons';
import {ModesOverlay} from './overlays/ModesOverlay';
import {AssistantOverlay} from './overlays/AssistantOverlay';
import {CompareOverlay} from './overlays/CompareOverlay';
import {MODES} from '../data/modes';
import {CLIPS} from '../data/clips';
import {Colors, Layout} from '../theme';
import {ENABLE_SEEK} from '../config';
import type {ModeId, VariantId, ClipId} from '../session/types';

const CONTROLS_TIMEOUT_MS = 6_000;

type OverlayType = 'modes' | 'assistant' | 'compare' | null;

interface PlayerScreenProps {
  initialClip: ClipId;
  onBack: () => void;
  engine: PlayerEngine;
}

const fmt = (s: number): string => {
  if (!isFinite(s) || isNaN(s)) { return '0:00'; }
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

export const PlayerScreen: React.FC<PlayerScreenProps> = ({initialClip, onBack, engine}) => {
  const {client, sessionState, recommendation, clearRecommendation,
         activeOverlay, setActiveOverlay, onSettingsApply, onPlaybackCommand} = useSessionContext();

  const [clip, setClip] = useState<ClipId>(initialClip);
  const [overlay, setOverlay] = useState<OverlayType>(null);
  const [showControls, setShowControls] = useState(true);
  const [lastFocusedBtn, setLastFocusedBtn] = useState<'play' | 'clip' | 'modes' | 'assistant' | 'compare'>('modes');
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bumpControls = useCallback(() => {
    setShowControls(true);
    if (controlsTimerRef.current) { clearTimeout(controlsTimerRef.current); }
    controlsTimerRef.current = setTimeout(() => setShowControls(false), CONTROLS_TIMEOUT_MS);
  }, []);

  useEffect(() => {
    bumpControls();
    return () => { if (controlsTimerRef.current) { clearTimeout(controlsTimerRef.current); } };
  }, [bumpControls]);

  // Settings from phone/session
  useEffect(() => {
    const unsub = onSettingsApply(p => {
      engine.load(clip, p.mode as VariantId);
    });
    return unsub;
  }, [clip, engine, onSettingsApply]);

  // Playback commands from phone/session (no seek)
  useEffect(() => {
    const unsub = onPlaybackCommand(p => {
      if (p.action === 'play') { engine.play(); }
      else if (p.action === 'pause') { engine.pause(); }
    });
    return unsub;
  }, [engine, onPlaybackCommand]);

  // Overlay from session
  useEffect(() => {
    if (activeOverlay) { setOverlay(activeOverlay); }
  }, [activeOverlay]);

  // Remote keys — back only; play/pause handled by system
  useTVEventHandler((evt: HWEvent) => {
    if (evt.eventKeyAction !== 0) { return; }
    bumpControls();
    const evtType: string = evt.eventType;
    if (evtType === 'back') {
      if (overlay) {
        setOverlay(null);
        setActiveOverlay(null);
      } else if (showControls) {
        onBack();
      } else {
        setShowControls(true);
      }
    } else if (ENABLE_SEEK && evtType === 'rewind') {
      engine.seekBy(-10);
    } else if (ENABLE_SEEK && (evtType === 'fastforward' || evtType === 'fastForward')) {
      engine.seekBy(10);
    }
  });

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (overlay) { setOverlay(null); setActiveOverlay(null); return true; }
      if (showControls) { onBack(); return true; }
      setShowControls(true);
      return true;
    });
    return () => sub.remove();
  }, [overlay, showControls, onBack, setActiveOverlay]);

  // Playback update to session (~2 s)
  useEffect(() => {
    const tid = setInterval(() => {
      client.sendPlaybackUpdate(clip, engine.state.positionInClip, engine.state.playing);
    }, 2_000);
    return () => clearInterval(tid);
  }, [client, clip, engine.state.positionInClip, engine.state.playing]);

  const currentModeInfo = MODES.find(m => m.id === engine.state.mode);
  const modeColor = currentModeInfo?.color ?? Colors.muted;
  const modeLabel = currentModeInfo?.label ?? (engine.state.mode === 'original' ? 'Original' : engine.state.mode);
  const progress = engine.state.positionInClip / engine.state.clipDuration;
  const phoneConnected = sessionState?.phoneConnected ?? false;
  const isActuallyPaused = engine.state.debug.paused;

  const handleModeSelect = (mode: ModeId): void => {
    setOverlay(null);
    setActiveOverlay(null);
    client.sendModeUpdate(mode, 'tv');
  };

  const handleApplyRec = (): void => {
    if (!recommendation) { return; }
    engine.load(clip, recommendation.mode as VariantId);
    clearRecommendation();
    setOverlay(null);
    setActiveOverlay(null);
  };

  const handleCompareRec = (): void => {
    setOverlay('compare');
    setActiveOverlay('compare');
  };

  const handleDismissRec = (): void => {
    if (recommendation) { client.sendRecommendationResponse(recommendation.id, false); }
    clearRecommendation();
    setOverlay(null);
    setActiveOverlay(null);
  };

  const handleKeepCompare = (): void => {
    if (recommendation) {
      engine.load(clip, recommendation.mode as VariantId);
      clearRecommendation();
    }
    setOverlay(null);
    setActiveOverlay(null);
  };

  const handleRevertCompare = (): void => {
    setOverlay(null);
    setActiveOverlay(null);
  };

  const switchClip = (): void => {
    const next = (clip === 'night' ? 'day' : 'night') as ClipId;
    setClip(next);
    engine.load(next, engine.state.mode);
  };

  return (
    <View style={styles.root}>
      <ScaledStage>
        {/* Top-left: mode pill */}
        {showControls && (
          <View style={styles.modePill}>
            <View style={[styles.modeDot, {backgroundColor: modeColor}]} />
            <Text style={[styles.modePillText, {color: modeColor}]}>{modeLabel}</Text>
          </View>
        )}

        {/* Top-right: AI status + phone */}
        {showControls && (
          <View style={styles.topRight}>
            {recommendation && (
              <View style={styles.aiPill}>
                <Text style={styles.aiPillText}>✦ AI suggestion</Text>
              </View>
            )}
            {phoneConnected && sessionState && (
              <View style={styles.phonePill}>
                <Text style={styles.phonePillText}>
                  Phone connected · {sessionState.code}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Loading / error */}
        {!engine.state.ready && !engine.overlay.visible && (
          <View style={styles.loadingOverlay}>
            <Text style={styles.loadingText}>{engine.state.error ?? 'Loading…'}</Text>
          </View>
        )}

        {/* Swap overlay */}
        {engine.overlay.visible && (
          <View style={styles.swapOverlay}>
            <Text style={styles.swapText}>{engine.overlay.text}</Text>
          </View>
        )}

        {/* Ended / Replay */}
        {engine.state.ended && !engine.overlay.visible && (
          <View style={styles.endedOverlay}>
            <FocusButton
              icon={<ReplayIcon size={36} color="#fff" />}
              label="Replay"
              onPress={() => engine.load(clip, engine.state.mode)}
              variant="primary"
              style={styles.replayBtn}
              hasTVPreferredFocus
            />
          </View>
        )}

        {/* Debug overlay */}
        <View style={styles.debugOverlay} pointerEvents="none">
          <Text style={styles.debugText}>
            {`rs:${engine.state.debug.readyState} paused:${engine.state.debug.paused} t:${engine.state.positionInClip.toFixed(2)} ev:${engine.state.debug.lastEvent} surf:${engine.state.debug.hasSurface} swap:${engine.state.debug.swapCount}`}
          </Text>
        </View>

        {/* Bottom controls */}
        {showControls && !overlay && !engine.state.ended && (
          <View style={styles.bottomBar}>
            <View style={styles.barTop}>
              <Text style={styles.clipTitle}>
                {CLIPS.find(c => c.id === clip)?.label ?? clip}
              </Text>
              <Text style={styles.timeText}>
                {fmt(engine.state.positionInClip)} / {fmt(engine.state.clipDuration)}
              </Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, {width: `${Math.min(100, progress * 100)}%`}]} />
            </View>
            <View style={styles.barButtons}>
              <View style={styles.transport}>
                {ENABLE_SEEK && (
                  <FocusButton
                    icon={<SeekBackIcon />}
                    label="−10s"
                    onPress={() => engine.seekBy(-10)}
                    variant="ghost"
                    style={styles.seekBtn}
                    labelStyle={styles.seekLabel}
                  />
                )}
                <FocusButton
                  icon={isActuallyPaused
                    ? <PlayIcon size={34} color="#fff" />
                    : <PauseIcon size={34} color="#fff" />}
                  onPress={() => {
                    console.log('[ui] play/pause paused=', isActuallyPaused);
                    if (isActuallyPaused) { engine.play(); } else { engine.pause(); }
                  }}
                  onFocus={() => setLastFocusedBtn('play')}
                  hasTVPreferredFocus={lastFocusedBtn === 'play'}
                  variant="primary"
                  style={styles.playBtn}
                />
                {ENABLE_SEEK && (
                  <FocusButton
                    icon={<SeekFwdIcon />}
                    label="+10s"
                    onPress={() => engine.seekBy(10)}
                    variant="ghost"
                    style={styles.seekBtn}
                    labelStyle={styles.seekLabel}
                  />
                )}
              </View>
              <View style={styles.actionBtns}>
                <FocusButton
                  icon={<FilmIcon size={28} color="#fff" />}
                  label="Clip"
                  onPress={switchClip}
                  onFocus={() => setLastFocusedBtn('clip')}
                  hasTVPreferredFocus={lastFocusedBtn === 'clip'}
                  variant="secondary"
                  style={styles.actionBtn}
                  labelStyle={styles.actionLabel}
                />
                <FocusButton
                  icon={<ModesIcon size={28} color="#fff" />}
                  label="Modes"
                  onPress={() => setOverlay('modes')}
                  onFocus={() => setLastFocusedBtn('modes')}
                  hasTVPreferredFocus={lastFocusedBtn === 'modes'}
                  variant="secondary"
                  style={styles.actionBtn}
                  labelStyle={styles.actionLabel}
                />
                <FocusButton
                  icon={<SparkleIcon size={28} color={recommendation ? Colors.accent : '#fff'} />}
                  label="Assistant"
                  onPress={() => setOverlay('assistant')}
                  onFocus={() => setLastFocusedBtn('assistant')}
                  hasTVPreferredFocus={lastFocusedBtn === 'assistant'}
                  variant="secondary"
                  style={styles.actionBtn}
                  labelStyle={styles.actionLabel}
                />
                <FocusButton
                  icon={<CompareIcon size={28} color="#fff" />}
                  label="Compare"
                  onPress={() => { if (recommendation) { setOverlay('compare'); } }}
                  onFocus={() => setLastFocusedBtn('compare')}
                  hasTVPreferredFocus={lastFocusedBtn === 'compare'}
                  variant="secondary"
                  style={styles.actionBtn}
                  labelStyle={styles.actionLabel}
                />
              </View>
            </View>
          </View>
        )}

        {/* Overlays */}
        {overlay === 'modes' && (
          <ModesOverlay
            currentMode={engine.state.mode}
            onSelect={handleModeSelect}
            onClose={() => { setOverlay(null); setActiveOverlay(null); }}
          />
        )}

        {overlay === 'assistant' && recommendation && (
          <AssistantOverlay
            recommendation={recommendation}
            onApply={handleApplyRec}
            onCompare={handleCompareRec}
            onDismiss={handleDismissRec}
          />
        )}

        {overlay === 'compare' && recommendation && (
          <CompareOverlay
            clip={clip}
            currentMode={engine.state.mode}
            recommendation={recommendation}
            onKeep={handleKeepCompare}
            onRevert={handleRevertCompare}
            onBack={() => { setOverlay(null); setActiveOverlay(null); }}
          />
        )}
      </ScaledStage>
    </View>
  );
};

// ── Seek icons: simple double-chevron arrows ────────────────────────────────
const Chevron: React.FC<{left?: boolean; color?: string}> = ({left = false, color = '#fff'}) => {
  const S = 12;
  return (
    <View style={{width: 0, height: 0,
      borderTopWidth: S, borderBottomWidth: S,
      borderLeftWidth: left ? 0 : S * 1.6,
      borderRightWidth: left ? S * 1.6 : 0,
      borderTopColor: 'transparent', borderBottomColor: 'transparent',
      borderLeftColor: left ? 'transparent' : color,
      borderRightColor: left ? color : 'transparent',
    }} />
  );
};
const SeekBackIcon: React.FC = () => (
  <View style={{flexDirection: 'row', gap: 2}}>
    <Chevron left color="#fff" />
    <Chevron left color="#fff" />
  </View>
);
const SeekFwdIcon: React.FC = () => (
  <View style={{flexDirection: 'row', gap: 2}}>
    <Chevron color="#fff" />
    <Chevron color="#fff" />
  </View>
);

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: 'transparent'},
  modePill: {
    position: 'absolute',
    top: Layout.safeV,
    left: Layout.safeH,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 24,
    zIndex: 10,
  },
  modeDot: {width: 10, height: 10, borderRadius: 5},
  modePillText: {fontSize: 20, fontWeight: '700'},
  topRight: {
    position: 'absolute',
    top: Layout.safeV,
    right: Layout.safeH,
    flexDirection: 'row',
    gap: 12,
    zIndex: 10,
  },
  aiPill: {
    backgroundColor: 'rgba(45,127,255,0.85)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  aiPillText: {color: '#fff', fontSize: 17, fontWeight: '700'},
  phonePill: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  phonePillText: {color: Colors.muted, fontSize: 17},
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  loadingText: {color: Colors.muted, fontSize: 28},
  swapOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(7,9,13,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 25,
  },
  swapText: {color: Colors.text, fontSize: 48, fontWeight: '300', letterSpacing: 1},
  endedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(7,9,13,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  replayBtn: {width: 280, height: 72},
  debugOverlay: {position: 'absolute', bottom: 8, left: 8, zIndex: 99},
  debugText: {
    color: '#0f0',
    fontSize: 14,
    fontFamily: 'monospace',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(7,9,13,0.92)',
    paddingHorizontal: Layout.safeH,
    paddingTop: 24,
    paddingBottom: Layout.safeV,
    zIndex: 10,
  },
  barTop: {flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12},
  clipTitle: {color: Colors.text, fontSize: 22, fontWeight: '600'},
  timeText: {color: Colors.muted, fontSize: 22},
  progressTrack: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 2,
    marginBottom: 20,
  },
  progressFill: {height: 4, backgroundColor: Colors.accent, borderRadius: 2},
  barButtons: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  transport: {flexDirection: 'row', gap: 16, alignItems: 'center'},
  playBtn: {width: 72, height: 56},
  seekBtn: {minWidth: 100, height: 56},
  seekLabel: {fontSize: 20},
  actionBtns: {flexDirection: 'row', gap: 16},
  actionBtn: {minWidth: 160},
  actionLabel: {fontSize: 22},
});
