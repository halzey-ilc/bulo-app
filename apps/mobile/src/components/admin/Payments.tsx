import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, RefreshControl, SectionList, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { errorMessage, Orders } from '../../api';
import { Admin, OfficeOrder } from '../../api/admin';
import { addDaysIso, dateChip, dayLabel, formatPhone, money, plural, todayIso } from '../../lib/format';
import { useLoad } from '../../lib/useLoad';
import { toast } from '../../store/ui';
import { colors, fonts, radius, shadows, space } from '../../theme';
import { callPhone } from '../contacts';
import { TAB_BAR_SPACE } from '../layout';
import { Button, EmptyState, ErrorState, T, Touchable } from '../ui';
import { AIcon } from './icons';
import { ListSkeleton, moneyShort, Pill, SearchBar, Segmented, TabHeader, useAutoRefresh } from './kit';
import { PAY_METHODS, PayMethodSheet } from './Sheets';

type Tab = 'queue' | 'paid';
const UNDO_MS = 5000;

interface Pending {
  order: OfficeOrder;
  method: string;
  timer: ReturnType<typeof setTimeout>;
}

/** Оплаты: очередь одобренных заказов и отметка «Оплата получена» с отменой. */
export function PaymentsView() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === 'paid' ? 'paid' : 'queue');
  useEffect(() => {
    if (params.tab === 'paid' || params.tab === 'queue') {
      setTab(params.tab);
      router.setParams({ tab: undefined });
    }
  }, [params.tab]);

  const [query, setQuery] = useState('');
  const queue = useLoad(() => Admin.orders({ status: ['APPROVED'] }), []);
  const paid = useLoad(() => Admin.orders({ status: ['PAID', 'IN_PRODUCTION', 'READY', 'SHIPPED', 'DELIVERED'], dateFrom: addDaysIso(todayIso(), -30) }), []);
  useAutoRefresh(() => {
    queue.reload();
    paid.reload();
  }, 60000);

  const [paying, setPaying] = useState<OfficeOrder | null>(null);
  const pending = useRef(new Map<string, Pending>());
  const [undo, setUndo] = useState<{ order: OfficeOrder; method: string } | null>(null);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());

  /** Отправка на сервер после окна отмены. */
  const commit = useCallback(
    async (id: string) => {
      const p = pending.current.get(id);
      if (!p) return;
      pending.current.delete(id);
      clearTimeout(p.timer);
      setUndo((u) => (u?.order.id === id ? null : u));
      try {
        await Orders.setStatus(id, 'PAID', { paymentMethod: p.method });
        paid.reload();
        queue.reload();
      } catch (e) {
        setHiddenIds((s) => {
          const n = new Set(s);
          n.delete(id);
          return n;
        });
        toast.error(`№${p.order.number}: ${errorMessage(e)}`);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Уходим с экрана — отправляем всё, что ждёт.
  useEffect(() => {
    const map = pending.current;
    return () => {
      for (const id of [...map.keys()]) void commit(id);
    };
  }, [commit]);

  const markPaid = (o: OfficeOrder, method: string) => {
    setHiddenIds((s) => new Set(s).add(o.id));
    const timer = setTimeout(() => void commit(o.id), UNDO_MS);
    pending.current.set(o.id, { order: o, method, timer });
    setUndo({ order: o, method });
  };

  const undoLast = () => {
    if (!undo) return;
    const p = pending.current.get(undo.order.id);
    if (p) clearTimeout(p.timer);
    pending.current.delete(undo.order.id);
    setHiddenIds((s) => {
      const n = new Set(s);
      n.delete(undo.order.id);
      return n;
    });
    setUndo(null);
    toast.info(`Оплата №${undo.order.number} отменена`);
  };

  const today = todayIso();
  const q = query.toLowerCase();
  const match = (o: OfficeOrder) => !q || o.partner?.name.toLowerCase().includes(q) || String(o.number) === q;

  const queueItems = useMemo(() => (queue.data ?? []).filter((o) => !hiddenIds.has(o.id) && match(o)), [queue.data, hiddenIds, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const queueSections = useMemo(() => {
    const m = new Map<string, OfficeOrder[]>();
    for (const o of [...queueItems].sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate) || a.number - b.number)) {
      const arr = m.get(o.deliveryDate) ?? [];
      arr.push(o);
      m.set(o.deliveryDate, arr);
    }
    return [...m].map(([date, data]) => ({ key: date, date, total: data.reduce((a, o) => a + o.total, 0), data }));
  }, [queueItems]);

  const paidToday = useMemo(
    () => (paid.data ?? []).filter((o) => o.paidAt && sameDay(o.paidAt) && match(o)).sort((a, b) => (b.paidAt ?? '').localeCompare(a.paidAt ?? '')),
    [paid.data, q], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const paidSum = paidToday.reduce((a, o) => a + o.total, 0);
  const queueSum = queueItems.reduce((a, o) => a + o.total, 0);

  const sections = tab === 'queue' ? queueSections : paidToday.length ? [{ key: 'paid', date: '', total: paidSum, data: paidToday }] : [];
  const loading = tab === 'queue' ? queue.loading : paid.loading;
  const error = tab === 'queue' ? queue.error : paid.error;

  const header = (
    <View style={{ gap: space.md, paddingBottom: space.sm }}>
      <TabHeader title="Оплаты" subtitle={queue.data ? `Ждут ${money(queueSum) || '0 сом'}` : 'Очередь и отметки об оплате'} />
      <View style={st.summary}>
        <SumBox label="К оплате" value={moneyShort(queueSum)} sub={`${queueItems.length} ${plural(queueItems.length, 'заказ', 'заказа', 'заказов')}`} tone={colors.softYellow} fg="#8A5A00" />
        <SumBox label="Оплачено сегодня" value={moneyShort(paidSum)} sub={`${paidToday.length} ${plural(paidToday.length, 'оплата', 'оплаты', 'оплат')}`} tone="#DDEFD9" fg={colors.success} />
      </View>
      <Segmented
        items={[
          { key: 'queue', label: 'К оплате', count: queueItems.length },
          { key: 'paid', label: 'Оплачено', count: paidToday.length },
        ]}
        value={tab}
        onChange={setTab}
      />
      <SearchBar placeholder="Партнёр или номер" onDebounced={setQuery} />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SectionList
        sections={loading ? [] : sections}
        keyExtractor={(o) => o.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingTop: insets.top + space.md, paddingBottom: TAB_BAR_SPACE + insets.bottom + (undo ? 70 : 0) }}
        ListHeaderComponent={header}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={queue.refreshing || paid.refreshing}
            onRefresh={() => (tab === 'queue' ? queue.refresh() : paid.refresh())}
            tintColor={colors.mango}
            colors={[colors.mango]}
          />
        }
        ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
        renderSectionHeader={({ section }) => (tab === 'queue' ? <DayHeader date={section.date} total={section.total} count={section.data.length} today={today} /> : <View style={{ height: space.md }} />)}
        renderItem={({ item }) => (tab === 'queue' ? <QueueRow o={item} today={today} onPay={setPaying} /> : <PaidRow o={item} />)}
        ListEmptyComponent={
          loading ? (
            <ListSkeleton rows={4} height={110} />
          ) : error ? (
            <ErrorState message={error} onRetry={tab === 'queue' ? queue.refresh : paid.refresh} />
          ) : tab === 'queue' ? (
            <EmptyState icon="check" tint={colors.greenSoft} title={q ? 'Ничего не нашли' : 'Все оплаты приняты'} text={q ? 'Нет заказов по этому запросу.' : 'Новые одобренные заказы появятся здесь автоматически.'} />
          ) : (
            <EmptyState icon="card" title="Сегодня оплат ещё не было" text="Отмеченные оплаты появятся в этом списке." />
          )
        }
      />

      <PayMethodSheet
        visible={!!paying}
        onClose={() => setPaying(null)}
        title={`Оплата №${paying?.number ?? ''} · ${paying?.partner?.name ?? ''}`}
        total={paying?.total}
        onPick={(m) => {
          const o = paying!;
          setPaying(null);
          markPaid(o, m);
        }}
      />
      <UndoBar item={undo} onUndo={undoLast} bottom={TAB_BAR_SPACE + insets.bottom - 18} />
    </View>
  );
}

function sameDay(ts: string) {
  const d = new Date(ts);
  const n = new Date();
  return d.toDateString() === n.toDateString();
}

function SumBox({ label, value, sub, tone, fg }: { label: string; value: string; sub: string; tone: string; fg: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: tone, borderRadius: radius.xl, padding: space.lg, gap: 2 }}>
      <T v="caption" color={fg} style={{ fontFamily: fonts.extrabold, textTransform: 'uppercase', letterSpacing: 0.6 }}>
        {label}
      </T>
      <T style={{ fontFamily: fonts.extrabold, fontSize: 24, lineHeight: 30 }} color={colors.cambodia} numberOfLines={1} adjustsFontSizeToFit>
        {value} <T v="small">сом</T>
      </T>
      <T v="small" color={colors.textMuted}>
        {sub}
      </T>
    </View>
  );
}

