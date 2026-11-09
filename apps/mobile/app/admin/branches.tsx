import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { errorMessage } from '../../src/api';
import { Admin, AdminBranch } from '../../src/api/admin';
import { ActionItem, Group, Label, ListSkeleton, Note, Sheet, ToggleRow } from '../../src/components/admin/kit';
import { AddressPicker } from '../../src/components/delivery/MapPicker';
import { Icon } from '../../src/components/Icon';
import { BottomBar, Header, Screen } from '../../src/components/layout';
import { FadeIn } from '../../src/components/motion';
import { Button, Chip, ErrorState, Field, hapticSuccess, T, Touchable } from '../../src/components/ui';
import { invalidate } from '../../src/lib/cache';
import { useLoad } from '../../src/lib/useLoad';
import { toast } from '../../src/store/ui';
import { colors, fonts, radius, shadows, space } from '../../src/theme';

/** Филиалы кофейни: часы работы, адрес на карте, склад 1С, меню и цены. */
export default function BranchesAdmin() {
  const list = useLoad(() => Admin.branches(), []);
  const [edit, setEdit] = useState<AdminBranch | 'new' | null>(null);
  const [copyTo, setCopyTo] = useState<AdminBranch | null>(null);

  const saved = (b: AdminBranch) => {
    list.reload();
    invalidate('branches');
    invalidate('products:');
    invalidate('categories:');
    setEdit(null);
    toast.success(`Филиал «${b.name}» сохранён`);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Филиалы и меню" />
      <Screen refreshing={list.refreshing} onRefresh={list.refresh} contentStyle={{ paddingBottom: 140 }}>
        <Note text="У каждого филиала свои цены. Товар есть в меню филиала, если у него стоит цена этого филиала (в карточке товара)." />
        {list.loading ? (
          <ListSkeleton rows={2} height={140} />
        ) : list.error ? (
          <ErrorState message={list.error} onRetry={list.refresh} />
        ) : (
          (list.data ?? []).map((b, i) => (
            <FadeIn key={b.id} delay={i * 50}>
              <View style={[styles.card, !b.active && { opacity: 0.6 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                  <View style={styles.icon}>
                    <Icon name="coffee" size={24} color={colors.coffee} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <T v="h3">{b.name}</T>
                    <T v="small" color={colors.textMuted} numberOfLines={1}>
                      {b.address || 'Адрес не указан'} · {b.opensAt}–{b.closesAt}
                    </T>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: space.sm }}>
                  <View style={[styles.stat, { backgroundColor: b.menuSize ? colors.greenSoft : colors.softYellow }]}>
                    <T v="h2">{b.menuSize}</T>
                    <T v="caption" color={colors.textMuted}>
                      позиций в меню
                    </T>
                  </View>
                  <View style={[styles.stat, { backgroundColor: b.oneCWarehouseId ? colors.iceCube : colors.oatMilk }]}>
                    <T v="bodyStrong" numberOfLines={1}>
                      {b.oneCWarehouseId || '—'}
                    </T>
                    <T v="caption" color={colors.textMuted}>
                      склад в 1С
                    </T>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: space.sm }}>
                  <Button title="Изменить" small kind="secondary" icon="edit" onPress={() => setEdit(b)} style={{ flex: 1 }} />
                  <Button title="Цены из филиала" small kind="secondary" icon="copy" onPress={() => setCopyTo(b)} style={{ flex: 1.3 }} />
                </View>
              </View>
            </FadeIn>
          ))
        )}
        <ActionItem icon="tag" title="Цены по товарам" subtitle="Каталог → товар → цена каждого филиала" onPress={() => router.push('/admin/catalog')} />
      </Screen>
      <BottomBar>
        <Button title="Новый филиал" icon="plus" kind="secondary" onPress={() => setEdit('new')} />
      </BottomBar>
      <BranchEditor branch={edit} onClose={() => setEdit(null)} onSaved={saved} />
      <CopyPrices
        to={copyTo}
        branches={list.data ?? []}
        onClose={() => setCopyTo(null)}
        onDone={() => {
          list.reload();
          invalidate('branches');
          invalidate('products:');
          invalidate('categories:');
        }}
      />
    </View>
  );
}

