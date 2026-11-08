import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { errorMessage } from '../../../src/api';
import { Admin, Counterparty, PartnerDetail } from '../../../src/api/admin';
import { AIcon } from '../../../src/components/admin/icons';
import { ActionItem, Avatar, Group, Label, Note, Pill, Sheet } from '../../../src/components/admin/kit';
import { ApproveSheet, CounterpartyPicker, PriceTypePicker } from '../../../src/components/admin/PartnerSheets';
import { PARTNER_STATUS_STYLE, ROLE_META } from '../../../src/components/admin/roles';
import { PARTNER_BLOCK_PRESETS, PARTNER_REJECT_PRESETS, ReasonSheet } from '../../../src/components/admin/Sheets';
import { callPhone, openMaps, openUrl } from '../../../src/components/contacts';
import { BottomBar, Header, Screen } from '../../../src/components/layout';
import { StatusChip } from '../../../src/components/order';
import { Button, Divider, ErrorState, Field, Skeleton, T, Touchable } from '../../../src/components/ui';
import { dateLong, dayLabel, formatPhone, formatPhoneLocal, money, phoneDigits, plural } from '../../../src/lib/format';
import { useLoad } from '../../../src/lib/useLoad';
import { usePersona } from '../../../src/store/auth';
import { confirmDialog, toast } from '../../../src/store/ui';
import { colors, fonts, radius, shadows, space } from '../../../src/theme';

