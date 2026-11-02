import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Admin, ExcelPaths } from '../../api/admin';
import { addDaysIso, dateChip, dayLabel, formatPhone, isoDay, money, parseDay, plural, qtyText, todayIso } from '../../lib/format';
import { useLoad } from '../../lib/useLoad';
import { usePersona } from '../../store/auth';
import { colors, fonts, radius, space } from '../../theme';
import { callPhone } from '../contacts';
import { Header, Screen } from '../layout';
import { Button, Chip, ErrorState, Field, Skeleton, T, Touchable } from '../ui';
import { AIcon } from './icons';
import { BarChart, ExcelRow, Group, Label, moneyShort, Note, Segmented, ShareBar, Sheet, TabHeader } from './kit';
import { topDebtors } from './Dashboard';

type Period = 'today' | 'week' | 'month' | 'custom';
type Section = 'overview' | 'debts' | 'excel';
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function range(p: Period, custom: { from: string; to: string }) {
  const t = todayIso();
  if (p === 'today') return { from: t, to: t };
  if (p === 'week') return { from: addDaysIso(t, -6), to: t };
  if (p === 'month') {
    const d = parseDay(t);
    return { from: isoDay(new Date(d.getFullYear(), d.getMonth(), 1)), to: t };
  }
  return custom;
}

