import React from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import type { Order } from '../api';
import { dayLabel, money, plural } from '../lib/format';
import { ORDER_FLOW, ORDER_STATUS_LABELS, OrderStatus } from '../shared';
import { colors, fonts, radius, space } from '../theme';
import { Icon, IconName } from './Icon';
import { ProductImage } from './product';
import { Card, T } from './ui';

export const STATUS_STYLE: Record<OrderStatus, { bg: string; fg: string; icon: IconName }> = {
  NEW: { bg: colors.iceCube, fg: colors.blueberry, icon: 'sparkle' },
  APPROVED: { bg: colors.softYellow, fg: '#8A5A00', icon: 'card' },
  PAID: { bg: '#E6EBC4', fg: colors.cambodia, icon: 'check' },
  IN_PRODUCTION: { bg: colors.primarySoft, fg: colors.mango, icon: 'chef' },
  READY: { bg: '#DDEFD9', fg: colors.success, icon: 'box' },
  SHIPPED: { bg: '#FBD9E8', fg: colors.coffee, icon: 'truck' },
  DELIVERED: { bg: colors.cambodia, fg: colors.oatMilk, icon: 'heart' },
  REJECTED: { bg: colors.dangerSoft, fg: colors.danger, icon: 'close' },
  CANCELLED: { bg: '#ECE8DC', fg: colors.textMuted, icon: 'close' },
};

export function StatusChip({ status, small }: { status: OrderStatus; small?: boolean }) {
  const s = STATUS_STYLE[status];
  return (
    <View style={[styles.chip, { backgroundColor: s.bg }, small && { paddingVertical: 3, paddingHorizontal: 8 }]}>
      <Icon name={s.icon} size={small ? 12 : 14} color={s.fg} strokeWidth={2} />
      <T v="caption" color={s.fg} style={{ fontFamily: fonts.bold, fontSize: small ? 11 : 12 }}>
        {ORDER_STATUS_LABELS[status]}
      </T>
    </View>
  );
}

/** Мини-шкала прогресса заказа (точки по ORDER_FLOW). */
export function FlowDots({ status }: { status: OrderStatus }) {
  const idx = ORDER_FLOW.indexOf(status);
  if (idx < 0) return null;
  return (
    <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
      {ORDER_FLOW.map((s, i) => (
        <View
          key={s}
          style={{
            flex: 1,
            height: 4,
            borderRadius: 2,
            backgroundColor: i <= idx ? colors.mango : 'rgba(38,66,43,0.1)',
          }}
        />
      ))}
    </View>
  );
}

export function OrderCard({
  order,
  showPartner,
  footer,
}: {
  order: Order;
  showPartner?: boolean;
  footer?: React.ReactNode;
}) {
  const count = order.items.length;
  return (
    <Card onPress={() => router.push(`/order/${order.id}`)} style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.md }}>
        <View style={{ flex: 1, gap: 2 }}>
          <T v="h3">Заказ №{order.number}</T>
          <T v="small" color={colors.textMuted}>
            {showPartner ? `${order.partner?.name} · ` : ''}на {dayLabel(order.deliveryDate).toLowerCase()}
          </T>
        </View>
        <StatusChip status={order.status} small />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row' }}>
          {order.items.slice(0, 4).map((i, k) => (
            <ProductImage
              key={i.id}
              photoUrl={i.photoUrl}
              category={i.category}
              seed={i.productId}
              iconSize={20}
              rounded={14}
              style={[styles.thumb, { marginLeft: k ? -10 : 0, zIndex: 10 - k }]}
            />
          ))}
          {count > 4 && (
            <View style={[styles.thumb, styles.more, { marginLeft: -10 }]}>
              <T v="caption" style={{ fontFamily: fonts.bold }}>
                +{count - 4}
              </T>
            </View>
          )}
        </View>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <T v="h3">{money(order.total)}</T>
          <T v="small" color={colors.textSoft}>
            {count} {plural(count, 'позиция', 'позиции', 'позиций')}
          </T>
        </View>
      </View>
      <FlowDots status={order.status} />
      {footer}
    </Card>
  );
}

export function OrderCardSkeleton() {
  return (
    <View style={[styles.skel]}>
      <View style={{ height: 18, width: '45%', borderRadius: 6, backgroundColor: 'rgba(38,66,43,0.07)' }} />
      <View style={{ height: 12, width: '30%', borderRadius: 6, backgroundColor: 'rgba(38,66,43,0.06)' }} />
      <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(38,66,43,0.06)' }} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  thumb: { width: 44, height: 44, borderWidth: 2, borderColor: colors.white },
  more: { borderRadius: 14, backgroundColor: colors.oatMilk, alignItems: 'center', justifyContent: 'center' },
  skel: { backgroundColor: colors.white, borderRadius: radius.xl, padding: space.lg, gap: 8 },
});
