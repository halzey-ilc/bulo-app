import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { errorMessage, Orders } from '../../api';
import { colors, fonts, radius, shadows, space } from '../../theme';
import { Sheet } from '../admin/kit';
import { Icon } from '../Icon';
import { Field, hapticSuccess, T, tap, Touchable } from '../ui';

const LEN = 4;

/**
 * Вручение заказа по коду: получатель называет 4 цифры, курьер вводит их на клавиатуре.
 * Неверный код — «встряхиваем» ячейки; верный — галочка, вибрация и закрытие.
 */
export function HandoverSheet({
  order,
  onClose,
  onDelivered,
}: {
  order: { orderId: string; number: number; partner: { name: string; contactName: string | null } } | null;
  onClose: () => void;
  onDelivered: (orderId: string) => void;
}) {
  const [code, setCode] = useState('');
  const [receivedBy, setReceivedBy] = useState('');
  const [showName, setShowName] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const shake = useRef(new Animated.Value(0)).current;
  const success = useRef(new Animated.Value(0)).current;
  const current = useRef(order);
  if (order) current.current = order;
  const o = current.current;

  useEffect(() => {
    if (order) {
      setCode('');
      setReceivedBy('');
      setShowName(false);
      setError(null);
      setBusy(false);
      setDone(false);
      success.setValue(0);
    }
  }, [order, success]);

  const runShake = () => {
    shake.setValue(0);
    Animated.sequence(
      [14, -12, 10, -8, 5, -3, 0].map((v) => Animated.timing(shake, { toValue: v, duration: 45, easing: Easing.linear, useNativeDriver: true })),
    ).start();
  };

  const submit = async (value: string) => {
    if (!o || busy || value.length < LEN) return;
    setBusy(true);
    setError(null);
    try {
      await Orders.setStatus(o.orderId, 'DELIVERED', { code: value, ...(receivedBy.trim() ? { receivedBy: receivedBy.trim() } : {}) });
      hapticSuccess();
      setDone(true);
      Animated.spring(success, { toValue: 1, useNativeDriver: true, speed: 10, bounciness: 12 }).start();
      setTimeout(() => onDelivered(o.orderId), 1500);
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setError(errorMessage(e));
      runShake();
      setTimeout(() => setCode(''), 380);
    } finally {
      setBusy(false);
    }
  };

  const press = (k: string) => {
    if (busy || done) return;
    tap();
    if (k === 'del') {
      setError(null);
      setCode((c) => c.slice(0, -1));
      return;
    }
    setError(null);
    setCode((c) => {
      if (c.length >= LEN) return c;
      const next = c + k;
      if (next.length === LEN) setTimeout(() => void submit(next), 120);
      return next;
    });
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
        <>
          <T v="body" color={colors.textMuted}>
            Попросите получателя назвать код из приложения или СМС — без кода заказ не отметить.
          </T>
          {showName ? (
            <Field label="Кто принял" placeholder={o?.partner.contactName || 'Имя получателя'} value={receivedBy} onChangeText={setReceivedBy} autoCapitalize="words" returnKeyType="done" />
          ) : (
            <Touchable onPress={() => setShowName(true)} haptic style={styles.nameLink}>
              <Icon name="user" size={16} color={colors.mango} />
              <T v="small" color={colors.mango} style={{ fontFamily: fonts.bold }}>
                Указать, кто принял (необязательно)
              </T>
            </Touchable>
          )}
          <Animated.View style={[styles.cells, { transform: [{ translateX: shake }] }]}>
            {Array.from({ length: LEN }, (_, i) => {
              const filled = i < code.length;
              const focus = i === code.length && !busy;
              return (
                <View key={i} style={[styles.cell, filled && styles.cellFilled, focus && styles.cellFocus, !!error && styles.cellError]}>
                  {busy && i === LEN - 1 && code.length === LEN ? (
                    <ActivityIndicator color={colors.mango} />
                  ) : (
                    <T style={styles.digit} color={error ? colors.danger : colors.text}>
                      {code[i] ?? ''}
                    </T>
                  )}
                </View>
              );
            })}
          </Animated.View>
          <View style={{ minHeight: 20, alignItems: 'center' }}>
            {!!error && (
              <T v="small" color={colors.danger} center style={{ fontFamily: fonts.bold }}>
                {error}
              </T>
            )}
          </View>


          <View style={styles.pad}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((k, i) =>
              k === '' ? (
                <View key={i} style={styles.key} />
              ) : (
                <Touchable key={i} onPress={() => press(k)} scaleTo={0.92} style={[styles.key, styles.keyBtn, k === 'del' && { backgroundColor: 'transparent', ...noShadow }]} accessibilityLabel={k === 'del' ? 'Стереть' : k}>
                  {k === 'del' ? <Icon name="chevronLeft" size={26} color={colors.text} /> : <T style={styles.keyText}>{k}</T>}
                </Touchable>
              ),
            )}
          </View>
        </>
      )}
    </Sheet>
  );
}

const noShadow = { elevation: 0, shadowOpacity: 0 };

const styles = StyleSheet.create({
  cells: { flexDirection: 'row', justifyContent: 'center', gap: space.md, marginTop: space.sm },
  cell: {
    width: 64,
    height: 68,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellFilled: { borderColor: colors.cambodia },
  cellFocus: { borderColor: colors.mango },
  cellError: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  digit: { fontFamily: fonts.extrabold, fontSize: 36, lineHeight: 42 },
  nameLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 6 },
  pad: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: space.sm },
  key: { width: '31.5%', height: 52, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  keyBtn: { backgroundColor: colors.white, ...shadows.soft },
  keyText: { fontFamily: fonts.bold, fontSize: 26, lineHeight: 32, color: colors.text },
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
