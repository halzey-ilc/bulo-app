import React, { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { errorMessage } from '../../src/api';
import { Admin, ExcelPaths, OneCDoc, OneCDocStatus } from '../../src/api/admin';
import { OneCCard } from '../../src/components/admin/Dashboard';
import { AIcon } from '../../src/components/admin/icons';
import { ago, ExcelRow, Group, Label, ListSkeleton, Note, Pill, Segmented } from '../../src/components/admin/kit';
import { Header, Screen } from '../../src/components/layout';
import { Button, EmptyState, ErrorState, T, Touchable } from '../../src/components/ui';
import { useLoad } from '../../src/lib/useLoad';
import { usePersona } from '../../src/store/auth';
import { toast } from '../../src/store/ui';
import { colors, fonts, radius, space } from '../../src/theme';

const TYPE_LABEL: Record<OneCDoc['type'], string> = {
  CUSTOMER_ORDER: 'Заказ клиента',
  PRODUCTION: 'Заказ на производство',
  SALE: 'Реализация',
};

/** 1С: документы к передаче, ошибки с повтором, Excel-выгрузка. */
export default function OneCScreen() {
  const persona = usePersona();
  const allowed = persona === 'admin' || persona === 'accountant';
  const [status, setStatus] = useState<OneCDocStatus>('ERROR');
  const docs = useLoad(() => Admin.onecDocs(status), [status], { enabled: allowed });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cardKey, setCardKey] = useState(0);

  if (!allowed) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title="1С" />
        <EmptyState icon="lock" title="Нет доступа" text="Обмен с 1С доступен администратору и бухгалтеру." />
      </View>
    );
  }

  const retry = async (d: OneCDoc) => {
    setBusyId(d.id);
    try {
      await Admin.onecRetry(d.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      docs.setData((cur) => cur?.filter((x) => x.id !== d.id));
      setCardKey((k) => k + 1);
      toast.success('Документ снова в очереди');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  const retryAll = async () => {
    const list = docs.data ?? [];
    setBusyId('all');
    let ok = 0;
    for (const d of list) {
      try {
        await Admin.onecRetry(d.id);
        ok++;
      } catch {}
    }
    setBusyId(null);
    toast.success(`В очередь возвращено: ${ok}`);
    docs.reload();
    setCardKey((k) => k + 1);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Обмен с 1С" />
      <Screen refreshing={docs.refreshing} onRefresh={() => { docs.refresh(); setCardKey((k) => k + 1); }}>
        <OneCCard key={cardKey} compact />
        <View style={{ gap: space.sm }}>
          <Label>Выгрузка</Label>
          <ExcelRow title="Выгрузить в Excel" subtitle="Документы, ещё не переданные в 1С" file={() => ExcelPaths.onec(false)} />
          <ExcelRow title="Выгрузить и отметить переданными" subtitle="После загрузки файла в 1С вручную" file={() => ExcelPaths.onec(true)} icon="check" />
        </View>

        <Segmented
          items={[
            { key: 'ERROR', label: 'Ошибки' },
            { key: 'PENDING', label: 'Ждут' },
            { key: 'SENT', label: 'Переданы' },
          ]}
          value={status}
          onChange={setStatus}
        />
        {status === 'ERROR' && (docs.data?.length ?? 0) > 1 && <Button kind="secondary" small icon="refresh" title={`Повторить все (${docs.data!.length})`} onPress={retryAll} loading={busyId === 'all'} />}

        {docs.loading ? (
          <ListSkeleton rows={3} height={90} />
        ) : docs.error ? (
          <ErrorState message={docs.error} onRetry={docs.refresh} />
        ) : !docs.data?.length ? (
          <EmptyState icon="check" tint={colors.greenSoft} title={status === 'ERROR' ? 'Ошибок нет' : status === 'PENDING' ? 'Очередь пуста' : 'Пока ничего не передано'} text={status === 'ERROR' ? 'Все документы уходят в 1С без проблем.' : undefined} />
        ) : (
          docs.data.map((d) => (
            <Group key={d.id} style={{ gap: space.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <View style={{ flex: 1 }}>
                  <T v="bodyStrong">{TYPE_LABEL[d.type]}</T>
                  <T v="small" color={colors.textMuted}>
                    {d.order ? `Заказ №${d.order.number} · ${d.order.partner.name}` : d.productionSheet ? `Сводная №${d.productionSheet.number}` : '—'}
                  </T>
                </View>
                <Pill
                  label={d.status === 'ERROR' ? 'ОШИБКА' : d.status === 'PENDING' ? 'ЖДЁТ' : `№${d.oneCNumber ?? '—'}`}
                  bg={d.status === 'ERROR' ? colors.dangerSoft : d.status === 'PENDING' ? colors.iceCube : '#DDEFD9'}
                  fg={d.status === 'ERROR' ? colors.danger : d.status === 'PENDING' ? colors.blueberry : colors.success}
                />
              </View>
              {!!d.lastError && (
                <View style={{ backgroundColor: colors.dangerSoft, borderRadius: radius.md, padding: space.sm }}>
                  <T v="small" color={colors.coffee} style={{ fontFamily: fonts.semibold }}>
                    {d.lastError}
                  </T>
                </View>
              )}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <T v="caption" color={colors.textSoft} style={{ flex: 1 }}>
                  создан {ago(d.createdAt)} · попыток {d.attempts}
                  {d.sentAt ? ` · передан ${ago(d.sentAt)}` : ''}
                </T>
                {d.order && (
                  <Touchable haptic onPress={() => router.push(`/order/${d.order!.id}`)}>
                    <T v="small" color={colors.mango} style={{ fontFamily: fonts.bold }}>
                      Заказ
                    </T>
                  </Touchable>
                )}
                {d.status === 'ERROR' &&
                  (busyId === d.id ? (
                    <ActivityIndicator color={colors.mango} />
                  ) : (
                    <Touchable haptic onPress={() => retry(d)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primarySoft, paddingHorizontal: 12, height: 32, borderRadius: 16 }}>
                      <AIcon name="refresh" size={14} color={colors.mango} strokeWidth={2.2} />
                      <T v="small" color={colors.mango} style={{ fontFamily: fonts.extrabold }}>
                        Повторить
                      </T>
                    </Touchable>
                  ))}
              </View>
            </Group>
          ))
        )}
        <Note text="1С забирает документы автоматически. Если обмен не настроен — выгрузите Excel и загрузите файл в 1С вручную." />
      </Screen>
    </View>
  );
}
