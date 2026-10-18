import React, {useEffect, useRef, useState} from 'react';
import {View, Text, StyleSheet, BackHandler} from 'react-native';
import {useSessionContext} from '../session/SessionContext';
import {FocusButton} from '../components/FocusButton';
import {QRCode} from '../components/QRCode';
import {PHONE_URL} from '../config';
import {Colors, Layout} from '../theme';
import {CLIPS} from '../data/clips';
import type {ClipId} from '../session/types';

const CODE_LIFETIME_S = 300;

interface PairingScreenProps {
  onStart: (clipId: ClipId) => void;
}

export const PairingScreen: React.FC<PairingScreenProps> = ({onStart}) => {
  const {client, sessionState} = useSessionContext();
  const [countdown, setCountdown] = useState(CODE_LIFETIME_S);
  const [selectedClip, setSelectedClip] = useState<ClipId>('night');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCountdown(c => Math.max(0, c - 1));
    }, 1_000);
    return () => {
      if (timerRef.current) { clearInterval(timerRef.current); }
    };
  }, []);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  const joinUrl = `${PHONE_URL}/join/${client.code}`;
  const phoneConnected = sessionState?.phoneConnected ?? false;

  const fmt = (s: number): string =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <View style={styles.root}>
      {/* Logo / headline */}
      <View style={styles.header}>
        <Text style={styles.logo}>Lumen</Text>
        <Text style={styles.tagline}>AI-powered viewing assistant</Text>
      </View>

      {/* Main two-column layout */}
      <View style={styles.body}>
        {/* Left: QR + code */}
        <View style={styles.left}>
          <QRCode url={joinUrl} size={220} />
          <View style={styles.codeRow}>
            {client.code.split('').map((ch, i) => (
              <View key={i} style={styles.codeBox}>
                <Text style={styles.codeChar}>{ch}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.joinUrl}>{joinUrl}</Text>
          <Text style={styles.countdown}>Code expires in {fmt(countdown)}</Text>

          {/* Phone status */}
          <View style={[styles.statusPill, phoneConnected && styles.statusConnected]}>
            <Text style={styles.statusText}>
              {phoneConnected ? '📱 Phone connected' : 'Waiting for phone…'}
            </Text>
          </View>
        </View>

        {/* Right: steps + clip picker + actions */}
        <View style={styles.right}>
          <Text style={styles.sectionTitle}>How to connect</Text>
          {[
            '1. Scan the QR code or type the URL on your phone',
            '2. Enter the 4-character code',
            '3. Control brightness, mode, and AI settings from your phone',
          ].map((step, i) => (
            <Text key={i} style={styles.step}>{step}</Text>
          ))}

          <Text style={[styles.sectionTitle, {marginTop: 40}]}>Select clip</Text>
          <View style={styles.clipRow}>
            {CLIPS.map(c => (
              <FocusButton
                key={c.id}
                label={c.label}
                onPress={() => setSelectedClip(c.id as ClipId)}
                variant={selectedClip === c.id ? 'primary' : 'secondary'}
                style={styles.clipBtn}
              />
            ))}
          </View>

          <View style={styles.actions}>
            <FocusButton
              label="Start watching"
              onPress={() => onStart(selectedClip)}
              variant="primary"
              hasTVPreferredFocus
              style={styles.actionBtn}
            />
            <FocusButton
              label="Continue without phone"
              onPress={() => onStart(selectedClip)}
              variant="secondary"
              style={styles.actionBtn}
            />
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg,
    paddingHorizontal: Layout.safeH,
    paddingVertical: Layout.safeV,
  },
  header: {marginBottom: 48},
  logo: {
    color: Colors.text,
    fontSize: 52,
    fontWeight: '900',
    letterSpacing: -1,
  },
  tagline: {
    color: Colors.muted,
    fontSize: 26,
    marginTop: 8,
  },
  body: {
    flex: 1,
    flexDirection: 'row',
    gap: 80,
  },
  left: {
    width: 300,
    alignItems: 'center',
  },
  codeRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  codeBox: {
    width: 60,
    height: 72,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeChar: {
    color: Colors.accent,
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: 2,
  },
  joinUrl: {
    color: Colors.muted,
    fontSize: 16,
    marginTop: 16,
    textAlign: 'center',
  },
  countdown: {
    color: Colors.muted,
    fontSize: 18,
    marginTop: 8,
  },
  statusPill: {
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 24,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  statusConnected: {
    borderColor: '#3ddc97',
  },
  statusText: {
    color: Colors.text,
    fontSize: 18,
  },
  right: {
    flex: 1,
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 16,
  },
  step: {
    color: Colors.muted,
    fontSize: 22,
    lineHeight: 34,
  },
  clipRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 40,
  },
  clipBtn: {minWidth: 180},
  actions: {
    flexDirection: 'row',
    gap: 20,
  },
  actionBtn: {minWidth: 280},
});
