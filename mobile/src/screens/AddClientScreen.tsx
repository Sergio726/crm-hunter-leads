import React, { useState } from 'react';
import { Alert, ScrollView, Text, TextInput, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { createClient } from '../lib/api';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';

export default function AddClientScreen() {
  const { colors, shared } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!fullName.trim()) {
      Alert.alert('Falta el nombre', 'Ingresá al menos el nombre del cliente.');
      return;
    }
    setSaving(true);
    try {
      const client = await createClient({
        full_name: fullName.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        company: company.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      navigation.replace('ClientDetail', { clientId: client.id });
    } catch (e) {
      Alert.alert('No se pudo guardar', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const placeholder = colors.textMuted;

  return (
    <ScrollView style={shared.screen} contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <Text style={shared.label}>Nombre *</Text>
      <TextInput
        style={shared.input}
        value={fullName}
        onChangeText={setFullName}
        placeholder="Juan Pérez"
        placeholderTextColor={placeholder}
      />

      <Text style={shared.label}>Teléfono (con código de país)</Text>
      <TextInput
        style={shared.input}
        value={phone}
        onChangeText={setPhone}
        placeholder="+54 9 11 2233 4455"
        placeholderTextColor={placeholder}
        keyboardType="phone-pad"
      />

      <Text style={shared.label}>Email</Text>
      <TextInput
        style={shared.input}
        value={email}
        onChangeText={setEmail}
        placeholder="juan@empresa.com"
        placeholderTextColor={placeholder}
        keyboardType="email-address"
        autoCapitalize="none"
      />

      <Text style={shared.label}>Empresa</Text>
      <TextInput
        style={shared.input}
        value={company}
        onChangeText={setCompany}
        placeholder="Empresa SA"
        placeholderTextColor={placeholder}
      />

      <Text style={shared.label}>Notas</Text>
      <TextInput
        style={shared.input}
        value={notes}
        onChangeText={setNotes}
        multiline
        placeholder="Contexto, interés, origen del contacto…"
        placeholderTextColor={placeholder}
      />

      <TouchableOpacity style={[shared.button, { marginTop: 24 }]} onPress={save} disabled={saving}>
        <Text style={shared.buttonText}>{saving ? 'Guardando…' : 'Guardar cliente'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