export default function PartnerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const persona = usePersona();
  const canEdit = persona === 'admin' || persona === 'manager';
  const { data: p, error, loading, refresh, refreshing, reload, setData } = useLoad(() => Admin.partner(id), [id]);
  const [sheet, setSheet] = useState<null | 'approve' | 'reject' | 'block' | 'price' | 'onec' | 'edit'>(null);

  if (loading || !p) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title="Партнёр" />
        {error ? (
          <ErrorState message={error} onRetry={refresh} />
        ) : (
          <View style={{ padding: space.lg, gap: space.lg }}>
            <Skeleton style={{ height: 170, borderRadius: radius.xxl }} />
            <Skeleton style={{ height: 220, borderRadius: radius.xl }} />
          </View>
        )}
      </View>
    );
  }

  const s = PARTNER_STATUS_STYLE[p.status];
  const pending = p.status === 'PENDING';
  const patch = async (dto: Parameters<typeof Admin.updatePartner>[1], msg: string) => {
    try {
      await Admin.updatePartner(p.id, dto);
      toast.success(msg);
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
      throw e;
    }
  };
  const debt = p.orders.filter((o) => !o.paidAt && o.status !== 'REJECTED' && o.status !== 'CANCELLED').reduce((a, o) => a + o.total, 0);
  const totalAll = p.orders.filter((o) => o.status !== 'REJECTED' && o.status !== 'CANCELLED').reduce((a, o) => a + o.total, 0);
  const wa = p.phone.replace(/\D/g, '');

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={p.name} subtitle={s.label} />
      <Screen refreshing={refreshing} onRefresh={refresh} contentStyle={{ paddingBottom: pending && canEdit ? 160 : 48 }}>
        <View style={st.hero}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <Avatar name={p.name} size={60} bg={colors.mango} />
            <View style={{ flex: 1, gap: 4 }}>
              <T v="h2" color={colors.oatMilk} numberOfLines={2}>
                {p.name}
              </T>
              <Pill label={s.label.toUpperCase()} bg={s.bg} fg={s.fg} icon={s.icon} />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <HeroStat label="Заказов" value={String(p.orders.length)} />
            <HeroStat label="Сумма" value={money(totalAll) || '0'} />
            <HeroStat label="Не оплачено" value={money(debt) || '0'} warn={debt > 0} />
          </View>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <HeroBtn icon="phone" label="Позвонить" onPress={() => callPhone(p.phone)} />
            <HeroBtn icon="chat" label="WhatsApp" onPress={() => openUrl(`https://wa.me/${wa.startsWith('996') ? wa : `996${wa}`}`)} />
            {canEdit && <HeroBtn icon="edit" label="Изменить" onPress={() => setSheet('edit')} />}
          </View>
        </View>

        {p.status === 'REJECTED' || p.status === 'BLOCKED' ? (
          <Note icon="alert" tone="danger" text={`${p.status === 'BLOCKED' ? 'Заблокирован' : 'Заявка отклонена'}: ${p.rejectReason || 'причина не указана'}`} />
        ) : null}

        <Group style={{ paddingVertical: space.sm, gap: 0 }}>
          <InfoRow icon="user" label="Контакт" value={p.contactName} />
          <Divider />
          <InfoRow icon="phone" label="Телефон" value={formatPhone(p.phone)} onPress={() => callPhone(p.phone)} />
          {!!p.email && (
            <>
              <Divider />
              <InfoRow icon="at" label="Почта" value={p.email} onPress={() => openUrl(`mailto:${p.email}`)} />
            </>
          )}
          {!!p.inn && (
            <>
              <Divider />
              <InfoRow icon="doc" label="ИНН" value={p.inn} />
            </>
          )}
          <Divider />
          <InfoRow icon="tag" label="Тип цен" value={p.priceType?.name ?? 'По умолчанию'} onPress={canEdit ? () => setSheet('price') : undefined} />
          <Divider />
          <InfoRow
            icon="sync"
            label="Контрагент 1С"
            value={p.counterparty ? p.counterparty.name : p.oneCId ? `Код ${p.oneCId}` : 'Не связан'}
            muted={!p.oneCId}
            onPress={canEdit ? () => setSheet('onec') : undefined}
          />
          <Divider />
          <InfoRow icon="calendar" label={p.approvedAt ? 'Партнёр с' : 'Заявка от'} value={dateLong((p.approvedAt ?? p.createdAt).slice(0, 10))} />
        </Group>

        {p.addresses.length > 0 && (
          <View style={{ gap: space.sm }}>
            <Label>Адреса доставки</Label>
            {p.addresses.map((a) => (
              <ActionItem key={a.id} icon="pin" tone="ice" title={a.address} subtitle={[a.label, a.isDefault && 'основной'].filter(Boolean).join(' · ') || undefined} onPress={() => openMaps(a.address)} />
            ))}
          </View>
        )}

        {p.users.length > 0 && (
          <View style={{ gap: space.sm }}>
            <Label>Кто входит в приложение</Label>
            {p.users.map((u) => (
              <ActionItem
                key={u.id}
                icon={ROLE_META[u.role].icon}
                tone="white"
                title={u.name}
                subtitle={[ROLE_META[u.role].label, u.phone && formatPhone(u.phone), u.login && `@${u.login}`, u.status === 'BLOCKED' && 'заблокирован'].filter(Boolean).join(' · ')}
                onPress={persona === 'admin' ? () => router.push(`/admin/user/${u.id}`) : undefined}
                right={persona === 'admin' ? undefined : <View />}
              />
            ))}
          </View>
        )}

        <View style={{ gap: space.sm }}>
          <Label>Последние заказы</Label>
          {p.orders.length === 0 ? (
            <T color={colors.textMuted}>Заказов пока не было.</T>
          ) : (
            <Group style={{ paddingVertical: space.xs, gap: 0 }}>
              {p.orders.map((o, i) => (
                <View key={o.id}>
                  {i > 0 && <Divider />}
                  <Touchable onPress={() => router.push(`/order/${o.id}`)} style={st.orderRow}>
                    <View style={{ flex: 1, gap: 4 }}>
                      <T v="bodyStrong">
                        №{o.number} · {dayLabel(o.deliveryDate)}
                      </T>
                      <StatusChip status={o.status} small />
                    </View>
                    <T v="bodyStrong">{money(o.total)}</T>
                    <AIcon name="chevronRight" size={16} color={colors.textSoft} />
                  </Touchable>
                </View>
              ))}
            </Group>
          )}
        </View>

        {canEdit && !pending && (
          <View style={{ gap: space.sm }}>
            <Label>Доступ</Label>
            {p.status === 'APPROVED' ? (
              <ActionItem icon="lock" danger title="Заблокировать" subtitle="Все пользователи партнёра выйдут из приложения" onPress={() => setSheet('block')} />
            ) : (
              <ActionItem
                icon="unlock"
                tone="green"
                title={p.status === 'BLOCKED' ? 'Разблокировать' : 'Открыть доступ'}
                subtitle="Партнёр снова сможет заказывать"
                onPress={() =>
                  p.status === 'REJECTED'
                    ? setSheet('approve')
                    : confirmDialog({
                        title: `Разблокировать «${p.name}»?`,
                        confirmText: 'Разблокировать',
                        onConfirm: async () => {
                          await Admin.unblockPartner(p.id);
                          toast.success('Доступ восстановлен');
                          reload();
                        },
                      })
                }
              />
            )}
          </View>
        )}
      </Screen>

      {pending && canEdit && (
        <BottomBar>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button title="Отклонить" kind="ghost" onPress={() => setSheet('reject')} style={{ flex: 1 }} />
            <Button title="Одобрить" icon="check" onPress={() => setSheet('approve')} style={{ flex: 1.4 }} />
          </View>
        </BottomBar>
      )}

      <ApproveSheet partner={sheet === 'approve' ? p : null} onClose={() => setSheet(null)} onDone={() => reload()} />
      <ReasonSheet
        visible={sheet === 'reject'}
        onClose={() => setSheet(null)}
        title="Отклонить заявку?"
        message="Заявитель увидит причину"
        presets={PARTNER_REJECT_PRESETS}
        onSubmit={async (r) => {
          await Admin.rejectPartner(p.id, r);
          toast.info('Заявка отклонена');
          reload();
        }}
      />
      <ReasonSheet
        visible={sheet === 'block'}
        onClose={() => setSheet(null)}
        title={`Заблокировать «${p.name}»?`}
        message="Пользователи партнёра сразу потеряют доступ"
        presets={PARTNER_BLOCK_PRESETS}
        confirmText="Заблокировать"
        onSubmit={async (r) => {
          await Admin.blockPartner(p.id, r);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
          toast.info('Партнёр заблокирован');
          reload();
        }}
      />
      <PriceSheet visible={sheet === 'price'} current={p.priceTypeId} onClose={() => setSheet(null)} onSave={(id) => patch({ priceTypeId: id }, 'Тип цен изменён')} />
      <OneCSheet visible={sheet === 'onec'} partner={p} onClose={() => setSheet(null)} onSave={(c) => patch({ oneCId: c?.oneCId ?? null }, c ? 'Связали с 1С' : 'Связь с 1С убрана')} />
      <EditSheet
        visible={sheet === 'edit'}
        partner={p}
        onClose={() => setSheet(null)}
        onSave={async (dto) => {
          await patch(dto, 'Сохранено');
          setData((cur) => (cur ? { ...cur, ...dto, phone: dto.phone ?? cur.phone } : cur));
        }}
      />
    </View>
  );
}