function DayHeader({ date, total, count, today }: { date: string; total: number; count: number; today: string }) {
  const overdue = date < today;
  const c = dateChip(date);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingTop: space.lg, paddingBottom: space.sm }}>
      <View style={[st.dayBox, overdue && { backgroundColor: colors.dangerSoft }, date === today && { backgroundColor: colors.mango }]}>
        <T v="caption" color={date === today ? colors.white : overdue ? colors.danger : colors.textMuted} style={{ fontSize: 10, fontFamily: fonts.bold }}>
          {c.weekday}
        </T>
        <T style={{ fontFamily: fonts.extrabold, fontSize: 16, lineHeight: 18 }} color={date === today ? colors.white : overdue ? colors.danger : colors.text}>
          {c.day}
        </T>
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <T v="h3">Доставка {dayLabel(date).toLowerCase()}</T>
          {overdue && <Pill label="ДОЛГ" bg={colors.dangerSoft} fg={colors.danger} />}
        </View>
        <T v="small" color={colors.textMuted}>
          {count} {plural(count, 'заказ', 'заказа', 'заказов')} · {money(total)}
        </T>
      </View>
    </View>
  );
}

const QueueRow = memo(function QueueRow({ o, today, onPay }: { o: OfficeOrder; today: string; onPay: (o: OfficeOrder) => void }) {
  const overdue = o.deliveryDate < today;
  return (
    <View style={[st.row, overdue && { borderColor: colors.dangerSoft, borderWidth: 1.5 }]}>
      <Touchable onPress={() => router.push(`/order/${o.id}`)} scaleTo={0.99} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <View style={{ flex: 1, gap: 2 }}>
          <T v="bodyStrong" numberOfLines={1}>
            {o.partner?.name}
          </T>
          <T v="small" color={colors.textMuted} numberOfLines={1}>
            №{o.number} · {o.items.length} {plural(o.items.length, 'позиция', 'позиции', 'позиций')}
            {o.partner?.phone ? ` · ${formatPhone(o.partner.phone)}` : ''}
          </T>
        </View>
        <T v="h3">{money(o.total)}</T>
      </Touchable>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        {!!o.partner?.phone && (
          <Touchable haptic onPress={() => callPhone(o.partner.phone!)} style={st.call} accessibilityLabel="Позвонить">
            <AIcon name="phone" size={20} color={colors.cambodia} />
          </Touchable>
        )}
        <Button small title="Оплата получена" icon="check" onPress={() => onPay(o)} style={{ flex: 1 }} />
      </View>
    </View>
  );
});

