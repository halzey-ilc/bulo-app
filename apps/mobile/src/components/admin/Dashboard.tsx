import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Svg, { Circle } from 'react-native-svg';
import { Admin, Dashboard as DashboardData, DebtRow, ExcelPaths, OfficeOrder } from '../../api/admin';
import { addDaysIso, dateLong, dayLabel, greeting, isoDay, money, parseDay, plural, todayIso } from '../../lib/format';
import { useLoad } from '../../lib/useLoad';
import { useAuth, usePersona } from '../../store/auth';
import { colors, fonts, radius, shadows, space } from '../../theme';
import { Screen } from '../layout';
import { ErrorState, Skeleton, T, Touchable } from '../ui';
import { AIcon, AIconName } from './icons';
import { ActionItem, ago, BarChart, ExcelRow, Group, KpiCard, Label, moneyShort, PulseDot, RoundButton, ShareBar, Sparkline, useAutoRefresh } from './kit';

const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

/** Последние 7 дней по дате доставки: заполняем пустые дни нулями. */
function useWeekRevenue() {
  const today = todayIso();
  const from = addDaysIso(today, -6);
  const sales = useLoad(() => Admin.sales(from, today), [from, today]);
  const days = useMemo(() => {
    const map = new Map((sales.data?.byDay ?? []).map((d) => [d.date, d.total]));
    return Array.from({ length: 7 }, (_, i) => {
      const iso = addDaysIso(from, i);
      return { key: iso, label: i === 6 ? 'сег' : WD[parseDay(iso).getDay()], value: map.get(iso) ?? 0 };
    });
  }, [sales.data, from]);
  return { sales, days };
}

export function weekStartIso() {
  const d = new Date();
  const wd = (d.getDay() + 6) % 7; // пн = 0
  return addDaysIso(todayIso(), -wd);
}

function firstName(name?: string | null) {
  return (name || '').split(/\s+/)[0] || '';
}

type RKey = 'today' | 'week' | 'month';

