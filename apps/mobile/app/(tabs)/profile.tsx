import React from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import Svg, { Circle, Path } from 'react-native-svg';
import { OfficeProfileLinks } from '../../src/components/admin/OfficeExtras';
import { PartnerStatusCard } from '../../src/components/gates';
import { Icon } from '../../src/components/Icon';
import { Screen } from '../../src/components/layout';
import { Logo } from '../../src/components/Logo';
import { Button, Card, Divider, Row, T } from '../../src/components/ui';
import { formatPhone, plural } from '../../src/lib/format';
import { isOffice, useAuth, usePersona } from '../../src/store/auth';
import { usePrefs } from '../../src/store/prefs';
import { confirmDialog } from '../../src/store/ui';
import { PARTNER_STATUS_LABELS, ROLE_LABELS } from '../../src/shared';
import { colors, fonts, radius, shadows, space } from '../../src/theme';

export default function Profile() {
  const user = useAuth((s) => s.user);
  const persona = usePersona();

  if (!user) return <Welcome />;

  const initials = (user.name || user.partner?.name || 'B')
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const isBuyer = persona === 'buyer';

  const logout = () =>
    confirmDialog({
      title: 'Выйти из аккаунта?',
      message: 'Корзина сохранится на этом устройстве.',
      confirmText: 'Выйти',
      destructive: true,
      onConfirm: async () => {
        await useAuth.getState().signOut();
      },
    });

  return (
    <Screen withTabBar topInset onRefresh={() => useAuth.getState().refresh()} refreshing={false}>
      <T v="display">Профиль</T>

      <View style={styles.hero}>
        <Svg style={StyleSheet.absoluteFill} viewBox="0 0 340 170" preserveAspectRatio="xMidYMid slice">
          <Circle cx={320} cy={10} r={70} fill={colors.softYellow} opacity={0.18} />
          <Circle cx={280} cy={160} r={40} fill={colors.mango} opacity={0.25} />
        </Svg>
        <View style={styles.avatar}>
          <T style={{ fontFamily: fonts.extrabold, fontSize: 22, color: colors.white }}>{initials}</T>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <T v="h2" color={colors.oatMilk} numberOfLines={1}>
            {user.name || user.partner?.contactName || 'Без имени'}
          </T>
          <T v="small" color="rgba(249,245,230,0.75)">
            {user.phone ? formatPhone(user.phone) : user.login ? `Логин: ${user.login}` : ''}
          </T>
          <View style={styles.rolePill}>
            <T v="caption" color={colors.cambodia} style={{ fontFamily: fonts.extrabold }}>
              {ROLE_LABELS[user.role]?.toUpperCase()}
            </T>
          </View>
        </View>
      </View>

      <PartnerStatusCard user={user} />

      {user.partner && (
        <Card style={{ gap: space.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Icon name="shop" size={20} color={colors.mango} />
            <T v="h3" style={{ flex: 1 }}>
              {user.partner.name}
            </T>
          </View>
          <Divider />
          <Info label="Статус" value={PARTNER_STATUS_LABELS[user.partner.status]} />
          {!!user.partner.contactName && <Info label="Контактное лицо" value={user.partner.contactName} />}
          {!!user.partner.inn && <Info label="ИНН" value={user.partner.inn} />}
          {!!user.partner.phone && <Info label="Телефон" value={formatPhone(user.partner.phone)} />}
          {user.role === 'GUEST' && <Info label="Оформление заказов" value={user.permissions.canOrder ? 'Доступно' : 'Только просмотр цен'} />}
        </Card>
      )}

      {isOffice(persona) && <OfficeProfileLinks />}

      <Card padded={false} style={{ paddingVertical: 4 }}>
        <Row icon="edit" title="Имя и почта" subtitle={user.email || 'Почта не указана'} onPress={() => router.push('/profile-edit')} />
        <Divider inset={68} />
        <Row icon="phone" title="Сменить телефон" subtitle={user.phone ? formatPhone(user.phone) : 'Телефон не привязан'} onPress={() => router.push('/change-phone')} />
        <Divider inset={68} />
        <Row
          icon="lock"
          title="Сменить пароль"
          subtitle={user.login ? `Логин: ${user.login}` : 'Для входа по логину и паролю'}
          onPress={() => router.push('/change-password')}
        />
        {isBuyer && (
          <>
            <Divider inset={68} />
            <Row icon="pin" title="Адреса доставки" onPress={() => router.push('/addresses')} />
            <Divider inset={68} />
            <FavoritesRow />
          </>
        )}
        <Divider inset={68} />
        <Row icon="bell" title="Уведомления" onPress={() => router.push('/notifications')} />
        <Divider inset={68} />
        <Row icon="at" title="Контакты BULO" subtitle="Телефон, адрес, соцсети" onPress={() => router.push('/contacts')} />
      </Card>

      <Card padded={false} style={{ paddingVertical: 4 }}>
        <Row icon="logout" title="Выйти" danger onPress={logout} />
      </Card>

      <Footer />
    </Screen>
  );
}

function FavoritesRow() {
  const count = usePrefs((s) => s.favorites.length);
  return (
    <Row
      icon="heart"
      title="Избранное"
      subtitle={count ? `${count} ${plural(count, 'товар', 'товара', 'товаров')}` : 'Отмечайте сердечком любимое'}
      onPress={() => router.navigate({ pathname: '/catalog', params: { fav: '1' } })}
    />
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md }}>
      <T v="small" color={colors.textMuted}>
        {label}
      </T>
      <T v="small" style={{ fontFamily: fonts.bold, flexShrink: 1, textAlign: 'right' }}>
        {value}
      </T>
    </View>
  );
}

