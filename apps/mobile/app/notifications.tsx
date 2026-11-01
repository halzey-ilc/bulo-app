import React, { useEffect } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Notifications } from '../src/api';
import { Icon } from '../src/components/Icon';
import { Header } from '../src/components/layout';
import { EmptyState, ErrorState, Skeleton, T, Touchable } from '../src/components/ui';
import { dateTime } from '../src/lib/format';
import { useLoad } from '../src/lib/useLoad';
import { colors, fonts, radius, space } from '../src/theme';

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const { data, error, loading, refresh, refreshing } = useLoad(() => Notifications.list(), []);

  // Отмечаем прочитанными после открытия (подсветка непрочитанных остаётся до следующего входа на экран).
  useEffect(() => {
    if (data?.unread) Notifications.readAll().catch(() => {});
  }, [data?.unread]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Уведомления" subtitle={data?.unread ? `${data.unread} новых` : undefined} />
      {loading ? (
        <View style={{ padding: space.lg, gap: space.md }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} style={{ height: 76, borderRadius: radius.xl }} />
          ))}
        </View>
      ) : error ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : (
        <FlatList
          data={data?.items ?? []}
          keyExtractor={(n) => n.id}
          contentContainerStyle={{ padding: space.lg, gap: space.sm, paddingBottom: insets.bottom + space.xxl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.mango} colors={[colors.mango]} />}
          renderItem={({ item }) => {
            const unread = !item.readAt;
            const content = (
              <>
                <View style={[styles.icon, { backgroundColor: unread ? colors.primarySoft : colors.oatMilk }]}>
                  <Icon name={item.orderId ? 'receipt' : 'bell'} size={20} color={unread ? colors.mango : colors.textMuted} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <T v="bodyStrong" style={unread ? { fontFamily: fonts.extrabold } : undefined}>
                    {item.title}
                  </T>
                  {!!item.body && (
                    <T v="small" color={colors.textMuted}>
                      {item.body}
                    </T>
                  )}
                  <T v="caption" color={colors.textSoft} style={{ marginTop: 2 }}>
                    {dateTime(item.createdAt)}
                  </T>
                </View>
                {unread && <View style={styles.dot} />}
              </>
            );
            return item.orderId ? (
              <Touchable style={[styles.item, unread && styles.unread]} onPress={() => router.push(`/order/${item.orderId}`)} scaleTo={0.98}>
                {content}
              </Touchable>
            ) : (
              <View style={[styles.item, unread && styles.unread]}>{content}</View>
            );
          }}
          ListEmptyComponent={<EmptyState icon="bell" title="Пока тихо" text="Здесь появятся новости о ваших заказах." tint={colors.iceCube} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    gap: space.md,
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    padding: space.lg,
    alignItems: 'flex-start',
  },
  unread: { borderWidth: 1.5, borderColor: colors.primarySoft },
  icon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.mango, marginTop: 6 },
});
