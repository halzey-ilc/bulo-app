import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Auth, errorMessage } from '../src/api';
import { Icon } from '../src/components/Icon';
import { BottomBar, Header, Screen } from '../src/components/layout';
import { Button, Field } from '../src/components/ui';
import { useAuth } from '../src/store/auth';
import { toast } from '../src/store/ui';
import { colors } from '../src/theme';

export default function ProfileEdit() {
  const user = useAuth((s) => s.user);
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; email?: string; common?: string }>({});

  const save = async () => {
    const e: typeof errors = {};
    if (name.trim().length < 2) e.name = 'Минимум 2 символа';
    if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) e.email = 'Проверьте адрес почты';
    setErrors(e);
    if (Object.keys(e).length) return;
    setLoading(true);
    try {
      const dto: { name: string; email?: string } = { name: name.trim() };
      if (email.trim()) dto.email = email.trim();
      const u = await Auth.updateMe(dto);
      useAuth.getState().setUser(u);
      toast.success('Сохранено');
      router.back();
    } catch (err) {
      setErrors({ common: errorMessage(err) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Личные данные" />
      <Screen>
        <Field label="Имя" value={name} onChangeText={setName} error={errors.name} left={<Icon name="user" size={20} color={colors.textSoft} />} autoComplete="name" />
        <Field
          label="Эл. почта"
          value={email}
          onChangeText={setEmail}
          error={errors.email ?? errors.common}
          keyboardType="email-address"
          autoCapitalize="none"
          left={<Icon name="at" size={20} color={colors.textSoft} />}
          hint="Пришлём копии важных уведомлений"
        />
      </Screen>
      <BottomBar>
        <Button title="Сохранить" onPress={save} loading={loading} />
      </BottomBar>
    </View>
  );
}
