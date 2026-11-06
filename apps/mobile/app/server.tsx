import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL, DEFAULT_API_URL, setApiUrl } from '../src/api/client';
import { Header } from '../src/components/layout';
import { Button, Field, T } from '../src/components/ui';
import { clearCache } from '../src/lib/cache';
import { API_URL_KEY } from '../src/store/auth';
import { colors, space } from '../src/theme';

/** «10.0.0.5:4000» → «http://10.0.0.5:4000/api». */
function normalize(raw: string) {
  let u = raw.trim().replace(/\/+$/, '');
  if (!u) return '';
  if (!/^https?:\/\//.test(u)) u = `http://${u}`;
  return /\/api$/.test(u) ? u : `${u}/api`;
}

/** Адрес сервера BULO. Открывается долгим нажатием на логотип на экране входа. */
export default function ServerScreen() {
  const [url, setUrl] = useState(API_URL);
  const [state, setState] = useState<'idle' | 'checking' | 'failed'>('idle');

  const save = async () => {
    const next = normalize(url);
    setState('checking');
    try {
      // сервер жив, если ответил хоть что-то — на запрос без токена это 401
      await fetch(`${next || DEFAULT_API_URL}/auth/me`, { signal: AbortSignal.timeout(6000) });
    } catch {
      return setState('failed');
    }
    if (next && next !== DEFAULT_API_URL) await AsyncStorage.setItem(API_URL_KEY, next);
    else await AsyncStorage.removeItem(API_URL_KEY);
    setApiUrl(next);
    clearCache();
    router.back();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Сервер" />
      <View style={{ padding: space.lg, gap: space.md }}>
        <Field
          label="Адрес сервера"
          placeholder={DEFAULT_API_URL}
          value={url}
          onChangeText={(v) => {
            setUrl(v);
            setState('idle');
          }}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          error={state === 'failed' ? 'Сервер не отвечает. Проверьте адрес и сеть.' : null}
        />
        <Button title="Сохранить" onPress={save} loading={state === 'checking'} />
        <T v="small" color={colors.textSoft}>
          Оставьте поле пустым, чтобы вернуть адрес по умолчанию.
        </T>
      </View>
    </View>
  );
}
