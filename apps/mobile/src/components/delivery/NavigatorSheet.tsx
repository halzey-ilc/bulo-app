import React from 'react';
import { View } from 'react-native';
import { colors, fonts } from '../../theme';
import { NAV_APPS, NavApp, openNavigator } from '../../lib/delivery';
import { ActionItem, Sheet } from '../admin/kit';
import { T } from '../ui';

const TONE: Record<NavApp, 'green' | 'yellow' | 'pink' | 'ice'> = { dgis: 'green', yandexnavi: 'yellow', yandexmaps: 'pink', google: 'ice' };

/** Выбор навигатора: 2ГИС, Яндекс, Google. Если приложения нет — откроется веб-карта. */
export function NavigatorSheet({
  target,
  onClose,
}: {
  target: { point: { lat: number; lng: number } | null; address: string | null; title?: string } | null;
  onClose: () => void;
}) {
  return (
    <Sheet visible={!!target} onClose={onClose} title="Построить маршрут" subtitle={target?.address ?? undefined}>
      {!target?.point && (
        <T v="small" color={colors.textMuted}>
          Точка на карте не указана — откроем поиск по адресу в 2ГИС.
        </T>
      )}
      {NAV_APPS.map((a) => (
        <ActionItem
          key={a.key}
          icon="share"
          tone={TONE[a.key]}
          title={a.title}
          subtitle={a.subtitle}
          onPress={() => {
            onClose();
            void openNavigator(a.key, target?.point ?? null, target?.address);
          }}
        />
      ))}
      <View style={{ height: 4 }} />
      <T v="caption" color={colors.textSoft} center style={{ fontFamily: fonts.semibold }}>
        Если приложения нет на телефоне, маршрут откроется в браузере
      </T>
    </Sheet>
  );
}
