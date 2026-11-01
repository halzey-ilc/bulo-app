import React, { useEffect, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Catalog } from '../../src/api';
import { NoOrderNote, PartnerStatusCard, SignInCta } from '../../src/components/gates';
import { Icon } from '../../src/components/Icon';
import { TAB_BAR_SPACE } from '../../src/components/layout';
import { ProductCard, ProductCardSkeleton } from '../../src/components/product';
import { Chip, EmptyState, ErrorState, Field, T } from '../../src/components/ui';
import { useLoad } from '../../src/lib/useLoad';
import { useAuth } from '../../src/store/auth';
import { colors, space } from '../../src/theme';

export default function CatalogScreen() {
  const params = useLocalSearchParams<{ categoryId?: string; isNew?: string }>();
  const insets = useSafeAreaInsets();
  const user = useAuth((s) => s.user);
  const canOrder = !!user?.permissions.canOrder;

  const [categoryId, setCategoryId] = useState<string | undefined>(params.categoryId);
  const [isNew, setIsNew] = useState(params.isNew === '1');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');

  // Переход с главной с параметрами
  useEffect(() => {
    if (params.categoryId !== undefined || params.isNew !== undefined) {
      setCategoryId(params.categoryId || undefined);
      setIsNew(params.isNew === '1');
      router.setParams({ categoryId: undefined, isNew: undefined });
    }
  }, [params.categoryId, params.isNew]);

  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const cats = useLoad(() => Catalog.categories(), []);
  const products = useLoad(
    () => Catalog.products({ categoryId, isNew, search: query || undefined }),
    [categoryId, isNew, query, user?.id],
  );

  const header = (
    <View style={{ gap: space.lg, paddingBottom: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <View>
          <T v="display">Каталог</T>
          <T v="body" color={colors.textMuted}>
            Свежая выпечка к вашему утру
          </T>
        </View>
      </View>
      <Field
        placeholder="Найти синнабон, торт, сэндвич…"
        value={search}
        onChangeText={setSearch}
        left={<Icon name="search" size={20} color={colors.textSoft} />}
        returnKeyType="search"
        autoCorrect={false}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.lg }} contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.sm }}>
        <Chip label="Все" active={!categoryId && !isNew} onPress={() => { setCategoryId(undefined); setIsNew(false); }} />
        <Chip label="Новинки" icon="sparkle" active={isNew} onPress={() => { setIsNew(!isNew); }} />
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
    </View>
  );

  const data = products.data ?? [];

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
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={products.refreshing}
            onRefresh={() => {
              products.refresh();
              cats.refresh();
            }}
            tintColor={colors.mango}
            colors={[colors.mango]}
          />
        }
        renderItem={({ item }) => (
          <View style={{ flex: 1, maxWidth: '50%' }}>
            <ProductCard product={item} canOrder={canOrder} />
          </View>
        )}
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
          ) : (
            <EmptyState
              icon="search"
              title={query ? 'Ничего не нашли' : 'Здесь пока пусто'}
              text={query ? `По запросу «${query}» нет товаров. Попробуйте другое слово.` : 'В этой категории скоро появится выпечка.'}
              action={query || categoryId || isNew ? 'Сбросить фильтры' : undefined}
              onAction={() => {
                setSearch('');
                setCategoryId(undefined);
                setIsNew(false);
              }}
            />
          )
        }
      />
    </View>
  );
}
