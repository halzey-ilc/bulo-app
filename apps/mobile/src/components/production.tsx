import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { ProductionGroup } from '../api';
import { colors, fonts, radius, space, tileFor } from '../theme';
import { categoryIcon, Icon } from './Icon';
import { T } from './ui';

/** «Что испечь»: участок цеха → товары с крупными цифрами. */
export function ProductionGroups({ groups }: { groups: ProductionGroup[] }) {
  return (
    <View style={{ gap: space.md }}>
      {groups.map((g) => {
        const tile = tileFor(g.items[0]?.category ?? g.area);
        return (
          <View key={g.area} style={styles.group}>
            <View style={[styles.groupHead, { backgroundColor: tile.bg }]}>
              <Icon name={categoryIcon(g.items[0]?.category ?? g.area)} size={22} color={tile.fg} />
              <T v="h3" style={{ flex: 1 }}>
                {g.area}
              </T>
              <T v="small" color={colors.textMuted} style={{ fontFamily: fonts.bold }}>
                {g.items.length} поз.
              </T>
            </View>
            {g.items.map((i, k) => (
              <View key={i.productId} style={[styles.item, k > 0 && styles.itemBorder]}>
                <View style={{ flex: 1 }}>
                  <T v="bodyStrong" style={{ fontSize: 16 }}>
                    {i.name}
                  </T>
                  <T v="small" color={colors.textSoft}>
                    {i.category}
                  </T>
                </View>
                <View style={styles.qty}>
                  <T style={styles.qtyNum}>{String(i.qty).replace('.', ',')}</T>
                  <T v="small" color={colors.textMuted} style={{ fontFamily: fonts.bold }}>
                    {i.unit}
                  </T>
                </View>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { backgroundColor: colors.white, borderRadius: radius.xl, overflow: 'hidden' },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.md },
  item: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.md },
  itemBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  qty: { flexDirection: 'row', alignItems: 'baseline', gap: 4, minWidth: 70, justifyContent: 'flex-end' },
  qtyNum: { fontFamily: fonts.extrabold, fontSize: 30, lineHeight: 36, color: colors.mango, letterSpacing: -0.5 },
});
