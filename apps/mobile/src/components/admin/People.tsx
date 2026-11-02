import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, SectionList, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { errorMessage } from '../../api';
import { Admin, AdminPartner, AdminUser } from '../../api/admin';
import { dateLong, formatPhone, plural } from '../../lib/format';
import { useLoad } from '../../lib/useLoad';
import { usePersona } from '../../store/auth';
import { toast } from '../../store/ui';
import { PartnerStatus, Role } from '../../shared';
import { colors, fonts, radius, shadows, space } from '../../theme';
import { callPhone } from '../contacts';
import { TAB_BAR_SPACE } from '../layout';
import { Button, Chip, EmptyState, ErrorState, T, Touchable } from '../ui';
import { AIcon } from './icons';
import { ago, Avatar, ListSkeleton, Pill, SearchBar, Segmented, TabHeader } from './kit';
import { AddPartnerSheet, ApproveSheet } from './PartnerSheets';
import { CLIENT_ORDER, PARTNER_STATUS_STYLE, ROLE_META, STAFF_ORDER } from './roles';
import { PARTNER_REJECT_PRESETS, ReasonSheet } from './Sheets';
import { UserCreateSheet } from './UserSheet';

type Seg = 'apps' | 'partners' | 'staff' | 'clients';

/** Люди: заявки партнёров, партнёры, сотрудники и клиенты (последние два — только админу). */
export function PeopleView() {
  const insets = useSafeAreaInsets();
  const persona = usePersona();
  const isAdmin = persona === 'admin';
  const params = useLocalSearchParams<{ seg?: string; create?: string }>();
  const [seg, setSeg] = useState<Seg>('apps');
  const [creating, setCreating] = useState<null | 'partner' | 'staff' | 'clients'>(null);

  useEffect(() => {
    const s = params.seg as Seg | undefined;
    if (s && (s === 'apps' || s === 'partners' || isAdmin)) setSeg(s);
    if (params.create === '1') {
      const target = (s ?? seg) as Seg;
      setCreating(target === 'partners' || target === 'apps' ? 'partner' : isAdmin ? (target === 'clients' ? 'clients' : 'staff') : 'partner');
    }
    if (params.seg || params.create) router.setParams({ seg: undefined, create: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.seg, params.create]);

  const [query, setQuery] = useState('');
  const [pStatus, setPStatus] = useState<PartnerStatus | 'ALL'>('ALL');

  const apps = useLoad(() => Admin.partners({ status: 'PENDING' }), []);
  const partners = useLoad(() => Admin.partners({ search: query || undefined, status: pStatus === 'ALL' ? undefined : pStatus }), [query, pStatus], { enabled: seg === 'partners' });
  const users = useLoad(() => Admin.users({ search: query || undefined }), [query], { enabled: isAdmin && (seg === 'staff' || seg === 'clients') });

  const [approving, setApproving] = useState<AdminPartner | null>(null);
  const [rejecting, setRejecting] = useState<AdminPartner | null>(null);

  const segments = [
    { key: 'apps' as Seg, label: 'Заявки', count: apps.data?.length },
    { key: 'partners' as Seg, label: 'Партнёры' },
    ...(isAdmin ? [{ key: 'staff' as Seg, label: 'Сотрудники' }, { key: 'clients' as Seg, label: 'Клиенты' }] : []),
  ];

  const sections = useMemo(() => {
    if (seg === 'apps') return apps.data?.length ? [{ key: 'apps', title: '', data: apps.data.map((p) => ({ kind: 'app' as const, p })) }] : [];
    if (seg === 'partners') return partners.data?.length ? [{ key: 'p', title: '', data: partners.data.map((p) => ({ kind: 'partner' as const, p })) }] : [];
    const order: Role[] = seg === 'staff' ? STAFF_ORDER : CLIENT_ORDER;
    return order
      .map((r) => ({ key: r, title: r, data: (users.data ?? []).filter((u) => u.role === r).map((u) => ({ kind: 'user' as const, u })) }))
      .filter((s) => s.data.length);
  }, [seg, apps.data, partners.data, users.data]);

  const cur = seg === 'apps' ? apps : seg === 'partners' ? partners : users;

  const onRejected = useCallback(
    async (p: AdminPartner, reason: string) => {
      await Admin.rejectPartner(p.id, reason);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      apps.setData((cur) => cur?.filter((x) => x.id !== p.id));
      toast.info(`Заявка «${p.name}» отклонена`);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const header = (
    <View style={{ gap: space.md, paddingBottom: space.sm }}>
      <TabHeader
        title="Люди"
        subtitle={isAdmin ? 'Партнёры, сотрудники и доступы' : 'Заявки и партнёры'}
        right={
          seg !== 'apps' && (seg === 'partners' || isAdmin) ? (
            <Touchable haptic onPress={() => setCreating(seg === 'partners' ? 'partner' : seg === 'clients' ? 'clients' : 'staff')} style={st.add}>
              <AIcon name="plus" size={18} color={colors.white} strokeWidth={2.4} />
              <T v="small" color={colors.white} style={{ fontFamily: fonts.extrabold }}>
                Добавить
              </T>
            </Touchable>
          ) : undefined
        }
      />
      <Segmented scroll={segments.length > 3} items={segments} value={seg} onChange={(s) => { setSeg(s); setQuery(''); }} />
      {seg !== 'apps' && <SearchBar key={seg} placeholder={seg === 'partners' ? 'Название, ИНН или телефон' : 'Имя, телефон или логин'} onDebounced={setQuery} />}
      {seg === 'partners' && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.lg }} contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.sm }}>
          {(['ALL', 'APPROVED', 'BLOCKED', 'REJECTED'] as const).map((s) => (
            <Chip key={s} label={s === 'ALL' ? 'Все' : PARTNER_STATUS_STYLE[s].label} active={pStatus === s} onPress={() => setPStatus(s)} />
          ))}
        </ScrollView>
      )}
      {seg === 'staff' && users.data && <RoleSummary users={users.data.filter((u) => STAFF_ORDER.includes(u.role))} />}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SectionList
        sections={cur.loading ? [] : (sections as any)}
        keyExtractor={(it: any) => (it.kind === 'user' ? it.u.id : it.p.id)}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingTop: insets.top + space.md, paddingBottom: TAB_BAR_SPACE + insets.bottom }}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={cur.refreshing}
            onRefresh={() => {
              cur.refresh();
              if (seg !== 'apps') apps.reload();
            }}
            tintColor={colors.mango}
            colors={[colors.mango]}
          />
        }
        ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
        renderSectionHeader={({ section }: any) =>
          section.title ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingTop: space.lg, paddingBottom: space.sm }}>
              <Pill label={ROLE_META[section.title as Role].label.toUpperCase()} bg={ROLE_META[section.title as Role].bg} fg={ROLE_META[section.title as Role].fg} icon={ROLE_META[section.title as Role].icon} />
              <T v="small" color={colors.textSoft}>
                {section.data.length}
              </T>
            </View>
          ) : (
            <View style={{ height: space.sm }} />
          )
        }
        renderItem={({ item }: any) =>
          item.kind === 'app' ? (
            <ApplicationCard p={item.p} onApprove={setApproving} onReject={setRejecting} />
          ) : item.kind === 'partner' ? (
            <PartnerRow p={item.p} />
          ) : (
            <UserRow u={item.u} />
          )
        }
        ListEmptyComponent={
          cur.loading ? (
            <ListSkeleton rows={4} height={seg === 'apps' ? 170 : 72} />
          ) : cur.error ? (
            <ErrorState message={cur.error} onRetry={cur.refresh} />
          ) : seg === 'apps' ? (
            <EmptyState icon="check" tint={colors.greenSoft} title="Новых заявок нет" text="Когда кофейня оставит заявку в приложении, она появится здесь — с уведомлением." />
          ) : (
            <EmptyState icon="search" title="Никого не нашли" text={query ? `По запросу «${query}» пусто.` : 'Добавьте первого — кнопка вверху справа.'} />
          )
        }
      />

      <ApproveSheet
        partner={approving}
        onClose={() => setApproving(null)}
        onDone={(p) => {
          apps.setData((cur) => cur?.filter((x) => x.id !== p.id));
          partners.reload();
        }}
      />
      <ReasonSheet
        visible={!!rejecting}
        onClose={() => setRejecting(null)}
        title={`Отклонить «${rejecting?.name ?? ''}»?`}
        message="Заявитель увидит причину в приложении"
        presets={PARTNER_REJECT_PRESETS}
        confirmText="Отклонить заявку"
        onSubmit={(r) => onRejected(rejecting!, r)}
      />
      <AddPartnerSheet
        visible={creating === 'partner'}
        onClose={() => setCreating(null)}
        onCreated={() => {
          setSeg('partners');
          partners.reload();
        }}
      />
      {isAdmin && (
        <UserCreateSheet
          visible={creating === 'staff' || creating === 'clients'}
          kind={creating === 'clients' ? 'clients' : 'staff'}
          onClose={() => setCreating(null)}
          onCreated={(u) => {
            setSeg(ROLE_META[u.role].staff ? 'staff' : 'clients');
            users.setData((cur) => (cur ? [u, ...cur.filter((x) => x.id !== u.id)] : cur));
            users.reload();
          }}
        />
      )}
    </View>
  );
}

