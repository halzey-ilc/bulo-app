import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DeliveryStage, Orders, Tracking } from '../../src/api';
import { Avatar, PulseDot } from '../../src/components/admin/kit';
import { callPhone } from '../../src/components/contacts';
import { Icon, IconName } from '../../src/components/Icon';
import { BrandRefresh, Header } from '../../src/components/layout';
import { DeliveryMap, DeliveryMapHandle, MapMarker } from '../../src/components/map/DeliveryMap';
import { MapSheet } from '../../src/components/map/MapSheet';
import { FadeIn, Pulse } from '../../src/components/motion';
import { Button, Card, ErrorState, hapticSuccess, Skeleton, T, Touchable } from '../../src/components/ui';
import { clock, kmText, minText, minutesUntil } from '../../src/lib/delivery';
import { dateTime, formatPhone, plural } from '../../src/lib/format';
import { invalidateOrders } from '../../src/lib/queries';
import { useLoad } from '../../src/lib/useLoad';
import { toast } from '../../src/store/ui';
import { colors, fonts, radius, shadows, space } from '../../src/theme';

const POLL = 5_000;
const LIVE: DeliveryStage[] = ['on_way', 'arriving', 'arrived'];

/** Трекинг заказа для получателя: курьер на карте и время прибытия. */
export default function TrackOrder() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { height: H } = useWindowDimensions();
  const map = useRef<DeliveryMapHandle>(null);
  const [terminal, setTerminal] = useState(false);
  const q = useLoad(() => Orders.tracking(id), [id], { key: `track:${id}`, poll: terminal ? undefined : POLL, staleTime: 3_000 });
  const t = q.data;
  const now = useNow(15_000);
  useStageNotice(t);

  useEffect(() => {
    if (t) setTerminal(t.stage === 'delivered' || t.stage === 'cancelled');
  }, [t]);

  const live = !!t && LIVE.includes(t.stage);
  const hasMap = !!t?.destination;
  const [sheetH, setSheetH] = useState(Math.round(H * 0.54));

  const markers = useMemo<MapMarker[]>(() => {
    if (!t) return [];
    const list: MapMarker[] = [];
    if (t.destination) list.push({ id: 'dest', kind: 'dest', ...t.destination, active: true });
    // пока заказ в пекарне (или курьер ещё не отметился) — показываем, откуда поедет
    if (!live || !t.position) list.push({ id: 'bakery', kind: 'bakery', ...t.bakery });
    return list;
  }, [t, live]);

  if (!t) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title="Где мой заказ" />
        {q.error ? (
          <ErrorState message={q.error} onRetry={q.refresh} />
        ) : (
          <View style={{ padding: space.lg, gap: space.lg }}>
            <Skeleton style={{ height: 260, borderRadius: radius.xl }} />
            <Skeleton style={{ height: 140, borderRadius: radius.xl }} />
          </View>
        )}
      </View>
    );
  }

  const body = (
    <View style={{ gap: space.md }}>
      {!hasMap && <StageHero t={t} now={now} />}
      <StageBar stage={t.stage} />
      {live && t.stopsBefore > 0 && (
        <View style={styles.note}>
          <Icon name="truck" size={18} color={colors.blueberry} />
          <T v="small" color={colors.blueberry} style={{ flex: 1, fontFamily: fonts.semibold }}>
            Перед вами ещё {t.stopsBefore} {plural(t.stopsBefore, 'заказ', 'заказа', 'заказов')} — курьер заедет к вам сразу после {t.stopsBefore > 1 ? 'них' : 'него'}.
          </T>
        </View>
      )}
      {!!t.courier && t.stage !== 'cancelled' && (
        <Card style={styles.courier}>
          <Avatar name={t.courier.name || 'Курьер'} bg={colors.cambodia} fg={colors.oatMilk} size={48} />
          <View style={{ flex: 1 }}>
            <T v="caption" color={colors.textMuted} style={{ fontFamily: fonts.bold }}>
              {t.stage === 'delivered' ? 'ДОСТАВИЛ' : 'ВАШ КУРЬЕР'}
            </T>
            <T v="h3" numberOfLines={1}>
              {t.courier.name || 'Курьер BULO'}
            </T>
            {!!t.courier.phone && (
              <T v="small" color={colors.textMuted}>
                {formatPhone(t.courier.phone)}
              </T>
            )}
          </View>
          {!!t.courier.phone && t.stage !== 'delivered' && (
            <Touchable haptic onPress={() => callPhone(t.courier!.phone!)} style={styles.call} accessibilityLabel="Позвонить курьеру">
              <Icon name="phone" size={22} color={colors.white} />
            </Touchable>
          )}
        </Card>
      )}
      <Card padded={false} style={{ paddingVertical: 4 }}>
        <InfoRow icon="pin" tint={colors.iceCube} fg={colors.blueberry} title={t.address || 'Адрес не указан'} sub={t.entrance || 'Адрес доставки'} />
        {!!t.shippedAt && <InfoRow icon="truck" tint={colors.softYellow} fg={colors.cambodia} title={`Передан курьеру ${dateTime(t.shippedAt)}`} sub={t.distanceKm != null && live ? `Осталось ${kmText(t.distanceKm)}` : undefined} />}
      </Card>
      {!t.destination && live && (
        <T v="small" color={colors.textSoft} center>
          Точка адреса не указана, поэтому карта недоступна. Добавьте её в «Адресах доставки» — в следующий раз покажем курьера на карте.
        </T>
      )}
      <Button title="Состав заказа" kind="ghost" icon="receipt" onPress={() => router.push(`/order/${t.orderId}`)} />
    </View>
  );

  if (!hasMap) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title={`Заказ №${t.number}`} subtitle="Отслеживание" />
        <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: insets.bottom + 40 }} refreshControl={<BrandRefresh refreshing={q.refreshing} onRefresh={q.refresh} />}>
          {body}
        </ScrollView>
      </View>
    );
  }

  const snaps = [200, Math.round(H * 0.54), Math.round(H - insets.top - 72)];
  const mins = minutesUntil(t.etaAt, now) ?? t.etaMinutes;
  const courierLabel = live && t.stage !== 'arrived' && mins != null ? (mins <= 1 ? 'рядом' : minText(mins)) : null;

  return (
    <View style={{ flex: 1, backgroundColor: '#EFE9DA' }}>
      <DeliveryMap
        ref={map}
        markers={markers}
        route={live ? t.route?.geometry : null}
        byRoads={t.route?.byRoads}
        courier={live && t.position ? t.position : null}
        courierAnimMs={POLL}
        courierLabel={courierLabel}
        keepInView
        padding={{ top: insets.top + 76, bottom: sheetH + 24, left: 44, right: 44 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.mapTop, { top: insets.top + 8 }]} pointerEvents="box-none">
        <Touchable haptic onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={styles.roundBtn} accessibilityLabel="Назад">
          <Icon name="chevronLeft" size={22} />
        </Touchable>
        <View style={styles.titlePill}>
          {live && <PulseDot color={colors.mango} size={7} />}
          <T v="bodyStrong" style={{ fontFamily: fonts.extrabold }}>
            Заказ №{t.number}
          </T>
        </View>
        <View style={{ width: 40 }} />
      </View>
      <MapSheet
        snaps={snaps}
        initial={1}
        bottomInset={insets.bottom}
        onSnap={(h) => setSheetH(h)}
        header={
          <View style={{ paddingHorizontal: space.lg, paddingBottom: space.md }}>
            <StageHero t={t} now={now} />
          </View>
        }
        above={
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }} pointerEvents="box-none">
            <Touchable haptic onPress={() => map.current?.fit()} style={styles.roundBtn} accessibilityLabel="Показать всё">
              <Icon name="navigation" size={20} />
            </Touchable>
          </View>
        }
        refreshControl={<BrandRefresh refreshing={q.refreshing} onRefresh={q.refresh} />}
      >
        {body}
      </MapSheet>
    </View>
  );
}