/** Выручка: кофейня (по филиалам) и партнёры — сегодня, 7 дней, месяц. */
export function RevenueCard() {
  const rev = useLoad(() => Admin.revenue(), []);
  const [k, setK] = useState<RKey>('today');
  useAutoRefresh(() => rev.reload(), 60000);
  const p = rev.data?.[k];
  const total = p?.total ?? 0;
  const cafeShare = total ? (p!.cafe.total / total) * 100 : 0;
  return (
    <Group>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <T v="h3">Выручка</T>
        <View style={st.rtabs}>
          {(
            [
              ['today', 'Сегодня'],
              ['week', '7 дней'],
              ['month', 'Месяц'],
            ] as [RKey, string][]
          ).map(([key, label]) => (
            <Touchable key={key} haptic onPress={() => setK(key)} style={[st.rtab, k === key && st.rtabOn]}>
              <T v="caption" color={k === key ? colors.white : colors.textMuted} style={{ fontFamily: fonts.bold }}>
                {label}
              </T>
            </Touchable>
          ))}
        </View>
      </View>
      {rev.loading || !p ? (
        <Skeleton style={{ height: 170 }} />
      ) : (
        <>
          <T style={{ fontFamily: fonts.extrabold, fontSize: 30, lineHeight: 36, letterSpacing: -0.5 }}>{money(total) || '0 сом'}</T>
          <View style={st.split}>
            <View style={{ width: `${cafeShare}%`, backgroundColor: colors.coffee }} />
            <View style={{ flex: 1, backgroundColor: colors.mango }} />
          </View>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Touchable style={[st.rtile, { backgroundColor: colors.coffeeSoft }]} onPress={() => router.navigate({ pathname: '/orders', params: { f: 'all' } })}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <AIcon name="coffee" size={16} color={colors.coffee} strokeWidth={2} />
                <T v="caption" color={colors.coffee} style={{ fontFamily: fonts.extrabold }}>
                  КОФЕЙНЯ
                </T>
              </View>
              <T v="h2" color={colors.coffee}>
                {money(p.cafe.total) || '0 сом'}
              </T>
              <T v="small" color={colors.textMuted}>
                {p.cafe.orders} {plural(p.cafe.orders, 'бронь', 'брони', 'броней')}
                {p.cafe.freeCoffees ? ` · 🎁 ${p.cafe.freeCoffees}` : ''}
              </T>
            </Touchable>
            <Touchable style={[st.rtile, { backgroundColor: colors.primarySoft }]} onPress={() => router.push('/admin/reports')}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <AIcon name="handshake" size={16} color={colors.mango} strokeWidth={2} />
                <T v="caption" color={colors.mango} style={{ fontFamily: fonts.extrabold }}>
                  ПАРТНЁРЫ
                </T>
              </View>
              <T v="h2" color={colors.mango}>
                {money(p.partners.total) || '0 сом'}
              </T>
              <T v="small" color={colors.textMuted}>
                {p.partners.orders} {plural(p.partners.orders, 'заказ', 'заказа', 'заказов')}
                {p.partners.unpaid ? ` · долг ${moneyShort(p.partners.unpaid)}` : ''}
              </T>
            </Touchable>
          </View>
          {p.byBranch.length > 0 && (
            <View style={{ gap: 6 }}>
              {p.byBranch.map((b) => (
                <View key={b.branchId} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                  <T v="small" style={{ width: 90, fontFamily: fonts.semibold }} numberOfLines={1}>
                    {b.name}
                  </T>
                  <View style={{ flex: 1 }}>
                    <ShareBar value={b.total} max={Math.max(...p.byBranch.map((x) => x.total), 1)} color={colors.coffee} />
                  </View>
                  <T v="small" style={{ fontFamily: fonts.bold }}>
                    {moneyShort(b.total)}
                  </T>
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </Group>
  );
}

/* ───────────────── Админ и менеджер ───────────────── */

export function OfficeDashboard() {
  const user = useAuth((s) => s.user);
  const persona = usePersona();
  const isAdmin = persona === 'admin';
  const dash = useLoad(() => Admin.dashboard(), []);
  const queue = useLoad(() => Admin.orders({ status: ['NEW', 'APPROVED', 'PAID', 'IN_PRODUCTION', 'READY', 'SHIPPED'] }), []);
  const pending = useLoad(() => Admin.partners({ status: 'PENDING' }), []);
  const { sales, days } = useWeekRevenue();

  const reloadAll = () => {
    dash.reload();
    queue.reload();
    pending.reload();
    sales.reload();
  };
  useAutoRefresh(reloadAll, 60000);

  const d = dash.data;
  const attention = useMemo(() => buildAttention(queue.data ?? [], pending.data ?? [], isAdmin ? d?.onecErrors ?? 0 : 0), [queue.data, pending.data, d?.onecErrors, isAdmin]);
  const weekTotal = days.reduce((a, b) => a + b.value, 0);

  const go = (f: string, extra: Record<string, string> = {}) => router.navigate({ pathname: '/orders', params: { f, ...extra } });

  return (
    <Screen
      withTabBar
      topInset
      refreshing={dash.refreshing}
      onRefresh={() => {
        dash.refresh();
        queue.reload();
        pending.reload();
        sales.reload();
      }}
    >
      <Greeting name={firstName(user?.name)} today={d?.today} right={<RoundButton icon="bell" onPress={() => router.push('/notifications')} label="Уведомления" />} />

      {dash.error && !d ? (
        <ErrorState message={dash.error} onRetry={dash.refresh} />
      ) : !d ? (
        <DashSkeleton />
      ) : (
        <>
          {/* Герой: доставки сегодня + выручка недели */}
          <Touchable onPress={() => go('all', { d: 'today' })} scaleTo={0.98} style={st.hero}>
            <HeroDecor />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <View style={st.heroBadge}>
                <AIcon name="truck" size={16} color={colors.cambodia} strokeWidth={2} />
              </View>
              <T v="small" color="rgba(249,245,230,0.8)" style={{ fontFamily: fonts.bold }}>
                Доставки сегодня
              </T>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: space.md }}>
              <View>
                <T style={{ fontFamily: fonts.extrabold, fontSize: 40, lineHeight: 44, letterSpacing: -1 }} color={colors.oatMilk}>
                  {d.todayDeliveries.count}
                  <T style={{ fontFamily: fonts.bold, fontSize: 16 }} color="rgba(249,245,230,0.7)">
                    {' '}
                    {plural(d.todayDeliveries.count, 'заказ', 'заказа', 'заказов')}
                  </T>
                </T>
                <T v="bodyStrong" color={colors.lime}>
                  {money(d.todayDeliveries.total) || '0 сом'}
                </T>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                <Sparkline values={days.map((x) => x.value)} width={110} height={40} color={colors.lime} />
                <T v="caption" color="rgba(249,245,230,0.7)">
                  7 дней · {moneyShort(weekTotal)} сом
                </T>
              </View>
            </View>
          </Touchable>

          {/* Выручка: кофейня и партнёры */}
          <RevenueCard />

          {/* KPI */}
          <View style={st.grid}>
            <KpiCard
              style={st.cell}
              icon="check"
              tone={d.newOrders ? 'mango' : 'white'}
              pulse={d.newOrders > 0}
              value={d.newOrders}
              label="Подтвердить"
              sub={d.newOrders ? (d.claimed ? `${d.claimed} уже оплатили` : 'Ждут оплаты') : 'Всё подтверждено'}
              onPress={() => go('confirm')}
            />
            <KpiCard
              style={st.cell}
              icon="coffee"
              tone={d.cafeActive ? 'pink' : 'white'}
              value={d.cafeActive ?? 0}
              label="Брони кофейни"
              sub={d.cafeActive ? 'Собрать и выдать' : 'Сейчас нет'}
              onPress={() => go('cafe')}
            />
            <KpiCard style={st.cell} icon="chef" tone="white" value={d.paid + d.inProduction} label="В цеху" sub={d.paid ? `${d.paid} оплачено, ждут цех` : 'Цех работает'} onPress={() => go('work')} />
            <KpiCard
              style={st.cell}
              icon="card"
              tone="yellow"
              value={d.awaitingPayment.count}
              label="Не оплачены"
              sub={d.awaitingPayment.count ? money(d.awaitingPayment.total) : "Долгов нет"}
              onPress={() => go('debt')}
            />
            <KpiCard
              style={st.cell}
              icon="handshake"
              tone={d.pendingPartners ? 'ice' : 'white'}
              pulse={d.pendingPartners > 0}
              value={d.pendingPartners}
              label="Заявки партнёров"
              sub={d.pendingPartners ? 'Ждут проверки' : 'Новых нет'}
              onPress={() => router.navigate({ pathname: '/people', params: { seg: 'apps' } })}
            />
            {isAdmin ? (
              <KpiCard
                style={st.cell}
                icon="sync"
                tone={d.onecErrors ? 'danger' : 'white'}
                value={d.onecErrors}
                label="Ошибки 1С"
                sub={d.onecErrors ? 'Нужно повторить' : 'Обмен в порядке'}
                onPress={() => router.push('/admin/onec')}
              />
            ) : (
              <KpiCard style={st.cell} icon="chart" tone="white" value={moneyShort(weekTotal)} label="Выручка 7 дней" sub="по дате доставки" onPress={() => router.push('/admin/reports')} />
            )}
          </View>

          {/* Нужно внимание */}
          <Attention items={attention} loading={queue.loading || pending.loading} />

          {/* Быстрые действия */}
          <View style={{ gap: space.md }}>
            <Label>Быстрые действия</Label>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.lg }} contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.sm }}>
              {isAdmin && <Quick icon="users" label={'Сотрудник\nили клиент'} tone={colors.cambodia} fg={colors.lime} onPress={() => router.navigate({ pathname: '/people', params: { seg: 'staff', create: '1' } })} />}
              <Quick icon="handshake" label={'Добавить\nпартнёра'} tone={colors.iceCube} fg={colors.blueberry} onPress={() => router.navigate({ pathname: '/people', params: { seg: 'partners', create: '1' } })} />
              <Quick icon="doc" label={'Сводная\nнакладная'} tone={colors.softYellow} fg="#8A5A00" onPress={() => router.push('/admin/production')} />
              <Quick icon="tag" label={'Каталог\nи цены'} tone={colors.primarySoft} fg={colors.mango} onPress={() => router.push('/admin/catalog')} />
              <Quick icon="image" label={'Истории\nна главной'} tone={colors.coffeeSoft} fg={colors.coffee} onPress={() => router.push('/admin/stories')} />
              <Quick icon="coffee" label={'Филиалы\nи меню'} tone={colors.softYellow} fg={colors.coffee} onPress={() => router.push('/admin/branches')} />
              <Quick icon="chart" label={'Отчёты\nи Excel'} tone="#E6EBC4" fg={colors.cambodia} onPress={() => router.push('/admin/reports')} />
              <Quick icon="settings" label={'Настройки'} tone={colors.white} fg={colors.cambodia} onPress={() => router.push('/admin/settings')} />
            </ScrollView>
          </View>

          {/* Выручка за неделю */}
          <Group>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View>
                <T v="h3">Выручка за 7 дней</T>
                <T v="small" color={colors.textMuted}>
                  {sales.data ? `${sales.data.totals.orders} ${plural(sales.data.totals.orders, 'заказ', 'заказа', 'заказов')} · оплачено ${moneyShort(sales.data.totals.paid)} сом` : 'Загружаем…'}
                </T>
              </View>
              <Touchable onPress={() => router.push('/admin/reports')} haptic>
                <T v="small" color={colors.mango} style={{ fontFamily: fonts.bold }}>
                  Отчёты
                </T>
              </Touchable>
            </View>
            {sales.loading ? <Skeleton style={{ height: 150 }} /> : <BarChart data={days} valueLabel={(v) => moneyShort(v)} />}
          </Group>
        </>
      )}
    </Screen>
  );
}

interface AttentionItem {
  key: string;
  icon: AIconName;
  tone: string;
  fg: string;
  title: string;
  sub: string;
  onPress: () => void;
}

function buildAttention(orders: OfficeOrder[], pending: { id: string; name: string; contactName: string; createdAt: string }[], onecErrors: number): AttentionItem[] {
  const out: AttentionItem[] = [];
  const now = Date.now();
  const tomorrow = addDaysIso(todayIso(), 1);
  if (onecErrors > 0)
    out.push({
      key: 'onec',
      icon: 'alert',
      tone: colors.dangerSoft,
      fg: colors.danger,
      title: `1С: ${onecErrors} ${plural(onecErrors, 'документ', 'документа', 'документов')} с ошибкой`,
      sub: 'Откройте и отправьте повторно',
      onPress: () => router.push('/admin/onec'),
    });
  for (const p of pending.slice(0, 3))
    out.push({
      key: `p${p.id}`,
      icon: 'handshake',
      tone: colors.iceCube,
      fg: colors.blueberry,
      title: `Заявка: ${p.name}`,
      sub: `${p.contactName} · ${ago(p.createdAt)}`,
      onPress: () => router.push(`/admin/partner/${p.id}`),
    });
  const stale = orders.filter((o) => o.status === 'NEW' && now - new Date(o.createdAt).getTime() > 2 * 3600_000).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const o of stale.slice(0, 3))
    out.push({
      key: `o${o.id}`,
      icon: 'hourglass',
      tone: colors.primarySoft,
      fg: colors.mango,
      title: `Заказ №${o.number} не в цехе уже ${ago(o.createdAt).replace(' назад', '')}`,
      sub: `${o.partner?.name} · ${money(o.total)}`,
      onPress: () => router.push(`/order/${o.id}`),
    });
  const unpaid = orders.filter((o) => !o.paidAt && o.deliveryDate <= tomorrow);
  if (unpaid.length)
    out.push({
      key: 'unpaid',
      icon: 'card',
      tone: colors.softYellow,
      fg: '#8A5A00',
      title: `${unpaid.length} ${plural(unpaid.length, 'заказ', 'заказа', 'заказов')} без оплаты к завтрашней доставке`,
      sub: money(unpaid.reduce((a, o) => a + o.total, 0)),
      onPress: () => router.navigate({ pathname: '/orders', params: { f: 'approved' } }),
    });
  return out;
}

