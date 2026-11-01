import React from 'react';
import { Tabs } from 'expo-router/js-tabs';
import { TabBar } from '../../src/components/TabBar';
import { TABS, usePersona } from '../../src/store/auth';
import { colors } from '../../src/theme';

export default function TabsLayout() {
  const persona = usePersona();
  const tabs = TABS[persona];
  const has = (n: string) => tabs.includes(n);

  // Порядок объявления задаёт вкладку по умолчанию — первую доступную для роли.
  // Недоступные роли вкладки скрыты через Tabs.Protected.
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
      tabBar={(props) => <TabBar {...props} order={tabs} profileLabel={persona === 'anon' ? 'Войти' : 'Профиль'} />}
    >
      <Tabs.Protected guard={has('dashboard')}>
        <Tabs.Screen name="dashboard" />
      </Tabs.Protected>
      <Tabs.Protected guard={has('index')}>
        <Tabs.Screen name="index" />
      </Tabs.Protected>
      <Tabs.Protected guard={has('deliveries')}>
        <Tabs.Screen name="deliveries" />
      </Tabs.Protected>
      <Tabs.Protected guard={has('workshop')}>
        <Tabs.Screen name="workshop" />
      </Tabs.Protected>
      <Tabs.Protected guard={has('payments')}>
        <Tabs.Screen name="payments" />
      </Tabs.Protected>
      <Tabs.Protected guard={has('orders')}>
        <Tabs.Screen name="orders" />
      </Tabs.Protected>
      <Tabs.Protected guard={has('people')}>
        <Tabs.Screen name="people" />
      </Tabs.Protected>
      <Tabs.Protected guard={has('reports')}>
        <Tabs.Screen name="reports" />
      </Tabs.Protected>
      <Tabs.Protected guard={has('catalog')}>
        <Tabs.Screen name="catalog" />
      </Tabs.Protected>
      <Tabs.Protected guard={has('cart')}>
        <Tabs.Screen name="cart" />
      </Tabs.Protected>
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