function Footer() {
  return (
    <View style={{ alignItems: 'center', gap: 4, paddingTop: space.md, opacity: 0.55 }}>
      <Logo width={52} color={colors.cambodia} />
      <T v="caption" color={colors.textMuted}>
        Версия {Constants.expoConfig?.version ?? '1.0.0'} · Taste at Your Pace
      </T>
    </View>
  );
}

/** Экран для гостя без входа: приветствие и варианты входа. */
function Welcome() {
  return (
    <Screen withTabBar topInset contentStyle={{ gap: space.xl }}>
      <View style={styles.welcome}>
        <Svg style={StyleSheet.absoluteFill} viewBox="0 0 340 360" preserveAspectRatio="xMidYMid slice">
          <Circle cx={300} cy={40} r={90} fill={colors.softYellow} />
          <Circle cx={40} cy={330} r={80} fill={colors.iceCube} opacity={0.8} />
          <Circle cx={290} cy={300} r={18} fill={colors.strawberryMilk} />
          <Path d="M60 90c10-14 30-14 40 0" stroke={colors.mango} strokeWidth={4} strokeLinecap="round" fill="none" opacity={0.5} />
        </Svg>
        <Logo width={150} />
        <T v="h1" center style={{ marginTop: space.lg }}>
          Добро пожаловать в BULO
        </T>
        <T v="body" center color={colors.textMuted} style={{ maxWidth: 280 }}>
          Синнабоны, выпечка, торты и сэндвичи для вашей кофейни — с доставкой к утру.
        </T>
      </View>
      <View style={{ gap: space.sm }}>
        <Button title="Войти по номеру телефона" icon="phone" onPress={() => router.push('/login')} />
        <Button title="Войти по логину и паролю" icon="key" kind="ghost" onPress={() => router.push('/login/password')} />
      </View>
      <Card style={{ gap: space.sm, backgroundColor: colors.cambodia }}>
        <T v="h3" color={colors.oatMilk}>
          Хотите продавать BULO?
        </T>
        <T v="small" color="rgba(249,245,230,0.8)">
          Оставьте заявку — после проверки откроем оптовые цены и заказы прямо в приложении.
        </T>
        <Button title="Стать партнёром" kind="primary" small icon="arrowRight" onPress={() => router.push('/register')} style={{ alignSelf: 'flex-start', marginTop: 4 }} />
      </Card>
      <Card padded={false} style={{ paddingVertical: 4 }}>
        <Row icon="at" title="Контакты BULO" subtitle="Телефон, адрес, соцсети" onPress={() => router.push('/contacts')} />
      </Card>
      <Footer />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    backgroundColor: colors.cambodia,
    borderRadius: radius.xxl,
    padding: space.xl,
    overflow: 'hidden',
    ...shadows.card,
  },
  avatar: {
    width: 68,
    height: 68,
    borderRadius: 26,
    backgroundColor: colors.mango,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-4deg' }],
  },
  rolePill: {
    alignSelf: 'flex-start',
    backgroundColor: colors.lime,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    marginTop: 2,
  },
  hint: { flexDirection: 'row', gap: space.sm, alignItems: 'center', backgroundColor: colors.iceCube, padding: space.md, borderRadius: radius.lg },
  welcome: {
    alignItems: 'center',
    paddingVertical: space.xxxl,
    paddingHorizontal: space.xl,
    borderRadius: radius.xxl,
    backgroundColor: colors.white,
    overflow: 'hidden',
    gap: space.sm,
  },
});