/* ───────── Главный блок: этап и время ───────── */

function StageHero({ t, now }: { t: Tracking; now: number }) {
  const mins = minutesUntil(t.etaAt, now) ?? t.etaMinutes;
  let caption = '';
  let title = '';
  let sub = '';
  let bg: string = colors.mango;
  let fg: string = colors.white;
  let icon: IconName = 'truck';
  switch (t.stage) {
    case 'preparing':
      caption = 'ГОТОВИМ';
      title = 'Печём ваш заказ';
      sub = 'Как только соберём — передадим курьеру и покажем его здесь';
      bg = colors.softYellow;
      fg = colors.cambodia;
      icon = 'chef';
      break;
    case 'ready':
      caption = 'ЗАКАЗ СОБРАН';
      title = 'Скоро передадим курьеру';
      sub = 'Курьер заберёт заказ в пекарне и отправится к вам';
      bg = colors.iceCube;
      fg = colors.cambodia;
      icon = 'box';
      break;
    case 'on_way':
      caption = mins != null ? 'В ПУТИ · ПРИВЕЗЁМ ЧЕРЕЗ' : 'В ПУТИ';
      title = mins != null ? minText(mins) : 'Курьер в пути';
      sub = [t.etaAt ? `к ${clock(t.etaAt)}` : null, t.distanceKm != null ? kmText(t.distanceKm) : null].filter(Boolean).join(' · ') || 'Считаем время в пути…';
      break;
    case 'arriving':
      caption = 'СОВСЕМ РЯДОМ';
      title = 'Курьер подъезжает';
      sub = mins != null && mins > 0 ? `Будет через ~${minText(mins)}` : 'Будет с минуты на минуту';
      break;
    case 'arrived':
      caption = t.arrivedAt ? `НА МЕСТЕ С ${clock(t.arrivedAt)}` : 'НА МЕСТЕ';
      title = 'Курьер у двери';
      sub = 'Сейчас передаст вам заказ';
      bg = colors.cambodia;
      fg = colors.oatMilk;
      icon = 'key';
      break;
    case 'delivered':
      caption = 'ДОСТАВЛЕН';
      title = t.deliveredAt ? `Доставлен в ${clock(t.deliveredAt)}` : 'Заказ доставлен';
      sub = t.receivedBy ? `Принял: ${t.receivedBy}` : 'Спасибо, что выбираете BULO!';
      bg = colors.greenSoft;
      fg = colors.cambodia;
      icon = 'check';
      break;
    case 'cancelled':
      caption = 'ОТМЕНЁН';
      title = 'Заказ отменён';
      sub = 'Если это ошибка — свяжитесь с нами';
      bg = colors.dangerSoft;
      fg = colors.coffee;
      icon = 'close';
      break;
  }
  const live = t.stage === 'on_way' || t.stage === 'arriving';
  return (
    <FadeIn key={t.stage}>
      <View style={[styles.hero, { backgroundColor: bg }]}>
        <View style={styles.heroIcon}>
          {live && <Pulse size={52} color="#FFFFFF" />}
          <Icon name={icon} size={26} color={fg === colors.white || fg === colors.oatMilk ? bg : fg} strokeWidth={2} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T v="caption" color={fg} style={{ fontFamily: fonts.extrabold, opacity: 0.8 }}>
            {caption}
          </T>
          <FadeIn key={title} offset={8}>
            <T style={styles.heroTitle} color={fg}>
              {title}
            </T>
          </FadeIn>
          <T v="body" color={fg} style={{ opacity: 0.9 }}>
            {sub}
          </T>
        </View>
      </View>
    </FadeIn>
  );
}

