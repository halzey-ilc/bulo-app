import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Address, Addresses, errorMessage } from '../src/api';
import { Icon } from '../src/components/Icon';
import { BottomBar, Header, Screen } from '../src/components/layout';
import { Button, Card, EmptyState, ErrorState, Skeleton, T, Touchable } from '../src/components/ui';
import { useLoad } from '../src/lib/useLoad';
import { confirmDialog, toast } from '../src/store/ui';
import { colors, fonts, radius, space } from '../src/theme';

export default function AddressesScreen() {
  const { data, error, loading, refresh, refreshing, reload } = useLoad(() => Addresses.list(), []);

  const add = () =>
    confirmDialog({
      title: 'Новый адрес',
      message: 'Улица, дом и ориентир для курьера.',
      input: { placeholder: 'г. Бишкек, ул. Киевская, 95', required: true },
      confirmText: 'Добавить',
      onConfirm: async (address) => {
        await Addresses.create({ address, isDefault: !data?.length });
        toast.success('Адрес добавлен');
        reload();
      },
    });

  const edit = (a: Address) =>
    confirmDialog({
      title: 'Изменить адрес',
      input: { placeholder: 'Адрес', required: true, initial: a.address },
      confirmText: 'Сохранить',
      onConfirm: async (address) => {
        await Addresses.update(a.id, { address, label: a.label ?? undefined });
        reload();
      },
    });

  const label = (a: Address) =>
    confirmDialog({
      title: 'Подпись адреса',
      message: 'Например: «Кофейня на Киевской», «Склад».',
      input: { placeholder: 'Подпись', initial: a.label ?? '' },
      confirmText: 'Сохранить',
      onConfirm: async (l) => {
        await Addresses.update(a.id, { address: a.address, label: l || undefined });
        reload();
      },
    });

  const makeDefault = async (a: Address) => {
    try {
      await Addresses.update(a.id, { address: a.address, label: a.label ?? undefined, isDefault: true });
      toast.success('Основной адрес обновлён');
      reload();
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
        reload();
      },
    });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Адреса доставки" />
      <Screen refreshing={refreshing} onRefresh={refresh} contentStyle={{ paddingBottom: 140 }}>
        {loading ? (
          <Skeleton style={{ height: 120, borderRadius: radius.xl }} />
        ) : error ? (
          <ErrorState message={error} onRetry={refresh} />
        ) : !data?.length ? (
          <EmptyState icon="pin" tint={colors.iceCube} title="Адресов пока нет" text="Добавьте адрес — и курьер привезёт выпечку прямо к дверям." />
        ) : (
          data.map((a) => (
            <Card key={a.id} style={{ gap: space.md, borderWidth: a.isDefault ? 1.5 : 0, borderColor: colors.mango }}>
              <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}>
                <View style={[styles.icon, { backgroundColor: a.isDefault ? colors.primarySoft : colors.oatMilk }]}>
                  <Icon name="pin" size={20} color={a.isDefault ? colors.mango : colors.textMuted} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  {(a.label || a.isDefault) && (
                    <T v="caption" color={colors.mango} style={{ fontFamily: fonts.bold }}>
                      {[a.label, a.isDefault ? 'ОСНОВНОЙ' : null].filter(Boolean).join(' · ').toUpperCase()}
                    </T>
                  )}
                  <T v="bodyStrong">{a.address}</T>
                </View>
              </View>
              <View style={styles.actions}>
                {!a.isDefault && <Action icon="star" label="Основной" onPress={() => makeDefault(a)} />}
                <Action icon="edit" label="Изменить" onPress={() => edit(a)} />
                <Action icon="sparkle" label="Подпись" onPress={() => label(a)} />
                <Action icon="trash" label="Удалить" danger onPress={() => remove(a)} />
              </View>
            </Card>
          ))
        )}
      </Screen>
      <BottomBar>
        <Button title="Добавить адрес" icon="plus" onPress={add} />
      </BottomBar>
    </View>
  );
}

function Action({ icon, label, onPress, danger }: { icon: 'star' | 'edit' | 'trash' | 'sparkle'; label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Touchable onPress={onPress} style={[styles.action, danger && { backgroundColor: colors.dangerSoft }]} haptic>
      <Icon name={icon} size={15} color={danger ? colors.danger : colors.text} />
      <T v="caption" color={danger ? colors.danger : colors.text} style={{ fontFamily: fonts.bold, letterSpacing: 0 }}>
        {label}
      </T>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  icon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.oatMilk,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radius.pill,
  },
});
