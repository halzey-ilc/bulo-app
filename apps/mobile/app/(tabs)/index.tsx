import React, { memo, useMemo } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import Svg, { Circle, Path } from 'react-native-svg';
import type { Order, Product } from '../../src/api';
import { ContactsCard } from '../../src/components/contacts';
import { NoOrderNote, PartnerStatusCard, SignInCta } from '../../src/components/gates';
import { Icon, IconName } from '../../src/components/Icon';
import { Screen } from '../../src/components/layout';
import { Logo } from '../../src/components/Logo';
import { FadeIn, Pulse } from '../../src/components/motion';
import { FlowDots, StatusChip } from '../../src/components/order';
import { ProductCard, ProductCardSkeleton, ProductImage } from '../../src/components/product';
import { Button, Card, IconButton, SectionTitle, Skeleton, T, Touchable } from '../../src/components/ui';
import { buyerCopy, durationText, useCutoff } from '../../src/lib/cutoff';
import { dayLabel, greeting, money, plural } from '../../src/lib/format';
import { frequentProducts, Q, useQuery } from '../../src/lib/queries';
import { repeatOrder } from '../../src/lib/repeat';
import { useAuth, usePersona } from '../../src/store/auth';
import { usePrefs } from '../../src/store/prefs';
import { colors, fonts, radius, shadows, space } from '../../src/theme';

const ACTIVE = new Set(['NEW', 'APPROVED', 'PAID', 'IN_PRODUCTION', 'READY', 'SHIPPED']);

