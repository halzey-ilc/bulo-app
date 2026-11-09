import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { router } from 'expo-router';
import { Auth } from '../api';

/**
 * Push-уведомления. Никогда не роняют приложение.
 * - Android: токен Firebase (FCM) — сервер шлёт напрямую в Google, без посредников.
 *   Нужен google-services.json в сборке; без него просто тихо выходим.
 * - iOS / Expo Go: Expo push-токен, если задан EAS projectId.
 */
export async function registerPushToken(): Promise<void> {
  try {
    if (Platform.OS === 'web' || !Device.isDevice) return;
    const Notifications = await import('expo-notifications');
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Заказы',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 200, 120, 200],
        lightColor: '#E94F15',
      });
    }
    const current = await Notifications.getPermissionsAsync();
    let granted = current.granted;
    if (!granted) granted = (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return;

    if (Platform.OS === 'android') {
      const t = await Notifications.getDevicePushTokenAsync();
      if (t?.data) await Auth.pushToken(String(t.data), 'fcm');
      return;
    }
    const projectId =
      (Constants.expoConfig?.extra as any)?.eas?.projectId ?? (Constants as any).easConfig?.projectId;
    if (!projectId) return;
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    await Auth.pushToken(data, Platform.OS);
  } catch (e) {
    if (__DEV__) console.log('[push] skipped:', (e as Error)?.message);
  }
}

let listening = false;

/** Нажали на уведомление — открываем заказ. */
export async function listenPushTaps() {
  if (listening || Platform.OS === 'web') return;
  listening = true;
  try {
    const Notifications = await import('expo-notifications');
    const open = (data: unknown) => {
      const id = (data as { orderId?: string } | undefined)?.orderId;
      if (id) router.push(`/order/${id}`);
    };
    const last = await Notifications.getLastNotificationResponseAsync();
    if (last) open(last.notification.request.content.data);
    Notifications.addNotificationResponseReceivedListener((r) => open(r.notification.request.content.data));
  } catch {
    // без модуля уведомлений — ничего страшного
  }
}
