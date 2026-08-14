import React from 'react';
import { Image, Text, View, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { mono } from '../ui';

/**
 * Lockup de marca: logotipo ST Labs + nombre del producto.
 *
 * El manual define dos variantes que no son intercambiables: la positiva va
 * sobre fondos claros y la negativa sobre fondos oscuros. Se elige según el
 * tema activo. Assets copiados del repositorio de identidad:
 * https://github.com/Sergio726/crm-hunter-leads-brand
 */
const LOGO_LIGHT = require('../../assets/st-labs-logo-light.png');
const LOGO_DARK = require('../../assets/st-labs-logo-dark.png');

export default function Logo({ size = 'lg' }: { size?: 'lg' | 'sm' }) {
  const { colors, name } = useTheme();
  const height = size === 'lg' ? 30 : 22;
  const word = size === 'lg' ? 17 : 14;

  return (
    <View style={styles.row}>
      <Image
        source={name === 'dark' ? LOGO_DARK : LOGO_LIGHT}
        style={{ height, width: height * 3.6 }}
        resizeMode="contain"
        accessibilityLabel="ST Labs"
      />
      <Text
        style={{
          fontFamily: mono,
          fontSize: word,
          fontWeight: '700',
          color: colors.text,
          letterSpacing: -0.4,
        }}
      >
        CRM Lite
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
