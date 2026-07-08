import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

// Para usar un logo en imagen, ver src/brand.ts y el README. Luego descomentá:
// import { Image } from 'react-native';
// const LOGO_IMAGE = require('../../assets/logo.png');

export default function Logo({ size = 'lg' }: { size?: 'lg' | 'sm' }) {
  const { colors } = useTheme();
  const box = size === 'lg' ? 44 : 32;
  const font = size === 'lg' ? 22 : 16;
  const word = size === 'lg' ? 26 : 18;

  // if (LOGO_IMAGE) {
  //   return <Image source={LOGO_IMAGE} style={{ height: box, width: box * 3.6, resizeMode: 'contain' }} />;
  // }

  return (
    <View style={styles.row}>
      <View style={[styles.mark, { height: box, width: box, borderRadius: box / 3.5, backgroundColor: colors.primary }]}>
        <Text style={{ color: '#fff', fontSize: font, fontWeight: '800' }}>C</Text>
      </View>
      <Text style={{ fontSize: word, fontWeight: '800', color: colors.text, letterSpacing: -0.5 }}>CRM Lite</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mark: { alignItems: 'center', justifyContent: 'center' },
});
