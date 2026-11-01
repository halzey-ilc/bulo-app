import React from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Svg, { Circle, Path } from 'react-native-svg';
import type { User } from '../api';
import { colors, fonts, radius, space } from '../theme';
import { Icon } from './Icon';
import { Button, T } from './ui';

/** Анониму: «Войдите, чтобы видеть цены». */
export function SignInCta({ compact }: { compact?: boolean }) {
  return (
    <View style={[styles.cta, compact && { padding: space.lg }]}>
      <Svg style={StyleSheet.absoluteFill} viewBox="0 0 300 160" preserveAspectRatio="xMidYMid slice">
        <Circle cx={280} cy={10} r={70} fill={colors.softYellow} opacity={0.9} />
        <Circle cx={250} cy={150} r={30} fill="#FBD9E8" opacity={0.9} />
      </Svg>
      <View style={styles.ctaIcon}>
        <Icon name="key" size={22} color={colors.mango} />
      </View>
      <T v="h3">Войдите, чтобы видеть цены</T>
      <T v="small" color={colors.textMuted} style={{ maxWidth: 260 }}>
        Оптовые цены и заказ доступны партнёрам BULO. Ещё не с нами — оставьте заявку.
      </T>
      <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.sm }}>
        <Button title="Войти" small onPress={() => router.push('/login')} />
        <Button title="Стать партнёром" small kind="light" onPress={() => router.push('/register')} />
      </View>
    </View>
  );
}

/** Статус заявки партнёра: на рассмотрении / отклонена / заблокирован. */
export function PartnerStatusCard({ user }: { user: User }) {
  const st = user.partner?.status;
  if (!st || st === 'APPROVED') return null;
  if (st === 'PENDING') {
    return (
      <View style={[styles.status, { backgroundColor: colors.iceCube }]}>
        <Svg width={96} height={96} viewBox="0 0 96 96" style={{ position: 'absolute', right: -6, top: -6 }}>
          <Circle cx={60} cy={36} r={34} fill="#FFFFFF" opacity={0.45} />
          <Path d="M44 30 c6 -8 18 -8 22 0 M48 44 c4 4 10 4 14 0" stroke={colors.blueberry} strokeWidth={2} fill="none" strokeLinecap="round" opacity={0.35} />
        </Svg>
        <View style={[styles.statusIcon, { backgroundColor: colors.white }]}>
          <Icon name="hourglass" size={22} color={colors.blueberry} />
        </View>
        <T v="h3" color={colors.blueberry}>
          Заявка на рассмотрении
        </T>
        <T v="small" color={colors.blueberry} style={{ opacity: 0.85 }}>
          Спасибо! Менеджер проверит данные «{user.partner?.name}» и откроет доступ к ценам и заказам. Обычно это занимает
          несколько часов в рабочее время.
        </T>
      </View>
    );
  }
  return (
    <View style={[styles.status, { backgroundColor: colors.dangerSoft }]}>
      <View style={[styles.statusIcon, { backgroundColor: colors.white }]}>
        <Icon name="info" size={22} color={colors.danger} />
      </View>
      <T v="h3" color={colors.coffee}>
        {st === 'REJECTED' ? 'Заявка отклонена' : 'Доступ приостановлен'}
      </T>
      <T v="small" color={colors.coffee}>
        {user.partner?.rejectReason
          ? `Причина: ${user.partner.rejectReason}`
          : 'Свяжитесь с нами, чтобы уточнить детали.'}
      </T>
      <Button title="Связаться с BULO" small kind="light" icon="phone" onPress={() => router.push('/contacts')} style={{ alignSelf: 'flex-start', marginTop: 4 }} />
    </View>
  );
}

/** Гостю без права заказа. */
export function NoOrderNote() {
  return (
    <View style={[styles.status, { backgroundColor: colors.softYellow, flexDirection: 'row', alignItems: 'center' }]}>
      <Icon name="info" size={20} color={colors.cambodia} />
      <T v="small" style={{ flex: 1, fontFamily: fonts.semibold }}>
        Вам доступен просмотр цен. Чтобы оформлять заказы, свяжитесь с менеджером BULO.
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  cta: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    padding: space.xl,
    gap: 6,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: colors.primarySoft,
  },
  ctaIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  status: { borderRadius: radius.xl, padding: space.xl, gap: 6, overflow: 'hidden' },
  statusIcon: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
});
