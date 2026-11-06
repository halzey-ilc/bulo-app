import React, { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { FlatList, ListRenderItem, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Product } from '../../src/api';
import { AdminCatalog } from '../../src/components/admin/AdminCatalog';
import { NoOrderNote, PartnerStatusCard, SignInCta } from '../../src/components/gates';
import { Icon } from '../../src/components/Icon';
import { BrandRefresh, StatusScrim, TAB_BAR_SPACE } from '../../src/components/layout';
import { FadeIn } from '../../src/components/motion';
import { ProductCard, ProductCardSkeleton } from '../../src/components/product';
import { Chip, EmptyState, ErrorState, Field, T, Touchable } from '../../src/components/ui';
import { buyerCopy } from '../../src/lib/cutoff';
import { plural } from '../../src/lib/format';
import { Q, useQuery } from '../../src/lib/queries';
import { isOffice, useAuth, usePersona } from '../../src/store/auth';
import { usePrefs } from '../../src/store/prefs';
import { colors, fonts, radius, space } from '../../src/theme';

// Офис — управление каталогом (видимость, цены, фото).
export default function CatalogTab() {
  const persona = usePersona();
  return isOffice(persona) ? <AdminCatalog /> : <CatalogScreen />;
}

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').trim();

/**
 * Каталог: весь ассортимент грузится один раз (и берётся из кэша), а категории, «Новинки»,
 * «Избранное» и поиск фильтруют его локально — мгновенно и без лишних запросов.
 */
function CatalogScreen() {
  const params = useLocalSearchParams<{ categoryId?: string; isNew?: string; fav?: string }>();
  const insets = useSafeAreaInsets();
  const user = useAuth((s) => s.user);
  const canOrder = !!user?.permissions.canOrder;
  const copy = buyerCopy(user);

  const [categoryId, setCategoryId] = useState<string | undefined>(params.categoryId);
  const [isNew, setIsNew] = useState(params.isNew === '1');
  const [favOnly, setFavOnly] = useState(params.fav === '1');
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const query = useDeferredValue(search);
  const favorites = usePrefs((s) => s.favorites);
  const recent = usePrefs((s) => s.recentSearches);

  // Переход с главной с параметрами
  useEffect(() => {
    if (params.categoryId !== undefined || params.isNew !== undefined || params.fav !== undefined) {
      setCategoryId(params.categoryId || undefined);
      setIsNew(params.isNew === '1');
      setFavOnly(params.fav === '1');
      router.setParams({ categoryId: undefined, isNew: undefined, fav: undefined });
    }
  }, [params.categoryId, params.isNew, params.fav]);

  const cats = useQuery(Q.categories(), { staleTime: 5 * 60_000 });
  const products = useQuery(Q.products(user?.id ?? 'anon'), { staleTime: 60_000 });

  const data = useMemo(() => {
    let list = products.data ?? [];
    if (categoryId) list = list.filter((p) => p.categoryId === categoryId);
    if (isNew) list = list.filter((p) => p.isNew);
    if (favOnly) {
      const set = new Set(favorites);
      list = list.filter((p) => set.has(p.id));
    }
    const q = norm(query);
    if (q) {
      const words = q.split(/\s+/);
      list = list.filter((p) => {
        const hay = norm(`${p.name} ${p.category?.name ?? ''} ${p.description ?? ''} ${p.composition ?? ''}`);
        return words.every((w) => hay.includes(w));
      });
    }
    return list;
  }, [products.data, categoryId, isNew, favOnly, favorites, query]);

  const filtered = !!(categoryId || isNew || favOnly || query.trim());
  const resetFilters = () => {
    setSearch('');
    setCategoryId(undefined);
    setIsNew(false);
    setFavOnly(false);
  };
  // Запоминаем запрос, когда по нему что-то открыли/отправили (ref — чтобы строки списка не перерисовывались на каждую букву).
  const searchRef = React.useRef(search);
  searchRef.current = search;
  const rememberSearch = useCallback(() => {
    if (searchRef.current.trim().length >= 2) usePrefs.getState().pushSearch(searchRef.current);
  }, []);

  const renderItem: ListRenderItem<Product> = useCallback(
    ({ item }) => (
      <View style={styles.cell} onTouchStart={rememberSearch}>
        <ProductCard product={item} canOrder={canOrder} />
      </View>
    ),
    [canOrder, rememberSearch],
  );

  const showRecent = searchFocused && !search && recent.length > 0;

  const header = (
    <View style={{ gap: space.lg, paddingBottom: space.md }}>
      <View>
        <T v="display">Каталог</T>
        <T v="body" color={colors.textMuted}>
          {user ? copy.priceNote : 'Свежая выпечка к вашему утру'}
        </T>
      </View>
      <Field
        placeholder="Найти синнабон, торт, сэндвич…"
        value={search}
        onChangeText={setSearch}
        onFocus={() => setSearchFocused(true)}
        onBlur={() => {
          setSearchFocused(false);
          rememberSearch();
        }}
        onSubmitEditing={rememberSearch}
        left={<Icon name="search" size={20} color={colors.textSoft} />}
        right={
          search ? (
            <Touchable hitSlop={10} onPress={() => setSearch('')} accessibilityLabel="Очистить поиск" style={styles.clear}>
              <Icon name="close" size={16} color={colors.white} strokeWidth={2.4} />
            </Touchable>
          ) : null
        }
        returnKeyType="search"
        autoCorrect={false}
      />
      {showRecent && (
        <FadeIn offset={6} style={{ gap: space.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <T v="small" color={colors.textMuted} style={{ fontFamily: fonts.bold }}>
              Вы искали
            </T>
            <Touchable hitSlop={8} onPress={() => usePrefs.getState().clearSearches()}>
              <T v="small" color={colors.mango} style={{ fontFamily: fonts.bold }}>
                Очистить
              </T>
            </Touchable>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {recent.map((r) => (
              <Touchable key={r} onPress={() => setSearch(r)} style={styles.recent} haptic>
                <Icon name="clock" size={14} color={colors.textMuted} />
                <T v="small" style={{ fontFamily: fonts.semibold }}>
                  {r}
                </T>
              </Touchable>
            ))}
          </View>
        </FadeIn>
      )}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -space.lg }}
        contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.sm }}
      >
        <Chip
          label="Все"
          active={!categoryId && !isNew && !favOnly}
          onPress={() => {
            setCategoryId(undefined);
            setIsNew(false);
            setFavOnly(false);
          }}
        />
        <Chip label="Избранное" icon="heart" active={favOnly} count={favorites.length || undefined} onPress={() => setFavOnly(!favOnly)} />
        <Chip label="Новинки" icon="sparkle" active={isNew} onPress={() => setIsNew(!isNew)} />
        {(cats.data ?? []).map((c) => (
          <Chip
            key={c.id}
            label={c.name}
            count={c._count?.products}
            active={categoryId === c.id}
            onPress={() => setCategoryId(categoryId === c.id ? undefined : c.id)}
          />
        ))}
      </ScrollView>
      {!user && <SignInCta compact />}
      {user && <PartnerStatusCard user={user} />}
      {user?.role === 'GUEST' && !canOrder && <NoOrderNote />}
      {filtered && !products.loading && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <T v="small" color={colors.textMuted} style={{ fontFamily: fonts.semibold }}>
            {data.length ? `Найдено ${data.length} ${plural(data.length, 'позиция', 'позиции', 'позиций')}` : 'Ничего не найдено'}
          </T>
          <Touchable hitSlop={8} onPress={resetFilters}>
            <T v="small" color={colors.mango} style={{ fontFamily: fonts.bold }}>
              Сбросить
            </T>
          </Touchable>
        </View>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={products.loading ? [] : data}
        keyExtractor={(p) => p.id}
        numColumns={2}
        columnWrapperStyle={{ gap: space.md }}
        contentContainerStyle={{
          paddingHorizontal: space.lg,
          paddingTop: insets.top + space.md,
          paddingBottom: TAB_BAR_SPACE + insets.bottom,
          gap: space.md,
        }}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={7}
        removeClippedSubviews={Platform.OS === 'android'}
        refreshControl={
          <BrandRefresh
            refreshing={products.refreshing}
            offset={insets.top}
            onRefresh={() => {
              products.refresh();
              cats.refresh();
            }}
          />
        }
        renderItem={renderItem}
        ListEmptyComponent={
          products.loading ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
              {[0, 1, 2, 3].map((i) => (
                <View key={i} style={{ width: '47.5%' }}>
                  <ProductCardSkeleton />
                </View>
              ))}
            </View>
          ) : products.error ? (
            <ErrorState message={products.error} onRetry={products.refresh} />
          ) : favOnly && !favorites.length ? (
            <EmptyState
              icon="heart"
              tint="#FBD9E8"
              title="Избранное пока пусто"
              text="Нажмите на сердечко на карточке товара — и он всегда будет под рукой."
              action="Смотреть всё"
              onAction={resetFilters}
            />
          ) : (
            <EmptyState
              icon="search"
              title={query ? 'Ничего не нашли' : 'Здесь пока пусто'}
              text={query ? `По запросу «${query}» нет товаров. Попробуйте другое слово.` : 'В этой категории скоро появится выпечка.'}
              action={filtered ? 'Сбросить фильтры' : undefined}
              onAction={resetFilters}
            />
          )
        }
      />
      <StatusScrim />
    </View>
  );
}

const styles = StyleSheet.create({
  cell: { flex: 1, maxWidth: '50%' },
  clear: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.textSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    height: 36,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
