import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Linking, Platform, ScrollView, StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { File, Paths } from 'expo-file-system';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { Branch, Catalog, errorMessage, Loyalty, Order, Orders, PaymentInfo, PaymentMethod, PickupSlot, PickupSlots } from '../api';
import { photoSrc } from '../api/admin';
import { branchHours, switchBranch, useBranch } from '../lib/branch';
import { setCached } from '../lib/cache';
import { money } from '../lib/format';
import { invalidateOrders, Q, useQuery } from '../lib/queries';
import { toast } from '../store/ui';
import { colors, fonts, radius, shadows, space } from '../theme';
import { Sheet } from './admin/kit';
import { Icon, IconName } from './Icon';
import { FadeIn } from './motion';
import { Button, hapticSuccess, Skeleton, T, tap, Touchable } from './ui';

/* ───────── Филиал ───────── */

/** «7 мкр · открыто до 22:00 ▾» — выбор филиала. */
export function BranchChip({ light }: { light?: boolean }) {
  const { branch, branches } = useBranch();
  const [open, setOpen] = useState(false);
  if (!branch) return <Skeleton style={{ height: 34, width: 180, borderRadius: radius.pill }} />;
  const h = branchHours(branch);
  return (
    <>
      <Touchable haptic onPress={() => setOpen(true)} style={[styles.branchChip, light && { backgroundColor: 'rgba(255,255,255,0.18)' }]} scaleTo={0.96}>
        <Icon name="pin" size={16} color={light ? colors.white : colors.mango} strokeWidth={2} />
        <T v="bodyStrong" numberOfLines={1} color={light ? colors.white : colors.text} style={{ fontFamily: fonts.bold, flexShrink: 0 }}>
          {branch.name}
        </T>
        <View style={[styles.dot, { backgroundColor: h.open ? '#3BB273' : colors.textSoft }]} />
        <T v="small" numberOfLines={1} color={light ? 'rgba(255,255,255,0.85)' : colors.textMuted}>
          {h.open ? `до ${branch.closesAt}` : `с ${branch.opensAt}`}
        </T>
        {branches.length > 1 && <Icon name="chevronDown" size={16} color={light ? colors.white : colors.textMuted} />}
      </Touchable>
      <BranchSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function BranchSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { branch, branches } = useBranch();
  return (
    <Sheet visible={visible} onClose={onClose} title="Филиал кофейни" subtitle="Меню и цены у каждого филиала свои">
      <View style={{ gap: space.sm }}>
        {branches.map((b) => {
          const active = b.id === branch?.id;
          const h = branchHours(b);
          const empty = b.menuSize === 0;
          return (
            <Touchable
              key={b.id}
              haptic
              disabled={empty}
              onPress={() => {
                void switchBranch(b);
                onClose();
              }}
              style={[styles.branchRow, active && styles.branchRowActive, empty && { opacity: 0.55 }]}
              scaleTo={0.98}
            >
              <View style={[styles.branchIcon, active && { backgroundColor: colors.mango }]}>
                <Icon name="coffee" size={22} color={active ? colors.white : colors.mango} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <T v="h3">{b.name}</T>
                {!!b.address && (
                  <T v="small" color={colors.textMuted} numberOfLines={1}>
                    {b.address}
                  </T>
                )}
                <T v="small" color={empty ? colors.mango : h.open ? colors.success : colors.textSoft} style={{ fontFamily: fonts.semibold }}>
                  {empty ? 'Меню скоро появится' : `${h.open ? 'Открыто' : 'Закрыто'} · ${h.text}`}
                </T>
              </View>
              {active && <Icon name="check" size={22} color={colors.mango} strokeWidth={2.2} />}
            </Touchable>
          );
        })}
      </View>
    </Sheet>
  );
}

/* ───────── Карта гостя ───────── */

/** Карта «7-й кофе в подарок»: штампы-стаканчики, последний — подарок. */
export function LoyaltyCard({ loyalty, onSignIn }: { loyalty?: Loyalty | null; onSignIn?: () => void }) {
  const every = loyalty?.every ?? 7;
  const stamps = loyalty?.stamps ?? 0;
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [anim, stamps]);
  if (loyalty && !loyalty.enabled) return null;
  const title = !loyalty
    ? `${every}-й кофе — в подарок`
    : loyalty.nextIsFree
      ? 'Следующий кофе — бесплатно!'
      : `Ещё ${loyalty.untilFree - 1} ${cups(loyalty.untilFree - 1)} — и ${every}-й в подарок`;
  return (
    <FadeIn>
      <Touchable onPress={onSignIn} disabled={!onSignIn} style={styles.loyalty} scaleTo={0.98}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <View style={styles.loyaltyTag}>
            <Icon name="gift" size={14} color={colors.coffee} strokeWidth={2} />
            <T v="caption" color={colors.coffee} style={{ fontFamily: fonts.extrabold }}>
              КАРТА ГОСТЯ
            </T>
          </View>
          <View style={{ flex: 1 }} />
          {loyalty && (
            <T v="small" color="rgba(255,255,255,0.8)" style={{ fontFamily: fonts.bold }}>
              {loyalty.total} {cups(loyalty.total)} всего
            </T>
          )}
        </View>
        <T v="h2" color={colors.white}>
          {title}
        </T>
        <View style={styles.stamps}>
          {Array.from({ length: every }, (_, i) => {
            const filled = i < stamps;
            const gift = i === every - 1;
            return (
              <Animated.View
                key={i}
                style={[
                  styles.stamp,
                  filled && styles.stampFilled,
                  gift && styles.stampGift,
                  filled && {
                    opacity: anim.interpolate({ inputRange: [0, Math.min(0.99, (i + 1) / every), 1], outputRange: [0.3, 1, 1] }),
                    transform: [{ scale: anim.interpolate({ inputRange: [0, Math.min(0.99, (i + 1) / every), 1], outputRange: [0.6, 1.08, 1] }) }],
                  },
                ]}
              >
                <Icon name={gift ? 'gift' : 'coffee'} size={18} color={filled ? colors.coffee : gift ? colors.softYellow : 'rgba(255,255,255,0.55)'} strokeWidth={2} />
              </Animated.View>
            );
          })}
        </View>
        <T v="small" color="rgba(255,255,255,0.9)" style={{ fontFamily: fonts.semibold }}>
          {loyalty ? 'Штамп ставится за каждый кофе в брони. Подарок спишется сам.' : 'Войдите по номеру — и копите штампы за каждый кофе'}
        </T>
      </Touchable>
    </FadeIn>
  );
}
const cups = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'кофе' : 'кофе');

