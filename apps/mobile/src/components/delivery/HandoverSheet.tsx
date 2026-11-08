import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { errorMessage, Orders } from '../../api';
import { colors, fonts, shadows, space } from '../../theme';
import { Sheet } from '../admin/kit';
import { Icon } from '../Icon';
import { Button, Field, hapticSuccess, T } from '../ui';


/** Вручение заказа без кода (как в доставке Яндекса): курьер отдаёт заказ и подтверждает одной кнопкой. */
export function HandoverSheet({
  order,
  onClose,
  onDelivered,
}: {
  order: { orderId: string; number: number; partner: { name: string; contactName: string | null } } | null;
  onClose: () => void;
  onDelivered: (orderId: string) => void;
}) {
  const [receivedBy, setReceivedBy] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const success = useRef(new Animated.Value(0)).current;
  const current = useRef(order);
  if (order) current.current = order;
  const o = current.current;

  useEffect(() => {
    if (order) {
      setReceivedBy('');
      setError(null);
      setBusy(false);
      setDone(false);
      success.setValue(0);
    }
  }, [order, success]);

  const submit = async () => {
    if (!o || busy) return;
    setBusy(true);
    setError(null);
    try {
      await Orders.setStatus(o.orderId, 'DELIVERED', receivedBy.trim() ? { receivedBy: receivedBy.trim() } : {});
      hapticSuccess();
      setDone(true);
      Animated.spring(success, { toValue: 1, useNativeDriver: true, speed: 10, bounciness: 12 }).start();
      setTimeout(() => onDelivered(o.orderId), 1500);
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={!!order} onClose={onClose} dismissable={!busy && !done} title={done ? undefined : 'Вручение заказа'} subtitle={o ? `№${o.number} · ${o.partner.name}` : undefined}>
      {done ? (
        <View style={styles.done}>
          <Animated.View style={[styles.doneCircle, { transform: [{ scale: success.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }], opacity: success }]}>
            <Icon name="check" size={54} color={colors.white} strokeWidth={3} />
          </Animated.View>
          <T v="h1" center>
            Заказ вручён
          </T>
          <T v="body" center color={colors.textMuted}>
            №{o?.number} · {o?.partner.name}
            {receivedBy.trim() ? `\nПринял: ${receivedBy.trim()}` : ''}
          </T>
        </View>
      ) : (
        <View style={{ gap: space.md }}>
          <T v="body" color={colors.textMuted}>
            Передайте заказ получателю и нажмите «Заказ вручён». Код не нужен.
          </T>
          <Field
            label="Кто принял (необязательно)"
            placeholder={o?.partner.contactName || 'Имя получателя'}
            value={receivedBy}
            onChangeText={setReceivedBy}
            autoCapitalize="words"
            returnKeyType="done"
          />
          {!!error && (
            <T v="small" color={colors.danger} center style={{ fontFamily: fonts.bold }}>
              {error}
            </T>
          )}
          <Button title="Заказ вручён" icon="check" onPress={submit} loading={busy} />
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  done: { alignItems: 'center', gap: space.sm, paddingVertical: space.xxl },
  doneCircle: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.md,
    ...shadows.float,
  },
});
