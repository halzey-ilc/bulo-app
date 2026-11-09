import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { errorMessage, Orders } from '../../../src/api';
import { Admin, AdminProduct, OfficeOrder, photoSrc } from '../../../src/api/admin';
import { AIcon } from '../../../src/components/admin/icons';
import { Group, Label, Note, SearchBar, Sheet } from '../../../src/components/admin/kit';
import { BottomBar, Header, Screen } from '../../../src/components/layout';
import { ProductImage, Stepper } from '../../../src/components/product';
import { Button, Divider, ErrorState, Field, Skeleton, T, Touchable } from '../../../src/components/ui';
import { money, qtyText } from '../../../src/lib/format';
import { useLoad } from '../../../src/lib/useLoad';
import { toast } from '../../../src/store/ui';
import { colors, fonts, radius, space } from '../../../src/theme';

interface Line {
  productId: string;
  name: string;
  unit: string;
  multiplicity: number;
  price: number | null;
  photoUrl: string | null;
  category: string;
  qty: number;
}

/** Правка состава заказа менеджером (до оплаты): количество кратно упаковке. */
export default function OrderEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const order = useLoad(() => Orders.get(id) as Promise<OfficeOrder>, [id], { refetchOnFocus: false });
  const products = useLoad(() => Admin.products(), [], { refetchOnFocus: false });
  const [lines, setLines] = useState<Line[] | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');

  const o = order.data;
  const ptId = (o?.partner as { priceTypeId?: string | null } | null)?.priceTypeId ?? null;
  const priceOf = (p: AdminProduct) => (p.prices.find((x) => x.priceTypeId === ptId) ?? (ptId ? undefined : p.prices.find((x) => x.priceType.isDefault)))?.price ?? null;

  useEffect(() => {
    if (o && !lines)
      setLines(o.items.map((i) => ({ productId: i.productId, name: i.name, unit: i.unit, multiplicity: i.multiplicity || 1, price: i.price, photoUrl: i.photoUrl, category: i.category, qty: i.qty })));
  }, [o, lines]);

  const candidates = useMemo(() => {
    const s = q.toLowerCase();
    const inOrder = new Set((lines ?? []).map((l) => l.productId));
    return (products.data ?? []).filter((p) => p.visible && !inOrder.has(p.id) && (!s || p.name.toLowerCase().includes(s))).slice(0, 30);
  }, [products.data, lines, q]);

  if (!o || !lines) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title="Состав заказа" />
        {order.error ? <ErrorState message={order.error} onRetry={order.refresh} /> : <View style={{ padding: space.lg, gap: space.md }}><Skeleton style={{ height: 300, borderRadius: radius.xl }} /></View>}
      </View>
    );
  }

  const editable = o.status === 'NEW' || o.status === 'APPROVED' || o.status === 'PAID';
  const active = lines.filter((l) => l.qty > 0);
  const total = active.reduce((a, l) => a + (l.price ?? 0) * l.qty, 0);
  const unknown = active.some((l) => l.price == null);
  const changed = JSON.stringify(active.map((l) => [l.productId, l.qty])) !== JSON.stringify(o.items.map((i) => [i.productId, i.qty]));

  const setQty = (pid: string, qty: number) => setLines((ls) => ls!.map((l) => (l.productId === pid ? { ...l, qty } : l)));

  const save = async () => {
    if (!active.length) return toast.error('В заказе должна остаться хотя бы одна позиция');
    setBusy(true);
    try {
      await Admin.updateItems(o.id, active.map((l) => ({ productId: l.productId, qty: l.qty })), comment.trim() || undefined);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast.success(`Состав №${o.number} обновлён — партнёр получит уведомление`);
      router.back();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={`Состав №${o.number}`} subtitle={o.partner?.name} />
      <Screen contentStyle={{ paddingBottom: 190 }}>
        {!editable && <Note icon="alert" tone="yellow" text="Состав можно менять только до оплаты." />}
        <Group style={{ gap: 0, paddingVertical: space.sm }}>
          {lines.map((l, k) => (
            <View key={l.productId}>
              {k > 0 && <Divider />}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, opacity: l.qty ? 1 : 0.45 }}>
                <ProductImage photoUrl={photoSrc(l.photoUrl)} category={l.category} seed={l.productId} style={{ width: 48, height: 48 }} iconSize={22} rounded={14} />
                <View style={{ flex: 1, gap: 2 }}>
                  <T v="bodyStrong" numberOfLines={2}>
                    {l.name}
                  </T>
                  <T v="small" color={colors.textMuted}>
                    {l.price != null ? `${money(l.price)} · ` : ''}кратно {qtyText(l.multiplicity, l.unit)}
                  </T>
                  {l.qty > 0 && l.price != null && (
                    <T v="small" style={{ fontFamily: fonts.bold }}>
                      {money(l.price * l.qty)}
                    </T>
                  )}
                </View>
                {editable ? (
                  l.qty > 0 ? (
                    <Stepper compact value={l.qty} step={l.multiplicity} unit={l.unit} onChange={(v) => setQty(l.productId, v)} />
                  ) : (
                    <Button small kind="secondary" title="Вернуть" onPress={() => setQty(l.productId, l.multiplicity)} />
                  )
                ) : (
                  <T v="bodyStrong">{qtyText(l.qty, l.unit)}</T>
                )}
              </View>
            </View>
          ))}
        </Group>
        {editable && (
          <Touchable haptic onPress={() => setAdding(true)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, height: 52, borderRadius: radius.lg, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.mango }}>
            <AIcon name="plus" size={20} color={colors.mango} strokeWidth={2.2} />
            <T v="bodyStrong" color={colors.mango}>
              Добавить товар
            </T>
          </Touchable>
        )}
        {editable && (
          <>
            <Label>Комментарий для партнёра</Label>
            <Field multiline placeholder="Например: синнабонов осталось 24 шт — заменили на круассаны" value={comment} onChangeText={setComment} />
          </>
        )}
      </Screen>
      {editable && (
        <BottomBar>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <T v="small" color={colors.textMuted}>
              Было {money(o.total)}
            </T>
            <T v="h3">
              {unknown ? '≈ ' : ''}
              {money(total)}
            </T>
          </View>
          <Button title={changed ? 'Сохранить состав' : 'Нет изменений'} icon="check" onPress={save} loading={busy} disabled={!changed} />
        </BottomBar>
      )}

      <Sheet visible={adding} onClose={() => setAdding(false)} title="Добавить товар" subtitle={`Цены — по типу «${o.partner?.priceType?.name ?? 'по умолчанию'}»`}>
        <SearchBar placeholder="Найти товар" onDebounced={setQ} />
        {products.loading && <Skeleton style={{ height: 200 }} />}
        {candidates.map((p) => {
          const price = priceOf(p);
          return (
            <Touchable
              key={p.id}
              haptic
              disabled={price == null}
              onPress={() => {
                setLines((ls) => [...ls!, { productId: p.id, name: p.name, unit: p.unit, multiplicity: p.multiplicity, price, photoUrl: p.photoUrl, category: p.category?.name ?? '', qty: p.multiplicity }]);
                setAdding(false);
              }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.white, padding: space.md, borderRadius: radius.lg, opacity: price == null ? 0.5 : 1 }}
            >
              <ProductImage photoUrl={photoSrc(p.photoUrl)} category={p.category?.name} seed={p.id} style={{ width: 44, height: 44 }} iconSize={20} rounded={12} />
              <View style={{ flex: 1 }}>
                <T v="bodyStrong" numberOfLines={1}>
                  {p.name}
                </T>
                <T v="small" color={price == null ? colors.danger : colors.textMuted}>
                  {price == null ? 'Нет цены для этого партнёра' : `${money(price)} · кратно ${qtyText(p.multiplicity, p.unit)}`}
                </T>
              </View>
              <AIcon name="plus" size={20} color={colors.mango} />
            </Touchable>
          );
        })}
      </Sheet>
    </View>
  );
}
