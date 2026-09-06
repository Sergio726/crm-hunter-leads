import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, type StyleProp, type ViewStyle } from 'react-native';

/** Entrada breve y respetuosa: se desactiva automáticamente con Reducir movimiento. */
export default function ScreenEnter({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (!mounted) return;
      if (reduced) {
        opacity.setValue(1);
        translateY.setValue(0);
        return;
      }
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 260, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
    });
    return () => { mounted = false; };
  }, [opacity, translateY]);

  return <Animated.View style={[{ flex: 1, opacity, transform: [{ translateY }] }, style]}>{children}</Animated.View>;
}