const PaidRow = memo(function PaidRow({ o }: { o: OfficeOrder }) {
  const m = PAY_METHODS.find((x) => x.key === o.paymentMethod);
  const t = o.paidAt ? new Date(o.paidAt) : null;
  return (
    <Touchable onPress={() => router.push(`/order/${o.id}`)} scaleTo={0.985} style={[st.row, { flexDirection: 'row', alignItems: 'center' }]}>
      <View style={[st.call, { backgroundColor: m?.bg ?? '#DDEFD9' }]}>
        <AIcon name={m?.icon ?? 'check'} size={20} color={m?.fg ?? colors.success} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T v="bodyStrong" numberOfLines={1}>
          {o.partner?.name}
        </T>
        <T v="small" color={colors.textMuted}>
          №{o.number} · {o.paymentMethod || 'способ не указан'}
          {t ? ` · ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}` : ''}
        </T>
      </View>
      <T v="h3" color={colors.success}>
        {money(o.total)}
      </T>
    </Touchable>
  );
});

/** Плашка «Оплата отмечена · Отменить» с полоской времени. */
function UndoBar({ item, onUndo, bottom }: { item: { order: OfficeOrder; method: string } | null; onUndo: () => void; bottom: number }) {
  const y = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(1)).current;
  const [shown, setShown] = useState(item);
  useEffect(() => {
    if (item) {
      setShown(item);
      progress.setValue(1);
      Animated.spring(y, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 6 }).start();
      Animated.timing(progress, { toValue: 0, duration: UNDO_MS, useNativeDriver: false }).start();
    } else {
      Animated.timing(y, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => setShown(null));
    }
  }, [item, y, progress]);
  if (!shown) return null;
  return (
    <Animated.View
      pointerEvents={item ? 'auto' : 'none'}
      style={[st.undo, { bottom, opacity: y, transform: [{ translateY: y.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }] }]}
    >
      <View style={st.undoIcon}>
        <AIcon name="check" size={16} color={colors.cambodia} strokeWidth={2.4} />
      </View>
      <View style={{ flex: 1 }}>
        <T v="bodyStrong" color={colors.oatMilk} numberOfLines={1}>
          №{shown.order.number} оплачен · {shown.method}
        </T>
        <T v="small" color="rgba(249,245,230,0.7)" numberOfLines={1}>
          {money(shown.order.total)} · {shown.order.partner?.name}
        </T>
      </View>
      <Touchable haptic onPress={onUndo} style={st.undoBtn}>
        <AIcon name="undo" size={16} color={colors.cambodia} strokeWidth={2} />
        <T v="small" color={colors.cambodia} style={{ fontFamily: fonts.extrabold }}>
          Отменить
        </T>
      </Touchable>
      <Animated.View style={[st.undoProgress, { width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
    </Animated.View>
  );
}

const st = StyleSheet.create({
  summary: { flexDirection: 'row', gap: space.md },
  row: { backgroundColor: colors.white, borderRadius: radius.xl, padding: space.lg, gap: space.md, ...shadows.soft },
  call: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.oatMilk, alignItems: 'center', justifyContent: 'center' },
  dayBox: { width: 44, height: 48, borderRadius: 14, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', ...shadows.soft },
  undo: { position: 'absolute', left: space.lg, right: space.lg, flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.cambodia, borderRadius: radius.lg, padding: space.md, overflow: 'hidden', ...shadows.float },
  undoIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' },
  undoBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.lime, paddingHorizontal: 12, height: 36, borderRadius: 18 },
  undoProgress: { position: 'absolute', left: 0, bottom: 0, height: 3, backgroundColor: colors.lime },
});