export default function Home() {
  const user = useAuth((s) => s.user);
  const persona = usePersona();
  const uid = user?.id ?? 'anon';
  const authed = !!user;
  const buyer = persona === 'buyer';
  const canOrder = !!user?.permissions.canOrder;
  const copy = buyerCopy(user);

  const info = useQuery(Q.info(), { staleTime: 5 * 60_000 });
  const cats = useQuery(Q.categories(), { staleTime: 5 * 60_000 });
  const products = useQuery(Q.products(uid), { staleTime: 60_000 });
  const rules = useQuery(Q.rules());
  const orders = useQuery(Q.orders(uid), { enabled: authed && buyer });
  const notif = useQuery(Q.notifications(uid), { enabled: authed });
  const favIds = usePrefs((s) => s.favorites);
  const cutoff = useCutoff(rules.data);

  const refreshing = products.refreshing || orders.refreshing;
  const onRefresh = () => {
    products.refresh();
    info.refresh();
    cats.refresh();
    rules.refresh();
    if (authed) {
      orders.refresh();
      notif.refresh();
      void useAuth.getState().refresh();
    }
  };

  const name = user ? user.partner?.contactName || user.name || user.partner?.name || copy.fallbackName : 'гость';
  const lastOrder = orders.data?.[0];
  const activeOrder = orders.data?.find((o) => ACTIVE.has(o.status));
  const news = useMemo(() => (products.data ?? []).filter((p) => p.isNew), [products.data]);
  const favorites = useMemo(() => {
    const byId = new Map((products.data ?? []).map((p) => [p.id, p]));
    return favIds.map((id) => byId.get(id)).filter((p): p is Product => !!p);
  }, [favIds, products.data]);
  const frequent = useMemo(() => frequentProducts(orders.data, products.data), [orders.data, products.data]);
  const cinnabon = cats.data?.find((c) => c.name.toLowerCase().includes('синнаб'));

  const stories: { key: string; label: string; icon: IconName; bg: string; fg: string; onPress: () => void }[] = [
    { key: 'new', label: 'Новинки', icon: 'sparkle', bg: '#EEF0B8', fg: colors.cambodia, onPress: () => router.navigate({ pathname: '/catalog', params: { isNew: '1' } }) },
    {
      key: 'cin',
      label: 'Синнабоны',
      icon: 'spiral',
      bg: colors.softYellow,
      fg: colors.mango,
      onPress: () => router.navigate({ pathname: '/catalog', params: cinnabon ? { categoryId: cinnabon.id } : {} }),
    },
    { key: 'fav', label: 'Избранное', icon: 'heart', bg: '#FBD9E8', fg: colors.coffee, onPress: () => router.navigate({ pathname: '/catalog', params: { fav: '1' } }) },
    canOrder && lastOrder
      ? { key: 'rep', label: 'Повторить', icon: 'repeat', bg: colors.primarySoft, fg: colors.mango, onPress: () => repeatOrder(lastOrder) }
      : { key: 'addr', label: authed ? 'Адреса' : 'Где мы', icon: 'pin', bg: colors.iceCube, fg: colors.blueberry, onPress: () => router.push(authed && buyer ? '/addresses' : '/contacts') },
    { key: 'cont', label: 'Контакты', icon: 'phone', bg: colors.greenSoft, fg: colors.cambodia, onPress: () => router.push('/contacts') },
  ];

  return (
    <Screen withTabBar topInset refreshing={refreshing} onRefresh={onRefresh} contentStyle={{ gap: space.xl }}>
      {/* Приветствие. Правый верхний угол — только логотип (там может всплывать кнопка разработчика). */}
      <View style={styles.top}>
        <View style={{ flex: 1 }}>
          <T v="body" color={colors.textMuted}>
            {greeting()} {new Date().getHours() >= 18 || new Date().getHours() < 5 ? '☾' : '☀'}
          </T>
          <T v="h1" numberOfLines={1}>
            {name.charAt(0).toUpperCase() + name.slice(1)}
          </T>
        </View>
        {authed && (
          <IconButton name="bell" badge={notif.data?.unread} onPress={() => router.push('/notifications')} label="Уведомления" />
        )}
        <View style={styles.logoPill}>
          <Logo width={44} />
        </View>
      </View>

      <Stories items={stories} />

      {user && <PartnerStatusCard user={user} />}
      {user && user.role === 'GUEST' && !canOrder && <NoOrderNote />}

      {/* Активный заказ — живой статус */}
      {authed && buyer && orders.loading && <Skeleton style={{ height: 92, borderRadius: radius.xl }} />}
      {activeOrder && <ActiveOrderCard order={activeOrder} />}

      {/* Отсечка приёма заказов с живым обратным отсчётом */}
      <CutoffCard cutoff={cutoff} minSum={rules.data?.minOrderSum ?? info.data?.minOrderSum} canOrder={canOrder} />

      {!authed && <SignInCta />}

      {/* Повтор последнего заказа в одно касание */}
      {canOrder && lastOrder && <RepeatCard order={lastOrder} />}

      {canOrder && frequent.length > 0 && (
        <ProductRow title="Часто заказываете" icon="flame" products={frequent} canOrder={canOrder} />
      )}

      {favorites.length > 0 && (
        <ProductRow
          title="Избранное"
          icon="heart"
          products={favorites}
          canOrder={canOrder}
          onAll={() => router.navigate({ pathname: '/catalog', params: { fav: '1' } })}
        />
      )}

      <ProductRow
        title="Новинки"
        icon="sparkle"
        products={news}
        canOrder={canOrder}
        loading={products.loading}
        empty="Скоро здесь появятся новинки"
        onAll={() => router.navigate({ pathname: '/catalog', params: { isNew: '1' } })}
      />

      {/* Категории */}
      {!!cats.data?.length && (
        <View style={{ gap: space.md }}>
          <SectionTitle title="Что печём" />
          <View style={styles.catGrid}>
            {cats.data.map((c) => (
              <Touchable
                key={c.id}
                style={styles.catTile}
                onPress={() => router.navigate({ pathname: '/catalog', params: { categoryId: c.id } })}
                scaleTo={0.96}
              >
                <ProductImage category={c.name} photoUrl={c.imageUrl} style={{ width: 52, height: 52 }} iconSize={28} rounded={16} />
                <View style={{ flex: 1 }}>
                  <T v="bodyStrong" numberOfLines={2} style={{ fontSize: 14, lineHeight: 18 }}>
                    {c.name}
                  </T>
                  <T v="small" color={colors.textSoft}>
                    {c._count?.products ?? 0} поз.
                  </T>
                </View>
              </Touchable>
            ))}
          </View>
        </View>
      )}

      {/* Контакты */}
      {info.data && (
        <View style={{ gap: space.md }}>
          <SectionTitle title="Мы на связи" />
          <ContactsCard info={info.data} />
        </View>
      )}

      <View style={{ alignItems: 'center', paddingTop: space.md, gap: 4, opacity: 0.6 }}>
        <Logo width={56} color={colors.cambodia} />
        <T v="caption" color={colors.textMuted}>
          Taste at Your Pace
        </T>
      </View>
    </Screen>
  );
}

