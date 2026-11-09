import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, View } from 'react-native';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/manrope';
import { AnimatedSplash } from '../src/components/AnimatedSplash';
import { DialogHost, FlyToCartHost, ToastHost } from '../src/components/Overlays';
import { cacheStats, clearCache } from '../src/lib/cache';
import { registerPushToken } from '../src/lib/push';
import { repriceCart, warmUp } from '../src/lib/queries';
import { personaOf, useAuth } from '../src/store/auth';
import { prefsHydrated, usePrefs } from '../src/store/prefs';
import { colors } from '../src/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

/** Общие для всех публичные данные — их не чистим при смене пользователя. */
const PUBLIC_KEYS = (k: string) => k === 'info' || k === 'rules' || k === 'branches';

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });
  const ready = useAuth((s) => s.ready);
  const userId = useAuth((s) => s.user?.id);
  const role = useAuth((s) => s.user?.role);
  const [splashDone, setSplashDone] = useState(false);
  const fontsReady = fontsLoaded || !!fontError;
  const prevUser = useRef<string | undefined>(undefined);
  const onboardingChecked = useRef(false);

  useEffect(() => {
    void useAuth.getState().bootstrap();
  }, []);

  useEffect(() => {
    if (fontsReady) SplashScreen.hideAsync().catch(() => {});
  }, [fontsReady]);

  // Обновляем профиль (права, статус партнёра) при возвращении в приложение.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void useAuth.getState().refresh();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (userId) void registerPushToken();
  }, [userId]);

  // Прогрев кэша сразу после проверки сессии — пока идёт заставка, каталог уже грузится.
  // При смене пользователя личные данные прошлой сессии выбрасываем.
  useEffect(() => {
    if (!ready) return;
    if (prevUser.current !== undefined && prevUser.current !== (userId ?? '')) clearCache(PUBLIC_KEYS);
    prevUser.current = userId ?? '';
    const persona = personaOf(role);
    warmUp(persona === 'buyer');
    void repriceCart();
  }, [ready, userId, role]);

  // Первое знакомство: короткий онбординг для тех, кто ещё не входил.
  useEffect(() => {
    if (!ready || !splashDone || onboardingChecked.current) return;
    onboardingChecked.current = true;
    if (useAuth.getState().user) return;
    void prefsHydrated().then(() => {
      if (!usePrefs.getState().onboardingSeen && !useAuth.getState().user) router.push('/onboarding');
    });
  }, [ready, splashDone]);

  // В разработке — счётчики сети/кэша в лог (замер: сколько запросов уходит при переключении вкладок).
  useEffect(() => {
    if (!__DEV__) return;
    const t = setInterval(() => console.log('[bulo-cache]', JSON.stringify(cacheStats)), 10_000);
    return () => clearInterval(t);
  }, []);

  const onSplashDone = useCallback(() => setSplashDone(true), []);

  if (!fontsReady) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        {ready && (
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.bg },
              // На Android «iOS-подобный» сдвиг выглядит плавнее стандартного.
              animation: Platform.OS === 'android' ? 'ios_from_right' : 'slide_from_right',
              animationDuration: 220,
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="login" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="onboarding" options={{ animation: 'fade', gestureEnabled: false }} />
            <Stack.Screen name="order-success" options={{ animation: 'fade', gestureEnabled: false }} />
          </Stack>
        )}
        <FlyToCartHost />
        <ToastHost />
        <DialogHost />
        {!splashDone && <AnimatedSplash ready={ready} onDone={onSplashDone} />}
      </View>
    </SafeAreaProvider>
  );
}
