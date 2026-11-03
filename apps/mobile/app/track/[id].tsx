import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DeliveryStage, Orders, Tracking } from '../../src/api';
import { Avatar } from '../../src/components/admin/kit';
import { callPhone } from '../../src/components/contacts';
import { Icon, IconName } from '../../src/components/Icon';
import { BrandRefresh, Header } from '../../src/components/layout';
import { DeliveryMap, DeliveryMapHandle, MapMarker } from '../../src/components/map/DeliveryMap';
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

/** Трекинг заказа для получателя: курьер на карте, время прибытия, код вручения. */
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
  const mapH = Math.round(H * 0.46);

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
      <StageHero t={t} now={now} />
      <StageBar stage={t.stage} />
      {!!t.deliveryCode && t.stage !== 'delivered' && t.stage !== 'cancelled' && <CodeCard code={t.deliveryCode} urgent={t.stage === 'arrived' || t.stage === 'arriving'} />}
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

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ height: mapH + 28 }}>
        <DeliveryMap
          ref={map}
          markers={markers}
          route={live ? t.route?.geometry : null}
          byRoads={t.route?.byRoads}
          courier={live && t.position ? t.position : null}
          courierAnimMs={POLL}
          keepInView
          padding={{ top: insets.top + 70, bottom: 64, left: 40, right: 40 }}
        />
        <View style={[styles.mapTop, { top: insets.top + 8 }]} pointerEvents="box-none">
          <Touchable haptic onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={styles.roundBtn} accessibilityLabel="Назад">
            <Icon name="chevronLeft" size={22} />
          </Touchable>
          <View style={styles.titlePill}>
            <T v="bodyStrong" style={{ fontFamily: fonts.extrabold }}>
              Заказ №{t.number}
            </T>
          </View>
          <Touchable haptic onPress={() => map.current?.fit()} style={styles.roundBtn} accessibilityLabel="Показать всё">
            <Icon name="navigation" size={20} />
          </Touchable>
        </View>
      </View>
      <View style={styles.panel}>
        <ScrollView
          contentContainerStyle={{ padding: space.lg, paddingTop: space.lg, paddingBottom: insets.bottom + 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<BrandRefresh refreshing={q.refreshing} onRefresh={q.refresh} />}
        >
          {body}
        </ScrollView>
      </View>
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
      sub = mins != null && mins > 0 ? `Будет через ~${minText(mins)} — приготовьте код` : 'Будет с минуты на минуту — приготовьте код';
      break;
    case 'arrived':
      caption = t.arrivedAt ? `НА МЕСТЕ С ${clock(t.arrivedAt)}` : 'НА МЕСТЕ';
      title = 'Курьер у двери';
      sub = 'Назовите ему код вручения';
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
    <FadeIn>
      <View style={[styles.hero, { backgroundColor: bg }]}>
        <View style={styles.heroIcon}>
          {live && <Pulse size={52} color="#FFFFFF" />}
          <Icon name={icon} size={26} color={fg === colors.white || fg === colors.oatMilk ? bg : fg} strokeWidth={2} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T v="caption" color={fg} style={{ fontFamily: fonts.extrabold, opacity: 0.8 }}>
            {caption}
          </T>
          <T style={styles.heroTitle} color={fg}>
            {title}
          </T>
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
          <View key={i} style={[styles.seg, { backgroundColor: i < cur ? colors.mango : i === cur ? colors.primarySoft : 'rgba(38,66,43,0.1)' }]}>
            {i === cur && <View style={[styles.segFill, { backgroundColor: colors.mango }]} />}
          </View>
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

/* ───────── Код вручения ───────── */

function CodeCard({ code, urgent }: { code: string; urgent: boolean }) {
  const copy = async () => {
    await Clipboard.setStringAsync(code).catch(() => {});
    hapticSuccess();
    toast.success('Код скопирован');
  };
  return (
    <Card style={[styles.codeCard, urgent && { borderColor: colors.mango, borderWidth: 2 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Icon name="key" size={18} color={colors.mango} />
        <T v="bodyStrong" style={{ flex: 1 }}>
          Код для курьера
        </T>
        <Touchable haptic onPress={copy} style={styles.copy}>
          <Icon name="copy" size={15} color={colors.mango} />
          <T v="caption" color={colors.mango} style={{ fontFamily: fonts.extrabold }}>
            Копировать
          </T>
        </Touchable>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: space.sm }}>
        {code.split('').map((d, i) => (
          <View key={i} style={styles.codeCell}>
            <T style={styles.codeDigit}>{d}</T>
          </View>
        ))}
      </View>
      <T v="small" color={colors.textMuted} center>
        Назовите код курьеру, когда он передаст заказ. Без кода заказ не будет отмечен доставленным.
      </T>
    </Card>
  );
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
        arriving: 'Курьер подъезжает — приготовьте код',
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
  roundBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', ...shadows.card },
  titlePill: { backgroundColor: colors.white, borderRadius: radius.pill, paddingHorizontal: space.lg, height: 40, justifyContent: 'center', ...shadows.card },
  panel: { flex: 1, marginTop: -28, backgroundColor: colors.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden', ...shadows.float },
  hero: { borderRadius: radius.xxl, padding: space.xl, flexDirection: 'row', gap: space.lg, alignItems: 'center' },
  heroIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center' },
  heroTitle: { fontFamily: fonts.extrabold, fontSize: 26, lineHeight: 31, letterSpacing: -0.5 },
  seg: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  segFill: { width: '50%', height: 6, borderRadius: 3 },
  note: { flexDirection: 'row', gap: space.sm, alignItems: 'center', backgroundColor: colors.iceCube, padding: space.md, borderRadius: radius.lg },
  courier: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  call: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.mango, alignItems: 'center', justifyContent: 'center', ...shadows.soft },
  codeCard: { gap: space.md, borderWidth: 2, borderColor: 'transparent' },
  copy: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primarySoft, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill },
  codeCell: { width: 62, height: 74, borderRadius: radius.lg, backgroundColor: colors.oatMilk, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.border },
  codeDigit: { fontFamily: fonts.extrabold, fontSize: 38, lineHeight: 44, color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.lg },
  rowIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
