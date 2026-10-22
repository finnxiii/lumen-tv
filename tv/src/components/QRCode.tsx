import React, {useMemo} from 'react';
import {View, StyleSheet} from 'react-native';
import QRCodeGen from 'qrcode';

interface QRCodeProps {
  url: string;
  size?: number;
}

export const QRCode: React.FC<QRCodeProps> = ({url, size = 200}) => {
  const matrix = useMemo<boolean[][] | null>(() => {
    try {
      const qr = QRCodeGen.create(url, {errorCorrectionLevel: 'M'});
      const {data, size: n} = qr.modules;
      const rows: boolean[][] = [];
      for (let r = 0; r < n; r++) {
        const row: boolean[] = [];
        for (let c = 0; c < n; c++) {
          row.push(data[r * n + c] !== 0);
        }
        rows.push(row);
      }
      return rows;
    } catch {
      return null;
    }
  }, [url]);

  if (!matrix) {
    return <View style={[styles.container, {width: size, height: size}]} />;
  }

  const mod = size / matrix.length;

  return (
    <View style={[styles.container, {width: size, height: size}]}>
      {matrix.map((row, r) => (
        <View key={r} style={styles.row}>
          {row.map((dark, c) => (
            <View key={c} style={[styles.module, {width: mod, height: mod, backgroundColor: dark ? '#000' : '#fff'}]} />
          ))}
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
  },
  module: {},
});
