import React, {useState} from 'react';
import {Pressable, Text, StyleSheet, type StyleProp, type ViewStyle, type TextStyle} from 'react-native';
import {Colors} from '../theme';

interface FocusButtonProps {
  label: string;
  onPress: () => void;
  hasTVPreferredFocus?: boolean;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  variant?: 'primary' | 'secondary' | 'ghost';
  testID?: string;
}

export const FocusButton: React.FC<FocusButtonProps> = ({
  label,
  onPress,
  hasTVPreferredFocus,
  style,
  labelStyle,
  variant = 'secondary',
  testID,
}) => {
  const [focused, setFocused] = useState(false);

  return (
    <Pressable
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      hasTVPreferredFocus={hasTVPreferredFocus}
      testID={testID}
      accessibilityRole="button"
      style={[
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'ghost' && styles.ghost,
        focused && styles.focused,
        style,
      ]}>
      <Text style={[styles.label, focused && styles.labelFocused, labelStyle]}>
        {label}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: Colors.accent,
  },
  secondary: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  focused: {
    borderWidth: 2,
    borderColor: Colors.focusRing,
    transform: [{scale: 1.04}],
  },
  label: {
    color: Colors.text,
    fontSize: 28,
    fontWeight: '600',
  },
  labelFocused: {
    color: '#ffffff',
  },
});