function BranchEditor({ branch, onClose, onSaved }: { branch: AdminBranch | 'new' | null; onClose: () => void; onSaved: (b: AdminBranch) => void }) {
  const isNew = branch === 'new';
  const b = branch && branch !== 'new' ? branch : null;
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [phone, setPhone] = useState('');
  const [opensAt, setOpensAt] = useState('08:00');
  const [closesAt, setClosesAt] = useState('22:00');
  const [wh, setWh] = useState('');
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [map, setMap] = useState(false);

  useEffect(() => {
    if (!branch) return;
    setName(b?.name ?? '');
    setAddress(b?.address ?? '');
    setPoint(b?.lat != null && b?.lng != null ? { lat: b.lat, lng: b.lng } : null);
    setPhone(b?.phone ?? '');
    setOpensAt(b?.opensAt ?? '08:00');
    setClosesAt(b?.closesAt ?? '22:00');
    setWh(b?.oneCWarehouseId ?? '');
    setActive(b?.active ?? true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch]);

  const time = /^([01]\d|2[0-3]):[0-5]\d$/;
  const save = async () => {
    if (name.trim().length < 2) return toast.error('Название филиала');
    if (!time.test(opensAt) || !time.test(closesAt)) return toast.error('Часы работы в формате ЧЧ:ММ');
    setBusy(true);
    try {
      const dto = {
        name: name.trim(),
        address: address.trim() || undefined,
        phone: phone.trim() || undefined,
        opensAt,
        closesAt,
        oneCWarehouseId: wh.trim(),
        active,
        ...(point ? { lat: point.lat, lng: point.lng } : {}),
      };
      const saved = isNew ? await Admin.createBranch(dto) : await Admin.updateBranch(b!.id, dto);
      hapticSuccess();
      onSaved(saved);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Sheet
        visible={!!branch}
        onClose={onClose}
        title={isNew ? 'Новый филиал' : `Филиал «${b?.name}»`}
        footer={<Button title="Сохранить" icon="check" loading={busy} onPress={save} />}
      >
        <View style={{ gap: space.md }}>
          <Field label="Название" value={name} onChangeText={setName} placeholder="Кок-Жар" />
          <Touchable onPress={() => setMap(true)} style={styles.addr}>
            <Icon name="pin" size={20} color={colors.mango} />
            <View style={{ flex: 1 }}>
              <T v="bodyStrong">{address || 'Указать адрес на карте'}</T>
              <T v="small" color={colors.textMuted}>
                {point ? 'Точка на карте стоит' : 'Гости увидят, куда идти'}
              </T>
            </View>
            <Icon name="chevronRight" size={18} color={colors.textSoft} />
          </Touchable>
          <Field label="Телефон филиала" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+996 …" />
          <Label>Часы работы</Label>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Field label="Открытие" value={opensAt} onChangeText={setOpensAt} maxLength={5} style={{ flex: 1 }} />
            <Field label="Закрытие" value={closesAt} onChangeText={setClosesAt} maxLength={5} style={{ flex: 1 }} />
          </View>
          <Field label="Код склада в 1С" value={wh} onChangeText={setWh} autoCapitalize="none" hint="Отсюда списываются брони гостей и берутся остатки" />
          <ToggleRow title="Филиал работает" subtitle="Выключенный филиал гости не видят" value={active} onChange={setActive} icon="coffee" />
        </View>
      </Sheet>
      <AddressPicker
        visible={map}
        initial={point ? { address, lat: point.lat, lng: point.lng, entrance: '' } : undefined}
        title="Адрес филиала"
        confirmText="Сохранить точку"
        onClose={() => setMap(false)}
        onDone={(p) => {
          setAddress(p.address);
          setPoint({ lat: p.lat, lng: p.lng });
          setMap(false);
        }}
      />
    </>
  );
}

/** Меню одного филиала из другого: те же позиции, цены со скидкой или наценкой. */
function CopyPrices({ to, branches, onClose, onDone }: { to: AdminBranch | null; branches: AdminBranch[]; onClose: () => void; onDone: () => void }) {
  const sources = branches.filter((b) => b.id !== to?.id && b.menuSize > 0);
  const [from, setFrom] = useState<string | null>(null);
  const [percent, setPercent] = useState(-10);
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (to) setFrom(sources[0]?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to?.id]);
  const example = Math.round((250 * (1 + percent / 100)) / 10) * 10;

  const run = async () => {
    if (!to || !from) return;
    setBusy(true);
    try {
      const r = await Admin.copyBranchPrices(to.id, { fromBranchId: from, percent, overwrite, round10: true });
      hapticSuccess();
      toast.success(`Готово: ${r.copied} ${r.copied === 1 ? 'цена' : 'цен'} в «${to.name}»`);
      onDone();
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible={!!to}
      onClose={onClose}
      title={`Меню для «${to?.name ?? ''}»`}
      subtitle="Скопировать позиции и цены из другого филиала"
      footer={<Button title="Скопировать цены" icon="copy" loading={busy} disabled={!from} onPress={run} />}
    >
      <View style={{ gap: space.md }}>
        {!sources.length ? (
          <Note text="Нет филиала с меню, из которого можно скопировать." />
        ) : (
          <>
            <Label>Откуда</Label>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {sources.map((b) => (
                <Chip key={b.id} label={`${b.name} · ${b.menuSize}`} active={from === b.id} onPress={() => setFrom(b.id)} />
              ))}
            </View>
            <Label>Цены</Label>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {[-20, -15, -10, -5, 0, 5, 10].map((p) => (
                <Chip key={p} label={p === 0 ? 'Те же' : `${p > 0 ? '+' : ''}${p}%`} active={percent === p} onPress={() => setPercent(p)} />
              ))}
            </View>
            <Group>
              <T v="small" color={colors.textMuted}>
                Например, синнабон за 250 сом станет{' '}
                <T v="small" style={{ fontFamily: fonts.extrabold }}>
                  {example} сом
                </T>
                . Цены округляются до 10 сом — потом любую можно поправить в карточке товара.
              </T>
            </Group>
            <ToggleRow title="Перезаписать уже стоящие цены" subtitle="Иначе заполним только пустые" value={overwrite} onChange={setOverwrite} icon="refresh" />
          </>
        )}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.white, borderRadius: radius.xl, padding: space.lg, gap: space.md, ...shadows.soft },
  icon: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.coffeeSoft, alignItems: 'center', justifyContent: 'center' },
  stat: { flex: 1, borderRadius: radius.lg, padding: space.md, gap: 2 },
  addr: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
});
