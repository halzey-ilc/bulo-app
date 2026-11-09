import React, { useEffect, useMemo, useState } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { errorMessage } from '../../../src/api';
import { Admin, AdminProduct, photoSrc, PickedImage, uploadProductPhoto } from '../../../src/api/admin';
import { AIcon } from '../../../src/components/admin/icons';
import { Group, Label, Note, ToggleRow } from '../../../src/components/admin/kit';
import { BottomBar, Header, Screen } from '../../../src/components/layout';
import { ProductImage } from '../../../src/components/product';
import { Button, ErrorState, Field, Skeleton, T, Touchable } from '../../../src/components/ui';
import { useLoad } from '../../../src/lib/useLoad';
import { useAuth } from '../../../src/store/auth';
import { toast } from '../../../src/store/ui';
import { colors, fonts, radius, shadows, space } from '../../../src/theme';

type Form = { name: string; description: string; composition: string; weight: string; shelfLife: string; unit: string; multiplicity: string; visible: boolean; isNew: boolean };

const toForm = (p: AdminProduct): Form => ({
  name: p.name,
  description: p.description ?? '',
  composition: p.composition ?? '',
  weight: p.weight ?? '',
  shelfLife: p.shelfLife ?? '',
  unit: p.unit,
  multiplicity: String(p.multiplicity).replace('.', ','),
  visible: p.visible,
  isNew: p.isNew,
});

const num = (s: string) => {
  const v = Number(s.replace(',', '.').replace(/\s/g, ''));
  return Number.isFinite(v) ? v : NaN;
};

