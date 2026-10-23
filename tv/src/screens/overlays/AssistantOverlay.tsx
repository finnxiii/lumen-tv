import React from 'react';
import {View, Text, StyleSheet, ActivityIndicator} from 'react-native';
import {FocusButton} from '../../components/FocusButton';
import {Colors, Layout} from '../../theme';
import {MODES} from '../../data/modes';
import type {Recommendation} from '../../session/types';

interface AssistantOverlayProps {
  recommendation: Recommendation | null;
  prevRecommendation: Recommendation | null;
  onApply: () => void;
  onCompare: () => void;
  onDismiss: () => void;
  onAnalyse: () => void;
  onComparePrev: () => void;
  isTransition?: boolean;
  isAnalysing?: boolean;
  analyseError?: string | null;
}

export const AssistantOverlay: React.FC<AssistantOverlayProps> = ({
  recommendation: rec,
  prevRecommendation: prev,
  onApply,
  onCompare,
  onDismiss,
  onAnalyse,
  onComparePrev,
  isTransition = false,
  isAnalysing = false,
  analyseError = null,
}) => (
  <View style={styles.backdrop}>
    <View style={styles.panel}>
      <Text style={styles.aiLabel}>AI Assistant</Text>

      {rec ? (
        /* ── Active recommendation ─────────────────────────────── */
        <RecContent
          rec={rec}
          onApply={onApply}
          onCompare={onCompare}
          onDismiss={onDismiss}
          isTransition={isTransition}
        />
      ) : isAnalysing ? (
        /* ── Analysing spinner ─────────────────────────────────── */
        <View style={styles.centred}>
          <ActivityIndicator size="large" color={Colors.accent} />
          <Text style={styles.analysingText}>Analysing this scene…</Text>
        </View>
      ) : analyseError ? (
        /* ── Error state ───────────────────────────────────────── */
        <View style={styles.centred}>
          <Text style={styles.errorText}>{analyseError}</Text>
          <FocusButton
            label="Retry"
            onPress={onAnalyse}
            variant="primary"
            style={styles.wideBtn}
            hasTVPreferredFocus
          />
        </View>
      ) : (
        /* ── Empty state ───────────────────────────────────────── */
        <>
          <Text style={styles.emptyTitle}>No suggestion right now</Text>
          <Text style={styles.emptyHint}>
            Ask from your phone, or let Lumen check this scene
          </Text>
          <FocusButton
            label="Analyse this scene"
            onPress={onAnalyse}
            variant="primary"
            style={styles.wideBtn}
            hasTVPreferredFocus
          />

          {prev && (
            <View style={styles.prevSection}>
              <Text style={styles.prevLabel}>Last suggestion</Text>
              <PrevRecRow rec={prev} onCompare={onComparePrev} />
            </View>
          )}
        </>
      )}
    </View>
  </View>
);

/* ── Sub-components ──────────────────────────────────────────────────────── */

const RecContent: React.FC<{
  rec: Recommendation;
  onApply: () => void;
  onCompare: () => void;
  onDismiss: () => void;
  isTransition: boolean;
}> = ({rec, onApply, onCompare, onDismiss, isTransition}) => {
  const modeInfo = MODES.find(m => m.id === rec.mode);
  const modeColor = modeInfo?.color ?? Colors.accent;
  return (
    <>
      {rec.request && (
        <View style={styles.requestBubble}>
          <Text style={styles.requestText}>"{rec.request}"</Text>
        </View>
      )}
      <View style={styles.recHeader}>
        <View style={[styles.modeDot, {backgroundColor: modeColor}]} />
        <Text style={[styles.recMode, {color: modeColor}]}>
          {modeInfo?.label ?? rec.mode}
        </Text>
      </View>
      <Text style={styles.recTitle}>{rec.title}</Text>
      <Text style={styles.explanation}>{rec.explanation}</Text>
      <Text style={styles.whyTitle}>Why</Text>
      {rec.reasons.map(r => (
        <View key={r.label} style={styles.whyRow}>
          <Text style={styles.whyLabel}>{r.label}</Text>
          <Text style={styles.whyValue}>{r.value}</Text>
        </View>
      ))}
      <View style={styles.adjustments}>
        {Object.entries(rec.settings)
          .filter(([, v]) => v !== 0)
          .map(([key, val]) => (
            <AdjBar key={key} label={key} value={val as number} />
          ))}
      </View>
      <View style={styles.actions}>
        <FocusButton label="Apply" onPress={onApply} variant="primary"
          disabled={isTransition} style={styles.btn} hasTVPreferredFocus />
        <FocusButton label="Compare first" onPress={onCompare} variant="secondary"
          disabled={isTransition} style={styles.btn} />
        <FocusButton label="Dismiss" onPress={onDismiss} variant="ghost"
          style={styles.btn} />
      </View>
      <Text style={styles.footer}>Undo from your phone</Text>
    </>
  );
};

