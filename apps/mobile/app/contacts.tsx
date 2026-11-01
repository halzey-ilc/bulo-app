import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Catalog } from '../src/api';
import { ContactsCard } from '../src/components/contacts';
import { Header, Screen } from '../src/components/layout';
import { Logo } from '../src/components/Logo';
import { ErrorState, Skeleton, T } from '../src/components/ui';
import { useLoad } from '../src/lib/useLoad';
import { colors, radius, space } from '../src/theme';

export default function Contacts() {
  const { data, error, loading, refresh, refreshing } = useLoad(() => Catalog.info(), []);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Контакты" />
      <Screen refreshing={refreshing} onRefresh={refresh}>
        <View style={styles.hero}>
          <Svg style={StyleSheet.absoluteFill} viewBox="0 0 340 200" preserveAspectRatio="xMidYMid slice">
            <Circle cx={310} cy={20} r={80} fill={colors.mango} opacity={0.12} />
            <Circle cx={30} cy={190} r={60} fill={colors.iceCube} />
          </Svg>
          <Logo width={120} />
          <T v="h3" style={{ marginTop: space.md }}>
            {data?.companyName ?? 'BULO'} — пекарня в Бишкеке
          </T>
          <T v="small" color={colors.textMuted} center>
            Синнабоны, выпечка, торты и сэндвичи. Taste at Your Pace.
          </T>
        </View>
        {loading ? (
          <Skeleton style={{ height: 240, borderRadius: radius.xl }} />
        ) : error || !data ? (
          <ErrorState message={error ?? 'Нет данных'} onRetry={refresh} />
        ) : (
          <>
            <ContactsCard info={data} />
            <View style={styles.rules}>
              <T v="bodyStrong">Приём заказов на завтра — до {data.cutoffTime}</T>
              {!!data.minOrderSum && (
                <T v="small" color={colors.textMuted}>
                  Минимальная сумма заказа — {data.minOrderSum.toLocaleString('ru-RU')} сом
                </T>
              )}
            </View>
          </>
        )}
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    backgroundColor: colors.softYellow,
    borderRadius: radius.xxl,
    padding: space.xxl,
    overflow: 'hidden',
    gap: 4,
  },
  rules: { backgroundColor: colors.white, borderRadius: radius.xl, padding: space.lg, gap: 4 },
});
