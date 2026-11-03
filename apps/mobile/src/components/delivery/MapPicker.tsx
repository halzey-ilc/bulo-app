import React, { useRef, useState } from 'react';
import { ActivityIndicator, Animated, Modal, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radius, shadows, space } from '../../theme';
import { currentPoint } from '../../lib/courierLocation';
import { toast } from '../../store/ui';
import { DeliveryMap, DeliveryMapHandle, LatLng } from '../map/DeliveryMap';
import { Icon } from '../Icon';
import { Button, hapticImpact, T, Touchable } from '../ui';

/** Бишкек, центр — если ни точки адреса, ни пекарни не знаем. */
export const BISHKEK: LatLng = { lat: 42.8746, lng: 74.5698 };

/**
 * Выбор точки как в приложениях доставки: пин стоит в центре, пользователь двигает карту под ним.
 * «Здесь» возвращает координаты центра.
 */
export function MapPicker({
  visible,
  initial,
  address,
  onClose,
  onPick,
}: {
  visible: boolean;
  initial: LatLng | null;
  address?: string;
  onClose: () => void;
  onPick: (p: LatLng) => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      {visible && <PickerBody initial={initial ?? BISHKEK} address={address} onClose={onClose} onPick={onPick} />}
    </Modal>
  );
}

function PickerBody({ initial, address, onClose, onPick }: { initial: LatLng; address?: string; onClose: () => void; onPick: (p: LatLng) => void }) {
  const insets = useSafeAreaInsets();
  const map = useRef<DeliveryMapHandle>(null);
  const [center, setCenter] = useState<LatLng>(initial);
  const [locating, setLocating] = useState(false);
  const lift = useRef(new Animated.Value(0)).current;

  const up = () => Animated.spring(lift, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 0 }).start();
  const down = () => {
    Animated.spring(lift, { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 10 }).start();
    hapticImpact();
  };

  const locate = async () => {
    setLocating(true);
    const p = await currentPoint();
    setLocating(false);
    if (!p) {
      toast.error('Не удалось определить, где вы. Разрешите доступ к геопозиции');
      return;
    }
    map.current?.setView(p, 17, true);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flex: 1 }}>
        <DeliveryMap
          ref={map}
          picker={{ ...initial, zoom: 17 }}
          autoFit={false}
          onMoveStart={up}
          onMoveEnd={(p) => {
            setCenter({ lat: p.lat, lng: p.lng });
            down();
          }}
        />
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
          <View style={styles.titlePill}>
            <T v="bodyStrong" style={{ fontFamily: fonts.extrabold }}>
              Точка доставки
            </T>
          </View>
          <Touchable haptic onPress={locate} style={styles.round} accessibilityLabel="Где я">
            {locating ? <ActivityIndicator color={colors.mango} /> : <Icon name="navigation" size={20} color={colors.blueberry} />}
          </Touchable>
        </View>
      </View>
      <View style={[styles.card, { paddingBottom: insets.bottom + space.lg }]}>
        {!!address && (
          <T v="h3" numberOfLines={2}>
            {address}
          </T>
        )}
        <T v="small" color={colors.textMuted}>
          Передвиньте карту, чтобы пин указывал на вход. Курьер приедет точно сюда.
        </T>
        <T v="caption" color={colors.textSoft} style={{ letterSpacing: 0 }}>
          {center.lat.toFixed(5)}, {center.lng.toFixed(5)}
        </T>
        <Button title="Здесь" icon="check" onPress={() => onPick(center)} />
      </View>
    </View>
  );
}

const PIN = 40;
const styles = StyleSheet.create({
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
  titlePill: { backgroundColor: colors.white, borderRadius: radius.pill, paddingHorizontal: space.lg, height: 40, justifyContent: 'center', ...shadows.card },
  card: {
    backgroundColor: colors.oatMilk,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -24,
    padding: space.xl,
    gap: space.sm,
    ...shadows.float,
  },
});