const PrevRecRow: React.FC<{rec: Recommendation; onCompare: () => void}> = ({rec, onCompare}) => {
  const modeInfo = MODES.find(m => m.id === rec.mode);
  const modeColor = modeInfo?.color ?? Colors.accent;
  return (
    <View style={styles.prevRow}>
      <View style={[styles.modeDot, {backgroundColor: modeColor}]} />
      <Text style={[styles.prevMode, {color: modeColor}]}>{modeInfo?.label ?? rec.mode}</Text>
      <Text style={styles.prevTitle} numberOfLines={1}>{rec.title}</Text>
      <FocusButton label="Compare" onPress={onCompare} variant="secondary"
        style={styles.compareBtn} labelStyle={styles.compareBtnLabel} />
    </View>
  );
};

const AdjBar: React.FC<{label: string; value: number}> = ({label, value}) => {
  const pct = ((value + 50) / 100) * 100;
  return (
    <View style={adjStyles.row}>
      <Text style={adjStyles.label}>{label}</Text>
      <View style={adjStyles.track}>
        <View style={[adjStyles.fill, {width: `${pct}%`}]} />
        <View style={[adjStyles.marker, {left: `${pct}%`}]} />
      </View>
      <Text style={adjStyles.val}>{value > 0 ? `+${value}` : value}</Text>
    </View>
  );
};

/* ── Styles ──────────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: Layout.safeH,
  },
  panel: {
    width: 620,
    backgroundColor: Colors.surface,
    borderRadius: Layout.panelRadius,
    padding: 48,
  },
  aiLabel: {
    color: Colors.accent,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 16,
  },
  /* empty state */
  emptyTitle: {
    color: Colors.text,
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 12,
  },
  emptyHint: {
    color: Colors.muted,
    fontSize: 18,
    lineHeight: 26,
    marginBottom: 24,
  },
  wideBtn: {width: '100%'},
  /* analysing */
  centred: {alignItems: 'center', paddingVertical: 24, gap: 24},
  analysingText: {color: Colors.muted, fontSize: 20},
  /* error */
  errorText: {color: '#ff6b6b', fontSize: 18, textAlign: 'center', marginBottom: 8},
  /* prev recommendation */
  prevSection: {marginTop: 32, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', paddingTop: 24},
  prevLabel: {color: Colors.muted, fontSize: 14, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 12},
  prevRow: {flexDirection: 'row', alignItems: 'center', gap: 10},
  prevMode: {fontSize: 16, fontWeight: '700', width: 64},
  prevTitle: {color: Colors.muted, fontSize: 16, flex: 1},
  compareBtn: {paddingHorizontal: 16, paddingVertical: 10},
  compareBtnLabel: {fontSize: 16},
  /* rec content */
  requestBubble: {
    backgroundColor: 'rgba(45,127,255,0.12)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  requestText: {color: Colors.muted, fontSize: 20, fontStyle: 'italic'},
  recHeader: {flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6},
  modeDot: {width: 10, height: 10, borderRadius: 5},
  recMode: {fontSize: 22, fontWeight: '700'},
  recTitle: {color: Colors.text, fontSize: 26, fontWeight: '700', marginBottom: 12},
  explanation: {color: Colors.muted, fontSize: 18, lineHeight: 26, marginBottom: 24},
  whyTitle: {color: Colors.text, fontSize: 18, fontWeight: '700', marginBottom: 12},
  whyRow: {flexDirection: 'row', gap: 12, marginBottom: 8},
  whyLabel: {color: Colors.accent, fontSize: 16, fontWeight: '700', width: 100},
  whyValue: {color: Colors.muted, fontSize: 16, flex: 1},
  adjustments: {marginTop: 20, marginBottom: 28, gap: 8},
  actions: {flexDirection: 'column', gap: 12},
  btn: {width: '100%'},
  footer: {color: Colors.muted, fontSize: 15, textAlign: 'center', marginTop: 20},
});

const adjStyles = StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'center', gap: 12},
  label: {color: Colors.muted, fontSize: 14, width: 80, textTransform: 'capitalize'},
  track: {
    flex: 1, height: 4,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 2, position: 'relative',
  },
  fill: {height: 4, backgroundColor: Colors.accent, borderRadius: 2},
  marker: {
    position: 'absolute', top: -4,
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: Colors.accent, marginLeft: -6,
  },
  val: {color: Colors.text, fontSize: 14, width: 36, textAlign: 'right'},
});
