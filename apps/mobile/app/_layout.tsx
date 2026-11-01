import React, { useCallback, useEffect, useState } from 'react';
import { AppState, View } from 'react-native';
import { Stack } from 'expo-router';
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
import { DialogHost, ToastHost } from '../src/components/Overlays';
import { registerPushToken } from '../src/lib/push';
import { useAuth } from '../src/store/auth';
import { colors } from '../src/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

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
  const [splashDone, setSplashDone] = useState(false);
  const fontsReady = fontsLoaded || !!fontError;

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
              animation: 'slide_from_right',
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="login" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="order-success" options={{ animation: 'fade', gestureEnabled: false }} />
          </Stack>
        )}
        <ToastHost />
        <DialogHost />
        {!splashDone && <AnimatedSplash ready={ready} onDone={onSplashDone} />}
      </View>
    </SafeAreaProvider>
  );
}
