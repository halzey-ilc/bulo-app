import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Address, Addresses, errorMessage } from '../src/api';
import { AddressPicker, BISHKEK, PickedAddress } from '../src/components/delivery/MapPicker';
import { Icon } from '../src/components/Icon';
import { BottomBar, Header, Screen } from '../src/components/layout';
import { FadeIn, SwipeToDelete } from '../src/components/motion';
import { Button, EmptyState, ErrorState, hapticSuccess, Skeleton, T, Touchable } from '../src/components/ui';
import { invalidate } from '../src/lib/cache';
import { Q, useQuery } from '../src/lib/queries';
import { useLoad } from '../src/lib/useLoad';
import { confirmDialog, toast } from '../src/store/ui';
import { colors, fonts, radius, shadows, space } from '../src/theme';

/** Сохранённые адреса: сверху те, куда возили последними. Нажать — поправить, смахнуть — удалить. */
export default function AddressesScreen() {
  const { data, error, loading, refresh, refreshing, reload } = useLoad(() => Addresses.list(), []);
  const info = useQuery(Q.info());
  const bakery = info.data?.bakeryLat != null && info.data?.bakeryLng != null ? { lat: info.data.bakeryLat, lng: info.data.bakeryLng } : BISHKEK;

  /** null — закрыт, 'new' — новый адрес, иначе правим этот */
  const [editing, setEditing] = useState<Address | 'new' | null>(null);

  const done = () => {
    invalidate('addr:');
    reload();
  };

  const save = async (p: PickedAddress) => {
    try {
      const dto = { address: p.address, entrance: p.entrance || null, lat: p.lat, lng: p.lng };
      if (editing && editing !== 'new') await Addresses.update(editing.id, { ...dto, label: editing.label ?? undefined });
      else if (!p.id) await Addresses.create(dto);
      hapticSuccess();
      toast.success(editing && editing !== 'new' ? 'Адрес сохранён' : 'Адрес добавлен');
      setEditing(null);
      done();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const remove = (a: Address) =>
    confirmDialog({
      title: 'Удалить адрес?',
      message: a.address,
      confirmText: 'Удалить',
      destructive: true,
      onConfirm: async () => {
        await Addresses.remove(a.id);
        done();
      },
    });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Адреса доставки" />
      <Screen refreshing={refreshing} onRefresh={refresh} contentStyle={{ paddingBottom: 140, gap: space.sm }}>
        {loading ? (
          <Skeleton style={{ height: 120, borderRadius: radius.xl }} />
        ) : error ? (
          <ErrorState message={error} onRetry={refresh} />
        ) : !data?.length ? (
          <EmptyState icon="pin" tint={colors.iceCube} title="Адресов пока нет" text="Добавьте адрес — и курьер привезёт выпечку прямо к дверям." />
        ) : (
          data.map((a, i) => {
            const pinned = a.lat != null && a.lng != null;
            return (
              <FadeIn key={a.id} delay={i * 40}>
                <SwipeToDelete onDelete={() => remove(a)}>
                  <Touchable onPress={() => setEditing(a)} haptic scaleTo={0.98} style={styles.card}>
                    <View style={[styles.icon, { backgroundColor: i === 0 && a.lastUsedAt ? colors.primarySoft : colors.oatMilk }]}>
                      <Icon name={a.lastUsedAt ? 'clock' : 'pin'} size={20} color={i === 0 && a.lastUsedAt ? colors.mango : colors.textMuted} />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      {!!a.label && (
                        <T v="caption" color={colors.mango} style={{ fontFamily: fonts.bold }}>
                          {a.label.toUpperCase()}
                        </T>
                      )}
                      <T v="bodyStrong">{a.address}</T>
                      {!!a.entrance && (
                        <T v="small" color={colors.textMuted}>
                          {a.entrance}
                        </T>
                      )}
                      {!pinned && (
                        <T v="small" color={colors.coffee} style={{ fontFamily: fonts.semibold }}>
                          Точка на карте не указана — нажмите, чтобы поставить
                        </T>
                      )}
                    </View>
                    <Icon name="chevronRight" size={18} color={colors.textSoft} />
                  </Touchable>
                </SwipeToDelete>
              </FadeIn>
            );
          })
        )}
        {!!data?.length && (
          <T v="small" color={colors.textSoft} center style={{ marginTop: space.sm }}>
            Смахните адрес влево, чтобы удалить
          </T>
        )}
      </Screen>
      <BottomBar>
        <Button title="Добавить адрес" icon="plus" onPress={() => setEditing('new')} />
      </BottomBar>

      <AddressPicker
        visible={!!editing}
        initial={editing && editing !== 'new' ? editing : null}
        recents={editing === 'new' ? [] : undefined}
        near={bakery}
        title={editing === 'new' ? 'Новый адрес' : 'Изменить адрес'}
        confirmText="Сохранить"
        onClose={() => setEditing(null)}
        onDone={save}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.white, borderRadius: radius.xl, padding: space.lg, ...shadows.soft },
  icon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
