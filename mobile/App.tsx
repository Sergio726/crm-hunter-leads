import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  NavigationContainer,
  DefaultTheme,
  DarkTheme,
  type Theme as NavTheme,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import type { Session } from '@supabase/supabase-js';

import { supabase } from './src/lib/supabase';
import { getMyProfile } from './src/lib/api';
import type { Profile } from './src/lib/types';
import type { RootStackParamList, TabsParamList } from './src/navigation/types';
import { ThemeProvider, useTheme } from './src/theme/ThemeProvider';

import LoginScreen from './src/screens/LoginScreen';
import PendingScreen from './src/screens/PendingScreen';
import ClientsScreen from './src/screens/ClientsScreen';
import ContactedScreen from './src/screens/ContactedScreen';
import ClientDetailScreen from './src/screens/ClientDetailScreen';
import AddClientScreen from './src/screens/AddClientScreen';
import AdminScreen from './src/screens/AdminScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import PendingApprovalScreen from './src/screens/PendingApprovalScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabsParamList>();

function Tabs({ profile }: { profile: Profile }) {
  const { colors } = useTheme();
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        headerStyle: { backgroundColor: colors.card },
        headerTitleStyle: { fontWeight: '700', color: colors.text },
        headerTintColor: colors.text,
      }}
    >
      <Tab.Screen
        name="Pendientes"
        component={PendingScreen}
        options={{ tabBarIcon: ({ color, size }) => <Ionicons name="list" color={color} size={size} /> }}
      />
      <Tab.Screen
        name="Clientes"
        component={ClientsScreen}
        options={{ tabBarIcon: ({ color, size }) => <Ionicons name="search" color={color} size={size} /> }}
      />
      <Tab.Screen
        name="Contactados"
        component={ContactedScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons name="checkmark-done" color={color} size={size} />,
        }}
      />
      {profile.role === 'superadmin' && (
        <Tab.Screen
          name="Equipo"
          component={AdminScreen}
          options={{ tabBarIcon: ({ color, size }) => <Ionicons name="people" color={color} size={size} /> }}
        />
      )}
      <Tab.Screen
        name="Perfil"
        options={{ tabBarIcon: ({ color, size }) => <Ionicons name="person" color={color} size={size} /> }}
      >
        {() => <ProfileScreen profile={profile} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

function AppInner() {
  const { name, colors } = useTheme();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setProfile(null);
      return;
    }
    let active = true;
    getMyProfile()
      .then((p) => {
        if (!active) return;
        if (p) setProfile(p);
        else supabase.auth.signOut();
      })
      .catch(() => {
        if (active) supabase.auth.signOut();
      });
    return () => {
      active = false;
    };
  }, [session]);

  if (loading || (session && !profile)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const base = name === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme: NavTheme = {
    ...base,
    colors: {
      ...base.colors,
      background: colors.bg,
      card: colors.card,
      text: colors.text,
      border: colors.border,
      primary: colors.primary,
    },
  };

  return (
    <NavigationContainer theme={navTheme}>
      <StatusBar style={name === 'dark' ? 'light' : 'dark'} />
      {session && profile && profile.role === 'pending' ? (
        <PendingApprovalScreen profile={profile} />
      ) : session && profile ? (
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: colors.card },
            headerTitleStyle: { color: colors.text },
            headerTintColor: colors.text,
          }}
        >
          <Stack.Screen name="Tabs" options={{ headerShown: false }}>
            {() => <Tabs profile={profile} />}
          </Stack.Screen>
          <Stack.Screen name="ClientDetail" component={ClientDetailScreen} options={{ title: 'Cliente' }} />
          <Stack.Screen name="AddClient" component={AddClientScreen} options={{ title: 'Nuevo cliente' }} />
        </Stack.Navigator>
      ) : (
        <LoginScreen />
      )}
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  );
}