function Attention({ items, loading }: { items: AttentionItem[]; loading?: boolean }) {
  return (
    <View style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
        <Label>Нужно внимание</Label>
        {items.length > 0 && <PulseDot size={7} />}
      </View>
      {loading && !items.length ? (
        <Skeleton style={{ height: 72, borderRadius: radius.xl }} />
      ) : items.length === 0 ? (
        <View style={[st.calm]}>
          <AIcon name="sun" size={22} color={colors.success} />
          <T v="bodyStrong" color={colors.success} style={{ flex: 1 }}>
            Срочного нет — всё под контролем
          </T>
        </View>
      ) : (
        <View style={{ gap: space.sm }}>
          {items.map((a) => (
            <Touchable key={a.key} onPress={a.onPress} haptic scaleTo={0.98} style={st.attn}>
              <View style={[st.attnIcon, { backgroundColor: a.tone }]}>
                <AIcon name={a.icon} size={20} color={a.fg} strokeWidth={1.9} />
              </View>
              <View style={{ flex: 1 }}>
                <T v="bodyStrong" numberOfLines={2}>
                  {a.title}
                </T>
                <T v="small" color={colors.textMuted} numberOfLines={1}>
                  {a.sub}
                </T>
              </View>
              <AIcon name="chevronRight" size={18} color={colors.textSoft} />
            </Touchable>
          ))}
        </View>
      )}
    </View>
  );
}

