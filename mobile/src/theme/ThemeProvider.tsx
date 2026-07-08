import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { darkColors, lightColors, makeShared, type ThemeColors } from '../ui';

export type ThemeName = 'light' | 'dark';

interface ThemeContextValue {
  name: ThemeName;
  colors: ThemeColors;
  shared: ReturnType<typeof makeShared>;
  toggle: () => void;
  isOverridden: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = 'theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [override, setOverride] = useState<ThemeName | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((v) => {
      if (v === 'light' || v === 'dark') setOverride(v);
    });
  }, []);

  const name: ThemeName = override ?? (system === 'dark' ? 'dark' : 'light');
  const colors = name === 'dark' ? darkColors : lightColors;
  const shared = useMemo(() => makeShared(colors), [colors]);

  const value = useMemo<ThemeContextValue>(() => {
    const setName = (t: ThemeName) => {
      setOverride(t);
      AsyncStorage.setItem(STORAGE_KEY, t);
    };
    return {
      name,
      colors,
      shared,
      isOverridden: override !== null,
      toggle: () => setName(name === 'dark' ? 'light' : 'dark'),
    };
  }, [name, colors, shared, override]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme debe usarse dentro de ThemeProvider');
  return ctx;
}