/* ───────── Шкала этапов ───────── */

const STEPS = ['Готовим', 'Передан курьеру', 'В пути', 'У двери', 'Доставлен'];

function stepOf(stage: DeliveryStage): number {
  switch (stage) {
    case 'preparing':
      return 0;
    case 'ready':
      return 1;
    case 'on_way':
    case 'arriving':
      return 2;
    case 'arrived':
      return 3;
    case 'delivered':
      return 5;
    default:
      return -1;
  }
}

function StageBar({ stage }: { stage: DeliveryStage }) {
  if (stage === 'cancelled') return null;
  const cur = stepOf(stage);
  return (
    <Card style={{ gap: space.md, paddingVertical: space.lg }}>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {STEPS.map((_, i) => (
          <Segment key={i} state={i < cur ? 'done' : i === cur ? 'current' : 'todo'} delay={i * 90} />
        ))}
      </View>
      <View style={{ flexDirection: 'row' }}>
        {STEPS.map((s, i) => (
          <T
            key={s}
            v="caption"
            numberOfLines={2}
            color={i <= cur ? colors.text : colors.textSoft}
            style={{ flex: 1, letterSpacing: 0, fontSize: 10.5, fontFamily: i === cur ? fonts.extrabold : fonts.semibold, textAlign: 'center' }}
          >
            {s}
          </T>
        ))}
      </View>
    </Card>
  );
}

