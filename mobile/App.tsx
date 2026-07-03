import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { Session } from '@supabase/supabase-js';

import { supabase } from './src/lib/supabase';
import { getMyProfile } from './src/lib/api';
import type { Profile } from './src/lib/types';
import type { RootStackParamList, TabsParamList } from './src/navigation/types';
import { colors } from './src/ui';

import LoginScreen from './src/screens/LoginScreen';
import PendingScreen from './src/screens/PendingScreen';
import ContactedScreen from './src/screens/ContactedScreen';
import ClientDetailScreen from './src/screens/ClientDetailScreen';
import AddClientScreen from './src/screens/AddClientScreen';
import AdminScreen from './src/screens/AdminScreen';
import ProfileScreen from './src/screens/ProfileScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabsParamList>();

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.45 }}>{label}</Text>;
}

function Tabs({ profile }: { profile: Profile }) {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Tab.Screen
        name="Pendientes"
        component={PendingScreen}
        options={{ tabBarIcon: (p) => <TabIcon label="📋" focused={p.focused} /> }}
      />
      <Tab.Screen
        name="Contactados"
        component={ContactedScreen}
        options={{ tabBarIcon: (p) => <TabIcon label="✅" focused={p.focused} /> }}
      />
      {profile.role === 'superadmin' && (
        <Tab.Screen
          name="Equipo"
          component={AdminScreen}
          options={{ tabBarIcon: (p) => <TabIcon label="📊" focused={p.focused} /> }}
        />
      )}
      <Tab.Screen
        name="Perfil"
        options={{ tabBarIcon: (p) => <TabIcon label="👤" focused={p.focused} /> }}
      >
        {() => <ProfileScreen profile={profile} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

export default function App() {
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
    getMyProfile().then(setProfile);
  }, [session]);

  if (loading || (session && !profile)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <StatusBar style="dark" />
      {session && profile ? (
        <Stack.Navigator>
          <Stack.Screen name="Tabs" options={{ headerShown: false }}>
            {() => <Tabs profile={profile} />}
          </Stack.Screen>
          <Stack.Screen
            name="ClientDetail"
            component={ClientDetailScreen}
            options={{ title: 'Cliente' }}
          />
          <Stack.Screen
            name="AddClient"
            component={AddClientScreen}
            options={{ title: 'Nuevo cliente' }}
          />
        </Stack.Navigator>
      ) : (
        <LoginScreen />
      )}
    </NavigationContainer>
  );
}
