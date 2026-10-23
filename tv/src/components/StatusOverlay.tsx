import React, {useEffect, useRef} from 'react';
import {Animated, StyleSheet, Text, View, ActivityIndicator} from 'react-native';
import {FocusButton} from './FocusButton';
import {Colors} from '../theme';
import type {PlaybackStatus} from '../player/usePlayerEngine';

interface StatusOverlayProps {
  status: PlaybackStatus;
  onRetry: () => void;
  onBack: () => void;
}

const TRANSITION_KINDS = new Set(['loading', 'applying', 'resuming', 'restarting', 'error']);

function overlayText(status: PlaybackStatus): string {
  switch (status.kind) {
    case 'loading':    return 'Loading…';
    case 'applying':   return `Previewing ${status.mode} from the start of the scene…`;
    case 'resuming':   return 'Resuming…';
    case 'restarting': return 'Restarting scene…';
    case 'error':      return status.message;
    default:           return '';
  }
}

export const StatusOverlay: React.FC<StatusOverlayProps> = ({status, onRetry, onBack}) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const isVisible = TRANSITION_KINDS.has(status.kind);

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: isVisible ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [isVisible, opacity]);

  const isError = status.kind === 'error';
  const showSpinner = !isError && isVisible;
  const text = overlayText(status);

  return (
    <Animated.View
      style={[styles.backdrop, {opacity}]}
      pointerEvents={isVisible ? 'box-none' : 'none'}>
      {showSpinner && (
        <ActivityIndicator size="large" color={Colors.text} style={styles.spinner} />
      )}
      <Text style={[styles.text, isError && styles.errorText]}>{text}</Text>
      {isError && (
        <View style={styles.actions}>
          <FocusButton
            label="Retry"
            onPress={onRetry}
            variant="primary"
            style={styles.btn}
            hasTVPreferredFocus
          />
          <FocusButton
            label="Back"
            onPress={onBack}
            variant="secondary"
            style={styles.btn}
          />
        </View>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(7,9,13,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 25,
  },
  spinner: {
    marginBottom: 28,
  },
  text: {
    color: Colors.text,
    fontSize: 40,
    fontWeight: '300',
    letterSpacing: 0.5,
    textAlign: 'center',
    paddingHorizontal: 96,
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 28,
    marginBottom: 40,
  },
  actions: {
    flexDirection: 'row',
    gap: 24,
    marginTop: 16,
  },
  btn: {minWidth: 200},
});
