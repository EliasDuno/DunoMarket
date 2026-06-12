import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityIndicator, View, Alert } from 'react-native';
import * as Notifications from 'expo-notifications';
import { api } from '@/lib/api';
import { registerForPushNotificationsAsync } from '@/lib/push';
export default function RootLayout() {
  const [session, setSession] = useState<any>(null);
  const [initialized, setInitialized] = useState(false);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    async function checkSession() {
      const sessionStr = await AsyncStorage.getItem('user_session');
      if (sessionStr) {
        try {
          const user = JSON.parse(sessionStr);
          if (user.tenantSlug) {
            await AsyncStorage.setItem('tenant_slug', user.tenantSlug);
          }
          const rol = (user.rol || '').toLowerCase();
          if (rol === 'admin' || rol === 'administrador' || rol === 'superadmin' || true) {
            const token = await registerForPushNotificationsAsync();
            if (token) {
              await api.post('/api/users/push-token', {
                email: user.email,
                token: token
              });
              Alert.alert('Push Activo', 'Token de notificaciones registrado desde el auto-login.');
            } else {
               Alert.alert('Advertencia', 'Token generado vacío en el auto-login.');
            }
          }
        } catch (err: any) {
          console.log('Push error in auto-login:', err);
          Alert.alert('Error Notificaciones', err?.message || String(err));
        }
      }
      setInitialized(true);
    }
    checkSession();
  }, []);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      router.push('/(tabs)/cuentas');
    });
    return () => subscription.remove();
  }, [router]);

  useEffect(() => {
    if (!initialized) return;

    const inAuthGroup = segments[0] === '(auth)';

    AsyncStorage.getItem('user_session').then(sessionStr => {
      if (sessionStr && inAuthGroup) {
        router.replace('/(tabs)/reportes');
      } else if (!sessionStr && !inAuthGroup) {
        router.replace('/(auth)/login');
      }
    });
  }, [initialized, segments]);

  if (!initialized) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#0000ff" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
    </Stack>
  );
}