function HeroStat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <View style={{ flex: 1, backgroundColor: 'rgba(249,245,230,0.08)', borderRadius: radius.md, padding: space.sm }}>
      <T v="bodyStrong" color={warn ? colors.lime : colors.oatMilk} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </T>
      <T v="caption" color="rgba(249,245,230,0.6)">
        {label}
      </T>
    </View>
  );
}

function HeroBtn({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <Touchable haptic onPress={onPress} style={st.heroBtn}>
      <AIcon name={icon} size={18} color={colors.cambodia} />
      <T v="small" color={colors.cambodia} style={{ fontFamily: fonts.extrabold }}>
        {label}
      </T>
    </Touchable>
  );
}

function InfoRow({ icon, label, value, onPress, muted }: { icon: string; label: string; value: string; onPress?: () => void; muted?: boolean }) {
  const body = (
    <>
      <AIcon name={icon} size={18} color={colors.textSoft} />
      <T v="small" color={colors.textMuted} style={{ width: 104 }}>
        {label}
      </T>
      <T v="bodyStrong" style={{ flex: 1, textAlign: 'right' }} color={muted ? colors.textSoft : colors.text} numberOfLines={2}>
        {value}
      </T>
      {onPress && <AIcon name="chevronRight" size={16} color={colors.textSoft} />}
    </>
  );
  return onPress ? (
    <Touchable onPress={onPress} style={st.info}>
      {body}
    </Touchable>
  ) : (
    <View style={st.info}>{body}</View>
  );
}