function short(iso: string) {
  const d = parseDay(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** Отчёты: продажи за период, график по дням, топы, долги и выгрузки в Excel. */
export function ReportsView({ stack }: { stack?: boolean }) {
  const persona = usePersona();
  const params = useLocalSearchParams<{ section?: string }>();
  const [section, setSection] = useState<Section>(params.section === 'debts' ? 'debts' : 'overview');
  useEffect(() => {
    if (params.section === 'debts' || params.section === 'excel') {
      setSection(params.section);
      if (!stack) router.setParams({ section: undefined });
    }
  }, [params.section, stack]);

  const [period, setPeriod] = useState<Period>('week');
  const [custom, setCustom] = useState({ from: addDaysIso(todayIso(), -13), to: todayIso() });
  const [pickOpen, setPickOpen] = useState(false);
  const r = range(period, custom);

  const sales = useLoad(() => Admin.sales(r.from, r.to), [r.from, r.to]);
  const debts = useLoad(() => Admin.debts(), []);
  const [selDay, setSelDay] = useState<string | undefined>();
  useEffect(() => setSelDay(undefined), [r.from, r.to]);

  const days = useMemo(() => {
    const map = new Map((sales.data?.byDay ?? []).map((d) => [d.date, d]));
    const out: { key: string; label: string; value: number; orders: number }[] = [];
    let cur = r.from;
    let guard = 0;
    while (cur <= r.to && guard++ < 120) {
      const d = map.get(cur);
      out.push({ key: cur, label: String(parseDay(cur).getDate()), value: d?.total ?? 0, orders: d?.orders ?? 0 });
      cur = addDaysIso(cur, 1);
    }
    return out;
  }, [sales.data, r.from, r.to]);
  const sel = days.find((d) => d.key === (selDay ?? days[days.length - 1]?.key));

  const s = sales.data;
  const canOneC = persona === 'admin' || persona === 'accountant';
  const debtors = useMemo(() => topDebtors(debts.data ?? [], 100), [debts.data]);
  const debtTotal = debtors.reduce((a, d) => a + d.total, 0);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {stack && <Header title="Отчёты" />}
      <Screen
        withTabBar={!stack}
        topInset={!stack}
        refreshing={sales.refreshing}
        onRefresh={() => {
          sales.refresh();
          debts.reload();
        }}
      >
        {!stack && <TabHeader title="Отчёты" subtitle="Продажи, долги и выгрузки" />}
        <Segmented
          items={[
            { key: 'overview', label: 'Продажи' },
            { key: 'debts', label: 'Долги', count: debts.data?.length },
            { key: 'excel', label: 'Excel' },
          ]}
          value={section}
          onChange={setSection}
        />

        {section !== 'debts' && (
          <View style={{ gap: space.sm }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.lg }} contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.sm }}>
              <Chip label="Сегодня" active={period === 'today'} onPress={() => setPeriod('today')} />
              <Chip label="7 дней" active={period === 'week'} onPress={() => setPeriod('week')} />
              <Chip label="Этот месяц" active={period === 'month'} onPress={() => setPeriod('month')} />
              <Chip label={period === 'custom' ? `${short(custom.from)} — ${short(custom.to)}` : 'Свой период'} icon="calendar" active={period === 'custom'} onPress={() => setPickOpen(true)} />
            </ScrollView>
            <T v="small" color={colors.textMuted}>
              По дате доставки: {short(r.from)}
              {r.from !== r.to ? ` — ${short(r.to)}` : ''}
            </T>
          </View>
        )}

        {section === 'overview' &&
          (sales.error && !s ? (
            <ErrorState message={sales.error} onRetry={sales.refresh} />
          ) : !s ? (
            <View style={{ gap: space.md }}>
              <Skeleton style={{ height: 120, borderRadius: radius.xl }} />
              <Skeleton style={{ height: 200, borderRadius: radius.xl }} />
            </View>
          ) : (
            <>
              <View style={st.totals}>
                <View style={[st.big]}>
                  <T v="caption" color="rgba(249,245,230,0.7)" style={{ fontFamily: fonts.extrabold, letterSpacing: 0.8 }}>
                    ПРОДАЖИ
                  </T>
                  <T style={{ fontFamily: fonts.extrabold, fontSize: 30, lineHeight: 36 }} color={colors.oatMilk} numberOfLines={1} adjustsFontSizeToFit>
                    {money(s.totals.total) || '0 сом'}
                  </T>
                  <T v="small" color={colors.lime} style={{ fontFamily: fonts.bold }}>
                    {s.totals.orders} {plural(s.totals.orders, 'заказ', 'заказа', 'заказов')}
                    {s.totals.orders ? ` · средний чек ${moneyShort(s.totals.total / s.totals.orders)} сом` : ''}
                  </T>
                  <View style={st.payBar}>
                    <View style={{ flex: Math.max(s.totals.paid, 0.0001), backgroundColor: colors.lime, borderRadius: 4 }} />
                    <View style={{ flex: Math.max(s.totals.unpaid, 0.0001), backgroundColor: 'rgba(249,245,230,0.2)', borderRadius: 4 }} />
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <T v="small" color={colors.oatMilk}>
                      Оплачено {moneyShort(s.totals.paid)}
                    </T>
                    <T v="small" color="rgba(249,245,230,0.7)">
                      Не оплачено {moneyShort(s.totals.unpaid)}
                    </T>
                  </View>
                </View>
              </View>

              {days.length > 1 && (
                <Group>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <View>
                      <T v="h3">По дням</T>
                      <T v="small" color={colors.textMuted}>
                        Нажмите на столбик
                      </T>
                    </View>
                    {sel && (
                      <View style={{ alignItems: 'flex-end' }}>
                        <T v="bodyStrong">{money(sel.value) || '0 сом'}</T>
                        <T v="small" color={colors.textMuted}>
                          {dayLabel(sel.key)} · {sel.orders} {plural(sel.orders, 'заказ', 'заказа', 'заказов')}
                        </T>
                      </View>
                    )}
                  </View>
                  <BarChart data={days} height={170} highlight={sel?.key} onSelect={setSelDay} />
                </Group>
              )}

              <Group>
                <T v="h3">Лучшие партнёры</T>
                {s.byPartner.length === 0 && <T color={colors.textMuted}>Нет продаж за период</T>}
                {s.byPartner.slice(0, 6).map((p, i) => (
                  <View key={p.partnerId} style={{ gap: 5 }}>
                    <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
                      <T v="caption" color={colors.textSoft} style={{ width: 16, fontFamily: fonts.extrabold }}>
                        {i + 1}
                      </T>
                      <T v="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
                        {p.name}
                      </T>
                      <T v="bodyStrong">{moneyShort(p.total)}</T>
                    </View>
                    <View style={{ paddingLeft: 24, gap: 3 }}>
                      <ShareBar value={p.total} max={s.byPartner[0].total} />
                      <T v="caption" color={p.debt ? colors.danger : colors.textSoft}>
                        {p.orders} {plural(p.orders, 'заказ', 'заказа', 'заказов')}
                        {p.debt ? ` · долг ${moneyShort(p.debt)} сом` : ' · всё оплачено'}
                      </T>
                    </View>
                  </View>
                ))}
              </Group>

              <Group>
                <T v="h3">Хиты продаж</T>
                {s.byProduct.length === 0 && <T color={colors.textMuted}>Нет продаж за период</T>}
                {s.byProduct.slice(0, 8).map((p, i) => (
                  <View key={p.productId} style={{ gap: 5 }}>
                    <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
                      <T v="caption" color={colors.textSoft} style={{ width: 16, fontFamily: fonts.extrabold }}>
                        {i + 1}
                      </T>
                      <T v="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
                        {p.name}
                      </T>
                      <T v="small" color={colors.textMuted}>
                        {qtyText(p.qty, p.unit)}
                      </T>
                    </View>
                    <View style={{ paddingLeft: 24, flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                      <View style={{ flex: 1 }}>
                        <ShareBar value={p.total} max={s.byProduct[0].total} color={colors.cambodia} />
                      </View>
                      <T v="caption" style={{ fontFamily: fonts.bold }}>
                        {moneyShort(p.total)}
                      </T>
                    </View>
                  </View>
                ))}
              </Group>
            </>
          ))}

        {section === 'debts' &&
          (debts.loading ? (
            <Skeleton style={{ height: 200, borderRadius: radius.xl }} />
          ) : debts.error ? (
            <ErrorState message={debts.error} onRetry={debts.refresh} />
          ) : (
            <>
              <View style={[st.big, { backgroundColor: debtTotal ? colors.coffee : colors.cambodia }]}>
                <T v="caption" color="rgba(255,255,255,0.7)" style={{ fontFamily: fonts.extrabold, letterSpacing: 0.8 }}>
                  ОДОБРЕНО, НО НЕ ОПЛАЧЕНО
                </T>
                <T style={{ fontFamily: fonts.extrabold, fontSize: 30, lineHeight: 36 }} color={colors.white}>
                  {money(debtTotal) || '0 сом'}
                </T>
                <T v="small" color="rgba(255,255,255,0.8)">
                  {debtors.length} {plural(debtors.length, 'партнёр', 'партнёра', 'партнёров')} · {debts.data?.length ?? 0} {plural(debts.data?.length ?? 0, 'заказ', 'заказа', 'заказов')}
                </T>
              </View>
              {debtors.map((d) => {
                const rows = (debts.data ?? []).filter((x) => x.partnerId === d.partnerId);
                return (
                  <Group key={d.partnerId}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                      <View style={{ flex: 1 }}>
                        <T v="h3" numberOfLines={1}>
                          {d.name}
                        </T>
                        <T v="small" color={colors.textMuted}>
                          {d.phone ? formatPhone(d.phone) : 'Телефон не указан'}
                        </T>
                      </View>
                      <T v="h3" color={colors.coffee}>
                        {money(d.total)}
                      </T>
                      {!!d.phone && (
                        <Touchable haptic onPress={() => callPhone(d.phone!)} style={st.call} accessibilityLabel="Позвонить">
                          <AIcon name="phone" size={18} color={colors.cambodia} />
                        </Touchable>
                      )}
                    </View>
                    <View style={{ gap: 6 }}>
                      {rows.map((x) => (
                        <Touchable key={x.orderId} onPress={() => router.push(`/order/${x.orderId}`)} style={st.debtRow}>
                          <T v="small" style={{ flex: 1, fontFamily: fonts.semibold }}>
                            №{x.number} · доставка {dayLabel(x.deliveryDate).toLowerCase()}
                          </T>
                          <T v="small" style={{ fontFamily: fonts.bold }} color={x.deliveryDate < todayIso() ? colors.danger : colors.text}>
                            {money(x.total)}
                          </T>
                          <AIcon name="chevronRight" size={14} color={colors.textSoft} />
                        </Touchable>
                      ))}
                    </View>
                  </Group>
                );
              })}
              {debtors.length === 0 && <Note icon="check" tone="green" text="Долгов нет — все одобренные заказы оплачены." />}
            </>
          ))}

        {section === 'excel' && <ExcelSection from={r.from} to={r.to} canOneC={canOneC} />}
      </Screen>

      <PeriodSheet
        visible={pickOpen}
        initial={custom}
        onClose={() => setPickOpen(false)}
        onApply={(v) => {
          setCustom(v);
          setPeriod('custom');
          setPickOpen(false);
        }}
      />
    </View>
  );
}

