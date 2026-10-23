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
import {StatusOverlay} from '../components/StatusOverlay';
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
  const [lastFocusedBtn, setLastFocusedBtn] = useState<'play' | 'clip' | 'modes' | 'assistant' | 'compare'>('assistant');
  const [prevRecommendation, setPrevRecommendation] = useState<typeof recommendation>(null);
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [analyseError, setAnalyseError] = useState<string | null>(null);
  const analyseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bumpControls = useCallback(() => {
    setShowControls(true);
    if (controlsTimerRef.current) { clearTimeout(controlsTimerRef.current); }
    controlsTimerRef.current = setTimeout(() => setShowControls(false), CONTROLS_TIMEOUT_MS);
  }, []);

  // Always close overlays the same way: restore bar + focus Assistant button
  const closeOverlay = useCallback(() => {
    setOverlay(null);
    setActiveOverlay(null);
    setLastFocusedBtn('assistant');
    bumpControls();
  }, [setActiveOverlay, bumpControls]);

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

  // Overlay from session (phone/AI opens it)
  useEffect(() => {
    if (activeOverlay) { setOverlay(activeOverlay); }
  }, [activeOverlay]);

  // When a recommendation arrives, clear the analysing state
  useEffect(() => {
    if (recommendation) {
      setIsAnalysing(false);
      setAnalyseError(null);
      if (analyseTimeoutRef.current) {
        clearTimeout(analyseTimeoutRef.current);
        analyseTimeoutRef.current = null;
      }
      console.log('[ui] recommendation arrived id=', recommendation.id);
    }
  }, [recommendation]);

  // Cleanup analyse timeout on unmount
  useEffect(() => () => {
    if (analyseTimeoutRef.current) { clearTimeout(analyseTimeoutRef.current); }
  }, []);

  const isTransition = ['loading', 'applying', 'resuming', 'restarting'].includes(engine.playbackStatus.kind);

  // Remote keys — back only; play/pause handled by system
  useTVEventHandler((evt: HWEvent) => {
    if (evt.eventKeyAction !== 0) { return; }
    bumpControls();
    const evtType: string = evt.eventType;
    if (evtType === 'back') {
      if (isTransition) { return; }
      if (overlay) {
        closeOverlay();
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
      if (isTransition) { return true; }
      if (overlay) { closeOverlay(); return true; }
      if (showControls) { onBack(); return true; }
      setShowControls(true);
      return true;
    });
    return () => sub.remove();
  }, [isTransition, overlay, showControls, onBack, closeOverlay]);

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
  const hasRec = recommendation !== null;
  const hasPrevRec = prevRecommendation !== null;
  // Focus after overlay close: if last focused btn is play/pause and we're in transition, default to assistant
  const effectiveFocusedBtn = (isTransition && lastFocusedBtn === 'play') ? 'assistant' : lastFocusedBtn;

  const handleModeSelect = (mode: ModeId): void => {
    closeOverlay();
    client.sendModeUpdate(mode, 'tv');
  };

  const handleApplyRec = (): void => {
    if (!recommendation) { return; }
    console.log('[ui] apply rec id=', recommendation.id, 'mode=', recommendation.mode);
    setPrevRecommendation(recommendation);
    engine.load(clip, recommendation.mode as VariantId);
    clearRecommendation();
    closeOverlay();
  };

  const handleCompareRec = (): void => {
    setOverlay('compare');
    setActiveOverlay('compare');
  };

  const handleDismissRec = (): void => {
    console.log('[ui] dismiss rec id=', recommendation?.id ?? 'null');
    if (recommendation) {
      client.sendRecommendationResponse(recommendation.id, false);
      setPrevRecommendation(recommendation);
    }
    clearRecommendation();
    closeOverlay();
  };

  const handleKeepCompare = (): void => {
    if (recommendation) {
      setPrevRecommendation(recommendation);
      engine.load(clip, recommendation.mode as VariantId);
      clearRecommendation();
    }
    closeOverlay();
  };

  const handleRevertCompare = (): void => {
    closeOverlay();
  };

  const handleAnalyse = useCallback(async () => {
    if (isAnalysing) { return; }
    setIsAnalysing(true);
    setAnalyseError(null);
    console.log('[ui] analyse scene requested');
    // 8 s hard timeout in case the socket event never arrives
    analyseTimeoutRef.current = setTimeout(() => {
      setIsAnalysing(false);
      setAnalyseError('No response from AI. Try again.');
    }, 8_000);
    try {
      await client.requestAnalysis('Suggest the best viewing mode for this scene');
    } catch (e) {
      if (analyseTimeoutRef.current) { clearTimeout(analyseTimeoutRef.current); analyseTimeoutRef.current = null; }
      setIsAnalysing(false);
      setAnalyseError((e as Error).message);
      console.warn('[ui] analyse error:', (e as Error).message);
    }
  }, [client, isAnalysing]);

  const handleComparePrev = (): void => {
    if (!prevRecommendation) { return; }
    setOverlay('compare');
    setActiveOverlay('compare');
  };

  const switchClip = (): void => {
    const next = (clip === 'night' ? 'day' : 'night') as ClipId;
    setClip(next);
    engine.load(next, engine.state.mode);
  };

  const openAssistant = (): void => {
    console.log('[ui] assistant open rec=', recommendation?.id ?? 'null', 'focused=', lastFocusedBtn);
    setLastFocusedBtn('assistant');
    setOverlay('assistant');
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

        {/* Unified status overlay — loading / applying / resuming / restarting / error */}
        <StatusOverlay
          status={engine.playbackStatus}
          onRetry={() => engine.load(clip, engine.state.mode)}
          onBack={onBack}
        />

        {/* Ended / Replay */}
        {engine.playbackStatus.kind === 'ended' && (
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
                  hasTVPreferredFocus={effectiveFocusedBtn === 'play'}
                  disabled={isTransition}
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
                  hasTVPreferredFocus={effectiveFocusedBtn === 'clip'}
                  disabled={isTransition}
                  variant="secondary"
                  style={styles.actionBtn}
                  labelStyle={styles.actionLabel}
                />
                <FocusButton
                  icon={<ModesIcon size={28} color="#fff" />}
                  label="Modes"
                  onPress={() => setOverlay('modes')}
                  onFocus={() => setLastFocusedBtn('modes')}
                  hasTVPreferredFocus={effectiveFocusedBtn === 'modes'}
                  disabled={isTransition}
                  variant="secondary"
                  style={styles.actionBtn}
                  labelStyle={styles.actionLabel}
                />
                <FocusButton
                  icon={<SparkleIcon size={28} color={hasRec ? Colors.accent : '#fff'} />}
                  label="Assistant"
                  onPress={openAssistant}
                  onFocus={() => setLastFocusedBtn('assistant')}
                  hasTVPreferredFocus={effectiveFocusedBtn === 'assistant'}
                  disabled={isTransition}
                  variant="secondary"
                  style={styles.actionBtn}
                  labelStyle={styles.actionLabel}
                />
                <View>
                  <FocusButton
                    icon={<CompareIcon size={28} color="#fff" />}
                    label="Compare"
                    onPress={() => { if (hasRec || hasPrevRec) { setOverlay('compare'); } }}
                    onFocus={() => setLastFocusedBtn('compare')}
                    hasTVPreferredFocus={effectiveFocusedBtn === 'compare'}
                    disabled={isTransition || (!hasRec && !hasPrevRec)}
                    variant="secondary"
                    style={styles.actionBtn}
                    labelStyle={styles.actionLabel}
                  />
                  {!hasRec && !hasPrevRec && (
                    <Text style={styles.disabledHint}>Available after a recommendation</Text>
                  )}
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Overlays */}
        {overlay === 'modes' && (
          <ModesOverlay
            currentMode={engine.state.mode}
            onSelect={handleModeSelect}
            onClose={closeOverlay}
          />
        )}

        {overlay === 'assistant' && (
          <AssistantOverlay
            recommendation={recommendation}
            prevRecommendation={prevRecommendation}
            onApply={handleApplyRec}
            onCompare={handleCompareRec}
            onDismiss={handleDismissRec}
            onAnalyse={handleAnalyse}
            onComparePrev={handleComparePrev}
            isTransition={isTransition}
            isAnalysing={isAnalysing}
            analyseError={analyseError}
          />
        )}

        {overlay === 'compare' && (recommendation ?? prevRecommendation) && (
          <CompareOverlay
            clip={clip}
            currentMode={engine.state.mode}
            recommendation={(recommendation ?? prevRecommendation)!}
            onKeep={handleKeepCompare}
            onRevert={handleRevertCompare}
            onBack={closeOverlay}
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
  disabledHint: {
    color: Colors.muted,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 6,
    opacity: 0.7,
  },
});
