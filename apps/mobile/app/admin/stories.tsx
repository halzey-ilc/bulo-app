import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { errorMessage } from '../../src/api';
import { Admin, AdminStory, photoSrc, PickedImage } from '../../src/api/admin';
import { ActionItem, Group, Label, ListSkeleton, Note, Sheet, Toggle } from '../../src/components/admin/kit';
import { Icon } from '../../src/components/Icon';
import { BottomBar, Header, Screen } from '../../src/components/layout';
import { FadeIn, ProgressBar } from '../../src/components/motion';
import { Button, Chip, EmptyState, ErrorState, Field, hapticSuccess, T, Touchable } from '../../src/components/ui';
import { invalidate } from '../../src/lib/cache';
import { useLoad } from '../../src/lib/useLoad';
import { confirmDialog, toast } from '../../src/store/ui';
import { colors, fonts, radius, shadows, space } from '../../src/theme';

const AUDIENCE: { key: AdminStory['audience']; label: string }[] = [
  { key: 'ALL', label: 'Всем' },
  { key: 'CAFE', label: 'Гостям кофейни' },
  { key: 'PARTNER', label: 'Партнёрам' },
];

/** Истории на главной: акции, новинки, новости. Каждая — кружок с картинкой, как в Instagram. */
export default function StoriesAdmin() {
  const list = useLoad(() => Admin.stories(), []);
  const [creating, setCreating] = useState(false);

  const toggle = async (s: AdminStory, active: boolean) => {
    list.setData((cur) => (cur ?? []).map((x) => (x.id === s.id ? { ...x, active } : x)));
    try {
      await Admin.updateStory(s.id, { active });
      invalidate('stories:');
    } catch (e) {
      list.reload();
      toast.error(errorMessage(e));
    }
  };

  const remove = (s: AdminStory) =>
    confirmDialog({
      title: `Удалить историю «${s.title}»?`,
      confirmText: 'Удалить',
      destructive: true,
      onConfirm: async () => {
        await Admin.deleteStory(s.id);
        list.setData((cur) => (cur ?? []).filter((x) => x.id !== s.id));
        invalidate('stories:');
        toast.success('История удалена');
      },
    });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Истории" subtitle="Кружки на главном экране" />
      <Screen refreshing={list.refreshing} onRefresh={list.refresh} contentStyle={{ paddingBottom: 140 }}>
        <Note text="Новые истории показываются первыми с цветным кольцом. Кроме ваших, приложение само собирает истории из новинок и меню." />
        {list.loading ? (
          <ListSkeleton rows={3} height={96} />
        ) : list.error ? (
          <ErrorState message={list.error} onRetry={list.refresh} />
        ) : !list.data?.length ? (
          <EmptyState icon="sparkle" title="Пока нет историй" text="Добавьте акцию, новинку или новость — гости увидят её на главной." action="Добавить" onAction={() => setCreating(true)} />
        ) : (
          <View style={{ gap: space.md }}>
            {list.data.map((s, i) => (
              <FadeIn key={s.id} delay={i * 40}>
                <View style={[styles.row, !s.active && { opacity: 0.6 }]}>
                  <View style={styles.ring}>
                    <Image source={{ uri: photoSrc(s.imageUrl) ?? undefined }} style={styles.cover} contentFit="cover" />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <T v="bodyStrong" numberOfLines={1}>
                      {s.title}
                    </T>
                    {!!s.caption && (
                      <T v="small" color={colors.textMuted} numberOfLines={2}>
                        {s.caption}
                      </T>
                    )}
                    <T v="caption" color={colors.textSoft}>
                      {AUDIENCE.find((a) => a.key === s.audience)?.label}
                      {s.productId ? ' · с кнопкой «Заказать»' : ''}
                    </T>
                  </View>
                  <View style={{ alignItems: 'center', gap: space.sm }}>
                    <Toggle value={s.active} onChange={(v) => toggle(s, v)} />
                    <Touchable hitSlop={8} onPress={() => remove(s)}>
                      <Icon name="trash" size={18} color={colors.danger} />
                    </Touchable>
                  </View>
                </View>
              </FadeIn>
            ))}
          </View>
        )}
      </Screen>
      <BottomBar>
        <Button title="Новая история" icon="plus" onPress={() => setCreating(true)} />
      </BottomBar>
      <CreateStory
        visible={creating}
        onClose={() => setCreating(false)}
        onCreated={(s) => {
          list.setData((cur) => [s, ...(cur ?? [])]);
          invalidate('stories:');
        }}
      />
    </View>
  );
}