function Quick({ icon, label, tone, fg, onPress }: { icon: AIconName; label: string; tone: string; fg: string; onPress: () => void }) {
  return (
    <Touchable onPress={onPress} haptic scaleTo={0.94} style={[st.quick, { backgroundColor: tone }]}>
      <View style={[st.quickIcon, { backgroundColor: tone === colors.white ? colors.oatMilk : 'rgba(255,255,255,0.55)' }]}>
        <AIcon name={icon} size={22} color={fg} strokeWidth={1.8} />
      </View>
      <T v="small" color={tone === colors.cambodia ? colors.oatMilk : colors.text} style={{ fontFamily: fonts.bold, lineHeight: 16 }}>
        {label}
      </T>
    </Touchable>
  );
}

function Greeting({ name, today, right }: { name: string; today?: string; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
      <View style={{ flex: 1 }}>
        <T v="small" color={colors.textMuted} style={{ fontFamily: fonts.semibold }}>
          {dateLong(today ?? todayIso())}
        </T>
        <T v="h1" numberOfLines={1}>
          {greeting()}
          {name ? `, ${name}` : ''}
        </T>
      </View>
      {right}
    </View>
  );
}

function HeroDecor() {
  return (
    <Svg style={StyleSheet.absoluteFill} viewBox="0 0 340 170" preserveAspectRatio="xMidYMid slice">
      <Circle cx={330} cy={-10} r={80} fill={colors.mango} opacity={0.35} />
      <Circle cx={250} cy={180} r={50} fill={colors.lime} opacity={0.1} />
      <Circle cx={30} cy={160} r={26} fill={colors.softYellow} opacity={0.08} />
    </Svg>
  );
}

