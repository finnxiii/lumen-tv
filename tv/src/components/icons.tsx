import React from 'react';
import {View} from 'react-native';

// All icons are drawn with plain Views — react-native-svg is not available on Vega.
// Size is in design units (1920×1080 space). Stroke weight ~10–12% of size.

interface IconProps {
  size?: number;
  color?: string;
}

// ── Play ────────────────────────────────────────────────────────────────────
// Right-pointing filled triangle (border trick).
export const PlayIcon: React.FC<IconProps> = ({size = 34, color = '#fff'}) => (
  <View style={{
    width: 0,
    height: 0,
    borderTopWidth: Math.round(size * 0.5),
    borderBottomWidth: Math.round(size * 0.5),
    borderLeftWidth: Math.round(size * 0.87),
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: color,
  }} />
);

// ── Pause ───────────────────────────────────────────────────────────────────
// Two vertical rounded bars.
export const PauseIcon: React.FC<IconProps> = ({size = 34, color = '#fff'}) => {
  const bar = Math.round(size * 0.26);
  const h   = Math.round(size * 0.88);
  const gap = Math.round(size * 0.24);
  return (
    <View style={{flexDirection: 'row', alignItems: 'center', gap}}>
      <View style={{width: bar, height: h, backgroundColor: color, borderRadius: 2}} />
      <View style={{width: bar, height: h, backgroundColor: color, borderRadius: 2}} />
    </View>
  );
};

// ── Replay ──────────────────────────────────────────────────────────────────
// ¾ ring (counterclockwise arrow) with a left-pointing arrowhead at the break.
export const ReplayIcon: React.FC<IconProps> = ({size = 36, color = '#fff'}) => {
  const stroke = Math.round(size * 0.12);
  const ring   = Math.round(size * 0.72);
  const tip    = Math.round(size * 0.22);
  return (
    <View style={{width: size, height: size, alignItems: 'center', justifyContent: 'center'}}>
      {/* ring with top-right quarter hidden */}
      <View style={{
        position: 'absolute',
        width: ring,
        height: ring,
        borderRadius: ring / 2,
        borderWidth: stroke,
        borderColor: color,
        borderTopColor: 'transparent',
        borderRightColor: 'transparent',
        transform: [{rotate: '45deg'}],
      }} />
      {/* arrowhead pointing left, placed at the open end (top-left of the ring) */}
      <View style={{
        position: 'absolute',
        top: Math.round(size * 0.04),
        left: Math.round(size * 0.06),
        width: 0,
        height: 0,
        borderTopWidth: tip * 0.55,
        borderBottomWidth: tip * 0.55,
        borderRightWidth: tip,
        borderTopColor: 'transparent',
        borderBottomColor: 'transparent',
        borderRightColor: color,
      }} />
    </View>
  );
};

// ── Modes ───────────────────────────────────────────────────────────────────
// 2×2 grid of squares — "viewing modes" grid.
export const ModesIcon: React.FC<IconProps> = ({size = 32, color = '#fff'}) => {
  const sq  = Math.round(size * 0.38);
  const gap = Math.round(size * 0.18);
  return (
    <View style={{gap}}>
      <View style={{flexDirection: 'row', gap}}>
        <View style={{width: sq, height: sq, backgroundColor: color, borderRadius: 2}} />
        <View style={{width: sq, height: sq, backgroundColor: color, borderRadius: 2}} />
      </View>
      <View style={{flexDirection: 'row', gap}}>
        <View style={{width: sq, height: sq, backgroundColor: color, borderRadius: 2}} />
        <View style={{width: sq, height: sq, backgroundColor: color, borderRadius: 2}} />
      </View>
    </View>
  );
};

// ── Sparkle ─────────────────────────────────────────────────────────────────
// 4-pointed star: two pill rectangles at 0° and 90°, plus two shorter at ±45°.
export const SparkleIcon: React.FC<IconProps> = ({size = 32, color = '#fff'}) => {
  const thick  = Math.round(size * 0.18);
  const longL  = size;
  const shortL = Math.round(size * 0.65);
  const r      = thick / 2;
  return (
    <View style={{width: size, height: size, alignItems: 'center', justifyContent: 'center'}}>
      <View style={{position: 'absolute', width: longL,  height: thick,  backgroundColor: color, borderRadius: r}} />
      <View style={{position: 'absolute', width: thick,  height: longL,  backgroundColor: color, borderRadius: r}} />
      <View style={{position: 'absolute', width: shortL, height: thick,  backgroundColor: color, borderRadius: r, transform: [{rotate: '45deg'}]}} />
      <View style={{position: 'absolute', width: shortL, height: thick,  backgroundColor: color, borderRadius: r, transform: [{rotate: '-45deg'}]}} />
    </View>
  );
};

// ── Compare ─────────────────────────────────────────────────────────────────
// Two outlined panels with a dividing line — "split-screen compare".
export const CompareIcon: React.FC<IconProps> = ({size = 32, color = '#fff'}) => {
  const stroke  = Math.round(size * 0.1);
  const panelW  = Math.round(size * 0.38);
  const panelH  = Math.round(size * 0.82);
  const divider = stroke;
  return (
    <View style={{flexDirection: 'row', alignItems: 'center', gap: Math.round(size * 0.06)}}>
      <View style={{width: panelW, height: panelH, borderWidth: stroke, borderColor: color, borderRadius: 3}} />
      <View style={{width: divider, height: panelH, backgroundColor: color}} />
      <View style={{width: panelW, height: panelH, borderWidth: stroke, borderColor: color, borderRadius: 3}} />
    </View>
  );
};

// ── Film ────────────────────────────────────────────────────────────────────
// Film-strip: outer rectangle with 3 perforations each on top and bottom edges.
export const FilmIcon: React.FC<IconProps> = ({size = 32, color = '#fff'}) => {
  const stroke = Math.round(size * 0.1);
  const bodyH  = Math.round(size * 0.62);
  const perf   = Math.round(size * 0.14);
  const offset = Math.round((size - bodyH) / 2 - perf / 2 + 1);
  const positions = [0.18, 0.50, 0.82];
  return (
    <View style={{width: size, height: size, alignItems: 'center', justifyContent: 'center'}}>
      {/* body outline */}
      <View style={{
        position: 'absolute',
        width: size,
        height: bodyH,
        borderWidth: stroke,
        borderColor: color,
        borderRadius: 3,
      }} />
      {/* top perforations */}
      {positions.map(x => (
        <View key={`t${x}`} style={{
          position: 'absolute',
          top: offset,
          left: Math.round(size * x - perf / 2),
          width: perf,
          height: perf,
          backgroundColor: color,
          borderRadius: 1,
        }} />
      ))}
      {/* bottom perforations */}
      {positions.map(x => (
        <View key={`b${x}`} style={{
          position: 'absolute',
          bottom: offset,
          left: Math.round(size * x - perf / 2),
          width: perf,
          height: perf,
          backgroundColor: color,
          borderRadius: 1,
        }} />
      ))}
    </View>
  );
};
