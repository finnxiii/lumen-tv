import React, {useCallback, useEffect, useRef, useState} from 'react';
import {BackHandler, StyleSheet, Text, View} from 'react-native';
import {ScaledStage} from '../components/ScaledStage';
import {useTVEventHandler, type HWEvent} from '@amazon-devices/react-native-kepler';
import type {PlayerEngine} from '../player/usePlayerEngine';
import {useSessionContext} from '../session/SessionContext';
import {FocusButton} from '../components/FocusButton';
import {ModesOverlay} from './overlays/ModesOverlay';
import {AssistantOverlay} from './overlays/AssistantOverlay';
import {CompareOverlay} from './overlays/CompareOverlay';
import {MODES} from '../data/modes';
import {CLIPS} from '../data/clips';
import {Colors, Layout} from '../theme';
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
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Apply initial clip/mode once player is ready
  useEffect(() => {
    if (engine.state.ready) {
      engine.setClipAndMode(initialClip, 'original');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine.state.ready]);

  const bumpControls = useCallback(() => {
    setShowControls(true);
    if (controlsTimerRef.current) { clearTimeout(controlsTimerRef.current); }
    controlsTimerRef.current = setTimeout(() => setShowControls(false), CONTROLS_TIMEOUT_MS);
  }, []);

  useEffect(() => {
    bumpControls();
    return () => {
      if (controlsTimerRef.current) { clearTimeout(controlsTimerRef.current); }
    };
  }, [bumpControls]);

  // Subscribe to session events
  useEffect(() => {
    const unsub = onSettingsApply(p => {
      engine.setClipAndMode(clip, p.mode as VariantId);
    });
    return unsub;
  }, [clip, engine, onSettingsApply]);

  useEffect(() => {
    const unsub = onPlaybackCommand(p => {
      if (p.action === 'play') { engine.play(); }
      else if (p.action === 'pause') { engine.pause(); }
      else if (p.action === 'seek' && p.position !== undefined) {
        engine.seekBy(p.position - engine.state.positionInSegment);
      }
    });
    return unsub;
  }, [engine, onPlaybackCommand]);

  // Sync overlay state from session
  useEffect(() => {
    if (activeOverlay) { setOverlay(activeOverlay); }
  }, [activeOverlay]);

  // Remote key handler
  useTVEventHandler((evt: HWEvent) => {
    if (evt.eventKeyAction !== 0) { return; }
    bumpControls();

    // Cast to string so TypeScript does not complain about non-union keys
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
    } else if (evtType === 'rewind') {
      console.log('[ui] remote rewind → seekBy(-10)');
      engine.seekBy(-10);
    } else if (evtType === 'fastforward' || evtType === 'fastForward') {
      console.log('[ui] remote fastforward → seekBy(+10)');
      engine.seekBy(10);
    }
    // playpause: handled by system media controls — do not toggle here
  });

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (overlay) {
        setOverlay(null);
        setActiveOverlay(null);
        return true;
      }
      if (showControls) {
        onBack();
        return true;
      }
      setShowControls(true);
      return true;
    });
    return () => sub.remove();
  }, [overlay, showControls, onBack, setActiveOverlay]);

  // Playback update to session (~2s)
  useEffect(() => {
    const tid = setInterval(() => {
      client.sendPlaybackUpdate(clip, engine.state.positionInSegment, engine.state.playing);
    }, 2_000);
    return () => clearInterval(tid);
  }, [client, clip, engine.state.positionInSegment, engine.state.playing]);

  const currentModeInfo = MODES.find(m => m.id === engine.state.mode);
  const modeColor = currentModeInfo?.color ?? Colors.muted;
  const modeLabel = currentModeInfo?.label ?? (engine.state.mode === 'original' ? 'Original' : engine.state.mode);
  const progress = engine.state.positionInSegment / engine.state.segmentDuration;
  const phoneConnected = sessionState?.phoneConnected ?? false;

  // Use raw paused flag from debug poll — more reliable than event-driven state
  const isActuallyPaused = engine.state.debug.paused;

  const handleModeSelect = (mode: ModeId): void => {
    setOverlay(null);
    setActiveOverlay(null);
    client.sendModeUpdate(mode, 'tv');
  };

  const handleApplyRec = (): void => {
    if (!recommendation) { return; }
    client.sendModeUpdate(recommendation.mode, 'tv');
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
      client.sendModeUpdate(recommendation.mode, 'tv');
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
    const next = clip === 'night' ? 'day' : 'night';
    setClip(next as ClipId);
    engine.setClipAndMode(next as ClipId, engine.state.mode);
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

        {/* Loading / error overlay */}
        {!engine.state.ready && (
          <View style={styles.loadingOverlay}>
            <Text style={styles.loadingText}>
              {engine.state.error ?? 'Loading…'}
            </Text>
          </View>
        )}

        {/* Mode change full-screen overlay */}
        {engine.modeOverlay.visible && (
          <View style={styles.modeChangeOverlay}>
            <Text style={styles.modeChangeText}>{engine.modeOverlay.text}</Text>
          </View>
        )}

        {/* Toast */}
        {engine.toast.visible && (
          <View style={styles.toast}>
            <Text style={styles.toastText}>{engine.toast.text}</Text>
          </View>
        )}

        {/* Debug overlay — remove before ship */}
        <View style={styles.debugOverlay} pointerEvents="none">
          <Text style={styles.debugText}>
            {`rs:${engine.state.debug.readyState} paused:${engine.state.debug.paused} t:${engine.state.debug.rawTime.toFixed(2)} seg:${engine.state.debug.segStart} ev:${engine.state.debug.lastEvent} surf:${engine.state.debug.hasSurface} intent:${engine.state.debug.intent} ret:${engine.state.debug.retries}`}
          </Text>
        </View>

        {/* Bottom controls bar */}
        {showControls && !overlay && (
          <View style={styles.bottomBar}>
            <View style={styles.barTop}>
              <Text style={styles.clipTitle}>
                {CLIPS.find(c => c.id === clip)?.label ?? clip}
              </Text>
              <Text style={styles.timeText}>
                {fmt(engine.state.positionInSegment)} / {fmt(engine.state.segmentDuration)}
              </Text>
            </View>
            {/* Progress bar */}
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, {width: `${Math.min(100, progress * 100)}%`}]} />
            </View>
            {/* Transport + action buttons */}
            <View style={styles.barButtons}>
              <View style={styles.transport}>
                <FocusButton
                  label="−10s"
                  onPress={() => { console.log('[ui] press -10s'); engine.seekBy(-10); }}
                  variant="ghost"
                  style={styles.transportBtn}
                />
                <FocusButton
                  label={isActuallyPaused ? '▶' : '⏸'}
                  onPress={() => {
                    console.log('[ui] press play/pause paused=', isActuallyPaused);
                    if (isActuallyPaused) { engine.play(); } else { engine.pause(); }
                  }}
                  variant="primary"
                  style={styles.playBtn}
                />
                <FocusButton
                  label="+10s"
                  onPress={() => { console.log('[ui] press +10s'); engine.seekBy(10); }}
                  variant="ghost"
                  style={styles.transportBtn}
                />
              </View>
              <View style={styles.actionBtns}>
                <FocusButton label="Clip" onPress={switchClip} variant="secondary" style={styles.actionBtn} />
                <FocusButton label="Viewing modes" onPress={() => setOverlay('modes')} variant="secondary" hasTVPreferredFocus style={styles.actionBtn} />
                <FocusButton
                  label={recommendation ? '✦ Assistant' : 'Assistant'}
                  onPress={() => setOverlay('assistant')}
                  variant="secondary"
                  style={styles.actionBtn}
                />
                <FocusButton label="Compare" onPress={() => recommendation ? setOverlay('compare') : undefined} variant="secondary" style={styles.actionBtn} />
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

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'transparent',
  },
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
  modeChangeOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(7,9,13,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 25,
  },
  modeChangeText: {
    color: Colors.text,
    fontSize: 48,
    fontWeight: '300',
    letterSpacing: 1,
  },
  toast: {
    position: 'absolute',
    bottom: 200,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.85)',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    zIndex: 26,
  },
  toastText: {color: Colors.text, fontSize: 24},
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
  barTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  clipTitle: {color: Colors.text, fontSize: 22, fontWeight: '600'},
  timeText: {color: Colors.muted, fontSize: 22},
  progressTrack: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 2,
    marginBottom: 20,
  },
  progressFill: {
    height: 4,
    backgroundColor: Colors.accent,
    borderRadius: 2,
  },
  barButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  transport: {flexDirection: 'row', gap: 16, alignItems: 'center'},
  transportBtn: {minWidth: 100},
  playBtn: {width: 72, height: 56},
  actionBtns: {flexDirection: 'row', gap: 16},
  actionBtn: {minWidth: 160},
  debugOverlay: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    zIndex: 99,
  },
  debugText: {
    color: '#0f0',
    fontSize: 14,
    fontFamily: 'monospace',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
});