function DashSkeleton() {
  return (
    <View style={{ gap: space.md }}>
      <Skeleton style={{ height: 150, borderRadius: radius.xxl }} />
      <View style={st.grid}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} style={[st.cell, { height: 132, borderRadius: radius.xl }]} />
        ))}
      </View>
      <Skeleton style={{ height: 72, borderRadius: radius.xl }} />
    </View>
  );
}

/* ───────────────── Бухгалтер ───────────────── */

export function AccountantDashboard() {
  const user = useAuth((s) => s.user);
  const today = todayIso();
  const weekStart = weekStartIso();
  const dash = useLoad(() => Admin.dashboard(), []);
  const debts = useLoad(() => Admin.debts(), []);
  const paidWeek = useLoad(
    () => Admin.orders({ status: ['NEW', 'APPROVED', 'PAID', 'IN_PRODUCTION', 'READY', 'SHIPPED', 'DELIVERED'], paid: true, dateFrom: addDaysIso(weekStart, -21) }),
    [weekStart],
  );
  const onec = useLoad(() => Admin.onecStatus(), []);
  const { sales, days } = useWeekRevenue();

  useAutoRefresh(() => {
    dash.reload();
    debts.reload();
    paidWeek.reload();
    onec.reload();
  }, 60000);

  const dueToday = useMemo(() => (debts.data ?? []).filter((r) => r.deliveryDate <= today), [debts.data, today]);
  const dueSum = dueToday.reduce((a, r) => a + r.total, 0);
  const paidOrders = useMemo(() => (paidWeek.data ?? []).filter((o) => o.paidAt && isoDay(new Date(o.paidAt)) >= weekStart), [paidWeek.data, weekStart]);
  const paidSum = paidOrders.reduce((a, o) => a + o.total, 0);
  const paidToday = paidOrders.filter((o) => isTodayTs(o.paidAt!)).reduce((a, o) => a + o.total, 0);
  const top = useMemo(() => topDebtors(debts.data ?? []), [debts.data]);
  const d = dash.data;

  return (
    <Screen
      withTabBar
      topInset
      refreshing={dash.refreshing}
      onRefresh={() => {
        dash.refresh();
        debts.reload();
        paidWeek.reload();
        onec.reload();
        sales.reload();
      }}
    >
      <Greeting name={firstName(user?.name)} today={d?.today} right={<RoundButton icon="bell" onPress={() => router.push('/notifications')} label="Уведомления" />} />
      {dash.error && !d ? (
        <ErrorState message={dash.error} onRetry={dash.refresh} />
      ) : !d ? (
        <DashSkeleton />
      ) : (
        <>
          <Touchable onPress={() => router.navigate('/payments')} scaleTo={0.98} style={st.hero}>
            <HeroDecor />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <View style={st.heroBadge}>
                <AIcon name="wallet" size={16} color={colors.cambodia} strokeWidth={2} />
              </View>
              <T v="small" color="rgba(249,245,230,0.8)" style={{ fontFamily: fonts.bold }}>
                Ждут оплаты всего
              </T>
            </View>
            <T style={{ fontFamily: fonts.extrabold, fontSize: 36, lineHeight: 42, letterSpacing: -1, marginTop: space.md }} color={colors.oatMilk} numberOfLines={1} adjustsFontSizeToFit>
              {money(d.awaitingPayment.total) || '0 сом'}
            </T>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <T v="bodyStrong" color={colors.lime}>
                {d.awaitingPayment.count} {plural(d.awaitingPayment.count, 'заказ', 'заказа', 'заказов')} в очереди
              </T>
              <View style={st.heroCta}>
                <T v="small" color={colors.cambodia} style={{ fontFamily: fonts.extrabold }}>
                  Принять оплату
                </T>
                <AIcon name="arrowRight" size={14} color={colors.cambodia} strokeWidth={2.2} />
              </View>
            </View>
          </Touchable>

          <View style={st.grid}>
            <KpiCard style={st.cell} icon="clock" tone={dueToday.length ? 'mango' : 'white'} pulse={dueToday.length > 0} value={moneyShort(dueSum)} label="К оплате сегодня" sub={`${dueToday.length} ${plural(dueToday.length, 'заказ', 'заказа', 'заказов')} с доставкой до сегодня`} onPress={() => router.navigate('/payments')} />
            <KpiCard style={st.cell} icon="check" tone="green" value={moneyShort(paidSum)} label="Оплаты недели" sub={paidToday ? `сегодня ${moneyShort(paidToday)} сом` : `${paidOrders.length} ${plural(paidOrders.length, 'оплата', 'оплаты', 'оплат')}`} onPress={() => router.navigate({ pathname: '/payments', params: { tab: 'paid' } })} />
            <KpiCard style={st.cell} icon="truck" tone="white" value={d.todayDeliveries.count} label="Доставки сегодня" sub={money(d.todayDeliveries.total) || '—'} onPress={() => router.push({ pathname: '/admin/orders', params: { f: 'all', d: 'today' } })} />
            <KpiCard style={st.cell} icon="sync" tone={d.onecErrors ? 'danger' : 'ice'} value={onec.data ? onec.data.pending + onec.data.errors : d.onecErrors} label="1С: к выгрузке" sub={d.onecErrors ? `${d.onecErrors} с ошибкой` : 'Ошибок нет'} onPress={() => router.push('/admin/onec')} />
          </View>

          {/* Долги по партнёрам */}
          <Group>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <T v="h3">Кто должен</T>
              <Touchable onPress={() => router.navigate({ pathname: '/reports', params: { section: 'debts' } })} haptic>
                <T v="small" color={colors.mango} style={{ fontFamily: fonts.bold }}>
                  Все долги
                </T>
              </Touchable>
            </View>
            {debts.loading ? (
              <Skeleton style={{ height: 120 }} />
            ) : top.length === 0 ? (
              <T v="body" color={colors.textMuted}>
                Долгов нет — все одобренные заказы оплачены.
              </T>
            ) : (
              top.map((p, i) => (
                <View key={p.partnerId} style={{ gap: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                    <T v="caption" color={colors.textSoft} style={{ width: 16, fontFamily: fonts.extrabold }}>
                      {i + 1}
                    </T>
                    <T v="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
                      {p.name}
                    </T>
                    <T v="bodyStrong">{money(p.total)}</T>
                  </View>
                  <View style={{ paddingLeft: 24 }}>
                    <ShareBar value={p.total} max={top[0].total} color={i === 0 ? colors.mango : colors.coffee} />
                    <T v="caption" color={colors.textSoft} style={{ marginTop: 3 }}>
                      {p.count} {plural(p.count, 'заказ', 'заказа', 'заказов')} · самый ранний на {dayLabel(p.oldest).toLowerCase()}
                    </T>
                  </View>
                </View>
              ))
            )}
          </Group>

          {/* Поступления по дням */}
          <Group>
            <T v="h3">Продажи за 7 дней</T>
            {sales.loading ? <Skeleton style={{ height: 150 }} /> : <BarChart data={days} valueLabel={(v) => moneyShort(v)} color={colors.cambodia} muted="#E6EBC4" />}
          </Group>

          {/* 1С */}
          <OneCCard />
        </>
      )}
    </Screen>
  );
}

function isTodayTs(ts: string) {
  const d = new Date(ts);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

export function topDebtors(rows: DebtRow[], limit = 5) {
  const m = new Map<string, { partnerId: string; name: string; total: number; count: number; oldest: string; phone: string | null }>();
  for (const r of rows) {
    const key = r.partnerId ?? `guest:${r.partner}`;
    const p = m.get(key) ?? { partnerId: key, name: r.partner, total: 0, count: 0, oldest: r.deliveryDate, phone: r.phone };
    p.total += r.total;
    p.count++;
    if (r.deliveryDate < p.oldest) p.oldest = r.deliveryDate;
    m.set(key, p);
  }
  return [...m.values()].sort((a, b) => b.total - a.total).slice(0, limit);
}

/** Карточка состояния обмена с 1С. Используется на пульте бухгалтера и в настройках. */
export function OneCCard({ compact }: { compact?: boolean }) {
  const st1 = useLoad(() => Admin.onecStatus(), []);
  const s = st1.data;
  const ok = s && !s.errors;
  return (
    <Group>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <View style={[st.attnIcon, { backgroundColor: ok ? '#DDEFD9' : s ? colors.dangerSoft : colors.oatMilk }]}>
          <AIcon name="sync" size={20} color={ok ? colors.success : s ? colors.danger : colors.textSoft} />
        </View>
        <View style={{ flex: 1 }}>
          <T v="h3">Обмен с 1С</T>
          <T v="small" color={colors.textMuted}>
            {!s ? 'Проверяем…' : s.lastOut ? `Последняя выгрузка ${ago(s.lastOut.createdAt)}` : 'Выгрузок ещё не было'}
          </T>
        </View>
      </View>
      {s && (
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Stat label="Ждут" value={s.pending} color={colors.blueberry} bg={colors.iceCube} />
          <Stat label="Ошибки" value={s.errors} color={s.errors ? colors.danger : colors.textMuted} bg={s.errors ? colors.dangerSoft : colors.oatMilk} />
          <Stat label="Переданы" value={s.sent} color={colors.success} bg="#DDEFD9" />
        </View>
      )}
      {!compact && (
        <View style={{ gap: space.sm }}>
          <ExcelRow title="Выгрузить в Excel" subtitle="Документы, ещё не переданные в 1С" file={() => ExcelPaths.onec(false)} />
          <ActionItem icon="doc" title="Документы и ошибки" subtitle="Повторная отправка" onPress={() => router.push('/admin/onec')} />
        </View>
      )}
    </Group>
  );
}

function Stat({ label, value, color, bg }: { label: string; value: number; color: string; bg: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: bg, borderRadius: radius.lg, padding: space.md, gap: 2 }}>
      <T style={{ fontFamily: fonts.extrabold, fontSize: 22, lineHeight: 26 }} color={color}>
        {value}
      </T>
      <T v="caption" color={color} style={{ fontFamily: fonts.bold }}>
        {label}
      </T>
    </View>
  );
}

export type { DashboardData };

const st = StyleSheet.create({
  rtabs: { flexDirection: "row", backgroundColor: colors.oatMilk, borderRadius: 999, padding: 3, gap: 2 },
  rtab: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  rtabOn: { backgroundColor: colors.cambodia },
  split: { flexDirection: "row", height: 8, borderRadius: 4, overflow: "hidden", backgroundColor: colors.oatMilk },
  rtile: { flex: 1, borderRadius: radius.lg, padding: space.md, gap: 2 },
  hero: { backgroundColor: colors.cambodia, borderRadius: radius.xxl, padding: space.xl, overflow: 'hidden', ...shadows.card },
  heroBadge: { width: 28, height: 28, borderRadius: 10, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' },
  heroCta: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.lime, paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  cell: { width: '47.8%', flexGrow: 1 },
  attn: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.white, padding: space.md, borderRadius: radius.lg, ...shadows.soft },
  attnIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  calm: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: '#DDEFD9', padding: space.lg, borderRadius: radius.lg },
  quick: { width: 108, height: 108, borderRadius: radius.xl, padding: space.md, justifyContent: 'space-between', ...shadows.soft },
  quickIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
