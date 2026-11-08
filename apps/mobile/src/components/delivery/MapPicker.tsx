import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Keyboard, Modal, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Address, Geo, GeoHit } from '../../api';
import { currentPoint } from '../../lib/courierLocation';
import { toast } from '../../store/ui';
import { colors, fonts, radius, shadows, space } from '../../theme';
import { DeliveryMap, DeliveryMapHandle, LatLng } from '../map/DeliveryMap';
import { Icon, IconName } from '../Icon';
import { FadeIn } from '../motion';
import { Button, Field, hapticImpact, T, Touchable } from '../ui';

/** Бишкек, центр — если ни точки адреса, ни пекарни не знаем. */
export const BISHKEK: LatLng = { lat: 42.8746, lng: 74.5698 };

export interface PickedAddress {
  address: string;
  lat: number;
  lng: number;
  entrance: string;
  /** Выбрали уже сохранённый адрес — его id */
  id?: string;
}

/**
 * Выбор адреса как в такси:
 * 1) строка поиска — под ней последние адреса, по мере ввода подсказки (дом найден точно или только улица);
 * 2) карта с пином в центре — под пином сразу видно, какой это адрес; пин двигают ко входу;
 * 3) подъезд и ориентир — и «Доставить сюда».
 */
export function AddressPicker({
  visible,
  initial,
  recents = [],
  near,
  title = 'Куда доставить?',
  confirmText = 'Доставить сюда',
  onClose,
  onDone,
}: {
  visible: boolean;
  /** Правка существующего адреса — сразу на карте */
  initial?: { address: string; lat?: number | null; lng?: number | null; entrance?: string | null } | null;
  recents?: Address[];
  /** Ближе к этой точке подсказки выше (пекарня) */
  near?: LatLng | null;
  title?: string;
  confirmText?: string;
  onClose: () => void;
  onDone: (a: PickedAddress) => void | Promise<void>;
}) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      {visible && <PickerBody initial={initial} recents={recents} near={near ?? BISHKEK} title={title} confirmText={confirmText} onClose={onClose} onDone={onDone} />}
    </Modal>
  );
}

type Spot = { lat: number; lng: number; title: string; exact: boolean; source: 'hit' | 'reverse' | 'saved' };