function PriceSheet({ visible, current, onClose, onSave }: { visible: boolean; current: string | null; onClose: () => void; onSave: (id: string) => Promise<void> }) {
  const [v, setV] = useState<string | null>(current);
  const [busy, setBusy] = useState(false);
  useEffect(() => setV(current), [current, visible]);
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Тип цен"
      subtitle="Новые заказы будут считаться по нему"
      footer={
        <Button
          title="Сохранить"
          loading={busy}
          disabled={!v || v === current}
          onPress={async () => {
            setBusy(true);
            try {
              await onSave(v!);
              onClose();
            } catch {
            } finally {
              setBusy(false);
            }
          }}
        />
      }
    >
      <PriceTypePicker value={v} onChange={setV} />
    </Sheet>
  );
}

function OneCSheet({ visible, partner, onClose, onSave }: { visible: boolean; partner: PartnerDetail; onClose: () => void; onSave: (c: Counterparty | null) => Promise<void> }) {
  const [c, setC] = useState<Counterparty | null>(partner.counterparty);
  const [busy, setBusy] = useState(false);
  useEffect(() => setC(partner.counterparty), [partner.counterparty, visible]);
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Контрагент в 1С"
      subtitle="Документы партнёра уйдут в 1С на этого контрагента"
      footer={
        <Button
          title={c ? 'Связать' : 'Убрать связь'}
          kind={c ? 'primary' : 'danger'}
          loading={busy}
          disabled={(c?.oneCId ?? null) === partner.oneCId}
          onPress={async () => {
            setBusy(true);
            try {
              await onSave(c);
              onClose();
            } catch {
            } finally {
              setBusy(false);
            }
          }}
        />
      }
    >
      <CounterpartyPicker value={c} onChange={setC} hint={partner.inn ?? undefined} />
    </Sheet>
  );
}

function EditSheet({
  visible,
  partner,
  onClose,
  onSave,
}: {
  visible: boolean;
  partner: PartnerDetail;
  onClose: () => void;
  onSave: (dto: { name: string; contactName: string; phone?: string; email?: string; inn?: string; note?: string }) => Promise<void>;
}) {
  const [f, setF] = useState({ name: '', contactName: '', phone: '', email: '', inn: '', note: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (visible) setF({ name: partner.name, contactName: partner.contactName, phone: phoneDigits(partner.phone), email: partner.email ?? '', inn: partner.inn ?? '', note: partner.note ?? '' });
  }, [visible, partner]);
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const valid = f.name.trim().length >= 2 && f.contactName.trim().length >= 2 && phoneDigits(f.phone).length === 9;
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Данные партнёра"
      dismissable={!busy}
      footer={
        <Button
          title="Сохранить"
          loading={busy}
          disabled={!valid}
          onPress={async () => {
            setBusy(true);
            try {
              await onSave({
                name: f.name.trim(),
                contactName: f.contactName.trim(),
                phone: `+996${phoneDigits(f.phone)}`,
                email: f.email.trim() || undefined,
                inn: f.inn.trim() || undefined,
                note: f.note.trim() || undefined,
              });
              onClose();
            } catch {
            } finally {
              setBusy(false);
            }
          }}
        />
      }
    >
      <Field label="Название" value={f.name} onChangeText={set('name')} />
      <Field label="Контактное лицо" value={f.contactName} onChangeText={set('contactName')} />
      <Field label="Телефон" keyboardType="phone-pad" value={formatPhoneLocal(phoneDigits(f.phone))} onChangeText={(v) => set('phone')(phoneDigits(v))} left={<T v="bodyStrong" color={colors.textMuted}>+996</T>} />
      <Field label="Почта" keyboardType="email-address" autoCapitalize="none" value={f.email} onChangeText={set('email')} />
      <Field label="ИНН" keyboardType="number-pad" value={f.inn} onChangeText={set('inn')} />
      <Field label="Заметка для офиса" multiline value={f.note} onChangeText={set('note')} placeholder="Например: принимает до 8:00, звонить Айгуль" />
    </Sheet>
  );
}


const st = StyleSheet.create({
  hero: { backgroundColor: colors.cambodia, borderRadius: radius.xxl, padding: space.xl, gap: space.lg, ...shadows.card },
  heroBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 42, borderRadius: 21, backgroundColor: colors.lime },
  info: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 14 },
  orderRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
});