/** Карточка товара для офиса: фото, описание, кратность, цены по типам. */
export default function ProductEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  /** Кассир: только «есть / нет в наличии». Товары, фото и цены ведут админ и менеджер */
  const cashier = useAuth((s) => s.user?.role) === 'CASHIER';
  const products = useLoad(() => Admin.products(), []);
  const types = useLoad(() => Admin.priceTypes(), []);
  const p = products.data?.find((x) => x.id === id);

  const [form, setForm] = useState<Form | null>(null);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [upload, setUpload] = useState<{ uri: string; progress: number } | null>(null);
  const bar = useMemo(() => new Animated.Value(0), []);

  const initialPrices = useMemo(() => {
    const m: Record<string, string> = {};
    for (const t of types.data ?? []) {
      const pr = p?.prices.find((x) => x.priceTypeId === t.id);
      m[t.id] = pr ? String(pr.price).replace('.', ',') : '';
    }
    return m;
  }, [p, types.data]);

  useEffect(() => {
    if (p && !form) setForm(toForm(p));
  }, [p, form]);
  useEffect(() => setPrices(initialPrices), [initialPrices]);

  if (!p || !form) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title="Товар" />
        {products.error ? (
          <ErrorState message={products.error} onRetry={products.refresh} />
        ) : products.data && !p ? (
          <ErrorState message="Товар не найден" />
        ) : (
          <View style={{ padding: space.lg, gap: space.lg }}>
            <Skeleton style={{ height: 260, borderRadius: radius.xxl }} />
            <Skeleton style={{ height: 200, borderRadius: radius.xl }} />
          </View>
        )}
      </View>
    );
  }

  const base = toForm(p);
  const formDirty = (Object.keys(form) as (keyof Form)[]).some((k) => form[k] !== base[k]);
  const priceDirty = Object.keys(prices).some((k) => (prices[k] ?? '') !== (initialPrices[k] ?? ''));
  const dirty = formDirty || priceDirty;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm({ ...form, [k]: v });

  const pick = async (camera: boolean) => {
    try {
      if (camera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) return toast.error('Нет доступа к камере — разрешите в настройках');
      } else if (Platform.OS !== 'web') {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) return toast.error('Нет доступа к галерее — разрешите в настройках');
      }
      const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 };
      const res = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      if (a.fileSize && a.fileSize > 8 * 1024 * 1024) return toast.error('Фото больше 8 МБ — выберите поменьше');
      const img: PickedImage = { uri: a.uri, mimeType: a.mimeType, fileName: a.fileName, file: (a as { file?: Blob }).file };
      setUpload({ uri: a.uri, progress: 0 });
      bar.setValue(0);
      const updated = await uploadProductPhoto(p.id, img, (x) => {
        setUpload((u) => (u ? { ...u, progress: x } : u));
        Animated.timing(bar, { toValue: x, duration: 120, useNativeDriver: false }).start();
      });
      products.setData((cur) => cur?.map((x) => (x.id === p.id ? { ...x, photoUrl: updated.photoUrl } : x)));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast.success('Фото обновлено');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setUpload(null);
    }
  };

  const save = async () => {
    const mult = num(form.multiplicity);
    if (form.name.trim().length < 1) return toast.error('Укажите название');
    if (!(mult > 0)) return toast.error('Кратность должна быть больше нуля');
    const priceItems: { priceTypeId: string; price: number | null }[] = [];
    for (const [tid, v] of Object.entries(prices)) {
      if ((v ?? '') === (initialPrices[tid] ?? '')) continue;
      if (!v.trim()) priceItems.push({ priceTypeId: tid, price: null });
      else {
        const n = num(v);
        if (!(n >= 0)) return toast.error('Проверьте цены — только числа');
        priceItems.push({ priceTypeId: tid, price: n });
      }
    }
    setBusy(true);
    try {
      if (formDirty && cashier) {
        await Admin.updateProduct(p.id, { visible: form.visible });
      } else if (formDirty) {
        await Admin.updateProduct(p.id, {
          name: form.name.trim(),
          description: form.description.trim(),
          composition: form.composition.trim(),
          weight: form.weight.trim(),
          shelfLife: form.shelfLife.trim(),
          unit: form.unit.trim() || 'шт',
          multiplicity: mult,
          visible: form.visible,
          isNew: form.isNew,
        });
      }
      if (priceItems.length) await Admin.setPrices(p.id, priceItems);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast.success('Товар сохранён');
      setForm(null);
      products.reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const photo = upload?.uri ?? photoSrc(p.photoUrl);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={p.name} subtitle={p.category?.name} />
      <Screen refreshing={products.refreshing} onRefresh={products.refresh} contentStyle={{ paddingBottom: dirty ? 150 : 48 }}>
        <View style={st.photoWrap}>
          <ProductImage photoUrl={photo} category={p.category?.name} seed={p.id} style={{ width: '100%', aspectRatio: 1.25 }} rounded={radius.xxl} iconSize={88} />
          {upload && (
            <View style={st.uploadOverlay}>
              <T v="h3" color={colors.white}>
                Загружаем… {Math.round(upload.progress * 100)}%
              </T>
              <View style={st.track}>
                <Animated.View style={[st.fill, { width: bar.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
              </View>
            </View>
          )}
          {!cashier && <View style={st.photoBtns}>
            <Touchable haptic onPress={() => pick(false)} style={st.photoBtn} disabled={!!upload}>
              <AIcon name="image" size={18} color={colors.cambodia} />
              <T v="small" style={{ fontFamily: fonts.extrabold }}>
                Из галереи
              </T>
            </Touchable>
            {Platform.OS !== 'web' && (
              <Touchable haptic onPress={() => pick(true)} style={st.photoBtn} disabled={!!upload}>
                <AIcon name="camera" size={18} color={colors.cambodia} />
                <T v="small" style={{ fontFamily: fonts.extrabold }}>
                  Снять
                </T>
              </Touchable>
            )}
          </View>}
        </View>
        <T v="small" color={colors.textSoft} center>
          Квадратное фото JPG, PNG или WebP до 8 МБ
        </T>

        <Group>
          <ToggleRow icon="eye" title="В продаже" subtitle={form.visible ? 'Товар есть, его видят и заказывают' : 'Убран из каталога'} value={form.visible} onChange={(v) => set('visible', v)} />
          {!cashier && <ToggleRow icon="sparkle" title="Новинка" subtitle="Плашка NEW и подборка на главной" value={form.isNew} onChange={(v) => set('isNew', v)} />}
        </Group>

        {!cashier && <Label>Цены, сом</Label>}
        {!cashier && <Group>
          {types.loading ? (
            <Skeleton style={{ height: 120 }} />
          ) : (
            (types.data ?? []).filter((t) => !cashier || t.isRetail).map((t) => (
              <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <View style={{ flex: 1 }}>
                  <T v="bodyStrong">{t.name}</T>
                  <T v="caption" color={colors.textSoft}>
                    {t.isDefault ? 'по умолчанию · ' : ''}
                    за 1 {form.unit || 'шт'}
                  </T>
                </View>
                <View style={{ width: 140 }}>
                  <Field placeholder="нет цены" keyboardType="decimal-pad" value={prices[t.id] ?? ''} onChangeText={(v) => setPrices((x) => ({ ...x, [t.id]: v.replace(/[^\d.,]/g, '') }))} style={{ textAlign: 'right', minWidth: 0, width: '100%' }} />
                </View>
              </View>
            ))
          )}
          <Note text="«Кофейня …» — цена в меню филиала, остальные — для партнёров. Пустое поле — в этом меню или для этих партнёров товара нет." />
        </Group>}

        {!cashier && <Label>Описание</Label>}
        {!cashier && (
        <Group>
          <Field label="Название" value={form.name} onChangeText={(v) => set('name', v)} />
          <Field label="Описание" multiline value={form.description} onChangeText={(v) => set('description', v)} placeholder="Пара тёплых слов о вкусе" />
          <Field label="Состав" multiline value={form.composition} onChangeText={(v) => set('composition', v)} placeholder="Мука, масло, корица…" />
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <View style={{ flex: 1 }}>
              <Field style={{ minWidth: 0 }} label="Вес" value={form.weight} onChangeText={(v) => set('weight', v)} placeholder="120 г" />
            </View>
            <View style={{ flex: 1 }}>
              <Field style={{ minWidth: 0 }} label="Срок годности" value={form.shelfLife} onChangeText={(v) => set('shelfLife', v)} placeholder="48 часов" />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <View style={{ flex: 1 }}>
              <Field style={{ minWidth: 0 }} label="Единица" value={form.unit} onChangeText={(v) => set('unit', v)} placeholder="шт" />
            </View>
            <View style={{ flex: 1 }}>
              <Field style={{ minWidth: 0 }} label="Кратность" keyboardType="decimal-pad" value={form.multiplicity} onChangeText={(v) => set('multiplicity', v)} hint="Заказ — кратно этому" />
            </View>
          </View>
        </Group>
        )}
      </Screen>

      {dirty && (
        <BottomBar>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button
              title="Отменить"
              kind="ghost"
              onPress={() => {
                setForm(null);
                setPrices(initialPrices);
              }}
              style={{ flex: 1 }}
            />
            <Button title="Сохранить" icon="check" onPress={save} loading={busy} style={{ flex: 1.4 }} />
          </View>
        </BottomBar>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  photoWrap: { borderRadius: radius.xxl, overflow: 'hidden', ...shadows.card },
  photoBtns: { position: 'absolute', right: space.md, bottom: space.md, flexDirection: 'row', gap: space.sm },
  photoBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.94)', paddingHorizontal: 14, height: 40, borderRadius: 20, ...shadows.soft },
  uploadOverlay: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(38,66,43,0.55)', alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xxl },
  track: { width: '80%', height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.lime },
});