function CreateStory({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated: (s: AdminStory) => void }) {
  const [img, setImg] = useState<PickedImage | null>(null);
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [audience, setAudience] = useState<AdminStory['audience']>('ALL');
  const [productId, setProductId] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);
  const products = useLoad(() => (picking ? Admin.products() : Promise.resolve([])), [picking]);
  const product = products.data?.find((p) => p.id === productId);

  const reset = () => {
    setImg(null);
    setTitle('');
    setCaption('');
    setAudience('ALL');
    setProductId(null);
    setProgress(null);
  };

  const pick = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85, allowsEditing: true, aspect: [9, 16] });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    setImg({ uri: a.uri, mimeType: a.mimeType, fileName: a.fileName, file: (a as { file?: Blob }).file });
  };

  const submit = async () => {
    if (!img) return toast.error('Выберите картинку');
    if (!title.trim()) return toast.error('Напишите заголовок');
    setProgress(0);
    try {
      const s = await Admin.createStory(img, { title: title.trim(), caption: caption.trim(), audience, productId: productId ?? undefined }, setProgress);
      hapticSuccess();
      toast.success('История опубликована');
      onCreated(s);
      reset();
      onClose();
    } catch (e) {
      setProgress(null);
      toast.error(errorMessage(e));
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Новая история"
      footer={
        progress != null ? (
          <View style={{ gap: 6 }}>
            <ProgressBar value={progress} />
            <T v="small" center color={colors.textMuted}>
              Загружаем… {Math.round(progress * 100)}%
            </T>
          </View>
        ) : (
          <Button title="Опубликовать" icon="check" onPress={submit} disabled={!img || !title.trim()} />
        )
      }
    >
      <View style={{ gap: space.md }}>
        <Touchable onPress={pick} style={styles.picker} scaleTo={0.98}>
          {img ? (
            <Image source={{ uri: img.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <View style={{ alignItems: 'center', gap: 6 }}>
              <Icon name="camera" size={30} color={colors.mango} />
              <T v="bodyStrong" color={colors.mango}>
                Выбрать картинку
              </T>
              <T v="small" color={colors.textMuted}>
                Лучше вертикальная, 9:16
              </T>
            </View>
          )}
        </Touchable>
        <Field label="Заголовок" value={title} onChangeText={setTitle} maxLength={60} placeholder="Например, Тыквенный латте вернулся" />
        <Field label="Текст" value={caption} onChangeText={setCaption} maxLength={200} multiline placeholder="Коротко: что, сколько стоит, до какого числа" />
        <Label>Кому показывать</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {AUDIENCE.map((a) => (
            <Chip key={a.key} label={a.label} active={audience === a.key} onPress={() => setAudience(a.key)} />
          ))}
        </View>
        <Group>
          {product ? (
            <ActionItem icon="bag" title={product.name} subtitle="Кнопка «Заказать» откроет этот товар — нажмите, чтобы убрать" onPress={() => setProductId(null)} />
          ) : picking ? (
            <View style={{ gap: 6 }}>
              {(products.data ?? [])
                .filter((p) => p.visible)
                .slice(0, 40)
                .map((p) => (
                  <Touchable key={p.id} onPress={() => { setProductId(p.id); setPicking(false); }} style={{ paddingVertical: 8 }}>
                    <T v="bodyStrong">{p.name}</T>
                    <T v="small" color={colors.textSoft}>
                      {p.category?.name}
                    </T>
                  </Touchable>
                ))}
            </View>
          ) : (
            <ActionItem icon="bag" title="Кнопка «Заказать»" subtitle="Привязать товар (необязательно)" onPress={() => setPicking(true)} />
          )}
        </Group>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.white, borderRadius: radius.xl, padding: space.md, ...shadows.soft },
  ring: { width: 64, height: 64, borderRadius: 32, padding: 3, borderWidth: 2.5, borderColor: colors.mango },
  cover: { flex: 1, borderRadius: 28 },
  picker: {
    height: 260,
    borderRadius: radius.xl,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.mango,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#FFF8F4',
  },
});

export { fonts };
