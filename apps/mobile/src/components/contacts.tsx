import React from 'react';
import { Linking, View } from 'react-native';
import type { Info } from '../api';
import { formatPhone } from '../lib/format';
import { toast } from '../store/ui';
import { colors } from '../theme';
import { Card, Divider, Row } from './ui';

export function openUrl(url: string) {
  Linking.openURL(url).catch(() => toast.error('Не удалось открыть ссылку'));
}

export function callPhone(phone: string) {
  openUrl(`tel:${phone.replace(/[^\d+]/g, '')}`);
}

export function openMaps(address: string) {
  const q = encodeURIComponent(address.includes('Бишкек') ? address : `Бишкек, ${address}`);
  openUrl(`https://2gis.kg/bishkek/search/${q}`);
}

const instagramUrl = (v: string) => (v.startsWith('http') ? v : `https://instagram.com/${v.replace(/^@/, '')}`);
const whatsappUrl = (v: string) => (v.startsWith('http') ? v : `https://wa.me/${v.replace(/\D/g, '')}`);
const telegramUrl = (v: string) => (v.startsWith('http') ? v : `https://t.me/${v.replace(/^@/, '')}`);

export function ContactsCard({ info }: { info: Info }) {
  const rows: React.ReactNode[] = [];
  if (info.phone)
    rows.push(
      <Row key="phone" icon="phone" tint={colors.primarySoft} iconColor={colors.mango} title={formatPhone(info.phone)} subtitle="Позвонить" onPress={() => callPhone(info.phone!)} />,
    );
  if (info.address)
    rows.push(
      <Row key="addr" icon="pin" tint={colors.iceCube} iconColor={colors.blueberry} title={info.address} subtitle="Открыть на карте" onPress={() => openMaps(info.address!)} />,
    );
  if (info.workHours)
    rows.push(<Row key="hours" icon="clock" tint={colors.softYellow} iconColor={colors.cambodia} title={info.workHours} subtitle="Часы работы" />);
  if (info.instagram)
    rows.push(
      <Row key="ig" icon="instagram" tint="#FBD9E8" iconColor={colors.coffee} title={`@${info.instagram.replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '')}`} subtitle="Instagram" onPress={() => openUrl(instagramUrl(info.instagram!))} />,
    );
  if (info.whatsapp)
    rows.push(
      <Row key="wa" icon="chat" tint={colors.greenSoft} iconColor={colors.success} title={info.whatsapp} subtitle="WhatsApp" onPress={() => openUrl(whatsappUrl(info.whatsapp!))} />,
    );
  if (info.telegram)
    rows.push(
      <Row key="tg" icon="send" tint={colors.iceCube} iconColor={colors.blueberry} title={info.telegram} subtitle="Telegram" onPress={() => openUrl(telegramUrl(info.telegram!))} />,
    );
  if (info.email)
    rows.push(<Row key="mail" icon="at" title={info.email} subtitle="Почта" onPress={() => openUrl(`mailto:${info.email}`)} />);

  return (
    <Card padded={false} style={{ paddingVertical: 4 }}>
      {rows.map((r, i) => (
        <View key={i}>
          {i > 0 && <Divider inset={68} />}
          {r}
        </View>
      ))}
    </Card>
  );
}
