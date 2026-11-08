import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL, DEFAULT_API_URL, setApiUrl } from '../src/api/client';
import { Icon } from '../src/components/Icon';
import { Header } from '../src/components/layout';
import { Button, Field, T, Touchable } from '../src/components/ui';
import { clearCache } from '../src/lib/cache';
import { API_URL_KEY } from '../src/store/auth';
import { colors, fonts, space } from '../src/theme';

/** «10.0.0.5:4000» → «http://10.0.0.5:4000/api»; адреса туннелей — сразу https. */
function normalize(raw: string) {
  let u = raw.trim().replace(/\/+$/, '');
  if (!u) return '';
  if (!/^https?:\/\//.test(u)) u = /trycloudflare\.com|ngrok|\.app$|\.dev$/.test(u) ? `https://${u}` : `http://${u}`;
  return /\/api$/.test(u) ? u : `${u}/api`;
}

/** Адрес эмулятора — на телефоне он не работает, поэтому поле не подставляем им. */
const isEmulatorDefault = (u: string) => /10\.0\.2\.2|localhost|127\.0\.0\.1/.test(u);

/** Адрес сервера BULO. Открывается долгим нажатием на логотип на экране входа. */
export default function ServerScreen() {
  const [url, setUrl] = useState(API_URL === DEFAULT_API_URL && isEmulatorDefault(API_URL) ? '' : API_URL.replace(/\/api$/, ''));
  const [state, setState] = useState<'idle' | 'checking' | 'failed'>('idle');

  const paste = async () => {
    const t = (await Clipboard.getStringAsync()).trim();
    if (t) {
      setUrl(t);
      setState('idle');
    }
  };

  const save = async () => {
    const next = normalize(url);
    setState('checking');
    try {
      // сервер жив, если ответил хоть что-то — на запрос без токена это 401
      await fetch(`${next || DEFAULT_API_URL}/auth/me`, { signal: AbortSignal.timeout(8000) });
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
          placeholder="https://….trycloudflare.com"
          value={url}
          onChangeText={(v) => {
            setUrl(v);
            setState('idle');
          }}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          error={state === 'failed' ? 'Сервер не отвечает. Проверьте адрес и интернет.' : null}
          right={
            !url ? (
              <Touchable onPress={paste} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} accessibilityLabel="Вставить">
                <Icon name="copy" size={16} color={colors.mango} />
                <T v="small" color={colors.mango} style={{ fontFamily: fonts.bold }}>
                  Вставить
                </T>
              </Touchable>
            ) : (
              <Touchable onPress={() => setUrl('')} hitSlop={10} accessibilityLabel="Очистить">
                <Icon name="close" size={18} color={colors.textSoft} />
              </Touchable>
            )
          }
        />
        <Button title="Подключиться" onPress={save} loading={state === 'checking'} disabled={!url.trim()} />
        <T v="small" color={colors.textSoft}>
          Скопируйте адрес, который вам прислали, и нажмите «Вставить». «/api» в конце добавится сам.
        </T>
      </View>
    </View>
  );
}
