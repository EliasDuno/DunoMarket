import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerForPushNotificationsAsync() {
  let token;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.log('Failed to get push token for push notification!');
      return null;
    }
    try {
      const projectId =
        Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
      
      // If we don't have EAS projectId, fallback to generic
      token = (
        await Notifications.getExpoPushTokenAsync({
          projectId: projectId || '5e3f7f9f-ce1e-4a88-99dd-d7d757a22d45',
        })
      ).data;
      console.log('Expo Push Token:', token);
    } catch (e: any) {
      console.error(e);
      // Devuelve un string con el error para que _layout.tsx lo pueda atrapar o registrar
      throw new Error("EXPO_ERR: " + (e?.message || String(e)));
    }
  } else {
    throw new Error("DEVICE_ERR: Debe usar un dispositivo físico");
  }

  return token;
}
