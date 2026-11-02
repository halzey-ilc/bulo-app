import React, { useCallback, useEffect, useMemo } from 'react';
import { SectionList, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Notification, Notifications } from '../src/api';
import { Icon } from '../src/components/Icon';
import { BrandRefresh, Header } from '../src/components/layout';
import { FadeIn } from '../src/components/motion';
import { EmptyState, ErrorState, Skeleton, T, Touchable } from '../src/components/ui';
import { updateCached } from '../src/lib/cache';
import { addDaysIso, dateTime, isoDay, todayIso } from '../src/lib/format';
import { Q, useQuery } from '../src/lib/queries';
import { useAuth } from '../src/store/auth';
import { colors, fonts, radius, space } from '../src/theme';

function timeOnly(ts: string) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const uid = useAuth((s) => s.user?.id ?? 'anon');
  const q = Q.notifications(uid);
  const { data, error, loading, refresh, refreshing } = useQuery(q, { staleTime: 10_000 });

  // Отмечаем прочитанными на сервере сразу; подсветка новых остаётся, пока экран открыт.
  useEffect(() => {
    if (data?.unread) Notifications.readAll().catch(() => {});
  }, [data?.unread]);
  // Уходя с экрана — гасим бейдж на главной без лишнего запроса.
  useFocusEffect(
    useCallback(
      () => () =>
        updateCached<{ items: Notification[]; unread: number }>(q.key, (prev) =>
          prev ? { unread: 0, items: prev.items.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })) } : prev!,
        ),
      [q.key],
    ),
  );

  const sections = useMemo(() => {
    const today = todayIso();
    const yesterday = addDaysIso(today, -1);
    const groups: Record<string, Notification[]> = { Сегодня: [], Вчера: [], Ранее: [] };
    for (const n of data?.items ?? []) {
      const day = isoDay(new Date(n.createdAt));
      groups[day === today ? 'Сегодня' : day === yesterday ? 'Вчера' : 'Ранее'].push(n);
    }
    return Object.entries(groups)
      .filter(([, items]) => items.length)
      .map(([title, items]) => ({ title, data: items }));
  }, [data?.items]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Уведомления" subtitle={data?.unread ? `${data.unread} новых` : 'Всё прочитано'} />
      {loading ? (
        <View style={{ padding: space.lg, gap: space.md }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} style={{ height: 76, borderRadius: radius.xl }} />
          ))}
        </View>
      ) : error && !data ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(n) => n.id}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: insets.bottom + space.xxl }}
          refreshControl={<BrandRefresh refreshing={refreshing} onRefresh={refresh} />}
          renderSectionHeader={({ section }) => (
            <T v="caption" color={colors.textMuted} style={styles.section}>
              {section.title.toUpperCase()}
            </T>
          )}
          ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
          renderItem={({ item, index }) => <NotificationItem item={item} index={index} />}
          ListEmptyComponent={<EmptyState icon="bell" title="Пока тихо" text="Здесь появятся новости о ваших заказах." tint={colors.iceCube} />}
        />
      )}
    </View>
  );
}

function NotificationItem({ item, index }: { item: Notification; index: number }) {
  const unread = !item.readAt;
  const today = isoDay(new Date(item.createdAt)) === todayIso();
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <T v="caption" color={colors.textSoft}>
            {today ? timeOnly(item.createdAt) : dateTime(item.createdAt)}
          </T>
          {item.orderId && (
            <T v="caption" color={colors.mango} style={{ fontFamily: fonts.bold }}>
              · Открыть заказ
            </T>
          )}
        </View>
      </View>
      {unread ? <View style={styles.dot} /> : item.orderId ? <Icon name="chevronRight" size={18} color={colors.textSoft} /> : null}
    </>
  );
  return (
    <FadeIn delay={Math.min(index, 6) * 35}>
      {item.orderId ? (
        <Touchable style={[styles.item, unread && styles.unread]} onPress={() => router.push(`/order/${item.orderId}`)} scaleTo={0.98}>
          {content}
        </Touchable>
      ) : (
        <View style={[styles.item, unread && styles.unread]}>{content}</View>
      )}
    </FadeIn>
  );
}

const styles = StyleSheet.create({
  section: { fontFamily: fonts.extrabold, paddingTop: space.lg, paddingBottom: space.sm, letterSpacing: 1 },
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
