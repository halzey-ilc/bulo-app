import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Svg, { Circle, Path } from 'react-native-svg';
import { Catalog, Notifications, Orders } from '../../src/api';
import { ContactsCard } from '../../src/components/contacts';
import { NoOrderNote, PartnerStatusCard, SignInCta } from '../../src/components/gates';
import { Icon, IconName } from '../../src/components/Icon';
import { Screen } from '../../src/components/layout';
import { Logo } from '../../src/components/Logo';
import { StatusChip } from '../../src/components/order';
import { ProductCard, ProductCardSkeleton, ProductImage } from '../../src/components/product';
import { Button, Card, IconButton, SectionTitle, Skeleton, T, Touchable } from '../../src/components/ui';
import { dayLabel, greeting, money } from '../../src/lib/format';
import { repeatOrder } from '../../src/lib/repeat';
import { useLoad } from '../../src/lib/useLoad';
import { useAuth } from '../../src/store/auth';
import { colors, fonts, radius, shadows, space } from '../../src/theme';

export default function Home() {
  const user = useAuth((s) => s.user);
  const authed = !!user;
  const canOrder = !!user?.permissions.canOrder;

  const info = useLoad(() => Catalog.info(), []);
  const news = useLoad(() => Catalog.products({ isNew: true }), [user?.id]);
  const cats = useLoad(() => Catalog.categories(), []);
  const rules = useLoad(() => Orders.rules(), [user?.id], { enabled: authed });
  const orders = useLoad(() => Orders.list(), [user?.id], { enabled: authed });
  const notif = useLoad(() => Notifications.list(), [user?.id], { enabled: authed });

  const refreshing = info.refreshing || news.refreshing;
  const onRefresh = () => {
    info.refresh();
    news.refresh();
    cats.refresh();
    if (authed) {
      rules.refresh();
      orders.refresh();
      notif.refresh();
      void useAuth.getState().refresh();
    }
  };

  const name = user ? (user.partner?.contactName || user.name || user.partner?.name || 'партнёр') : 'гость';
  const lastOrder = orders.data?.[0];
  const cutoff = rules.data?.cutoffTime ?? info.data?.cutoffTime ?? '16:00';
  const minSum = rules.data?.minOrderSum ?? info.data?.minOrderSum;
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
    ...(canOrder && lastOrder
      ? [{ key: 'rep', label: 'Повторить', icon: 'repeat' as IconName, bg: colors.primarySoft, fg: colors.mango, onPress: () => repeatOrder(lastOrder) }]
      : []),
    { key: 'addr', label: 'Адреса', icon: 'pin', bg: colors.iceCube, fg: colors.blueberry, onPress: () => router.push(authed ? '/addresses' : '/contacts') },
    { key: 'soc', label: 'Соцсети', icon: 'instagram', bg: '#FBD9E8', fg: colors.coffee, onPress: () => router.push('/contacts') },
    { key: 'cont', label: 'Контакты', icon: 'phone', bg: colors.greenSoft, fg: colors.cambodia, onPress: () => router.push('/contacts') },
  ];

  return (
    <Screen withTabBar topInset refreshing={refreshing} onRefresh={onRefresh} contentStyle={{ gap: space.xl }}>
      {/* Приветствие */}
      <View style={styles.top}>
        <View style={{ flex: 1 }}>
          <T v="body" color={colors.textMuted}>
            {greeting()} {new Date().getHours() >= 18 || new Date().getHours() < 5 ? '☾' : '☀'}
          </T>
          <T v="h1" numberOfLines={1}>
            {name.charAt(0).toUpperCase() + name.slice(1)}
          </T>
        </View>
        {authed ? (
          <>
            <View style={styles.logoPill}>
              <Logo width={44} />
            </View>
            <IconButton name="bell" badge={notif.data?.unread} onPress={() => router.push('/notifications')} label="Уведомления" />
          </>
        ) : (
          <Touchable onPress={() => router.push('/login')} style={styles.loginPill} haptic>
            <Icon name="login" size={18} color={colors.white} />
            <T v="small" color={colors.white} style={{ fontFamily: fonts.bold }}>
              Войти
            </T>
          </Touchable>
        )}
      </View>

      {/* Сторис */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stories} style={{ marginHorizontal: -space.lg }}>
        {stories.map((s) => (
          <Touchable key={s.key} onPress={s.onPress} style={styles.story} haptic scaleTo={0.93}>
            <View style={styles.storyRing}>
              <View style={[styles.storyInner, { backgroundColor: s.bg }]}>
                <Icon name={s.icon} size={30} color={s.fg} strokeWidth={1.6} />
              </View>
            </View>
            <T v="small" style={{ fontFamily: fonts.semibold, fontSize: 12 }} numberOfLines={1}>
              {s.label}
            </T>
          </Touchable>
        ))}
      </ScrollView>

      {user && <PartnerStatusCard user={user} />}
      {user && user.role === 'GUEST' && !canOrder && <NoOrderNote />}

      {/* Последний заказ */}
      {authed && orders.loading && <Skeleton style={{ height: 76, borderRadius: radius.xl }} />}
      {lastOrder && (
        <Card onPress={() => router.push(`/order/${lastOrder.id}`)} style={styles.lastOrder}>
          <View style={styles.lastIcon}>
            <Icon name="receipt" size={22} color={colors.mango} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <T v="bodyStrong">
              Заказ №{lastOrder.number} · на {dayLabel(lastOrder.deliveryDate).toLowerCase()}
            </T>
            <StatusChip status={lastOrder.status} small />
          </View>
          <Icon name="chevronRight" size={18} color={colors.textSoft} />
        </Card>
      )}

      {/* Промо */}
      <View style={styles.promo}>
        <Svg style={StyleSheet.absoluteFill} viewBox="0 0 340 200" preserveAspectRatio="xMidYMid slice">
          <Circle cx={315} cy={20} r={80} fill="#FFFFFF" opacity={0.12} />
          <Circle cx={300} cy={190} r={46} fill={colors.coffee} opacity={0.18} />
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
          <Icon name="clock" size={14} color={colors.mango} strokeWidth={2} />
          <T v="caption" color={colors.mango} style={{ fontFamily: fonts.extrabold }}>
            ПРИЁМ ЗАКАЗОВ
          </T>
        </View>
        <T v="h1" color={colors.white} style={{ maxWidth: 240 }}>
          На завтра — до {cutoff}
        </T>
        <T v="small" color="rgba(255,255,255,0.88)" style={{ maxWidth: 250 }}>
          {rules.data
            ? `Ближайшая доставка: ${dayLabel(rules.data.earliestDeliveryDate).toLowerCase()}${minSum ? ` · минимальный заказ ${money(minSum)}` : ''}`
            : 'Свежая выпечка каждое утро — успейте оформить заказ заранее.'}
        </T>
        <Button
          title={canOrder ? 'Собрать заказ' : 'Смотреть каталог'}
          kind="light"
          small
          onPress={() => router.navigate('/catalog')}
          style={{ alignSelf: 'flex-start', marginTop: space.sm }}
        />
      </View>

      {!authed && <SignInCta />}

      {/* Новинки */}
      <View style={{ gap: space.md }}>
        <SectionTitle title="Новинки" action="Все" onAction={() => router.navigate({ pathname: '/catalog', params: { isNew: '1' } })} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.lg }} contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.md, paddingVertical: 4 }}>
          {news.loading
            ? [0, 1].map((i) => (
                <View key={i} style={{ width: 168 }}>
                  <ProductCardSkeleton />
                </View>
              ))
            : (news.data ?? []).map((p) => <ProductCard key={p.id} product={p} canOrder={canOrder} width={168} />)}
          {!news.loading && !news.data?.length && (
            <T v="body" color={colors.textMuted}>
              Скоро здесь появятся новинки
            </T>
          )}
        </ScrollView>
      </View>

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
                  <T v="bodyStrong" numberOfLines={1}>
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

const styles = StyleSheet.create({
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
  loginPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.mango,
    paddingHorizontal: 16,
    height: 44,
    borderRadius: 22,
  },
  stories: { paddingHorizontal: space.lg, gap: 14 },
  story: { alignItems: 'center', gap: 6, width: 74 },
  storyRing: {
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 2.5,
    borderColor: colors.mango,
    padding: 3,
    backgroundColor: colors.white,
  },
  storyInner: { flex: 1, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  lastOrder: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  lastIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
