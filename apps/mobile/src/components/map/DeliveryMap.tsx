import React, { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { colors } from '../../theme';
import { MapFrame, MapFrameHandle } from './MapFrame';

export type LatLng = { lat: number; lng: number };

export interface MapMarker extends LatLng {
  id: string;
  /** bakery — пекарня, stop — точка маршрута с номером, dest — адрес получателя, me — «я здесь». */
  kind: 'bakery' | 'stop' | 'dest' | 'me';
  label?: string;
  active?: boolean;
}

export interface MapPadding {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface DeliveryMapHandle {
  /** Показать все точки целиком. */
  fit: () => void;
  /** Следовать за курьером (или вернуться к обзору маршрута). */
  follow: (on: boolean) => void;
  /** Поставить центр карты (выбор точки адреса). */
  setView: (p: LatLng, zoom?: number, animate?: boolean) => void;
}

type Courier = { lat: number; lng: number; heading?: number | null } | null;

const DEFAULT_PADDING: MapPadding = { top: 80, bottom: 80, left: 40, right: 40 };

/**
 * Карта доставки (Leaflet + OSM в WebView/iframe). Пропсы превращаются в сообщения для страницы:
 * сама страница грузится один раз, маркеры и маршрут меняются на месте, курьер едет плавно.
 */
export function DeliveryMap({
  ref,
  markers = [],
  route,
  byRoads = true,
  courier,
  courierAnimMs = 1000,
  courierLabel,
  padding = DEFAULT_PADDING,
  autoFit = true,
  keepInView = false,
  picker,
  onMarkerPress,
  onUserMove,
  onMoveStart,
  onMoveEnd,
  style,
}: {
  ref?: React.Ref<DeliveryMapHandle>;
  markers?: MapMarker[];
  route?: [number, number][] | null;
  byRoads?: boolean;
  courier?: Courier;
  /** За сколько мс курьер «доезжает» до новой точки (≈ интервал обновлений). */
  courierAnimMs?: number;
  /** Подпись над курьером, например «4 мин». */
  courierLabel?: string | null;
  /** Отступы от краёв (шторка, шапка), чтобы точки не прятались под ними. */
  padding?: MapPadding;
  /** Подгонять масштаб, когда меняется набор точек (пока пользователь сам не двигал карту). */
  autoFit?: boolean;
  /** Держать в кадре курьера и все точки, пока он едет (экран получателя). */
  keepInView?: boolean;
  /** Режим выбора точки: начальный центр карты. */
  picker?: LatLng & { zoom?: number };
  onMarkerPress?: (id: string) => void;
  onUserMove?: () => void;
  onMoveStart?: () => void;
  onMoveEnd?: (p: LatLng & { zoom: number }) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const frame = useRef<MapFrameHandle>(null);
  const ready = useRef(false);
  const queue = useRef<unknown[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const cbs = useRef({ onMarkerPress, onUserMove, onMoveStart, onMoveEnd });
  cbs.current = { onMarkerPress, onUserMove, onMoveStart, onMoveEnd };

  const post = useCallback((msg: unknown) => {
    if (ready.current) frame.current?.post(msg);
    else queue.current.push(msg);
  }, []);

  useImperativeHandle(ref, () => ({
    fit: () => post({ type: 'fit' }),
    follow: (on) => post({ type: 'follow', on }),
    setView: (p, zoom, animate = true) => post({ type: 'view', lat: p.lat, lng: p.lng, zoom, animate, picker: true }),
  }));

  // Начальный центр для выбора точки — один раз.
  const pickerRef = useRef(picker);
  useEffect(() => {
    const p = pickerRef.current;
    if (p) post({ type: 'view', lat: p.lat, lng: p.lng, zoom: p.zoom ?? 16, picker: true });
  }, [post]);

  // Сцена: маркеры + маршрут. Отправляем, только если что-то реально поменялось.
  const sceneJson = JSON.stringify({ markers, route: route ?? null, byRoads, padding, keepInView });
  const idsKey = markers.map((m) => m.id).join(',');
  const lastIds = useRef<string | null>(null);
  useEffect(() => {
    const scene = JSON.parse(sceneJson);
    const fit = autoFit && idsKey !== lastIds.current;
    lastIds.current = idsKey;
    post({ type: 'scene', ...scene, fit });
  }, [sceneJson, idsKey, autoFit, post]);

  // Курьер: только координаты — страница сама плавно ведёт маркер.
  const cLat = courier?.lat;
  const cLng = courier?.lng;
  const cHead = courier?.heading ?? null;
  const cLabel = courierLabel ?? null;
  useEffect(() => {
    post({ type: 'courier', courier: cLat != null && cLng != null ? { lat: cLat, lng: cLng, heading: cHead, ms: courierAnimMs, label: cLabel } : null });
  }, [cLat, cLng, cHead, courierAnimMs, cLabel, post]);

  const onMessage = useCallback(
    (data: string) => {
      let m: any;
      try {
        m = JSON.parse(data);
      } catch {
        return;
      }
      switch (m?.type) {
        case 'ready': {
          ready.current = true;
          setLoaded(true);
          const q = queue.current;
          queue.current = [];
          // из очереди достаточно последней сцены и последней позиции курьера
          const lastScene = [...q].reverse().find((x: any) => x.type === 'scene');
          const lastCourier = [...q].reverse().find((x: any) => x.type === 'courier');
          for (const x of q as any[]) if (x.type !== 'scene' && x.type !== 'courier') frame.current?.post(x);
          if (lastScene) frame.current?.post({ ...(lastScene as object), fit: true });
          if (lastCourier) frame.current?.post(lastCourier);
          break;
        }
        case 'error':
          setFailed(true);
          setLoaded(true);
          break;
        case 'marker':
          cbs.current.onMarkerPress?.(m.id);
          break;
        case 'userMove':
          cbs.current.onUserMove?.();
          break;
        case 'moveStart':
          cbs.current.onMoveStart?.();
          break;
        case 'moveEnd':
          cbs.current.onMoveEnd?.({ lat: m.lat, lng: m.lng, zoom: m.zoom });
          break;
      }
    },
    [],
  );

  return (
    <View style={[styles.wrap, style]}>
      <MapFrame ref={frame} onMessage={onMessage} />
      <LoadingVeil done={loaded || failed} />
    </View>
  );
}

/** Подложка, пока грузится карта: растворяется, а не пропадает рывком. */
function LoadingVeil({ done }: { done: boolean }) {
  const v = useRef(new Animated.Value(1)).current;
  const [gone, setGone] = useState(false);
  useEffect(() => {
    if (!done) return;
    Animated.timing(v, { toValue: 0, duration: 380, delay: 120, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(() => setGone(true));
  }, [done, v]);
  if (gone) return null;
  return (
    <Animated.View style={[styles.loading, { opacity: v }]} pointerEvents="none">
      <ActivityIndicator color={colors.mango} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#EFE9DA', overflow: 'hidden' },
  loading: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EFE9DA' },
});
