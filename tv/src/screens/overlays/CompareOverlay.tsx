import React, {useState} from 'react';
import {View, Text, Image, StyleSheet} from 'react-native';
import {FocusButton} from '../../components/FocusButton';
import {Colors, Layout} from '../../theme';
import {MEDIA_BASE_URL} from '../../config';
import {MODES} from '../../data/modes';
import type {VariantId, ClipId, Recommendation} from '../../session/types';

interface CompareOverlayProps {
  clip: ClipId;
  currentMode: VariantId;
  recommendation: Recommendation;
  onKeep: () => void;
  onRevert: () => void;
  onBack: () => void;
}

export const CompareOverlay: React.FC<CompareOverlayProps> = ({
  clip,
  currentMode,
  recommendation: rec,
  onKeep,
  onRevert,
  onBack,
}) => {
  const [divider] = useState(50); // % from left; drag not yet implemented
  const origFrame = `${MEDIA_BASE_URL}/${clip}/frame-original.jpg`;
  const recFrame  = `${MEDIA_BASE_URL}/${clip}/frame-${rec.mode}.jpg`;
  const recModeInfo = MODES.find(m => m.id === rec.mode);
  const curModeInfo = MODES.find(m => m.id === currentMode);

  return (
    <View style={styles.backdrop}>
      {/* Split frame */}
      <View style={styles.frames}>
        {/* Left: original */}
        <View style={[styles.half, {width: `${divider}%`}]}>
          <Image
            source={{uri: origFrame}}
            style={styles.frameImg}
            resizeMode="cover"
          />
          <View style={styles.frameLabel}>
            <Text style={styles.frameLabelText}>Original</Text>
          </View>
        </View>
        {/* Divider */}
        <View style={styles.divider} />
        {/* Right: recommended */}
        <View style={[styles.half, {flex: 1}]}>
          <Image
            source={{uri: recFrame}}
            style={styles.frameImg}
            resizeMode="cover"
          />
          <View style={styles.frameLabel}>
            <Text style={[styles.frameLabelText, {color: recModeInfo?.color ?? Colors.accent}]}>
              {recModeInfo?.label ?? rec.mode}
            </Text>
          </View>
        </View>
      </View>

      {/* Metrics panel */}
      <View style={styles.metricsPanel}>
        <Text style={styles.metricsTitle}>Comparison</Text>

        <View style={styles.metricRow}>
          <Text style={styles.metricLabel}>Mode</Text>
          <Text style={styles.metricBefore}>
            {curModeInfo?.label ?? currentMode}
          </Text>
          <Text style={styles.arrow}>→</Text>
          <Text style={[styles.metricAfter, {color: recModeInfo?.color ?? Colors.accent}]}>
            {recModeInfo?.label ?? rec.mode}
          </Text>
        </View>

        {Object.entries(rec.settings)
          .filter(([, v]) => v !== 0)
          .map(([key, val]) => (
            <View key={key} style={styles.metricRow}>
              <Text style={styles.metricLabel}>{key}</Text>
              <Text style={styles.metricBefore}>0</Text>
              <Text style={styles.arrow}>→</Text>
              <Text style={styles.metricAfter}>
                {(val as number) > 0 ? `+${val}` : val}
              </Text>
            </View>
          ))}

        <View style={styles.actions}>
          <FocusButton
            label="Keep"
            onPress={onKeep}
            variant="primary"
            hasTVPreferredFocus
            style={styles.btn}
          />
          <FocusButton
            label="Revert"
            onPress={onRevert}
            variant="secondary"
            style={styles.btn}
          />
          <FocusButton
            label="Back to playback"
            onPress={onBack}
            variant="ghost"
            style={styles.btn}
          />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.bg,
    zIndex: 30,
    flexDirection: 'row',
  },
  frames: {
    flex: 1,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  half: {
    overflow: 'hidden',
    position: 'relative',
  },
  frameImg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  divider: {
    width: 3,
    backgroundColor: Colors.focusRing,
    zIndex: 2,
  },
  frameLabel: {
    position: 'absolute',
    bottom: Layout.safeV,
    left: Layout.safeH / 2,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  frameLabelText: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  metricsPanel: {
    width: 460,
    backgroundColor: Colors.surface,
    padding: 40,
    justifyContent: 'center',
  },
  metricsTitle: {
    color: Colors.text,
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 24,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 8,
  },
  metricLabel: {
    color: Colors.muted,
    fontSize: 16,
    width: 90,
    textTransform: 'capitalize',
  },
  metricBefore: {
    color: Colors.muted,
    fontSize: 16,
    width: 36,
    textAlign: 'right',
  },
  arrow: {
    color: Colors.muted,
    fontSize: 14,
  },
  metricAfter: {
    color: Colors.accent,
    fontSize: 16,
    fontWeight: '700',
  },
  actions: {
    marginTop: 32,
    gap: 14,
  },
  btn: {width: '100%'},
});
