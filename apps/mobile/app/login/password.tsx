import React from 'react';
import { LoginScreen } from '../../src/components/LoginScreen';

/** Старый адрес /login/password — тот же единый экран входа, сразу на вкладке «Логин и пароль». */
export default function LoginPassword() {
  return <LoginScreen initialTab="password" />;
}