function PickerBody({
  initial,
  recents,
  near,
  title,
  confirmText,
  onClose,
  onDone,
}: {
  initial?: { address: string; lat?: number | null; lng?: number | null; entrance?: string | null } | null;
  recents: Address[];
  near: LatLng;
  title: string;
  confirmText: string;
  onClose: () => void;
  onDone: (a: PickedAddress) => void | Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const hasPoint = initial?.lat != null && initial?.lng != null;
  const [step, setStep] = useState<'search' | 'map'>(hasPoint ? 'map' : 'search');
  const [query, setQuery] = useState(hasPoint ? '' : (initial?.address ?? ''));
  const [spot, setSpot] = useState<Spot | null>(
    hasPoint ? { lat: initial!.lat!, lng: initial!.lng!, title: initial!.address, exact: true, source: 'saved' } : null,
  );
  const [entrance, setEntrance] = useState(initial?.entrance ?? '');
  const [saving, setSaving] = useState(false);

  const openMap = (s: Spot) => {
    Keyboard.dismiss();
    setSpot(s);
    setStep('map');
  };

  const pickRecent = async (a: Address) => {
    if (a.lat == null || a.lng == null) {
      // у старого адреса нет точки — пусть поправят пин
      openMap({ lat: near.lat, lng: near.lng, title: a.address, exact: false, source: 'saved' });
      setEntrance(a.entrance ?? '');
      return;
    }
    hapticImpact();
    setSaving(true);
    try {
      await onDone({ id: a.id, address: a.address, lat: a.lat, lng: a.lng, entrance: a.entrance ?? '' });
    } finally {
      setSaving(false);
    }
  };

  const confirm = async () => {
    if (!spot) return;
    setSaving(true);
    try {
      await onDone({ address: spot.title, lat: spot.lat, lng: spot.lng, entrance: entrance.trim() });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {step === 'search' ? (
        <SearchStep
          insetsTop={insets.top}
          title={title}
          query={query}
          setQuery={setQuery}
          recents={recents}
          near={near}
          busy={saving}
          onClose={hasPoint || spot ? () => setStep('map') : onClose}
          onRecent={pickRecent}
          onHit={(h) => openMap({ lat: h.lat, lng: h.lng, title: h.title, exact: h.exact, source: 'hit' })}
          onMap={(p) => openMap({ lat: p.lat, lng: p.lng, title: '', exact: false, source: 'reverse' })}
        />
      ) : (
        <MapStep
          insets={insets}
          spot={spot ?? { ...near, title: '', exact: false, source: 'reverse' }}
          setSpot={setSpot}
          entrance={entrance}
          setEntrance={setEntrance}
          saving={saving}
          confirmText={confirmText}
          onSearch={() => {
            setQuery(spot?.title ?? '');
            setStep('search');
          }}
          onClose={onClose}
          onConfirm={confirm}
        />
      )}
    </View>
  );
}

/* ───────── Шаг 1: поиск ───────── */

function SearchStep({
  insetsTop,
  title,
  query,
  setQuery,
  recents,
  near,
  busy,
  onClose,
  onRecent,
  onHit,
  onMap,
}: {
  insetsTop: number;
  title: string;
  query: string;
  setQuery: (v: string) => void;
  recents: Address[];
  near: LatLng;
  busy: boolean;
  onClose: () => void;
  onRecent: (a: Address) => void;
  onHit: (h: GeoHit) => void;
  onMap: (p: LatLng) => void;
}) {
  const [hits, setHits] = useState<GeoHit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const seq = useRef(0);

  // подсказки по мере ввода: ждём паузу в наборе, старые ответы отбрасываем
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setHits(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const my = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const r = await Geo.suggest(q, near);
        if (my === seq.current) setHits(r);
      } catch {
        if (my === seq.current) setHits([]);
      } finally {
        if (my === seq.current) setLoading(false);
      }
    }, 380);
    return () => clearTimeout(t);
  }, [query, near]);

  const locate = async () => {
    setLocating(true);
    const p = await currentPoint();
    setLocating(false);
    if (!p) {
      toast.error('Не удалось определить, где вы. Разрешите доступ к геопозиции');
      return;
    }
    onMap(p);
  };

  const typing = query.trim().length >= 3;
  const recentList = recents.filter((a) => !query.trim() || a.address.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 6);

  return (
    <View style={{ flex: 1, paddingTop: insetsTop + 8 }}>
      <View style={styles.searchHead}>
        <Touchable haptic onPress={onClose} style={styles.roundFlat} accessibilityLabel="Назад">
          <Icon name="chevronLeft" size={24} />
        </Touchable>
        <T v="h2" style={{ flex: 1 }}>
          {title}
        </T>
      </View>
      <View style={{ paddingHorizontal: space.lg, paddingBottom: space.sm }}>
        <Field
          autoFocus
          placeholder="Улица и номер дома"
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          returnKeyType="search"
          left={<Icon name="search" size={18} color={colors.textSoft} />}
          right={
            loading ? (
              <ActivityIndicator color={colors.mango} size="small" />
            ) : query ? (
              <Touchable onPress={() => setQuery('')} hitSlop={10} accessibilityLabel="Очистить">
                <Icon name="close" size={18} color={colors.textSoft} />
              </Touchable>
            ) : null
          }
        />
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: 40, gap: 2 }}>
        {!typing && (
          <View style={styles.quickRow}>
            <QuickAction icon="navigation" label="Где я" loading={locating} onPress={locate} />
            <QuickAction icon="pin" label="На карте" onPress={() => onMap(near)} />
          </View>
        )}

        {typing && hits && hits.length > 0 &&
          hits.map((h, i) => (
            <FadeIn key={`${h.lat},${h.lng}`} delay={i * 30} offset={6}>
              <ResultRow icon={h.exact ? 'pin' : 'navigation'} title={h.title} subtitle={h.exact ? h.subtitle : `${h.subtitle ? h.subtitle + ' · ' : ''}дом уточните на карте`} onPress={() => onHit(h)} />
            </FadeIn>
          ))}

        {typing && hits && !hits.length && !loading && (
          <View style={styles.empty}>
            <T v="bodyStrong">Такого адреса не нашли</T>
            <T v="small" color={colors.textMuted} center>
              Проверьте название улицы или поставьте точку на карте сами
            </T>
            <Button title="Указать на карте" icon="pin" kind="secondary" small onPress={() => onMap(near)} />
          </View>
        )}

        {recentList.length > 0 && (
          <>
            <T v="caption" color={colors.textSoft} style={styles.section}>
              {typing ? 'СОХРАНЁННЫЕ' : 'ПОСЛЕДНИЕ АДРЕСА'}
            </T>
            {recentList.map((a, i) => (
              <FadeIn key={a.id} delay={i * 35} offset={6}>
                <ResultRow
                  icon="clock"
                  title={a.label || a.address}
                  subtitle={a.label ? a.address : a.entrance || (a.ordersCount ? `${a.ordersCount} ${a.ordersCount === 1 ? 'заказ' : a.ordersCount < 5 ? 'заказа' : 'заказов'}` : 'Бишкек')}
                  disabled={busy}
                  onPress={() => onRecent(a)}
                />
              </FadeIn>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function QuickAction({ icon, label, onPress, loading }: { icon: IconName; label: string; onPress: () => void; loading?: boolean }) {
  return (
    <Touchable haptic onPress={onPress} style={styles.quick} scaleTo={0.96}>
      {loading ? <ActivityIndicator color={colors.mango} size="small" /> : <Icon name={icon} size={18} color={colors.mango} />}
      <T v="bodyStrong">{label}</T>
    </Touchable>
  );
}

function ResultRow({ icon, title, subtitle, onPress, disabled }: { icon: IconName; title: string; subtitle?: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Touchable onPress={onPress} disabled={disabled} style={styles.row} scaleTo={0.98}>
      <View style={styles.rowIcon}>
        <Icon name={icon} size={18} color={colors.textMuted} />
      </View>
      <View style={{ flex: 1 }}>
        <T v="bodyStrong" numberOfLines={1}>
          {title}
        </T>
        {!!subtitle && (
          <T v="small" color={colors.textMuted} numberOfLines={1}>
            {subtitle}
          </T>
        )}
      </View>
    </Touchable>
  );
}

/* ───────── Шаг 2: карта ───────── */

function MapStep({
  insets,
  spot,
  setSpot,
  entrance,
  setEntrance,
  saving,
  confirmText,
  onSearch,
  onClose,
  onConfirm,
}: {
  insets: { top: number; bottom: number };
  spot: Spot;
  setSpot: (s: Spot) => void;
  entrance: string;
  setEntrance: (v: string) => void;
  saving: boolean;
  confirmText: string;
  onSearch: () => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const map = useRef<DeliveryMapHandle>(null);
  const [locating, setLocating] = useState(false);
  const [resolving, setResolving] = useState(!spot.title);
  const lift = useRef(new Animated.Value(0)).current;
  const anchor = useRef({ lat: spot.lat, lng: spot.lng });
  const spotRef = useRef(spot);
  spotRef.current = spot;
  const seq = useRef(0);

  const up = () => Animated.spring(lift, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 0 }).start();
  const down = () => {
    Animated.spring(lift, { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 10 }).start();
    hapticImpact();
  };

  const resolve = async (p: LatLng) => {
    const my = ++seq.current;
    setResolving(true);
    try {
      const r = await Geo.reverse(p);
      if (my !== seq.current) return;
      setSpot({ lat: p.lat, lng: p.lng, title: r?.title ?? spotRef.current.title ?? '', exact: !!r?.exact, source: 'reverse' });
    } catch {
      if (my === seq.current) setSpot({ ...spotRef.current, lat: p.lat, lng: p.lng });
    } finally {
      if (my === seq.current) setResolving(false);
    }
  };

  // точку выбрали без адреса (карта, «где я») — сразу узнаём, что под пином
  useEffect(() => {
    if (!spot.title) void resolve(spot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onMoveEnd = (p: LatLng) => {
    down();
    const s = spotRef.current;
    // небольшой сдвиг найденного дома ко входу — подпись оставляем как нашли
    if (s.source !== 'reverse' && dist(anchor.current, p) < 30) {
      setSpot({ ...s, lat: p.lat, lng: p.lng });
      return;
    }
    void resolve(p);
  };

  const locate = async () => {
    setLocating(true);
    const p = await currentPoint();
    setLocating(false);
    if (!p) {
      toast.error('Не удалось определить, где вы. Разрешите доступ к геопозиции');
      return;
    }
    map.current?.setView(p, 18, true);
  };

  return (
    <>
      <View style={{ flex: 1 }}>
        <DeliveryMap ref={map} picker={{ lat: spot.lat, lng: spot.lng, zoom: 18 }} autoFit={false} onMoveStart={up} onMoveEnd={onMoveEnd} />
        {/* Пин в центре карты: «приподнимается», пока карту двигают */}
        <View style={styles.pinWrap} pointerEvents="none">
          <Animated.View style={{ alignItems: 'center', transform: [{ translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [0, -14] }) }] }}>
            <View style={styles.pinHead}>
              <View style={styles.pinDot} />
            </View>
            <View style={styles.pinLeg} />
          </Animated.View>
          <Animated.View style={[styles.pinShadow, { opacity: lift.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.15] }), transform: [{ scale: lift.interpolate({ inputRange: [0, 1], outputRange: [1, 0.7] }) }] }]} />
        </View>
        <View style={[styles.top, { top: insets.top + 8 }]} pointerEvents="box-none">
          <Touchable haptic onPress={onClose} style={styles.round} accessibilityLabel="Закрыть">
            <Icon name="close" size={22} />
          </Touchable>
          <Touchable haptic onPress={locate} style={styles.round} accessibilityLabel="Где я">
            {locating ? <ActivityIndicator color={colors.mango} /> : <Icon name="navigation" size={20} color={colors.blueberry} />}
          </Touchable>
        </View>
      </View>
      <View style={[styles.card, { paddingBottom: insets.bottom + space.lg }]}>
        <Touchable onPress={onSearch} style={styles.addrBox} scaleTo={0.98} accessibilityLabel="Изменить адрес">
          <View style={{ flex: 1 }}>
            {resolving && !spot.title ? (
              <T v="h3" color={colors.textSoft}>
                Определяем адрес…
              </T>
            ) : (
              <T v="h3" numberOfLines={2}>
                {spot.title || 'Адрес не определён — введите его'}
              </T>
            )}
            {!spot.exact && !!spot.title && !resolving && (
              <T v="small" color={colors.coffee}>
                Дом точно не нашли — подвиньте пин ко входу
              </T>
            )}
          </View>
          {resolving && spot.title ? <ActivityIndicator color={colors.mango} size="small" /> : <Icon name="search" size={20} color={colors.textSoft} />}
        </Touchable>
        <Field placeholder="Подъезд, этаж, ориентир" value={entrance} onChangeText={setEntrance} maxLength={200} />
        <Button title={confirmText} icon="check" loading={saving} disabled={!spot.title || (resolving && !spot.title)} onPress={onConfirm} />
      </View>
    </>
  );
}

function dist(a: LatLng, b: LatLng) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

const PIN = 40;
const styles = StyleSheet.create({
  searchHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingBottom: space.sm },
  roundFlat: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  quickRow: { flexDirection: 'row', gap: space.sm, marginBottom: space.sm },
  quick: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: radius.lg, backgroundColor: colors.white, ...shadows.soft },
  section: { fontFamily: fonts.bold, marginTop: space.md, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 10 },
  rowIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.oatMilk, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', gap: space.sm, paddingVertical: space.xl },
  pinWrap: { position: 'absolute', left: '50%', top: '50%', width: 60, marginLeft: -30, marginTop: -(PIN + 18), alignItems: 'center' },
  pinHead: {
    width: PIN,
    height: PIN,
    borderRadius: PIN / 2,
    backgroundColor: colors.mango,
    borderWidth: 4,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.float,
  },
  pinDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.white },
  pinLeg: { width: 4, height: 18, borderBottomLeftRadius: 2, borderBottomRightRadius: 2, backgroundColor: colors.cambodia, marginTop: -2 },
  pinShadow: { width: 14, height: 6, borderRadius: 7, backgroundColor: colors.cambodia, marginTop: -3 },
  top: { position: 'absolute', left: space.md, right: space.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  round: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', ...shadows.card },
  card: {
    backgroundColor: colors.oatMilk,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -24,
    padding: space.xl,
    gap: space.md,
    ...shadows.float,
  },
  addrBox: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
