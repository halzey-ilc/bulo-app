import React, { memo, useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { errorMessage } from '../../api';
import { Admin, AdminProduct, photoSrc } from '../../api/admin';
import { useLoad } from '../../lib/useLoad';
import { toast } from '../../store/ui';
import { colors, fonts, radius, shadows, space } from '../../theme';
import { Header, TAB_BAR_SPACE } from '../layout';
import { ProductImage } from '../product';
import { Chip, EmptyState, ErrorState, T, tap, Touchable } from '../ui';
import { AIcon } from './icons';
import { ListSkeleton, moneyShort, Pill, SearchBar, TabHeader, Toggle } from './kit';

type Quick = 'all' | 'hidden' | 'new' | 'nophoto' | 'noprice';
const QUICK: { key: Quick; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'hidden', label: 'Скрытые' },
  { key: 'new', label: 'Новинки' },
  { key: 'nophoto', label: 'Без фото' },
  { key: 'noprice', label: 'Без цены' },
];

/** Управление каталогом для офиса: витрина, новинки, цены, фото. */
export function AdminCatalog({ stack }: { stack?: boolean }) {
  const insets = useSafeAreaInsets();
  const products = useLoad(() => Admin.products(), []);
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  const [quick, setQuick] = useState<Quick>('all');

  const all = products.data ?? [];
  const cats = useMemo(() => {
    const m = new Map<string, { id: string; name: string; count: number }>();
    for (const p of all) {
      const c = m.get(p.categoryId) ?? { id: p.categoryId, name: p.category?.name ?? '—', count: 0 };
      c.count++;
      m.set(p.categoryId, c);
    }
    return [...m.values()];
  }, [all]);

  const data = useMemo(() => {
    const q = query.toLowerCase();
    return all.filter(
      (p) =>
        (!cat || p.categoryId === cat) &&
        (!q || p.name.toLowerCase().includes(q)) &&
        (quick === 'all' ||
          (quick === 'hidden' && !p.visible) ||
          (quick === 'new' && p.isNew) ||
          (quick === 'nophoto' && !p.photoUrl) ||
          (quick === 'noprice' && p.prices.length === 0)),
    );
  }, [all, query, cat, quick]);

  const hidden = all.filter((p) => !p.visible).length;

  /** Мгновенно переключаем флаг, при ошибке — откат. */
  const patch = useCallback(
    async (p: AdminProduct, dto: Partial<Pick<AdminProduct, 'visible' | 'isNew'>>) => {
      products.setData((cur) => cur?.map((x) => (x.id === p.id ? { ...x, ...dto } : x)));
      try {
        await Admin.updateProduct(p.id, dto);
        if (dto.visible !== undefined) toast.success(dto.visible ? `«${p.name}» снова на витрине` : `«${p.name}» скрыт из каталога`);
      } catch (e) {
        products.setData((cur) => cur?.map((x) => (x.id === p.id ? { ...x, visible: p.visible, isNew: p.isNew } : x)));
        toast.error(errorMessage(e));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const header = (
    <View style={{ gap: space.md, paddingBottom: space.md }}>
      {!stack && <TabHeader title="Каталог" subtitle={products.data ? `${all.length} товаров${hidden ? ` · ${hidden} скрыто` : ''}` : 'Витрина, цены и фото'} />}
      <SearchBar placeholder="Найти товар" onDebounced={setQuery} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.lg }} contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.sm }}>
        {QUICK.map((x) => (
          <Chip key={x.key} label={x.label} active={quick === x.key} onPress={() => setQuick(x.key)} icon={x.key === 'new' ? 'sparkle' : undefined} />
        ))}
      </ScrollView>
      {cats.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.lg }} contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.sm }}>
          <CatChip label="Все категории" active={!cat} onPress={() => setCat(null)} />
          {cats.map((c) => (
            <CatChip key={c.id} label={`${c.name} · ${c.count}`} active={cat === c.id} onPress={() => setCat(cat === c.id ? null : c.id)} />
          ))}
        </ScrollView>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {stack && <Header title="Каталог" subtitle={products.data ? `${all.length} товаров` : undefined} />}
      <FlatList
        data={products.loading ? [] : data}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingTop: stack ? space.sm : insets.top + space.md, paddingBottom: (stack ? space.xxxl : TAB_BAR_SPACE) + insets.bottom }}
        ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={products.refreshing} onRefresh={products.refresh} tintColor={colors.mango} colors={[colors.mango]} />}
        renderItem={({ item }) => <ProductRow p={item} onPatch={patch} />}
        ListEmptyComponent={
          products.loading ? (
            <ListSkeleton rows={6} height={88} />
          ) : products.error ? (
            <ErrorState message={products.error} onRetry={products.refresh} />
          ) : (
            <EmptyState icon="search" title="Ничего не нашли" text="Попробуйте другой фильтр или запрос." action="Сбросить" onAction={() => { setQuick('all'); setCat(null); }} />
          )
        }
      />
    </View>
  );
}

function CatChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Touchable haptic onPress={onPress} style={[st.cat, active && { backgroundColor: colors.mango, borderColor: colors.mango }]}>
      <T v="small" color={active ? colors.white : colors.textMuted} style={{ fontFamily: fonts.bold }}>
        {label}
      </T>
    </Touchable>
  );
}

const ProductRow = memo(function ProductRow({ p, onPatch }: { p: AdminProduct; onPatch: (p: AdminProduct, dto: Partial<Pick<AdminProduct, 'visible' | 'isNew'>>) => void }) {
  const prices = p.prices.slice().sort((a, b) => Number(b.priceType.isDefault) - Number(a.priceType.isDefault));
  return (
    <Touchable onPress={() => router.push(`/admin/product/${p.id}`)} scaleTo={0.985} style={[st.row, !p.visible && { opacity: 0.72 }]}>
      <View>
        <ProductImage photoUrl={photoSrc(p.photoUrl)} category={p.category?.name} seed={p.id} style={{ width: 64, height: 64 }} iconSize={28} rounded={18} />
        {!p.photoUrl && (
          <View style={st.camBadge}>
            <AIcon name="camera" size={12} color={colors.white} strokeWidth={2} />
          </View>
        )}
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <T v="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
            {p.name}
          </T>
          {!p.visible && <Pill label="СКРЫТ" bg="#ECE8DC" fg={colors.textMuted} />}
        </View>
        <T v="small" color={colors.textMuted} numberOfLines={1}>
          {p.category?.name} · кратно {String(p.multiplicity).replace('.', ',')} {p.unit}
        </T>
        <T v="small" color={prices.length ? colors.text : colors.danger} style={{ fontFamily: fonts.semibold }} numberOfLines={1}>
          {prices.length ? prices.map((x, i) => (i === 0 ? `${moneyShort(x.price)} сом` : `${x.priceType.name.slice(0, 4).toLowerCase()}. ${moneyShort(x.price)}`)).join(' · ') : 'Нет цен — партнёры не смогут заказать'}
        </T>
      </View>
      <View style={{ alignItems: 'flex-end', gap: space.sm }}>
        <Toggle value={p.visible} onChange={(v) => onPatch(p, { visible: v })} />
        <Touchable
          onPress={() => {
            tap();
            onPatch(p, { isNew: !p.isNew });
          }}
          hitSlop={8}
          style={[st.newBtn, p.isNew && { backgroundColor: colors.lime }]}
          accessibilityLabel="Новинка"
        >
          <AIcon name="sparkle" size={14} color={p.isNew ? colors.cambodia : colors.textSoft} strokeWidth={2} />
          <T v="caption" color={p.isNew ? colors.cambodia : colors.textSoft} style={{ fontFamily: fonts.extrabold }}>
            NEW
          </T>
        </Touchable>
      </View>
    </Touchable>
  );
});

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.white, borderRadius: radius.xl, padding: space.md, ...shadows.soft },
  camBadge: { position: 'absolute', right: -4, bottom: -4, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.mango, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.white },
  newBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, height: 26, borderRadius: 13, backgroundColor: colors.oatMilk },
  cat: { paddingHorizontal: 14, height: 34, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', backgroundColor: colors.white },
});
