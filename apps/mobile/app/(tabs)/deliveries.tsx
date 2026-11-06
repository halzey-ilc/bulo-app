import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Courier, CourierRoute, CourierStop, errorMessage, Orders } from '../../src/api';
import { Pill, PulseDot, Toggle } from '../../src/components/admin/kit';
import { callPhone } from '../../src/components/contacts';
import { HandoverSheet } from '../../src/components/delivery/HandoverSheet';
import { NavigatorSheet } from '../../src/components/delivery/NavigatorSheet';
import { Icon, IconName } from '../../src/components/Icon';
import { BrandRefresh } from '../../src/components/layout';
import { DeliveryMap, DeliveryMapHandle, MapMarker } from '../../src/components/map/DeliveryMap';
import { MapSheet, MapSheetHandle } from '../../src/components/map/MapSheet';
import { FadeIn } from '../../src/components/motion';
import { Button, Card, EmptyState, ErrorState, hapticImpact, hapticSuccess, Skeleton, T, Touchable } from '../../src/components/ui';
import { useCourierTracking } from '../../src/lib/courierLocation';
import { addressCount, clock, kmText, minText, minutesUntil } from '../../src/lib/delivery';
import { dayLabel, formatPhone, money, plural } from '../../src/lib/format';
import { invalidateOrders } from '../../src/lib/queries';
import { useLoad } from '../../src/lib/useLoad';
import { toast } from '../../src/store/ui';
import { colors, fonts, radius, shadows, space } from '../../src/theme';

