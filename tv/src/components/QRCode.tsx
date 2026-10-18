import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {Colors} from '../theme';

interface QRCodeProps {
  url: string;
  size?: number;
}

// Renders a placeholder QR-code area with the URL visible.
// A full QR module can replace this without changing the API.
export const QRCode: React.FC<QRCodeProps> = ({url, size = 200}) => {
  return (
    <View style={[styles.container, {width: size, height: size}]}>
      <View style={styles.corner} />
      <View style={[styles.corner, styles.tr]} />
      <View style={[styles.corner, styles.bl]} />
      <View style={styles.inner}>
        <Text style={styles.qrLabel}>QR</Text>
        <Text style={styles.urlText} numberOfLines={3}>{url}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  inner: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  corner: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 28,
    height: 28,
    borderWidth: 4,
    borderColor: '#000',
    borderRadius: 4,
  },
  tr: {top: 12, left: undefined, right: 12},
  bl: {top: undefined, bottom: 12, left: 12},
  qrLabel: {
    fontSize: 28,
    fontWeight: '900',
    color: Colors.bg,
    letterSpacing: 4,
  },
  urlText: {
    fontSize: 9,
    color: '#333',
    textAlign: 'center',
    marginTop: 4,
  },
});