/* ───────── Время самовывоза ───────── */

export function PickupPicker({ branch, value, onChange }: { branch: Branch | null; value: string | null; onChange: (s: PickupSlot) => void }) {
  const [day, setDay] = useState<'today' | 'tomorrow'>('today');
  const [slots, setSlots] = useState<PickupSlots | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!branch) return;
    let alive = true;
    setSlots(null);
    Catalog.slots(branch.id)
      .then((s) => {
        if (!alive) return;
        setSlots(s);
        const d = s.today.length ? 'today' : 'tomorrow';
        setDay(d);
        if (!value) {
          const first = s[d][0];
          if (first) onChange(first);
        }
      })
      .catch((e) => alive && setError(errorMessage(e)));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch?.id]);

  if (error) return <T v="small" color={colors.danger}>{error}</T>;
  if (!slots) return <Skeleton style={{ height: 96 }} />;
  const list = slots[day];
  return (
    <View style={{ gap: space.md }}>
      <View style={styles.dayRow}>
        {(['today', 'tomorrow'] as const).map((d) => {
          const disabled = !slots[d].length;
          const active = d === day;
          return (
            <Touchable
              key={d}
              haptic
              disabled={disabled}
              onPress={() => {
                setDay(d);
                if (slots[d][0]) onChange(slots[d][0]);
              }}
              style={[styles.dayBtn, active && styles.dayBtnActive, disabled && { opacity: 0.4 }]}
            >
              <T v="bodyStrong" color={active ? colors.white : colors.text}>
                {d === 'today' ? 'Сегодня' : 'Завтра'}
              </T>
              {d === 'today' && slots.closedToday && (
                <T v="caption" color={active ? colors.white : colors.textSoft}>
                  уже закрыто
                </T>
              )}
            </Touchable>
          );
        })}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.lg }} contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.sm }}>
        {list.map((s, i) => {
          const active = s.at === value;
          return (
            <Touchable key={s.at} haptic onPress={() => onChange(s)} style={[styles.slot, active && styles.slotActive]} scaleTo={0.94}>
              <T v="h3" color={active ? colors.white : colors.text}>
                {s.time}
              </T>
              {i === 0 && day === 'today' && (
                <T v="caption" color={active ? 'rgba(255,255,255,0.85)' : colors.mango}>
                  быстрее всего
                </T>
              )}
            </Touchable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/* ───────── Способ оплаты ───────── */

const METHODS: Record<PaymentMethod, { icon: IconName; title: string; cafe: string; partner: string }> = {
  QR: { icon: 'qr', title: 'QR-код', cafe: 'Оплатите сразу в приложении банка', partner: 'В приложении любого банка — сумма уже в QR' },
  BANK: { icon: 'bank', title: 'Расчётный счёт', cafe: '', partner: 'Перевод на счёт компании, реквизиты — после оформления' },
  CASH: { icon: 'cash', title: 'Наличные', cafe: 'Оплатите на кассе, когда заберёте', partner: 'Курьеру при доставке — после подтверждения менеджером' },
};

export function PaymentPicker({
  value,
  onChange,
  methods,
  cafe,
}: {
  value: PaymentMethod;
  onChange: (m: PaymentMethod) => void;
  methods: PaymentMethod[];
  cafe?: boolean;
}) {
  return (
    <View style={{ gap: space.sm }}>
      {methods.map((m) => {
        const meta = METHODS[m];
        const active = m === value;
        return (
          <Touchable key={m} haptic onPress={() => onChange(m)} style={[styles.method, active && styles.methodActive]} scaleTo={0.98}>
            <View style={[styles.methodIcon, active && { backgroundColor: colors.mango }]}>
              <Icon name={meta.icon} size={22} color={active ? colors.white : colors.mango} strokeWidth={1.8} />
            </View>
            <View style={{ flex: 1 }}>
              <T v="bodyStrong">{meta.title}</T>
              <T v="small" color={colors.textMuted}>
                {cafe ? meta.cafe : meta.partner}
              </T>
            </View>
            <View style={[styles.radio, active && styles.radioActive]}>{active && <View style={styles.radioDot} />}</View>
          </Touchable>
        );
      })}
    </View>
  );
}

export const paymentTitle = (m: string | null | undefined) => (m && m in METHODS ? METHODS[m as PaymentMethod].title : 'Не выбран');

/* ───────── Оплата заказа ───────── */

/** Блок «Оплата» на экране заказа: QR с суммой, реквизиты, «Я оплатил» с чеком. */
export function PaymentPanel({ order, onChanged }: { order: Order; onChanged: (o: Order) => void }) {
  const pay = useQuery(Q.payment(order.id), { staleTime: 0 });
  const [busy, setBusy] = useState(false);
  const p = pay.data;
  const method = (order.paymentMethod ?? 'CASH') as PaymentMethod;
  const closed = order.status === 'CANCELLED' || order.status === 'REJECTED';
  if (closed) return null;

  const claim = async (withReceipt: boolean) => {
    let receipt: ImagePicker.ImagePickerAsset | undefined;
    if (withReceipt) {
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
      if (r.canceled || !r.assets?.[0]) return;
      receipt = r.assets[0];
    }
    setBusy(true);
    try {
      const o = await Orders.claimPaid(
        order.id,
        receipt ? { uri: receipt.uri, mimeType: receipt.mimeType, fileName: receipt.fileName, file: (receipt as { file?: Blob }).file } : undefined,
      );
      hapticSuccess();
      toast.success('Спасибо! Менеджер проверит оплату и подтвердит заказ');
      setCached(Q.order(order.id).key, o);
      invalidateOrders();
      pay.reload();
      onChanged(o);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (order.paidAt) {
    return (
      <View style={[styles.payState, { backgroundColor: colors.greenSoft }]}>
        <Icon name="check" size={22} color={colors.success} strokeWidth={2.2} />
        <View style={{ flex: 1 }}>
          <T v="bodyStrong" color={colors.success}>
            Оплачено · {paymentTitle(method)}
          </T>
          <T v="small" color={colors.textMuted}>
            {money(order.total)}
          </T>
        </View>
      </View>
    );
  }

  if (method === 'CASH') {
    return (
      <View style={[styles.payState, { backgroundColor: colors.softYellow }]}>
        <Icon name="cash" size={22} color={colors.coffee} />
        <View style={{ flex: 1 }}>
          <T v="bodyStrong">Наличными · {money(order.total)}</T>
          <T v="small" color={colors.textMuted}>
            {order.channel === 'CAFE' ? 'Оплатите на кассе, когда заберёте заказ' : 'Курьеру при доставке'}
          </T>
        </View>
      </View>
    );
  }

  if (pay.loading) return <Skeleton style={{ height: 220, borderRadius: radius.xl }} />;
  const claimed = !!(p?.claimedAt ?? order.paymentClaimedAt);

  return (
    <View style={styles.payCard}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Icon name={METHODS[method].icon} size={22} color={colors.mango} strokeWidth={1.8} />
        <T v="h3" style={{ flex: 1 }}>
          {method === 'QR' ? 'Оплата по QR' : 'Оплата на расчётный счёт'}
        </T>
        <T v="h3" color={colors.mango}>
          {money(order.total)}
        </T>
      </View>

      {claimed ? (
        <View style={[styles.payState, { backgroundColor: colors.iceCube }]}>
          <Icon name="hourglass" size={22} color={colors.blueberry} />
          <View style={{ flex: 1 }}>
            <T v="bodyStrong" color={colors.blueberry}>
              Проверяем оплату
            </T>
            <T v="small" color={colors.blueberry}>
              Как только менеджер увидит деньги, заказ подтвердится — придёт уведомление
            </T>
          </View>
        </View>
      ) : method === 'QR' ? (
        p?.qr ? (
          <QrBlock info={p} />
        ) : (
          <T v="small" color={colors.textMuted}>
            QR для оплаты ещё не настроен — оплатите наличными или уточните у менеджера.
          </T>
        )
      ) : p?.bank ? (
        <BankBlock info={p} />
      ) : (
        <T v="small" color={colors.textMuted}>
          Реквизиты скоро появятся. Менеджер пришлёт их вам — или выберите оплату по QR.
        </T>
      )}

      {!claimed && (
        <View style={{ gap: space.sm }}>
          <Button title="Я оплатил" icon="check" loading={busy} onPress={() => claim(false)} />
          <Button title="Приложить чек" kind="secondary" icon="camera" small disabled={busy} onPress={() => claim(true)} />
        </View>
      )}
    </View>
  );
}

function QrBlock({ info }: { info: PaymentInfo }) {
  const qr = info.qr!;
  const open = async () => {
    tap();
    try {
      await Linking.openURL(qr.value);
    } catch {
      toast.info('Откройте приложение банка и отсканируйте QR');
    }
  };
  const share = async () => {
    if (!qr.image) return;
    try {
      if (Platform.OS === 'web') {
        const a = document.createElement('a');
        a.href = qr.image;
        a.download = `bulo-qr-${info.number}.png`;
        a.click();
        return;
      }
      const file = new File(Paths.cache, `bulo-qr-${info.number}.png`);
      if (file.exists) file.delete();
      file.create();
      file.write(base64ToBytes(qr.image.split(',')[1] ?? ''));
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: 'image/png', dialogTitle: 'QR для оплаты' });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  return (
    <View style={{ gap: space.md, alignItems: 'center' }}>
      {qr.image ? (
        <View style={styles.qrFrame}>
          <Image source={{ uri: qr.image }} style={{ width: 220, height: 220 }} contentFit="contain" />
        </View>
      ) : null}
      <T v="small" center color={colors.textMuted} style={{ maxWidth: 300 }}>
        {qr.withAmount
          ? `Отсканируйте в приложении любого банка — сумма ${money(info.amount)} уже подставлена`
          : `Отсканируйте в приложении банка и введите сумму ${money(info.amount)}. Получатель: ${qr.recipient}`}
      </T>
      <View style={{ flexDirection: 'row', gap: space.sm, alignSelf: 'stretch' }}>
        <Button title="Открыть банк" kind="secondary" small icon="arrowRight" onPress={open} style={{ flex: 1 }} />
        <Button title="Сохранить QR" kind="secondary" small icon="share" onPress={share} style={{ flex: 1 }} />
      </View>
      {!qr.withAmount && <CopyRow label="Сумма" value={String(info.amount)} />}
    </View>
  );
}

function BankBlock({ info }: { info: PaymentInfo }) {
  const b = info.bank!;
  return (
    <View style={{ gap: 2 }}>
      {!!b.recipient && <CopyRow label="Получатель" value={b.recipient} />}
      {!!b.name && <CopyRow label="Банк" value={b.name} />}
      {!!b.account && <CopyRow label="Расчётный счёт" value={b.account} />}
      {!!b.bik && <CopyRow label="БИК" value={b.bik} />}
      {!!b.inn && <CopyRow label="ИНН" value={b.inn} />}
      <CopyRow label="Сумма" value={String(info.amount)} />
      <CopyRow label="Назначение" value={b.purpose} />
    </View>
  );
}

export function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <Touchable
      onPress={async () => {
        await Clipboard.setStringAsync(value);
        tap();
        toast.success(`${label}: скопировано`);
      }}
      style={styles.copyRow}
    >
      <View style={{ flex: 1 }}>
        <T v="caption" color={colors.textSoft}>
          {label.toUpperCase()}
        </T>
        <T v="bodyStrong" selectable>
          {value}
        </T>
      </View>
      <Icon name="copy" size={18} color={colors.textSoft} />
    </Touchable>
  );
}

function base64ToBytes(b64: string): Uint8Array {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = lookup[clean.charCodeAt(i)];
    const b = lookup[clean.charCodeAt(i + 1)];
    const c = lookup[clean.charCodeAt(i + 2)];
    const d = lookup[clean.charCodeAt(i + 3)];
    out[p++] = (a << 2) | (b >> 4);
    if (i + 2 < clean.length) out[p++] = ((b & 15) << 4) | (c >> 2);
    if (i + 3 < clean.length) out[p++] = ((c & 3) << 6) | d;
  }
  return out.subarray(0, p);
}

/* ───────── Оплата глазами сотрудника ───────── */

/** Для админа, менеджера, бухгалтера и кассира: способ оплаты, чек, «Подтвердить» и «Деньги получены». */
export function StaffPaymentPanel({
  order,
  canConfirm,
  canMarkPaid,
  onConfirm,
  onMarkPaid,
}: {
  order: Order;
  canConfirm: boolean;
  canMarkPaid: boolean;
  onConfirm: () => void;
  onMarkPaid: () => void;
}) {
  const [zoom, setZoom] = useState(false);
  const closed = order.status === 'CANCELLED' || order.status === 'REJECTED';
  if (closed) return null;
  const method = (order.paymentMethod ?? 'CASH') as PaymentMethod;
  const receipt = photoSrc(order.receiptUrl);
  const tone = order.paidAt ? colors.greenSoft : order.paymentClaimedAt ? colors.iceCube : canConfirm ? colors.softYellow : colors.white;
  return (
    <View style={[styles.payCard, { backgroundColor: tone }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Icon name={METHODS[method]?.icon ?? 'card'} size={22} color={colors.mango} strokeWidth={1.8} />
        <View style={{ flex: 1 }}>
          <T v="h3">
            {paymentTitle(method)} · {money(order.total)}
          </T>
          <T v="small" color={colors.textMuted}>
            {order.paidAt
              ? 'Оплата получена'
              : order.paymentClaimedAt
                ? 'Покупатель сообщил, что оплатил — проверьте поступление'
                : canConfirm
                  ? method === 'CASH'
                    ? 'Оплата наличными при получении — примите заказ'
                    : 'Ждём оплату'
                  : 'Оплата наличными при получении'}
          </T>
        </View>
      </View>
      {!!receipt && (
        <Touchable onPress={() => setZoom(true)} style={styles.receipt}>
          <Image source={{ uri: receipt }} style={{ width: 64, height: 64, borderRadius: 10 }} contentFit="cover" />
          <View style={{ flex: 1 }}>
            <T v="bodyStrong">Чек об оплате</T>
            <T v="small" color={colors.textMuted}>
              Нажмите, чтобы посмотреть
            </T>
          </View>
          <Icon name="eye" size={20} color={colors.textMuted} />
        </Touchable>
      )}
      {canConfirm && (
        <Button
          title={method === 'CASH' ? 'Принять заказ' : 'Оплата получена — подтвердить'}
          icon="check"
          onPress={onConfirm}
        />
      )}
      {!canConfirm && canMarkPaid && <Button title="Деньги получены" kind="secondary" icon="cash" small onPress={onMarkPaid} />}
      <Sheet visible={zoom} onClose={() => setZoom(false)} title="Чек об оплате">
        {!!receipt && <Image source={{ uri: receipt }} style={{ width: '100%', aspectRatio: 0.7, borderRadius: radius.lg }} contentFit="contain" />}
      </Sheet>
    </View>
  );
}

/* ───────── Подсказки акции в корзине ───────── */

/** Сколько кофе в корзине станут подарком: та же логика, что на сервере. */
export function usePromoPreview(lines: { productId: string; qty: number; price: number | null; promo?: boolean }[], loyalty?: Loyalty | null) {
  return useMemo(() => {
    if (!loyalty?.enabled) return { free: 0, discount: 0 };
    const coffees = lines.filter((l) => l.promo && l.qty > 0);
    const count = coffees.reduce((s, l) => s + Math.floor(l.qty), 0);
    let free = Math.floor((loyalty.total + count) / loyalty.every) - Math.floor(loyalty.total / loyalty.every);
    const n = free;
    let discount = 0;
    for (const l of [...coffees].sort((a, b) => (a.price ?? 0) - (b.price ?? 0))) {
      if (free <= 0) break;
      const take = Math.min(free, Math.floor(l.qty));
      discount += take * (l.price ?? 0);
      free -= take;
    }
    return { free: n, discount };
  }, [lines, loyalty]);
}

const styles = StyleSheet.create({
  branchChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    height: 34,
    borderRadius: radius.pill,
    ...shadows.soft,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  branchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  branchRowActive: { borderColor: colors.mango, backgroundColor: '#FFF8F4' },
  branchIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  loyalty: { backgroundColor: colors.coffee, borderRadius: radius.xl, padding: space.lg, gap: space.sm, overflow: 'hidden', ...shadows.card },
  loyaltyTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.softYellow,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  stamps: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 4 },
  stamp: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stampFilled: { backgroundColor: colors.softYellow, borderStyle: 'solid', borderColor: colors.softYellow },
  stampGift: { borderColor: colors.softYellow, borderStyle: 'solid', borderWidth: 2 },
  dayRow: { flexDirection: 'row', gap: space.sm },
  dayBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  dayBtnActive: { backgroundColor: colors.cambodia, borderColor: colors.cambodia },
  slot: {
    minWidth: 76,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  slotActive: { backgroundColor: colors.mango, borderColor: colors.mango },
  method: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  methodActive: { borderColor: colors.mango, backgroundColor: '#FFF8F4' },
  methodIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: colors.mango },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.mango },
  payCard: { backgroundColor: colors.white, borderRadius: radius.xl, padding: space.lg, gap: space.md, ...shadows.soft },
  payState: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg },
  qrFrame: { padding: 12, borderRadius: radius.xl, backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border },
  copyRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  receipt: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.white, borderRadius: radius.lg, padding: 8 },
});

export { photoSrc };
