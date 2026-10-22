import React, {useState} from 'react';
import {View, Text, StyleSheet, Pressable} from 'react-native';
import {MODES} from '../../data/modes';
import {Colors, Layout} from '../../theme';
import {FocusButton} from '../../components/FocusButton';
import type {ModeId, VariantId} from '../../session/types';

interface ModesOverlayProps {
  currentMode: VariantId;
  onSelect: (mode: ModeId) => void;
  onClose: () => void;
}

export const ModesOverlay: React.FC<ModesOverlayProps> = ({currentMode, onSelect, onClose}) => {
  const [focused, setFocused] = useState<ModeId | null>(null);

  return (
    <View style={styles.backdrop}>
      <View style={styles.panel}>
        <Text style={styles.title}>Viewing Modes</Text>
        <View style={styles.grid}>
          {MODES.map(mode => {
            const isCurrent = currentMode === mode.id;
            const isFocused = focused === mode.id;
            return (
              <Pressable
                key={mode.id}
                onPress={() => onSelect(mode.id)}
                onFocus={() => setFocused(mode.id)}
                onBlur={() => setFocused(null)}
                hasTVPreferredFocus={mode.id === currentMode || (currentMode === 'original' && mode.id === 'cinema')}
                accessibilityRole="button"
                style={[
                  styles.card,
                  isFocused && styles.cardFocused,
                  isCurrent && styles.cardCurrent,
                ]}>
                <View style={styles.cardTop}>
                  <View style={[styles.dot, {backgroundColor: mode.color}]} />
                  <Text style={[styles.modeName, {color: mode.color}]}>{mode.label}</Text>
                  {isCurrent && (
                    <View style={[styles.badge, {backgroundColor: mode.color}]}>
                      <Text style={styles.badgeText}>Current</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.desc}>{mode.description}</Text>
                <View style={styles.adjustments}>
                  {mode.adjustments.map(a => (
                    <Text key={a} style={styles.adj}>· {a}</Text>
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.footer}>
          <FocusButton label="Close" onPress={onClose} variant="ghost" />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(7,9,13,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 30,
  },
  panel: {
    width: 1400,
    backgroundColor: Colors.surface,
    borderRadius: Layout.panelRadius,
    padding: 56,
  },
  title: {
    color: Colors.text,
    fontSize: 36,
    fontWeight: '700',
    marginBottom: 40,
  },
  grid: {
    flexDirection: 'row',
    gap: 24,
  },
  card: {
    flex: 1,
    backgroundColor: Colors.bg,
    borderRadius: 20,
    padding: 32,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cardFocused: {
    borderColor: Colors.focusRing,
    transform: [{scale: 1.03}],
  },
  cardCurrent: {
    borderColor: 'rgba(255,255,255,0.2)',
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  modeName: {
    fontSize: 26,
    fontWeight: '700',
    flex: 1,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '700',
  },
  desc: {
    color: Colors.muted,
    fontSize: 18,
    lineHeight: 26,
    marginBottom: 16,
  },
  adjustments: {gap: 4},
  adj: {
    color: Colors.muted,
    fontSize: 16,
  },
  footer: {
    marginTop: 32,
    alignItems: 'flex-end',
  },
});
