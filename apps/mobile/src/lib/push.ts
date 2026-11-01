import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Auth } from '../api';

/**
 * Регистрирует Expo push-токен на сервере. Никогда не роняет приложение:
 * в вебе, симуляторе, Expo Go без projectId — просто тихо выходит.
 * Для боевых пушей нужен EAS projectId (extra.eas.projectId в app.json).
 */
export async function registerPushToken(): Promise<void> {
  try {
    if (Platform.OS === 'web' || !Device.isDevice) return;
    const projectId =
      (Constants.expoConfig?.extra as any)?.eas?.projectId ?? (Constants as any).easConfig?.projectId;
    if (!projectId) return;
    const Notifications = await import('expo-notifications');
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Заказы',
        importance: Notifications.AndroidImportance.DEFAULT,
        lightColor: '#E94F15',
      });
    }
    const current = await Notifications.getPermissionsAsync();
    let granted = current.granted;
    if (!granted) granted = (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return;
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    await Auth.pushToken(data, Platform.OS);
  } catch (e) {
    if (__DEV__) console.log('[push] skipped:', (e as Error)?.message);
  }
}
