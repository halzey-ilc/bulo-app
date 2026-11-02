import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { LoginScreen } from '../../src/components/LoginScreen';

/** Единый экран входа: вкладки «По номеру» и «Логин и пароль». */
export default function Login() {
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  return <LoginScreen initialTab={tab === 'password' ? 'password' : tab === 'phone' ? 'phone' : undefined} />;
}
