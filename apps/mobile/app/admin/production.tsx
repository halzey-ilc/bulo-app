import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Production } from '../../src/api';
import { Admin, ExcelPaths } from '../../src/api/admin';
import { ActionItem, ExcelRow, Group, Label, Note } from '../../src/components/admin/kit';
import { Header, Screen } from '../../src/components/layout';
import { ProductionGroups } from '../../src/components/production';
import { Button, Chip, ErrorState, Skeleton, T } from '../../src/components/ui';
import { addDaysIso, dateLong, dayLabel, money, plural, todayIso } from '../../src/lib/format';
import { useLoad } from '../../src/lib/useLoad';
import { usePersona } from '../../src/store/auth';
import { confirmDialog, toast } from '../../src/store/ui';
import { colors, fonts, radius, space } from '../../src/theme';

/** Сводная накладная для офиса: что печь на дату, сформировать лист, накладные на отгрузку. */
export default function ProductionScreen() {
  const persona = usePersona();
  const canCreate = persona === 'admin' || persona === 'manager';
  const today = todayIso();
  const days = [today, addDaysIso(today, 1), addDaysIso(today, 2)];
  const [date, setDate] = useState(days[1]);
  const summary = useLoad(() => Production.summary(date), [date]);
  const inv = useLoad(() => Admin.invoices(date), [date]);
  const s = summary.data;

  const create = () =>
    confirmDialog({
      title: 'Сформировать сводную?',
      message: `Оплаченные заказы на ${dayLabel(date).toLowerCase()} уйдут в производство.`,
      confirmText: 'Сформировать',
      onConfirm: async () => {
        const sheet = await Production.createSheet(date);
        toast.success(`Сводная №${sheet.number} готова`);
        summary.reload();
        router.push(`/sheet/${sheet.id}`);
      },
    });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Сводная накладная" subtitle={dateLong(date)} />
      <Screen refreshing={summary.refreshing} onRefresh={() => { summary.refresh(); inv.reload(); }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.lg }} contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.sm }}>
          {days.map((d) => (
            <Chip key={d} label={dayLabel(d)} active={d === date} onPress={() => setDate(d)} />
          ))}
        </ScrollView>

        {summary.loading ? (
          <Skeleton style={{ height: 260, borderRadius: radius.xl }} />
        ) : summary.error ? (
          <ErrorState message={summary.error} onRetry={summary.refresh} />
        ) : s ? (
          <>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Box value={s.pending.orders.length} label="оплачено, ждут цех" bg={colors.mango} fg={colors.white} />
              <Box value={s.sheets.length} label={plural(s.sheets.length, 'накладная', 'накладные', 'накладных')} bg={colors.cambodia} fg={colors.oatMilk} />
              <Box value={s.awaitingPayment} label="ждут оплаты" bg={colors.softYellow} fg={colors.cambodia} />
            </View>
            {s.awaitingPayment > 0 && <Note icon="card" tone="yellow" text={`${s.awaitingPayment} ${plural(s.awaitingPayment, 'заказ', 'заказа', 'заказов')} ещё не оплачены — они не попадут в сводную.`} />}
            {s.pending.groups.length > 0 ? (
              <>
                <Label>Что испечь (новые оплаченные)</Label>
                <ProductionGroups groups={s.pending.groups} />
                {canCreate && <Button title="Сформировать сводную накладную" icon="receipt" onPress={create} />}
              </>
            ) : (
              <Group>
                <T v="bodyStrong">Новых оплаченных заказов нет</T>
                <T v="small" color={colors.textMuted}>
                  Всё, что оплачено на {dayLabel(date).toLowerCase()}, уже в производстве.
                </T>
              </Group>
            )}
            {s.sheets.length > 0 && (
              <View style={{ gap: space.sm }}>
                <Label>Сформированные</Label>
                {s.sheets.map((sh) => (
                  <ActionItem key={sh.id} icon="doc" tone="yellow" title={`Сводная №${sh.number}${sh.isSupplement ? ' · дополнение' : ''}`} subtitle={`${sh.ordersCount} ${plural(sh.ordersCount, 'заказ', 'заказа', 'заказов')}`} onPress={() => router.push(`/sheet/${sh.id}`)} />
                ))}
              </View>
            )}
          </>
        ) : null}

        <View style={{ gap: space.sm }}>
          <Label>Отгрузка</Label>
          <ExcelRow
            title={`Накладные на ${dayLabel(date).toLowerCase()}`}
            subtitle={inv.data ? `${inv.data.length} ${plural(inv.data.length, 'накладная', 'накладные', 'накладных')} · ${money(inv.data.reduce((a, x) => a + x.total, 0)) || '0 сом'}` : 'Считаем…'}
            file={() => ExcelPaths.invoices(date)}
            icon="truck"
            disabled={inv.data?.length === 0}
          />
        </View>
      </Screen>
    </View>
  );
}

function Box({ value, label, bg, fg }: { value: number; label: string; bg: string; fg: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: bg, borderRadius: radius.lg, padding: space.md }}>
      <T style={{ fontFamily: fonts.extrabold, fontSize: 26, lineHeight: 30 }} color={fg}>
        {value}
      </T>
      <T v="caption" color={fg} style={{ fontFamily: fonts.bold, opacity: 0.85 }}>
        {label}
      </T>
    </View>
  );
}
