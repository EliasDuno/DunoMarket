import React, { useState } from 'react';
import { Alert, StyleSheet, View, TextInput, Button, Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { api } from '@/lib/api';

export default function LoginScreen() {
  const [tenantSlug, setTenantSlug] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function signInWithEmail() {
    if (!tenantSlug || !email || !password) {
      Alert.alert('Error', 'Por favor completa todos los campos.');
      return;
    }

    setLoading(true);
    
    try {
      // First, temporarily save tenant slug so the API client uses it for this request
      await AsyncStorage.setItem('tenant_slug', tenantSlug.trim().toLowerCase());
      
      const { data, error } = await api.post('/api/login', {
        email: email.trim().toLowerCase(),
        password: password
      });

      if (error) {
        throw error;
      }

      if (data && data.success && data.user) {
        // Save the full session exactly like the web app
        await AsyncStorage.setItem('user_session', JSON.stringify(data.user));
        
        // Push Notification Logic (Only for admins/superadmins)
        const rol = (data.user.rol || '').toLowerCase();
        if (rol === 'admin' || rol === 'administrador' || rol === 'superadmin') {
          try {
            const { registerForPushNotificationsAsync } = require('@/lib/push');
            const token = await registerForPushNotificationsAsync();
            if (token) {
              await api.post('/api/users/push-token', {
                email: data.user.email,
                token: token
              });
            }
          } catch (pushErr) {
            console.log('Error registering push token:', pushErr);
          }
        }

        // Use expo-router to redirect to the tabs layout and reload root layout state
        router.replace('/(tabs)/reportes');
      } else {
        throw new Error(data?.message || 'Error desconocido al iniciar sesión');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'No se pudo iniciar sesión');
      // Cleanup on fail
      await AsyncStorage.removeItem('tenant_slug');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Pidunet Mobile</Text>
      
      <View style={[styles.verticallySpaced, styles.mt20]}>
        <Text style={styles.label}>Código de Empresa</Text>
        <TextInput
          style={styles.input}
          onChangeText={(text) => setTenantSlug(text)}
          value={tenantSlug}
          placeholder="Ej: dmarket"
          autoCapitalize={'none'}
        />
      </View>

      <View style={styles.verticallySpaced}>
        <Text style={styles.label}>Correo Electrónico</Text>
        <TextInput
          style={styles.input}
          onChangeText={(text) => setEmail(text)}
          value={email}
          placeholder="email@address.com"
          autoCapitalize={'none'}
          keyboardType="email-address"
        />
      </View>

      <View style={styles.verticallySpaced}>
        <Text style={styles.label}>Contraseña</Text>
        <TextInput
          style={styles.input}
          onChangeText={(text) => setPassword(text)}
          value={password}
          secureTextEntry={true}
          placeholder="Contraseña"
          autoCapitalize={'none'}
        />
      </View>

      <View style={[styles.verticallySpaced, styles.mt20]}>
        <Button title="Ingresar" disabled={loading} onPress={() => signInWithEmail()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 40,
    padding: 20,
    flex: 1,
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 30,
    color: '#333',
  },
  label: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 5,
    color: '#555',
  },
  verticallySpaced: {
    paddingTop: 8,
    paddingBottom: 8,
    alignSelf: 'stretch',
  },
  mt20: {
    marginTop: 20,
  },
  input: {
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    fontSize: 16,
  },
});