/** Экран курьера в духе Яндекс Про: карта с маршрутом, «на линии», шторка с текущей точкой. */
export default function Deliveries() {
  const insets = useSafeAreaInsets();
  const { height: H } = useWindowDimensions();
  const map = useRef<DeliveryMapHandle>(null);
  const sheet = useRef<MapSheetHandle>(null);
  const tabH = 60 + Math.max(insets.bottom, 10);

  const q = useLoad(() => Courier.route(), [], { key: 'courier:route', poll: 15_000, staleTime: 5_000 });
  const data = q.data;
  const onShift = !!data?.onShift;
  const live = useCourierTracking(onShift);
  const now = useNow(30_000);

  const [focusId, setFocusId] = useState<string | null>(null);
  const [handover, setHandover] = useState<CourierStop | null>(null);
  const [nav, setNav] = useState<CourierStop | null>(null);
  const [following, setFollowing] = useState(false);
  const [moved, setMoved] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [shiftBusy, setShiftBusy] = useState(false);

  const stops = data?.stops ?? [];
  const pickups = data?.toPickup ?? [];
  const focus = stops.find((s) => s.orderId === focusId) ?? stops[0] ?? null;
  const focusIdx = focus ? stops.indexOf(focus) : -1;

  // Ступени шторки: «шапка», половина экрана, почти весь экран.
  const snaps = useMemo(() => [176, Math.round(H * 0.5), Math.round(H - insets.top - 150 - tabH)], [H, insets.top, tabH]);
  const [sheetH, setSheetH] = useState(snaps[1]);

  const patch = (fn: (d: CourierRoute) => CourierRoute) => q.setData((d) => (d ? fn(d) : d));
  const setBusyFor = (id: string, v: boolean) => setBusy((b) => ({ ...b, [id]: v }));

  /* ───── Действия ───── */

  const toggleShift = async (on: boolean) => {
    setShiftBusy(true);
    patch((d) => ({ ...d, onShift: on }));
    try {
      await Courier.shift(on);
      hapticSuccess();
      toast.success(on ? 'Вы на линии — хорошей дороги!' : 'Смена завершена. Отдыхайте!');
      q.reload();
    } catch (e) {
      patch((d) => ({ ...d, onShift: !on }));
      toast.error(errorMessage(e));
    } finally {
      setShiftBusy(false);
    }
  };

  const pickUp = async (ids: string[]) => {
    if (!ids.length) return;
    ids.forEach((id) => setBusyFor(id, true));
    // сразу переносим в маршрут — сервер подтвердит при следующем обновлении
    patch((d) => {
      const moving = d.toPickup.filter((o) => ids.includes(o.orderId)).map((o) => ({ ...o, status: 'SHIPPED' as const }));
      return { ...d, toPickup: d.toPickup.filter((o) => !ids.includes(o.orderId)), stops: [...d.stops, ...moving] };
    });
    const results = await Promise.allSettled(ids.map((id) => Orders.setStatus(id, 'SHIPPED')));
    ids.forEach((id) => setBusyFor(id, false));
    setSelected(new Set());
    const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    if (failed.length) toast.error(errorMessage(failed[0].reason));
    const ok = ids.length - failed.length;
    if (ok) {
      hapticSuccess();
      toast.success(ok === 1 ? 'Заказ у вас — в путь!' : `${ok} ${plural(ok, 'заказ', 'заказа', 'заказов')} у вас — в путь!`);
      if (!onShift) toast.info('Выйдите на линию, чтобы получатели видели вас на карте');
    }
    invalidateOrders();
    q.reload();
  };

  const arrived = async (s: CourierStop) => {
    setBusyFor(s.orderId, true);
    const at = new Date().toISOString();
    patch((d) => ({ ...d, stops: d.stops.map((x) => (x.orderId === s.orderId ? { ...x, arrivedAt: at } : x)) }));
    try {
      await Courier.arrived(s.orderId);
      hapticSuccess();
      toast.success('Получатель знает, что вы на месте');
    } catch (e) {
      patch((d) => ({ ...d, stops: d.stops.map((x) => (x.orderId === s.orderId ? { ...x, arrivedAt: null } : x)) }));
      toast.error(errorMessage(e));
    } finally {
      setBusyFor(s.orderId, false);
    }
  };

  const delivered = (orderId: string) => {
    setHandover(null);
    setFocusId(null);
    patch((d) => ({ ...d, stops: d.stops.filter((x) => x.orderId !== orderId) }));
    invalidateOrders();
    q.reload();
  };

  /* ───── Карта ───── */

  const markers = useMemo<MapMarker[]>(() => {
    const list: MapMarker[] = [];
    if (data?.bakery) list.push({ id: 'bakery', kind: 'bakery', ...data.bakery, active: !stops.length && pickups.length > 0 });
    stops.forEach((s, i) => {
      if (s.point) list.push({ id: s.orderId, kind: 'stop', ...s.point, label: String(i + 1), active: s.orderId === focus?.orderId });
    });
    return list;
  }, [data?.bakery, stops, pickups.length, focus?.orderId]);

  const geoProblem = onShift && (live.permission === 'denied' || live.permission === 'blocked' || live.permission === 'off');
  const fixGeo = () => (live.permission === 'blocked' ? Linking.openSettings() : live.retry());
  const courierPos = live.fix ?? (onShift ? data?.position : null) ?? null;
  const padding = useMemo(() => ({ top: insets.top + 96, bottom: sheetH + tabH + 64, left: 36, right: 36 }), [insets.top, sheetH, tabH]);

  const onMarkerPress = useCallback(
    (id: string) => {
      if (id === 'bakery') {
        sheet.current?.snapTo(1);
        return;
      }
      setFocusId(id);
      hapticImpact();
      sheet.current?.snapTo(1);
    },
    [],
  );

  const recenter = () => {
    setMoved(false);
    setFollowing(false);
    map.current?.fit();
  };
  const toggleFollow = () => {
    const on = !following;
    setFollowing(on);
    setMoved(false);
    map.current?.follow(on);
  };

  // После смены высоты шторки — вписать маршрут заново (если карту не трогали).
  useEffect(() => {
    if (!moved && !following) {
      const t = setTimeout(() => map.current?.fit(), 60);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetH]);

  /* ───── Разметка ───── */

  const totalKm = data?.route.totalKm ?? 0;
  const totalMin = data?.route.totalMinutes ?? 0;
  const summary = stops.length
    ? `${addressCount(stops.length)} · ${kmText(totalKm) || '—'} · ~${minText(totalMin) || '—'}`
    : pickups.length
      ? `${pickups.length} ${plural(pickups.length, 'заказ ждёт', 'заказа ждут', 'заказов ждут')} в пекарне`
      : 'Заказов к доставке нет';

  // шапка «въезжает» заново, когда меняется её смысл: другая точка, на месте, пекарня, смена
  const headerKey = q.loading ? 'loading' : focus ? `${focus.orderId}:${focus.arrivedAt ? 1 : 0}` : pickups.length ? 'pickup' : onShift ? 'done' : 'off';
  const header = (
    <FadeIn key={headerKey} offset={10}>
    <SheetHeader
      loading={q.loading}
      onShift={onShift}
      shiftBusy={shiftBusy}
      focus={focus}
      index={focusIdx}
      isNext={focusIdx === 0}
      pickups={pickups.length}
      now={now}
      busy={focus ? !!busy[focus.orderId] : false}
      onGoOnline={() => toggleShift(true)}
      onArrived={() => focus && arrived(focus)}
      onHandover={() => focus && setHandover(focus)}
      onPickAll={() => pickUp(pickups.map((p) => p.orderId))}
      pickBusy={pickups.some((p) => busy[p.orderId])}
    />
    </FadeIn>
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#EFE9DA' }}>
      <DeliveryMap
        ref={map}
        markers={markers}
        route={data?.route.geometry}
        byRoads={data?.route.byRoads}
        courier={courierPos}
        courierAnimMs={1000}
        padding={padding}
        onMarkerPress={onMarkerPress}
        onUserMove={() => {
          setMoved(true);
          setFollowing(false);
        }}
        style={StyleSheet.absoluteFill}
      />

      {/* Плавающая шапка: смена + сводка */}
      <View style={[styles.top, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }} pointerEvents="box-none">
          <View style={[styles.shift, onShift && styles.shiftOn]}>
            {onShift ? <PulseDot color={colors.lime} size={8} /> : <View style={styles.offDot} />}
            <View style={{ flex: 1 }}>
              <T v="bodyStrong" color={onShift ? colors.oatMilk : colors.text} style={{ fontFamily: fonts.extrabold }}>
                {onShift ? 'На линии' : 'Не на линии'}
              </T>
              <T v="caption" numberOfLines={1} color={onShift ? 'rgba(249,245,230,0.75)' : colors.textMuted} style={{ letterSpacing: 0 }}>
                {summary}
              </T>
            </View>
            {shiftBusy ? <ActivityIndicator color={onShift ? colors.oatMilk : colors.mango} /> : <Toggle value={onShift} onChange={toggleShift} disabled={!data} />}
          </View>
        </View>
        {geoProblem && (
          <Touchable haptic onPress={fixGeo} style={styles.geoPill}>
            <Icon name="info" size={14} color={colors.coffee} />
            <T v="caption" color={colors.coffee} style={{ fontFamily: fonts.extrabold, letterSpacing: 0 }}>
              {live.permission === 'off' ? 'Геолокация выключена' : 'Нет доступа к геопозиции'}
            </T>
          </Touchable>
        )}
      </View>

      <MapSheet
        ref={sheet}
        snaps={snaps}
        initial={1}
        bottomInset={tabH}
        onSnap={(h) => setSheetH(h)}
        header={header}
        above={
          <View style={styles.above} pointerEvents="box-none">
            {focus && !focus.arrivedAt && focus.etaAt ? (
              <View style={styles.etaChip}>
                <Icon name="clock" size={15} color={colors.oatMilk} />
                <T v="caption" color={colors.oatMilk} style={{ fontFamily: fonts.extrabold, letterSpacing: 0 }}>
                  {minText(minutesUntil(focus.etaAt, now) ?? focus.etaMinutes)} · {kmText(focus.distanceKm)}
                </T>
              </View>
            ) : (
              <View />
            )}
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <MapButton icon="pin" active={false} onPress={recenter} label="Весь маршрут" highlight={moved} />
              <MapButton icon="navigation" active={following} onPress={toggleFollow} label="Следовать за мной" />
            </View>
          </View>
        }
        refreshControl={<BrandRefresh refreshing={q.refreshing} onRefresh={q.refresh} />}
      >
        {q.loading ? (
          <View style={{ gap: space.md }}>
            <Skeleton style={{ height: 200, borderRadius: radius.xl }} />
            <Skeleton style={{ height: 90, borderRadius: radius.xl }} />
          </View>
        ) : q.error && !data ? (
          <ErrorState message={q.error} onRetry={q.refresh} />
        ) : (
          <>
            {geoProblem && (
              <Touchable haptic onPress={fixGeo} style={styles.geoWarn}>
                <Icon name="info" size={18} color={colors.coffee} />
                <View style={{ flex: 1 }}>
                  <T v="small" color={colors.coffee} style={{ fontFamily: fonts.extrabold }}>
                    {live.permission === 'off' ? 'Геолокация в телефоне выключена' : 'Нет доступа к геопозиции'}
                  </T>
                  <T v="small" color={colors.coffee}>
                    Получатели не видят, где заказ, а время считается от пекарни.{' '}
                    {live.permission === 'blocked' ? 'Разрешите доступ в настройках →' : live.permission === 'off' ? 'Включите её и нажмите сюда →' : 'Нажмите, чтобы разрешить →'}
                  </T>
                </View>
              </Touchable>
            )}
            {focus && (
              <StopDetails
                stop={focus}
                now={now}
                onCall={() => focus.partner.phone && callPhone(focus.partner.phone)}
                onNav={() => setNav(focus)}
                onOpen={() => router.push(`/order/${focus.orderId}`)}
              />
            )}
            {focusIdx > 0 && (
              <Touchable onPress={() => setFocusId(null)} haptic style={styles.backToNext}>
                <Icon name="arrowRight" size={16} color={colors.mango} />
                <T v="small" color={colors.mango} style={{ fontFamily: fonts.bold }}>
                  Вернуться к следующей точке
                </T>
              </Touchable>
            )}

            {stops.length > 1 && (
              <View style={{ gap: space.sm }}>
                <SectionLabel title="Маршрут" right={`${addressCount(stops.length)} · ${kmText(totalKm)}`} />
                {stops.map((s, i) => (
                  <StopRow key={s.orderId} stop={s} index={i} active={s.orderId === focus?.orderId} now={now} onPress={() => {
                    setFocusId(s.orderId);
                    sheet.current?.snapTo(1);
                  }} />
                ))}
              </View>
            )}

            {pickups.length > 0 && (
              <PickupSection
                items={pickups}
                busy={busy}
                selected={selected}
                onToggle={(id) =>
                  setSelected((s) => {
                    const n = new Set(s);
                    if (n.has(id)) n.delete(id);
                    else n.add(id);
                    return n;
                  })
                }
                onPick={pickUp}
              />
            )}

            {!stops.length && !pickups.length && (
              <EmptyState
                icon="truck"
                tint={colors.iceCube}
                title={onShift ? 'Пока нечего везти' : 'Сегодня заказов нет'}
                text={
                  onShift
                    ? 'Как только цех соберёт заказы, они появятся в «Забрать в пекарне». Мы обновляем список сами.'
                    : 'Выйдите на линию, когда будете готовы, — заказы появятся здесь, как только их соберёт цех.'
                }
              />
            )}
          </>
        )}
      </MapSheet>

      <HandoverSheet order={handover} onClose={() => setHandover(null)} onDelivered={delivered} />
      <NavigatorSheet target={nav ? { point: nav.point, address: nav.address } : null} onClose={() => setNav(null)} />
    </View>
  );
}

/* ───────── Шапка шторки ───────── */

function SheetHeader({
  loading,
  onShift,
  shiftBusy,
  focus,
  index,
  isNext,
  pickups,
  now,
  busy,
  pickBusy,
  onGoOnline,
  onArrived,
  onHandover,
  onPickAll,
}: {
  loading: boolean;
  onShift: boolean;
  shiftBusy: boolean;
  focus: CourierStop | null;
  index: number;
  isNext: boolean;
  pickups: number;
  now: number;
  busy: boolean;
  pickBusy: boolean;
  onGoOnline: () => void;
  onArrived: () => void;
  onHandover: () => void;
  onPickAll: () => void;
}) {
  if (loading) {
    return (
      <View style={styles.head}>
        <Skeleton style={{ height: 22, width: '60%' }} />
        <Skeleton style={{ height: 46, borderRadius: radius.md }} />
      </View>
    );
  }
  if (focus) {
    const mins = minutesUntil(focus.etaAt, now) ?? focus.etaMinutes;
    const there = !!focus.arrivedAt;
    return (
      <View style={styles.head}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <View style={[styles.num, there && { backgroundColor: colors.cambodia }]}>
            {there ? <Icon name="check" size={20} color={colors.white} strokeWidth={3} /> : <T style={styles.numText}>{index + 1}</T>}
          </View>
          <View style={{ flex: 1 }}>
            <T v="caption" color={colors.mango} style={{ fontFamily: fonts.extrabold }}>
              {there ? 'ВЫ НА МЕСТЕ' : isNext ? 'СЛЕДУЮЩАЯ ТОЧКА' : `ТОЧКА ${index + 1}`}
            </T>
            <T v="h3" numberOfLines={1}>
              {focus.partner.name}
            </T>
          </View>
          {!there && mins != null && (
            <View style={{ alignItems: 'flex-end' }}>
              <T style={styles.eta}>{clock(focus.etaAt)}</T>
              <T v="caption" color={colors.textMuted} style={{ letterSpacing: 0 }}>
                через {minText(mins)}
              </T>
            </View>
          )}
        </View>
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          {!there && <Button title="Я на месте" icon="pin" kind="dark" loading={busy} onPress={onArrived} style={{ flex: 1 }} />}
          <Button title="Вручить" icon="key" onPress={onHandover} style={{ flex: 1 }} />
        </View>
      </View>
    );
  }
  if (pickups > 0) {
    return (
      <View style={styles.head}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <View style={[styles.num, { backgroundColor: colors.coffee }]}>
            <Icon name="shop" size={20} color={colors.white} />
          </View>
          <View style={{ flex: 1 }}>
            <T v="caption" color={colors.coffee} style={{ fontFamily: fonts.extrabold }}>
              ПЕКАРНЯ
            </T>
            <T v="h3">
              Заберите {pickups} {plural(pickups, 'заказ', 'заказа', 'заказов')}
            </T>
          </View>
        </View>
        <Button title={pickups > 1 ? `Забрать все (${pickups})` : 'Забрать'} icon="box" kind="dark" loading={pickBusy} onPress={onPickAll} />
      </View>
    );
  }
  if (!onShift) {
    return (
      <View style={styles.head}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <View style={[styles.num, { backgroundColor: colors.oatMilk, borderWidth: 1.5, borderColor: colors.borderStrong }]}>
            <Icon name="truck" size={20} color={colors.textMuted} />
          </View>
          <View style={{ flex: 1 }}>
            <T v="h3">Вы не на линии</T>
            <T v="small" color={colors.textMuted}>
              Выйдите, чтобы получатели видели вас на карте
            </T>
          </View>
        </View>
        <Button title="Выйти на линию" icon="navigation" loading={shiftBusy} onPress={onGoOnline} />
      </View>
    );
  }
  return (
    <View style={styles.head}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <View style={[styles.num, { backgroundColor: colors.greenSoft }]}>
          <Icon name="check" size={20} color={colors.success} strokeWidth={2.6} />
        </View>
        <View style={{ flex: 1 }}>
          <T v="h3">Все заказы доставлены</T>
          <T v="small" color={colors.textMuted}>
            Новые появятся здесь сами
          </T>
        </View>
      </View>
    </View>
  );
}

/* ───────── Карточка точки ───────── */

function StopDetails({ stop, now, onCall, onNav, onOpen }: { stop: CourierStop; now: number; onCall: () => void; onNav: () => void; onOpen: () => void }) {
  const mins = minutesUntil(stop.etaAt, now) ?? stop.etaMinutes;
  return (
    <Card style={{ gap: space.md }}>
      <View style={{ gap: 4 }}>
        <T v="h2">{stop.address || 'Адрес не указан'}</T>
        {!!stop.entrance && (
          <View style={styles.inline}>
            <Icon name="key" size={15} color={colors.textMuted} />
            <T v="body" color={colors.textMuted} style={{ flex: 1 }}>
              {stop.entrance}
            </T>
          </View>
        )}
        {!stop.point && (
          <Pill label="Нет точки на карте — уточните адрес" bg={colors.softYellow} fg={colors.cambodia} icon="info" style={{ marginTop: 4 }} />
        )}
      </View>

      <View style={styles.facts}>
        {stop.arrivedAt ? (
          <Fact icon="check" title={`с ${clock(stop.arrivedAt)}`} sub="вы на месте" tone={colors.greenSoft} fg={colors.success} />
        ) : mins != null ? (
          <Fact icon="clock" title={`в ${clock(stop.etaAt)}`} sub={`через ${minText(mins)}`} tone={colors.primarySoft} fg={colors.mango} />
        ) : (
          <Fact icon="clock" title="—" sub="время уточняется" tone={colors.oatMilk} fg={colors.textMuted} />
        )}
        <Fact icon="navigation" title={stop.distanceKm != null ? kmText(stop.distanceKm) : '—'} sub="до точки" tone={colors.iceCube} fg={colors.blueberry} />
        <Fact icon="box" title={`${stop.unitsCount} шт`} sub={`${stop.itemsCount} ${plural(stop.itemsCount, 'позиция', 'позиции', 'позиций')}`} tone={colors.softYellow} fg={colors.cambodia} />
      </View>

      <Touchable onPress={onOpen} haptic style={styles.recipient} scaleTo={0.98}>
        <View style={[styles.lineIcon, { backgroundColor: colors.softYellow }]}>
          <Icon name="shop" size={18} color={colors.cambodia} />
        </View>
        <View style={{ flex: 1 }}>
          <T v="bodyStrong" numberOfLines={1}>
            {stop.partner.contactName || stop.partner.name}
          </T>
          <T v="small" color={colors.textMuted} numberOfLines={1}>
            №{stop.number} · {money(stop.total)} · {dayLabel(stop.deliveryDate).toLowerCase()}
          </T>
        </View>
        <Icon name="chevronRight" size={18} color={colors.textSoft} />
      </Touchable>

      {!!stop.comment && (
        <View style={styles.comment}>
          <Icon name="chat" size={18} color={colors.cambodia} />
          <T v="small" style={{ flex: 1, fontFamily: fonts.semibold }}>
            {stop.comment}
          </T>
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Button title="Позвонить" icon="phone" kind="secondary" onPress={onCall} disabled={!stop.partner.phone} style={{ flex: 1, paddingHorizontal: space.md }} />
        <Button title="Навигатор" icon="navigation" kind="ghost" onPress={onNav} style={{ flex: 1, paddingHorizontal: space.md }} />
      </View>
      {!!stop.partner.phone && (
        <T v="caption" color={colors.textSoft} center style={{ letterSpacing: 0 }}>
          {formatPhone(stop.partner.phone)}
        </T>
      )}
    </Card>
  );
}

function Fact({ icon, title, sub, tone, fg }: { icon: IconName; title: string; sub: string; tone: string; fg: string }) {
  return (
    <View style={[styles.fact, { backgroundColor: tone }]}>
      <Icon name={icon} size={16} color={fg} />
      <T v="bodyStrong" style={{ fontFamily: fonts.extrabold }} numberOfLines={1}>
        {title}
      </T>
      <T v="caption" color={colors.textMuted} numberOfLines={1} style={{ letterSpacing: 0 }}>
        {sub}
      </T>
    </View>
  );
}

function StopRow({ stop, index, active, now, onPress }: { stop: CourierStop; index: number; active: boolean; now: number; onPress: () => void }) {
  const mins = minutesUntil(stop.etaAt, now) ?? stop.etaMinutes;
  return (
    <Touchable onPress={onPress} haptic scaleTo={0.98} style={[styles.stopRow, active && { borderColor: colors.mango }]}>
      <View style={[styles.numSmall, !active && { backgroundColor: colors.white, borderWidth: 2, borderColor: colors.mango }]}>
        {stop.arrivedAt ? (
          <Icon name="check" size={14} color={active ? colors.white : colors.mango} strokeWidth={3} />
        ) : (
          <T style={[styles.numSmallText, !active && { color: colors.cambodia }]}>{index + 1}</T>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <T v="bodyStrong" numberOfLines={1}>
          {stop.partner.name}
        </T>
        <T v="small" color={colors.textMuted} numberOfLines={1}>
          {stop.address || 'Адрес не указан'}
        </T>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <T v="bodyStrong" style={{ fontFamily: fonts.extrabold }}>
          {stop.arrivedAt ? 'на месте' : clock(stop.etaAt) || '—'}
        </T>
        {mins != null && !stop.arrivedAt && (
          <T v="caption" color={colors.textMuted} style={{ letterSpacing: 0 }}>
            {minText(mins)} · {kmText(stop.distanceKm)}
          </T>
        )}
      </View>
    </Touchable>
  );
}

/* ───────── Забрать в пекарне ───────── */

function PickupSection({
  items,
  busy,
  selected,
  onToggle,
  onPick,
}: {
  items: CourierStop[];
  busy: Record<string, boolean>;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onPick: (ids: string[]) => void;
}) {
  const sel = items.filter((i) => selected.has(i.orderId)).map((i) => i.orderId);
  const anyBusy = items.some((i) => busy[i.orderId]);
  return (
    <View style={{ gap: space.sm }}>
      <SectionLabel title="Забрать в пекарне" right={`${items.length} ${plural(items.length, 'заказ', 'заказа', 'заказов')}`} />
      <Card padded={false} style={{ paddingVertical: 4 }}>
        {items.map((o, i) => {
          const on = selected.has(o.orderId);
          return (
            <View key={o.orderId} style={[styles.pickRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
              <Touchable onPress={() => onToggle(o.orderId)} haptic hitSlop={8} style={[styles.check, on && styles.checkOn]} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
                {on && <Icon name="check" size={16} color={colors.white} strokeWidth={3} />}
              </Touchable>
              <Touchable onPress={() => onToggle(o.orderId)} style={{ flex: 1 }}>
                <T v="bodyStrong" numberOfLines={1}>
                  №{o.number} · {o.partner.name}
                </T>
                <T v="small" color={colors.textMuted} numberOfLines={1}>
                  {o.unitsCount} шт · {o.address || 'адрес не указан'}
                </T>
              </Touchable>
              <Button title="Забрать" small kind="dark" loading={!!busy[o.orderId]} onPress={() => onPick([o.orderId])} />
            </View>
          );
        })}
      </Card>
      {items.length > 1 && (
        <Button
          title={sel.length ? `Забрать выбранные (${sel.length})` : `Забрать все (${items.length})`}
          icon="box"
          kind={sel.length ? 'primary' : 'secondary'}
          loading={anyBusy}
          onPress={() => onPick(sel.length ? sel : items.map((i) => i.orderId))}
        />
      )}
    </View>
  );
}

/* ───────── Мелочи ───────── */

function SectionLabel({ title, right }: { title: string; right?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: space.sm }}>
      <T v="h3">{title}</T>
      {!!right && (
        <T v="small" color={colors.textMuted}>
          {right}
        </T>
      )}
    </View>
  );
}

function MapButton({ icon, active, onPress, label, highlight }: { icon: IconName; active: boolean; onPress: () => void; label: string; highlight?: boolean }) {
  return (
    <Touchable onPress={onPress} haptic accessibilityLabel={label} style={[styles.mapBtn, active && { backgroundColor: colors.mango }, highlight && { borderColor: colors.mango }]}>
      <Icon name={icon} size={20} color={active ? colors.white : colors.text} />
    </Touchable>
  );
}

/** Тикает раз в N мс — чтобы «через 12 мин» убывало между обновлениями. */
function useNow(ms: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

const styles = StyleSheet.create({
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: space.md, gap: space.sm },
  shift: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    paddingVertical: 6,
    paddingLeft: space.md,
    paddingRight: space.sm,
    minHeight: 50,
    ...shadows.card,
  },
  shiftOn: { backgroundColor: colors.cambodia },
  offDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: 'rgba(38,66,43,0.3)', marginHorizontal: 7 },
  mapBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    ...shadows.card,
  },
  above: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  etaChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.cambodia, paddingHorizontal: 12, height: 36, borderRadius: radius.pill, ...shadows.card },
  geoWarn: { flexDirection: 'row', gap: space.sm, alignItems: 'center', backgroundColor: colors.dangerSoft, padding: space.md, borderRadius: radius.lg },
  geoPill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: colors.dangerSoft, paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, ...shadows.soft },
  head: { paddingHorizontal: space.lg, paddingBottom: space.md, paddingTop: 2, gap: space.md },
  num: { width: 44, height: 44, borderRadius: 16, backgroundColor: colors.mango, alignItems: 'center', justifyContent: 'center' },
  numText: { fontFamily: fonts.extrabold, fontSize: 20, lineHeight: 24, color: colors.white },
  eta: { fontFamily: fonts.extrabold, fontSize: 24, lineHeight: 28, letterSpacing: -0.5, color: colors.text },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  facts: { flexDirection: 'row', gap: space.sm },
  fact: { flex: 1, borderRadius: radius.md, padding: 10, gap: 2 },
  recipient: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.oatMilk, borderRadius: radius.md, padding: 10 },
  lineIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  comment: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start', backgroundColor: colors.softYellow, borderRadius: radius.md, padding: space.md },
  backToNext: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 4 },
  stopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: space.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
    ...shadows.soft,
  },
  numSmall: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.mango, alignItems: 'center', justifyContent: 'center' },
  numSmallText: { fontFamily: fonts.extrabold, fontSize: 14, lineHeight: 18, color: colors.white },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.lg },
  check: { width: 26, height: 26, borderRadius: 9, borderWidth: 2, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: colors.mango, borderColor: colors.mango },
});