/** Ряд «сторис»: ровно 5 кружков на ширину экрана — без обрезанного края. */
function Stories({ items }: { items: { key: string; label: string; icon: IconName; bg: string; fg: string; onPress: () => void }[] }) {
  const { width } = useWindowDimensions();
  const gap = 8;
  const size = Math.min(74, Math.floor((width - space.lg * 2 - gap * (items.length - 1)) / items.length));
  return (
    <View style={[styles.stories, { gap }]}>
      {items.map((s) => (
        <Touchable key={s.key} onPress={s.onPress} style={[styles.story, { width: size }]} haptic scaleTo={0.93} accessibilityLabel={s.label}>
          <View style={[styles.storyRing, { width: size, height: size, borderRadius: size / 2 }]}>
            <View style={[styles.storyInner, { backgroundColor: s.bg }]}>
              <Icon name={s.icon} size={Math.round(size * 0.4)} color={s.fg} strokeWidth={1.7} />
            </View>
          </View>
          <T v="small" style={{ fontFamily: fonts.semibold, fontSize: 11, letterSpacing: -0.2 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
            {s.label}
          </T>
        </Touchable>
      ))}
    </View>
  );
}

const ProductRow = memo(function ProductRow({
  title,
  icon,
  products,
  canOrder,
  loading,
  empty,
  onAll,
}: {
  title: string;
  icon?: IconName;
  products: Product[];
  canOrder: boolean;
  loading?: boolean;
  empty?: string;
  onAll?: () => void;
}) {
  if (!loading && !products.length && !empty) return null;
  return (
    <FadeIn style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        {icon && (
          <View style={styles.rowIcon}>
            <Icon name={icon} size={16} color={colors.mango} strokeWidth={2} />
          </View>
        )}
        <SectionTitle title={title} action={onAll && products.length > 2 ? 'Все' : undefined} onAction={onAll} style={{ flex: 1 }} />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -space.lg }}
        contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.md, paddingVertical: 4 }}
        decelerationRate="fast"
        snapToInterval={168 + space.md}
      >
        {loading
          ? [0, 1, 2].map((i) => (
              <View key={i} style={{ width: 168 }}>
                <ProductCardSkeleton />
              </View>
            ))
          : products.map((p) => <ProductCard key={p.id} product={p} canOrder={canOrder} width={168} />)}
        {!loading && !products.length && (
          <T v="body" color={colors.textMuted}>
            {empty}
          </T>
        )}
      </ScrollView>
    </FadeIn>
  );
});