function RoleSummary({ users }: { users: AdminUser[] }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.lg }} contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.sm }}>
      {STAFF_ORDER.map((r) => {
        const m = ROLE_META[r];
        const n = users.filter((u) => u.role === r).length;
        return (
          <View key={r} style={[st.roleTile, { backgroundColor: m.bg }]}>
            <AIcon name={m.icon} size={18} color={m.fg} />
            <T style={{ fontFamily: fonts.extrabold, fontSize: 20 }} color={m.fg}>
              {n}
            </T>
            <T v="caption" color={m.fg} style={{ fontFamily: fonts.bold }}>
              {m.label}
            </T>
          </View>
        );
      })}
    </ScrollView>
  );
}

const ApplicationCard = memo(function ApplicationCard({ p, onApprove, onReject }: { p: AdminPartner; onApprove: (p: AdminPartner) => void; onReject: (p: AdminPartner) => void }) {
  return (
    <Touchable onPress={() => router.push(`/admin/partner/${p.id}`)} scaleTo={0.985} style={st.card}>
      <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
        <Avatar name={p.name} bg={colors.iceCube} fg={colors.blueberry} />
        <View style={{ flex: 1 }}>
          <T v="h3" numberOfLines={1}>
            {p.name}
          </T>
          <T v="small" color={colors.textMuted}>
            {p.contactName} · {ago(p.createdAt)}
          </T>
        </View>
        <Touchable haptic onPress={() => callPhone(p.phone)} style={st.call} accessibilityLabel="Позвонить">
          <AIcon name="phone" size={18} color={colors.cambodia} />
        </Touchable>
      </View>
      <View style={st.facts}>
        <Fact icon="phone" text={formatPhone(p.phone)} />
        {!!p.inn && <Fact icon="doc" text={`ИНН ${p.inn}`} />}
        {p.addresses[0] && <Fact icon="pin" text={p.addresses[0].address} />}
        {!!p.email && <Fact icon="at" text={p.email} />}
      </View>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Button small kind="ghost" title="Отклонить" onPress={() => onReject(p)} style={{ flex: 1 }} />
        <Button small title="Одобрить" icon="check" onPress={() => onApprove(p)} style={{ flex: 1.4 }} />
      </View>
    </Touchable>
  );
});

