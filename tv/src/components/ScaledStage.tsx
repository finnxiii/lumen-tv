import React, {useEffect, useRef} from 'react';
import {StyleSheet, View, useWindowDimensions} from 'react-native';

const DESIGN_W = 1920;
const DESIGN_H = 1080;

interface ScaledStageProps {
  children: React.ReactNode;
}

// Renders a fixed 1920×1080 design space scaled to fit the actual window.
// Put all UI children inside this; keep the video surface OUTSIDE (behind it).
export const ScaledStage: React.FC<ScaledStageProps> = ({children}) => {
  const {width, height} = useWindowDimensions();
  const logged = useRef(false);

  useEffect(() => {
    if (!logged.current) {
      logged.current = true;
      console.log(`[ScaledStage] window=${width}x${height}`);
    }
  }, [width, height]);

  const scale = Math.min(width / DESIGN_W, height / DESIGN_H);

  // Translate to counteract the default center-origin scale, so the
  // top-left of the 1920×1080 view stays pinned at (0,0).
  const tx = -(DESIGN_W / 2 * (1 - scale));
  const ty = -(DESIGN_H / 2 * (1 - scale));

  return (
    <View style={styles.outer} pointerEvents="box-none">
      <View
        style={[
          styles.stage,
          {transform: [{translateX: tx}, {translateY: ty}, {scale}]},
        ]}
      >
        {children}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  outer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  stage: {
    width: DESIGN_W,
    height: DESIGN_H,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
});