/** Сегмент шкалы: заполняется пружиной, текущий — «бегущий» блик. */
function Segment({ state, delay }: { state: 'done' | 'current' | 'todo'; delay: number }) {
  const [w, setW] = useState(0);
  const fill = useRef(new Animated.Value(0)).current;
  const run = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fill, {
      toValue: state === 'done' ? 1 : state === 'current' ? 0.5 : 0,
      duration: 520,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [state, delay, fill]);
  useEffect(() => {
    if (state !== 'current') return;
    const loop = Animated.loop(Animated.timing(run, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [state, run]);
  return (
    <View style={[styles.seg, { backgroundColor: state === 'current' ? colors.primarySoft : 'rgba(38,66,43,0.1)' }]} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {w > 0 && (
        <Animated.View
          style={[
            styles.segFill,
            { width: w, backgroundColor: colors.mango, transform: [{ translateX: fill.interpolate({ inputRange: [0, 1], outputRange: [-w, 0] }) }] },
          ]}
        />
      )}
      {w > 0 && state === 'current' && (
        <Animated.View
          style={[
            styles.segShine,
            { transform: [{ translateX: run.interpolate({ inputRange: [0, 1], outputRange: [-w * 0.4, w] }) }], opacity: run.interpolate({ inputRange: [0, 0.2, 0.8, 1], outputRange: [0, 1, 1, 0] }) },
          ]}
        />
      )}
    </View>
  );
}

/** Появление с пружинкой: масштаб 0.6 → 1. */
function PopIn({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(v, { toValue: 1, delay, useNativeDriver: true, damping: 12, stiffness: 220, mass: 0.8 }).start();
  }, [v, delay]);
  return <Animated.View style={{ opacity: v.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] }), transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }}>{children}</Animated.View>;
}

/** Мягкое свечение вокруг карточки, когда курьер рядом. */
function Breathe() {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return <Animated.View pointerEvents="none" style={[styles.glow, { opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0, 0.55] }) }]} />;
}

function InfoRow({ icon, tint, fg, title, sub }: { icon: IconName; tint: string; fg: string; title: string; sub?: string | null }) {
  return (
    <View style={styles.row}>
      <View style={[styles.rowIcon, { backgroundColor: tint }]}>
        <Icon name={icon} size={20} color={fg} />
      </View>
      <View style={{ flex: 1 }}>
        <T v="bodyStrong">{title}</T>
        {!!sub && (
          <T v="small" color={colors.textMuted}>
            {sub}
          </T>
        )}
      </View>
    </View>
  );
}

function useNow(ms: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** Этап сменился, пока экран открыт, — вибрация и короткое сообщение. */
function useStageNotice(t: Tracking | undefined) {
  const prev = useRef<string | null>(null);
  useEffect(() => {
    if (!t) return;
    const p = prev.current;
    if (p && p !== t.stage) {
      const msg: Partial<Record<DeliveryStage, string>> = {
        on_way: 'Курьер забрал заказ и едет к вам',
        arriving: 'Курьер подъезжает',
        arrived: 'Курьер на месте',
        delivered: 'Заказ доставлен. Приятного аппетита!',
      };
      if (msg[t.stage]) {
        hapticSuccess();
        toast.success(msg[t.stage]!);
      }
      if (t.stage === 'delivered') invalidateOrders();
    }
    prev.current = t.stage;
  }, [t]);
}

const styles = StyleSheet.create({
  mapTop: { position: 'absolute', left: space.md, right: space.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  roundBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', ...shadows.card },
  titlePill: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.white, borderRadius: radius.pill, paddingHorizontal: space.md, height: 36, ...shadows.card },
  hero: { borderRadius: radius.xl, padding: space.md, flexDirection: 'row', gap: space.md, alignItems: 'center' },
  heroIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center' },
  heroTitle: { fontFamily: fonts.extrabold, fontSize: 20, lineHeight: 25, letterSpacing: -0.3 },
  seg: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  segFill: { position: 'absolute', left: 0, top: 0, height: 6, borderRadius: 3 },
  segShine: { position: 'absolute', top: 0, width: '40%', height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.75)' },
  glow: { position: 'absolute', top: -2, left: -2, right: -2, bottom: -2, borderRadius: radius.xl + 2, borderWidth: 4, borderColor: colors.mango },
  note: { flexDirection: 'row', gap: space.sm, alignItems: 'center', backgroundColor: colors.iceCube, padding: space.md, borderRadius: radius.lg },
  courier: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  call: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.mango, alignItems: 'center', justifyContent: 'center', ...shadows.soft },
  codeCard: { gap: space.md, borderWidth: 2, borderColor: 'transparent' },
  copy: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primarySoft, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill },
  codeCell: { width: 50, height: 58, borderRadius: radius.md, backgroundColor: colors.oatMilk, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.border },
  codeDigit: { fontFamily: fonts.extrabold, fontSize: 28, lineHeight: 34, color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.lg },
  rowIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
