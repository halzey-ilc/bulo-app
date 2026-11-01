import React from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Production } from '../../src/api';
import { Header, Screen } from '../../src/components/layout';
import { StatusChip } from '../../src/components/order';
import { ProductionGroups } from '../../src/components/production';
import { Card, Divider, ErrorState, SectionTitle, Skeleton, T, Touchable } from '../../src/components/ui';
import { dateLong } from '../../src/lib/format';
import { useLoad } from '../../src/lib/useLoad';
import { colors, radius, space } from '../../src/theme';

export default function SheetScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, loading, refresh, refreshing } = useLoad(() => Production.sheet(id), [id]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header
        title={data ? `Накладная №${data.number}` : 'Накладная'}
        subtitle={data ? `${dateLong(data.date)}${data.isSupplement ? ' · дозаказ' : ''}` : undefined}
      />
      {loading ? (
        <View style={{ padding: space.lg, gap: space.md }}>
          <Skeleton style={{ height: 240, borderRadius: radius.xl }} />
        </View>
      ) : error || !data ? (
        <ErrorState message={error ?? 'Нет данных'} onRetry={refresh} />
      ) : (
        <Screen refreshing={refreshing} onRefresh={refresh}>
          <SectionTitle title="Испечь" />
          <ProductionGroups groups={data.groups} />
          <SectionTitle title={`Заказы (${data.orders.length})`} />
          <Card padded={false}>
            {data.orders.map((o, i) => (
              <View key={o.id}>
                {i > 0 && <Divider />}
                <Touchable onPress={() => router.push(`/order/${o.id}`)} style={{ padding: space.lg, gap: 6 }} scaleTo={0.99}>
                  <T v="bodyStrong">
                    №{o.number} · {o.partner}
                  </T>
                  <StatusChip status={o.status} small />
                </Touchable>
              </View>
            ))}
          </Card>
        </Screen>
      )}
    </View>
  );
}