function Fact({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <AIcon name={icon} size={15} color={colors.textSoft} />
      <T v="small" color={colors.textMuted} style={{ flex: 1 }} numberOfLines={1}>
        {text}
      </T>
    </View>
  );
}

const PartnerRow = memo(function PartnerRow({ p }: { p: AdminPartner }) {
  const s = PARTNER_STATUS_STYLE[p.status];
  return (
    <Touchable onPress={() => router.push(`/admin/partner/${p.id}`)} scaleTo={0.985} style={[st.card, st.rowCard]}>
      <Avatar name={p.name} bg={s.bg} fg={s.fg} />
      <View style={{ flex: 1, gap: 2 }}>
        <T v="bodyStrong" numberOfLines={1}>
          {p.name}
        </T>
        <T v="small" color={colors.textMuted} numberOfLines={1}>
          {p.priceType?.name ?? 'Цены по умолчанию'} · {p._count?.orders ?? 0} {plural(p._count?.orders ?? 0, 'заказ', 'заказа', 'заказов')}
        </T>
      </View>
      {p.status !== 'APPROVED' ? <Pill label={s.label} bg={s.bg} fg={s.fg} icon={s.icon} /> : p.oneCId ? <AIcon name="sync" size={16} color={colors.success} /> : null}
      <AIcon name="chevronRight" size={18} color={colors.textSoft} />
    </Touchable>
  );
});

