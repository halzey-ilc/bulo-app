import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Address, Addresses, errorMessage } from '../src/api';
import { Sheet } from '../src/components/admin/kit';
import { BISHKEK, MapPicker } from '../src/components/delivery/MapPicker';
import { Icon, IconName } from '../src/components/Icon';
import { BottomBar, Header, Screen } from '../src/components/layout';
import { Button, Card, EmptyState, ErrorState, Field, hapticSuccess, Skeleton, T, Touchable } from '../src/components/ui';
import { invalidate } from '../src/lib/cache';
import { Q, useQuery } from '../src/lib/queries';
import { useLoad } from '../src/lib/useLoad';
import { confirmDialog, toast } from '../src/store/ui';
import { colors, fonts, radius, space } from '../src/theme';

type Draft = {
  id?: string;
  address: string;
  entrance: string;
  label: string;
  isDefault: boolean;
  lat: number | null;
  lng: number | null;
  /** Адрес до правки и «точку поставили сейчас» — чтобы не оставить старую точку у нового адреса. */
  origAddress?: string;
  picked?: boolean;
};

const emptyDraft = (isDefault: boolean): Draft => ({ address: '', entrance: '', label: '', isDefault, lat: null, lng: null });

export default function AddressesScreen() {
  const { data, error, loading, refresh, refreshing, reload } = useLoad(() => Addresses.list(), []);
  const info = useQuery(Q.info());
  const bakery = info.data?.bakeryLat != null && info.data?.bakeryLng != null ? { lat: info.data.bakeryLat, lng: info.data.bakeryLng } : BISHKEK;

  const [draft, setDraft] = useState<Draft | null>(null);
  const [picking, setPicking] = useState(false);
  /** Точку ставим прямо из карточки адреса — без формы. */
  const [pinFor, setPinFor] = useState<Address | null>(null);
  const [saving, setSaving] = useState(false);

  const done = () => {
    invalidate('addr:');
    reload();
  };

  const add = () => setDraft(emptyDraft(!data?.length));
  const edit = (a: Address) =>
    setDraft({ id: a.id, address: a.address, entrance: a.entrance ?? '', label: a.label ?? '', isDefault: a.isDefault, lat: a.lat ?? null, lng: a.lng ?? null, origAddress: a.address });

  const save = async () => {
    if (!draft) return;
    const address = draft.address.trim();
    if (!address) {
      toast.error('Укажите адрес');
      return;
    }
    setSaving(true);
    const dto = {
      address,
      label: draft.label.trim() || undefined,
      entrance: draft.entrance.trim() || undefined,
      isDefault: draft.isDefault || undefined,
      // адрес поменяли, а точку не двигали — пусть сервер найдёт новую по адресу
      ...(draft.lat != null && draft.lng != null && (draft.picked || !draft.id || address === draft.origAddress) ? { lat: draft.lat, lng: draft.lng } : {}),
    };
    try {
      const saved = draft.id ? await Addresses.update(draft.id, dto) : await Addresses.create(dto);
      hapticSuccess();
      toast.success(draft.id ? 'Адрес сохранён' : saved?.lat == null ? 'Адрес добавлен. Укажите точку на карте — курьеру будет проще' : 'Адрес добавлен');
      setDraft(null);
      done();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const savePin = async (a: Address, p: { lat: number; lng: number }) => {
    try {
      await Addresses.update(a.id, { address: a.address, label: a.label ?? undefined, entrance: a.entrance ?? undefined, lat: p.lat, lng: p.lng });
      hapticSuccess();
      toast.success('Точка на карте сохранена');
      done();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const makeDefault = async (a: Address) => {
    try {
      await Addresses.update(a.id, { address: a.address, label: a.label ?? undefined, isDefault: true });
      toast.success('Основной адрес обновлён');
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

  const pickerInitial = pinFor ? (pinFor.lat != null && pinFor.lng != null ? { lat: pinFor.lat, lng: pinFor.lng } : bakery) : draft?.lat != null && draft?.lng != null ? { lat: draft.lat, lng: draft.lng } : bakery;

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
          data.map((a) => {
            const pinned = a.lat != null && a.lng != null;
            return (
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
                    {!!a.entrance && (
                      <T v="small" color={colors.textMuted}>
                        {a.entrance}
                      </T>
                    )}
                    <View style={[styles.pinState, { backgroundColor: pinned ? colors.greenSoft : colors.softYellow }]}>
                      <Icon name={pinned ? 'check' : 'info'} size={12} color={pinned ? colors.success : colors.cambodia} strokeWidth={2.6} />
                      <T v="caption" color={pinned ? colors.success : colors.cambodia} style={{ fontFamily: fonts.bold, letterSpacing: 0 }}>
                        {pinned ? 'Точка на карте указана' : 'Точка на карте не указана'}
                      </T>
                    </View>
                  </View>
                </View>
                <View style={styles.actions}>
                  <Action icon="navigation" label={pinned ? 'Точка на карте' : 'Указать на карте'} accent={!pinned} onPress={() => setPinFor(a)} />
                  {!a.isDefault && <Action icon="star" label="Основной" onPress={() => makeDefault(a)} />}
                  <Action icon="edit" label="Изменить" onPress={() => edit(a)} />
                  <Action icon="trash" label="Удалить" danger onPress={() => remove(a)} />
                </View>
              </Card>
            );
          })
        )}
      </Screen>
      <BottomBar>
        <Button title="Добавить адрес" icon="plus" onPress={add} />
      </BottomBar>

      <Sheet
        visible={!!draft && !picking}
        onClose={() => setDraft(null)}
        title={draft?.id ? 'Изменить адрес' : 'Новый адрес'}
        subtitle="Чем точнее — тем быстрее курьер вас найдёт"
        footer={<Button title={draft?.id ? 'Сохранить' : 'Добавить адрес'} loading={saving} onPress={save} />}
      >
        {draft && (
          <>
            <Field label="Адрес" placeholder="г. Бишкек, ул. Киевская, 95" value={draft.address} onChangeText={(v) => setDraft({ ...draft, address: v })} />
            <Field label="Подъезд, этаж, ориентир" placeholder="Вход со двора, 2 этаж, вывеска «Кофейня»" value={draft.entrance} onChangeText={(v) => setDraft({ ...draft, entrance: v })} />
            <Field label="Подпись (необязательно)" placeholder="Кофейня на Киевской" value={draft.label} onChangeText={(v) => setDraft({ ...draft, label: v })} />
            <Touchable haptic onPress={() => setPicking(true)} style={styles.mapRow} scaleTo={0.98}>
              <View style={[styles.icon, { backgroundColor: draft.lat != null ? colors.greenSoft : colors.iceCube }]}>
                <Icon name={draft.lat != null ? 'check' : 'navigation'} size={20} color={draft.lat != null ? colors.success : colors.blueberry} />
              </View>
              <View style={{ flex: 1 }}>
                <T v="bodyStrong">{draft.lat != null ? 'Точка на карте указана' : 'Указать на карте'}</T>
                <T v="small" color={colors.textMuted}>
                  {draft.lat != null ? 'Нажмите, чтобы поправить' : 'Иначе найдём по адресу автоматически'}
                </T>
              </View>
              <Icon name="chevronRight" size={18} color={colors.textSoft} />
            </Touchable>
          </>
        )}
      </Sheet>

      <MapPicker
        visible={picking || !!pinFor}
        initial={pickerInitial}
        address={pinFor?.address ?? draft?.address}
        onClose={() => {
          setPicking(false);
          setPinFor(null);
        }}
        onPick={(p) => {
          if (pinFor) {
            const a = pinFor;
            setPinFor(null);
            void savePin(a, p);
          } else {
            setDraft((d) => (d ? { ...d, lat: p.lat, lng: p.lng, picked: true } : d));
            setPicking(false);
          }
        }}
      />
    </View>
  );
}

function Action({ icon, label, onPress, danger, accent }: { icon: IconName; label: string; onPress: () => void; danger?: boolean; accent?: boolean }) {
  const fg = danger ? colors.danger : accent ? colors.white : colors.text;
  return (
    <Touchable onPress={onPress} style={[styles.action, danger && { backgroundColor: colors.dangerSoft }, accent && { backgroundColor: colors.mango }]} haptic>
      <Icon name={icon} size={15} color={fg} />
      <T v="caption" color={fg} style={{ fontFamily: fonts.bold, letterSpacing: 0 }}>
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
  pinState: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, marginTop: 4 },
  mapRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.white, borderRadius: radius.lg, padding: space.md },
});