function ExcelSection({ from, to, canOneC }: { from: string; to: string; canOneC: boolean }) {
  const [invDay, setInvDay] = useState(todayIso());
  const inv = useLoad(() => Admin.invoices(invDay), [invDay]);
  const per = `${short(from)}${from !== to ? ` — ${short(to)}` : ''}`;
  return (
    <>
      <View style={{ gap: space.sm }}>
        <Label>За выбранный период</Label>
        <ExcelRow title="Продажи" subtitle={`${per} · по партнёрам, товарам и дням`} file={() => ExcelPaths.sales(from, to)} icon="chart" />
        <ExcelRow title="Реестр заказов" subtitle={`${per} · все позиции`} file={() => ExcelPaths.orders(from, to)} icon="receipt" />
      </View>
      <View style={{ gap: space.sm }}>
        <Label>Накладные на отгрузку</Label>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.lg }} contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.sm }}>
          {[-1, 0, 1, 2].map((i) => {
            const d = addDaysIso(todayIso(), i);
            const c = dateChip(d);
            return <Chip key={d} label={i === 0 ? 'Сегодня' : i === 1 ? 'Завтра' : `${c.weekday}, ${c.day} ${c.month}`} active={d === invDay} onPress={() => setInvDay(d)} />;
          })}
        </ScrollView>
        <ExcelRow
          title={`Накладные на ${dayLabel(invDay).toLowerCase()}`}
          subtitle={inv.data ? `${inv.data.length} ${plural(inv.data.length, 'накладная', 'накладные', 'накладных')} · ${money(inv.data.reduce((a, x) => a + x.total, 0)) || '0 сом'}` : 'Считаем…'}
          file={() => ExcelPaths.invoices(invDay)}
          icon="truck"
          disabled={inv.data?.length === 0}
        />
      </View>
      {canOneC && (
        <View style={{ gap: space.sm }}>
          <Label>1С</Label>
          <ExcelRow title="Выгрузка для 1С" subtitle="Документы, ещё не переданные в 1С" file={() => ExcelPaths.onec(false)} icon="sync" />
          <ExcelRow title="Выгрузить и отметить переданными" subtitle="Чтобы не выгрузить дважды" file={() => ExcelPaths.onec(true)} icon="check" />
        </View>
      )}
      <Note text="Файл откроется в меню «Поделиться» — отправьте его в WhatsApp, на почту или сохраните в Файлы." />
    </>
  );
}

