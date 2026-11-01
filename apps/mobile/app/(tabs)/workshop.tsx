import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Orders, Production } from '../../src/api';
import { Icon } from '../../src/components/Icon';
import { Screen } from '../../src/components/layout';
import { ProductionGroups } from '../../src/components/production';
import { Button, Card, Chip, EmptyState, ErrorState, SectionTitle, Skeleton, T, Touchable } from '../../src/components/ui';
import { addDaysIso, dateLong, dayLabel, money, plural, todayIso } from '../../src/lib/format';
import { runOrderAction } from '../../src/lib/orderActions';
import { useLoad } from '../../src/lib/useLoad';
import { confirmDialog, toast } from '../../src/store/ui';
import { colors, fonts, radius, space } from '../../src/theme';

export default function Workshop() {
  const today = todayIso();
  const days = [today, addDaysIso(today, 1), addDaysIso(today, 2)];
  const [date, setDate] = useState(days[1]);
  const summary = useLoad(() => Production.summary(date), [date]);
  const inProd = useLoad(() => Orders.list(['IN_PRODUCTION']), []);
  const s = summary.data;

  const createSheet = () =>
    confirmDialog({
      title: 'Сформировать накладную?',
      message: `Оплаченные заказы на ${dayLabel(date).toLowerCase()} перейдут в производство.`,
      confirmText: 'Сформировать',
      onConfirm: async () => {
        const sheet = await Production.createSheet(date);
        toast.success(`Сводная накладная №${sheet.number} готова`);
        summary.reload();
        inProd.reload();
        router.push(`/sheet/${sheet.id}`);
      },
    });

  const onRefresh = () => {
    summary.refresh();
    inProd.refresh();
  };

  return (
    <Screen withTabBar topInset refreshing={summary.refreshing} onRefresh={onRefresh} contentStyle={{ gap: space.xl }}>
      <View>
        <T v="body" color={colors.textMuted}>
          Цех BULO
        </T>
        <T v="display">Что печём</T>
      </View>

      <View style={{ flexDirection: 'row', gap: space.sm }}>
        {days.map((d) => (
          <Chip key={d} label={dayLabel(d)} active={d === date} onPress={() => setDate(d)} />
        ))}
      </View>

      {summary.loading ? (
        <View style={{ gap: space.md }}>
          <Skeleton style={{ height: 96, borderRadius: radius.xl }} />
          <Skeleton style={{ height: 220, borderRadius: radius.xl }} />
        </View>
      ) : summary.error ? (
        <ErrorState message={summary.error} onRetry={summary.refresh} />
      ) : s ? (
        <>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Stat value={s.pending.orders.length} label="оплачено, ждут цех" bg={colors.mango} fg={colors.white} />
            <Stat value={s.sheets.length} label="накладных" bg={colors.cambodia} fg={colors.oatMilk} />
            <Stat value={s.awaitingPayment} label="ждут оплаты" bg={colors.softYellow} fg={colors.cambodia} />
          </View>

          <T v="small" color={colors.textMuted}>
            Производство на {dateLong(date)}
          </T>

          {s.pending.groups.length > 0 ? (
            <View style={{ gap: space.md }}>
              <SectionTitle title="Новые оплаченные" />
              <ProductionGroups groups={s.pending.groups} />
              <Button title="Сформировать сводную накладную" icon="receipt" onPress={createSheet} />
            </View>
          ) : (
            <Card style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
              <View style={styles.okIcon}>
                <Icon name="check" size={22} color={colors.success} strokeWidth={2.2} />
              </View>
              <T v="body" color={colors.textMuted} style={{ flex: 1 }}>
                Все оплаченные заказы на {dayLabel(date).toLowerCase()} уже переданы в цех.
              </T>
            </Card>
          )}

          {s.sheets.length > 0 && (
            <View style={{ gap: space.md }}>
              <SectionTitle title="Сводные накладные" />
              {s.sheets.map((sh) => (
                <Touchable key={sh.id} onPress={() => router.push(`/sheet/${sh.id}`)} style={styles.sheet} scaleTo={0.98}>
                  <View style={styles.sheetIcon}>
                    <Icon name="receipt" size={22} color={colors.mango} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <T v="bodyStrong">
                      Накладная №{sh.number}
                      {sh.isSupplement ? ' · дозаказ' : ''}
                    </T>
                    <T v="small" color={colors.textSoft}>
                      {sh.ordersCount} {plural(sh.ordersCount, 'заказ', 'заказа', 'заказов')} · открыть список для выпечки
                    </T>
                  </View>
                  <Icon name="chevronRight" size={18} color={colors.textSoft} />
                </Touchable>
              ))}
            </View>
          )}
        </>
      ) : null}

      <View style={{ gap: space.md }}>
        <SectionTitle title="В производстве" />
        {inProd.loading ? (
          <Skeleton style={{ height: 80, borderRadius: radius.xl }} />
        ) : inProd.error ? (
          <ErrorState message={inProd.error} onRetry={inProd.refresh} />
        ) : !inProd.data?.length ? (
          <EmptyState icon="chef" title="Печь свободна" text="Заказы в производстве появятся здесь." />
        ) : (
          inProd.data.map((o) => (
            <Card key={o.id} style={{ gap: space.md }} onPress={() => router.push(`/order/${o.id}`)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <View style={{ flex: 1 }}>
                  <T v="h3">
                    №{o.number} · {o.partner?.name}
                  </T>
                  <T v="small" color={colors.textMuted}>
                    на {dayLabel(o.deliveryDate).toLowerCase()} · {money(o.total)}
                  </T>
                </View>
              </View>
              <View style={{ gap: 4 }}>
                {o.items.map((i) => (
                  <View key={i.id} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <T v="body" style={{ flex: 1 }} numberOfLines={1}>
                      {i.name}
                    </T>
                    <T v="bodyStrong" style={{ fontFamily: fonts.extrabold }}>
                      {i.qty} {i.unit}
                    </T>
                  </View>
                ))}
              </View>
              <Button
                title="Готово"
                icon="check"
                onPress={() =>
                  runOrderAction(o, 'READY', () => {
                    inProd.reload();
                    summary.reload();
                  })
                }
              />
            </Card>
          ))
        )}
      </View>
    </Screen>
  );
}

function Stat({ value, label, bg, fg }: { value: number; label: string; bg: string; fg: string }) {
  return (
    <View style={[styles.stat, { backgroundColor: bg }]}>
      <T style={{ fontFamily: fonts.extrabold, fontSize: 32, lineHeight: 38, color: fg }}>{value}</T>
      <T v="caption" color={fg} style={{ opacity: 0.85, letterSpacing: 0 }}>
        {label}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  stat: { flex: 1, borderRadius: radius.xl, padding: space.md, paddingVertical: space.lg },
  okIcon: { width: 44, height: 44, borderRadius: 16, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center' },
  sheet: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    padding: space.lg,
  },
  sheetIcon: { width: 44, height: 44, borderRadius: 16, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
});