function ActiveOrderCard({ order }: { order: Order }) {
  return (
    <FadeIn>
      <Card onPress={() => router.push(`/order/${order.id}`)} style={{ gap: space.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <View style={styles.liveIcon}>
            <Pulse size={44} color={colors.mango} />
            <Icon name="receipt" size={22} color={colors.mango} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <T v="bodyStrong">
              Заказ №{order.number} · на {dayLabel(order.deliveryDate).toLowerCase()}
            </T>
            <StatusChip status={order.status} small />
          </View>
          <Icon name="chevronRight" size={18} color={colors.textSoft} />
        </View>
        <FlowDots status={order.status} />
        {order.status === 'SHIPPED' && (
          <Touchable onPress={() => router.push(`/track/${order.id}`)} haptic style={styles.trackBtn}>
            <Icon name="navigation" size={18} color={colors.white} />
            <T v="bodyStrong" color={colors.white} style={{ flex: 1, fontFamily: fonts.bold }}>
              Отследить курьера
            </T>
            <Icon name="chevronRight" size={18} color={colors.white} />
          </Touchable>
        )}
      </Card>
    </FadeIn>
  );
}

function RepeatCard({ order }: { order: Order }) {
  const count = order.items.length;
  return (
    <FadeIn>
      <View style={styles.repeat}>
        <View style={{ flex: 1, gap: 6 }}>
          <T v="caption" color={colors.mango} style={{ fontFamily: fonts.extrabold }}>
            ПРОШЛЫЙ ЗАКАЗ
          </T>
          <View style={{ flexDirection: 'row' }}>
            {order.items.slice(0, 4).map((i, k) => (
              <ProductImage
                key={i.id}
                photoUrl={i.photoUrl}
                category={i.category}
                seed={i.productId}
                iconSize={18}
                rounded={12}
                style={[styles.thumb, { marginLeft: k ? -8 : 0, zIndex: 10 - k }]}
              />
            ))}
          </View>
          <T v="small" color={colors.textMuted}>
            №{order.number} · {count} {plural(count, 'позиция', 'позиции', 'позиций')} · {money(order.total)}
          </T>
        </View>
        <Button title="В корзину" icon="repeat" small onPress={() => repeatOrder(order)} />
      </View>
    </FadeIn>
  );
}

function CutoffCard({
  cutoff,
  minSum,
  canOrder,
}: {
  cutoff: ReturnType<typeof useCutoff>;
  minSum?: number;
  canOrder: boolean;
}) {
  return (
    <View style={[styles.promo, !cutoff.open && { backgroundColor: colors.coffee }]}>
      <Svg style={StyleSheet.absoluteFill} viewBox="0 0 340 200" preserveAspectRatio="xMidYMid slice">
        <Circle cx={315} cy={20} r={80} fill="#FFFFFF" opacity={0.12} />
        <Circle cx={300} cy={190} r={46} fill={colors.cambodia} opacity={0.14} />
        <Path
          d="M262 112a5 5 0 1 1 5-6.5 13 13 0 0 1-11.5 18 19 19 0 0 1-18.5-21 26 26 0 0 1 28.5-24 32 32 0 0 1 29 34.5"
          stroke="#FFFFFF"
          strokeWidth={5}
          strokeLinecap="round"
          fill="none"
          opacity={0.55}
        />
      </Svg>
      <View style={styles.promoTag}>
        <Icon name="clock" size={14} color={cutoff.open ? colors.mango : colors.coffee} strokeWidth={2} />
        <T v="caption" color={cutoff.open ? colors.mango : colors.coffee} style={{ fontFamily: fonts.extrabold }}>
          {cutoff.open ? (cutoff.urgent ? 'УСПЕЙТЕ ОФОРМИТЬ' : 'ПРИЁМ ЗАКАЗОВ ОТКРЫТ') : 'ПРИЁМ НА ЗАВТРА ЗАКРЫТ'}
        </T>
      </View>
      <T v="h1" color={colors.white} style={{ maxWidth: 250 }}>
        {cutoff.open ? `На завтра — до ${cutoff.cutoffTime}` : `Доставим ${dayLabel(cutoff.earliest).toLowerCase()}`}
      </T>
      <T v="small" color="rgba(255,255,255,0.92)" style={{ maxWidth: 260, fontFamily: fonts.semibold }}>
        {cutoff.open
          ? `До закрытия приёма осталось ${durationText(cutoff.leftMin)}`
          : `Заказы на завтра принимаем до ${cutoff.cutoffTime}`}
        {minSum ? ` · минимальный заказ ${money(minSum)}` : ''}
      </T>
      <Button
        title={canOrder ? 'Собрать заказ' : 'Смотреть каталог'}
        kind="light"
        small
        icon="arrowRight"
        onPress={() => router.navigate('/catalog')}
        style={{ alignSelf: 'flex-start', marginTop: space.sm }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  trackBtn: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.mango, borderRadius: radius.lg, paddingHorizontal: space.lg, height: 48 },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  logoPill: {
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 22,
    backgroundColor: colors.softYellow,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.white,
    ...shadows.soft,
  },
  stories: { flexDirection: 'row', justifyContent: 'space-between' },
  story: { alignItems: 'center', gap: 6 },
  storyRing: {
    borderWidth: 2.5,
    borderColor: colors.mango,
    padding: 3,
    backgroundColor: colors.white,
  },
  storyInner: { flex: 1, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  liveIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIcon: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  repeat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    padding: space.lg,
    borderWidth: 1.5,
    borderColor: colors.primarySoft,
  },
  thumb: { width: 36, height: 36, borderWidth: 2, borderColor: colors.white },
  promo: {
    backgroundColor: colors.mango,
    borderRadius: radius.xxl,
    padding: space.xxl,
    gap: 8,
    overflow: 'hidden',
    ...shadows.card,
  },
  promoTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: colors.white,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  catTile: {
    flexBasis: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 10,
    ...shadows.soft,
  },
});