function PeriodSheet({ visible, initial, onClose, onApply }: { visible: boolean; initial: { from: string; to: string }; onClose: () => void; onApply: (v: { from: string; to: string }) => void }) {
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  useEffect(() => {
    if (visible) {
      setFrom(initial.from);
      setTo(initial.to);
    }
  }, [visible, initial.from, initial.to]);
  const t = todayIso();
  const d = parseDay(t);
  const presets = [
    { label: '14 дней', from: addDaysIso(t, -13), to: t },
    { label: '30 дней', from: addDaysIso(t, -29), to: t },
    { label: 'Прошлый месяц', from: isoDay(new Date(d.getFullYear(), d.getMonth() - 1, 1)), to: isoDay(new Date(d.getFullYear(), d.getMonth(), 0)) },
    { label: 'Прошлая неделя', from: addDaysIso(t, -((d.getDay() + 6) % 7) - 7), to: addDaysIso(t, -((d.getDay() + 6) % 7) - 1) },
  ];
  const valid = ISO.test(from) && ISO.test(to) && from <= to;
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Свой период"
      subtitle="По дате доставки"
      footer={<Button title="Показать" onPress={() => onApply({ from, to })} disabled={!valid} />}
    >
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {presets.map((p) => (
          <Chip key={p.label} label={p.label} active={from === p.from && to === p.to} onPress={() => { setFrom(p.from); setTo(p.to); }} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <View style={{ flex: 1 }}>
          <Field style={{ minWidth: 0 }} label="С" value={from} onChangeText={setFrom} placeholder="ГГГГ-ММ-ДД" autoCapitalize="none" maxLength={10} error={from && !ISO.test(from) ? 'ГГГГ-ММ-ДД' : null} />
        </View>
        <View style={{ flex: 1 }}>
          <Field style={{ minWidth: 0 }} label="По" value={to} onChangeText={setTo} placeholder="ГГГГ-ММ-ДД" autoCapitalize="none" maxLength={10} error={to && !ISO.test(to) ? 'ГГГГ-ММ-ДД' : valid || !ISO.test(from) ? null : 'Раньше начала'} />
        </View>
      </View>
    </Sheet>
  );
}

const st = StyleSheet.create({
  totals: { gap: space.md },
  big: { backgroundColor: colors.cambodia, borderRadius: radius.xxl, padding: space.xl, gap: 4 },
  payBar: { flexDirection: 'row', height: 8, gap: 3, marginTop: space.sm, marginBottom: 2 },
  call: { width: 38, height: 38, borderRadius: 13, backgroundColor: colors.oatMilk, alignItems: 'center', justifyContent: 'center' },
  debtRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.oatMilk, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 10 },
});
