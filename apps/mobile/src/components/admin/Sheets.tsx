import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { errorMessage } from '../../api';
import { money } from '../../lib/format';
import { colors, fonts, radius, space } from '../../theme';
import { Button, Field, T, Touchable } from '../ui';
import { AIcon, AIconName } from './icons';
import { Note, Sheet } from './kit';

/** Шторка с причиной: быстрые варианты + свой текст. Для отклонения заказа, заявки, блокировки. */
export function ReasonSheet({
  visible,
  onClose,
  title,
  message,
  presets = [],
  confirmText = 'Отклонить',
  placeholder = 'Причина',
  onSubmit,
  destructive = true,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  message?: string;
  presets?: string[];
  confirmText?: string;
  placeholder?: string;
  onSubmit: (reason: string) => Promise<void> | void;
  destructive?: boolean;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (visible) {
      setText('');
      setErr(null);
      setBusy(false);
    }
  }, [visible]);

  const submit = async () => {
    const r = text.trim();
    if (r.length < 2) return setErr('Напишите причину — её увидит клиент');
    setBusy(true);
    try {
      await onSubmit(r);
      onClose();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      subtitle={message}
      footer={<Button title={confirmText} kind={destructive ? 'danger' : 'primary'} onPress={submit} loading={busy} />}
    >
      {presets.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {presets.map((p) => {
            const active = text === p;
            return (
              <Touchable
                key={p}
                haptic
                onPress={() => {
                  setText(p);
                  setErr(null);
                }}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 9,
                  borderRadius: radius.pill,
                  backgroundColor: active ? colors.coffee : colors.white,
                  borderWidth: 1,
                  borderColor: active ? colors.coffee : colors.border,
                }}
              >
                <T v="small" color={active ? colors.white : colors.text} style={{ fontFamily: fonts.bold }}>
                  {p}
                </T>
              </Touchable>
            );
          })}
        </View>
      )}
      <Field
        placeholder={placeholder}
        value={text}
        onChangeText={(v) => {
          setText(v);
          setErr(null);
        }}
        multiline
        error={err}
      />
    </Sheet>
  );
}

export const PAY_METHODS: { key: string; label: string; icon: AIconName; hint: string; bg: string; fg: string }[] = [
  { key: 'Наличные', label: 'Наличные', icon: 'cash', hint: 'Курьеру или в офисе', bg: '#DDEFD9', fg: colors.success },
  { key: 'Перевод', label: 'Перевод', icon: 'transfer', hint: 'На расчётный счёт', bg: colors.iceCube, fg: colors.blueberry },
  { key: 'Карта / QR', label: 'Карта / QR', icon: 'qr', hint: 'Терминал, Элсом, MBank…', bg: colors.softYellow, fg: '#8A5A00' },
];

/** Выбор способа оплаты: одно касание — и готово. */
export function PayMethodSheet({
  visible,
  onClose,
  title,
  total,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  total?: number;
  onPick: (method: string) => void;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title} subtitle={total != null ? `Сумма ${money(total)}` : undefined}>
      <View style={{ gap: space.sm }}>
        {PAY_METHODS.map((m) => (
          <Touchable
            key={m.key}
            scaleTo={0.97}
            onPress={() => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              onPick(m.key);
            }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.white, borderRadius: radius.lg, padding: space.md }}
          >
            <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: m.bg, alignItems: 'center', justifyContent: 'center' }}>
              <AIcon name={m.icon} size={24} color={m.fg} />
            </View>
            <View style={{ flex: 1 }}>
              <T v="h3">{m.label}</T>
              <T v="small" color={colors.textMuted}>
                {m.hint}
              </T>
            </View>
            <AIcon name="check" size={20} color={colors.textSoft} />
          </Touchable>
        ))}
      </View>
      <Note icon="info" text="Способ оплаты уточняется — пока отмечаем вручную. Онлайн-оплата появится позже." />
    </Sheet>
  );
}

export const ORDER_REJECT_PRESETS = ['Нет нужного количества', 'Не подходит дата доставки', 'Дубль заказа', 'По просьбе клиента', 'Нет оплаты'];
export const PARTNER_REJECT_PRESETS = ['Не удалось связаться', 'Неполные данные', 'Не работаем в этом районе', 'Дубль заявки'];
export const PARTNER_BLOCK_PRESETS = ['Долг по оплате', 'Нарушение условий', 'Прекратили сотрудничество'];