const UserRow = memo(function UserRow({ u }: { u: AdminUser }) {
  const m = ROLE_META[u.role];
  const expired = u.accessExpiresAt && new Date(u.accessExpiresAt) < new Date();
  const blocked = u.status === 'BLOCKED';
  return (
    <Touchable onPress={() => router.push(`/admin/user/${u.id}`)} scaleTo={0.985} style={[st.card, st.rowCard, (blocked || expired) && { opacity: 0.65 }]}>
      <Avatar name={u.name} bg={m.bg} fg={m.fg} />
      <View style={{ flex: 1, gap: 2 }}>
        <T v="bodyStrong" numberOfLines={1}>
          {u.name}
        </T>
        <T v="small" color={colors.textMuted} numberOfLines={1}>
          {[u.login && `@${u.login}`, u.phone && formatPhone(u.phone), u.partner?.name].filter(Boolean).join(' · ') || 'Нет способа входа'}
        </T>
        {!!u.accessExpiresAt && !expired && (
          <T v="caption" color="#8A5A00">
            до {dateLong(u.accessExpiresAt.slice(0, 10))}
          </T>
        )}
      </View>
      {blocked ? <Pill label="БЛОК" bg={colors.dangerSoft} fg={colors.danger} icon="lock" /> : expired ? <Pill label="ИСТЁК" bg="#ECE8DC" fg={colors.textMuted} icon="clock" /> : u.role === 'GUEST' && u.canOrder ? <Pill label="ЗАКАЗЫ" bg="#DDEFD9" fg={colors.success} /> : null}
      <AIcon name="chevronRight" size={18} color={colors.textSoft} />
    </Touchable>
  );
});


const st = StyleSheet.create({
  card: { backgroundColor: colors.white, borderRadius: radius.xl, padding: space.lg, gap: space.md, ...shadows.soft },
  rowCard: { flexDirection: 'row', alignItems: 'center', padding: space.md },
  call: { width: 40, height: 40, borderRadius: 14, backgroundColor: colors.oatMilk, alignItems: 'center', justifyContent: 'center' },
  facts: { gap: 6, backgroundColor: colors.surfaceWarm, borderRadius: radius.md, padding: space.md },
  add: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.mango, paddingHorizontal: 14, height: 40, borderRadius: 20, ...shadows.soft },
  roleTile: { width: 92, borderRadius: radius.lg, padding: space.md, gap: 2 },
});
