import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, PanResponder, Pressable, ScrollView, StatusBar, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { photoSrc } from '../api/admin';
import type { Category, Product, StoryItem } from '../api';
import { money } from '../lib/format';
import { usePrefs } from '../store/prefs';
import { colors, fonts, space } from '../theme';
import { Icon, IconName } from './Icon';
import { Button, hapticImpact, T, Touchable } from './ui';

/* ───────── Данные ───────── */

export interface StorySlide {
  id: string;
  /** Фото на весь экран; без фото — фирменный фон с иконкой */
  photo?: string | null;
  icon?: IconName;
  bg?: string;
  title: string;
  text?: string;
  /** Кнопка внизу */
  cta?: { label: string; onPress: () => void };
}

export interface StoryGroup {
  key: string;
  label: string;
  /** Картинка в кружке */
  cover?: string | null;
  icon?: IconName;
  slides: StorySlide[];
}

const SLIDE_MS = 5000;

/**
 * Истории: сначала те, что добавили админ или менеджер (акции, новинки),
 * потом собранные из каталога: «Новинки», по категориям (только товары с фото), «Как заказать».
 */
export function buildStories({
  products,
  categories,
  canOrder,
  cutoffTime,
  custom,
  cafe,
  promoEvery,
}: {
  products: Product[] | undefined;
  categories: Category[] | undefined;
  canOrder: boolean;
  cutoffTime?: string | null;
  custom?: StoryItem[];
  /** Гость кофейни: свои подсказки «как заказать» */
  cafe?: boolean;
  promoEvery?: number;
}): StoryGroup[] {
  const list = products ?? [];
  const withPhoto = list.filter((p) => !!p.photoUrl);
  const slide = (p: Product): StorySlide => ({
    id: p.id,
    photo: p.photoUrl,
    title: p.name,
    text: [p.weight, (canOrder || cafe) && p.price != null ? `${money(p.price)}` : null].filter(Boolean).join(' · ') || undefined,
    cta: { label: 'Подробнее', onPress: () => router.push(`/product/${p.id}`) },
  });

  const groups: StoryGroup[] = [];
  for (const s of custom ?? []) {
    groups.push({
      key: `s:${s.id}`,
      label: shortName(s.title).slice(0, 14),
      cover: s.imageUrl,
      slides: [
        {
          id: s.id,
          photo: s.imageUrl,
          title: s.title,
          text: s.caption ?? undefined,
          cta: s.productId ? { label: 'Заказать', onPress: () => router.push(`/product/${s.productId}`) } : undefined,
        },
      ],
    });
  }
  const news = withPhoto.filter((p) => p.isNew);
  if (news.length) groups.push({ key: 'new', label: 'Новинки', cover: news[0].photoUrl, slides: news.slice(0, 8).map(slide) });

  for (const c of categories ?? []) {
    const items = withPhoto.filter((p) => p.categoryId === c.id);
    if (items.length < 2) continue;
    groups.push({ key: `cat:${c.id}`, label: shortName(c.name), cover: c.imageUrl ?? items[0].photoUrl, slides: items.slice(0, 8).map(slide) });
  }

  if (cafe) {
    groups.push({
      key: 'how-cafe',
      label: 'Как заказать',
      icon: 'sparkle',
      slides: [
        { id: 'c1', icon: 'clock', bg: colors.mango, title: 'Забронируйте заранее', text: 'Выберите кофе и выпечку, время — и заберите без очереди. Мы приготовим к вашему приходу.' },
        { id: 'c2', icon: 'gift', bg: colors.coffee, title: `${promoEvery ?? 7}-й кофе — в подарок`, text: 'Каждый кофе ставит штамп в карту гостя. Седьмой — за наш счёт, автоматически.' },
        {
          id: 'c3',
          icon: 'card',
          bg: colors.cambodia,
          title: 'Оплата по QR или на кассе',
          text: 'Оплатите по QR-коду в приложении банка или наличными, когда заберёте заказ.',
          cta: { label: 'В меню', onPress: () => router.navigate('/catalog') },
        },
      ],
    });
    return groups;
  }

  groups.push({
    key: 'how',
    label: 'Как заказать',
    icon: 'sparkle',
    slides: [
      { id: 'how1', icon: 'calendar', bg: colors.mango, title: `Закажите до ${cutoffTime ?? '16:00'}`, text: 'и мы испечём и привезём всё завтра утром — свежее, из печи.' },
      { id: 'how2', icon: 'truck', bg: colors.cambodia, title: 'Курьер на карте', text: 'Следите за доставкой в приложении: видно, где курьер и через сколько минут он приедет.' },
      {
        id: 'how3',
        icon: 'repeat',
        bg: colors.coffee,
        title: 'Повтор в одно касание',
        text: 'Прошлый заказ можно повторить с главного экрана — без поиска и корзины.',
        cta: { label: 'В каталог', onPress: () => router.navigate('/catalog') },
      },
    ],
  });
  return groups;
}

/** «Полуфабрикаты (замороженные)» → «Полуфабрикаты» */
function shortName(name: string) {
  return name.replace(/\s*\(.*?\)\s*/g, '').split(/\s+и\s+/)[0];
}

const sigOf = (g: StoryGroup) => g.slides.map((s) => s.id).join(',');

/* ───────── Ряд кружков ───────── */

export function StoriesRow({ groups }: { groups: StoryGroup[] }) {
  const seen = usePrefs((s) => s.seenStories);
  const [open, setOpen] = useState<number | null>(null);
  // непросмотренные — первыми, как в Instagram
  const ordered = useMemo(() => {
    const fresh = groups.filter((g) => seen[g.key] !== sigOf(g));
    const old = groups.filter((g) => seen[g.key] === sigOf(g));
    return [...fresh, ...old];
  }, [groups, seen]);

  if (!ordered.length) return null;
  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.lg }} contentContainerStyle={{ paddingHorizontal: space.lg, gap: 14 }}>
        {ordered.map((g, i) => (
          <StoryBubble key={g.key} group={g} seen={seen[g.key] === sigOf(g)} delay={i * 50} onPress={() => setOpen(i)} />
        ))}
      </ScrollView>
      <StoryViewer groups={ordered} start={open} onClose={() => setOpen(null)} />
    </>
  );
}

const BUBBLE = 68;

function StoryBubble({ group, seen, delay, onPress }: { group: StoryGroup; seen: boolean; delay: number; onPress: () => void }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(v, { toValue: 1, delay, useNativeDriver: true, speed: 14, bounciness: 8 }).start();
  }, [v, delay]);
  const uri = photoSrc(group.cover);
  return (
    <Animated.View style={{ opacity: v, transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }}>
      <Touchable onPress={onPress} haptic scaleTo={0.92} style={{ width: BUBBLE + 6, alignItems: 'center', gap: 6 }} accessibilityLabel={`История: ${group.label}`}>
        {seen ? (
          <View style={[styles.ring, { backgroundColor: 'rgba(38,66,43,0.18)' }]}>
            <Cover uri={uri} icon={group.icon} />
          </View>
        ) : (
          <LinearGradient colors={[colors.mango, '#F7B32B', colors.coffee]} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={styles.ring}>
            <Cover uri={uri} icon={group.icon} />
          </LinearGradient>
        )}
        <T v="small" numberOfLines={1} style={{ fontFamily: seen ? fonts.medium : fonts.bold, fontSize: 11.5, letterSpacing: -0.2 }} color={seen ? colors.textMuted : colors.text}>
          {group.label}
        </T>
      </Touchable>
    </Animated.View>
  );
}

function Cover({ uri, icon, size = BUBBLE, gap = 3 }: { uri: string | null; icon?: IconName; size?: number; gap?: number }) {
  const round = { width: '100%' as const, height: '100%' as const, borderRadius: size / 2, overflow: 'hidden' as const };
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: gap ? colors.bg : 'transparent', padding: gap }}>
      {uri ? (
        <Image source={{ uri }} style={round} contentFit="cover" transition={200} />
      ) : (
        <View style={[round, { backgroundColor: colors.softYellow, alignItems: 'center', justifyContent: 'center' }]}>
          <Icon name={icon ?? 'sparkle'} size={Math.round(size * 0.4)} color={colors.mango} strokeWidth={1.8} />
        </View>
      )}
    </View>
  );
}

/* ───────── Просмотр ───────── */

function StoryViewer({ groups, start, onClose }: { groups: StoryGroup[]; start: number | null; onClose: () => void }) {
  return (
    <Modal visible={start != null} animationType="fade" transparent statusBarTranslucent onRequestClose={onClose}>
      {start != null && <ViewerBody groups={groups} start={start} onClose={onClose} />}
    </Modal>
  );
}

function ViewerBody({ groups, start, onClose }: { groups: StoryGroup[]; start: number; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { height: H } = useWindowDimensions();
  const markSeen = usePrefs((s) => s.markStorySeen);
  const [gi, setGi] = useState(start);
  const [si, setSi] = useState(0);
  const group = groups[gi];
  const slide = group?.slides[si];

  const progress = useRef(new Animated.Value(0)).current;
  const paused = useRef(false);
  const elapsed = useRef(0);
  const dragY = useRef(new Animated.Value(0)).current;
  const enter = useRef(new Animated.Value(0)).current;

  // каждая новая группа «въезжает» с лёгким масштабом
  useEffect(() => {
    enter.setValue(0);
    Animated.timing(enter, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [gi, enter]);

  // группу досмотрели до последнего слайда — кружок становится серым
  useEffect(() => {
    if (group && si === group.slides.length - 1) markSeen(group.key, sigOf(group));
  }, [gi, si, group, markSeen]);

  const next = () => {
    if (!group) return;
    if (si < group.slides.length - 1) setSi(si + 1);
    else if (gi < groups.length - 1) {
      setGi(gi + 1);
      setSi(0);
    } else onClose();
  };
  const prev = () => {
    if (si > 0) setSi(si - 1);
    else if (gi > 0) {
      setGi(gi - 1);
      setSi(Math.max(0, groups[gi - 1].slides.length - 1));
    } else {
      // первая история — просто перезапустить слайд
      elapsed.current = 0;
      run();
    }
  };
  const nextRef = useRef(next);
  nextRef.current = next;

  const run = () => {
    const left = SLIDE_MS * (1 - elapsed.current);
    Animated.timing(progress, { toValue: 1, duration: Math.max(0, left), easing: Easing.linear, useNativeDriver: false }).start(({ finished }) => {
      if (finished) nextRef.current();
    });
  };

  useEffect(() => {
    elapsed.current = 0;
    progress.setValue(0);
    if (!paused.current) run();
    return () => progress.stopAnimation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gi, si]);

  const pause = () => {
    paused.current = true;
    progress.stopAnimation((v) => (elapsed.current = v));
  };
  const resume = () => {
    if (!paused.current) return;
    paused.current = false;
    run();
  };

  // свайп вниз — закрыть
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => g.dy > 10 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
        onPanResponderGrant: () => pause(),
        onPanResponderMove: (_, g) => dragY.setValue(Math.max(0, g.dy)),
        onPanResponderRelease: (_, g) => {
          if (g.dy > 120 || g.vy > 1) {
            Animated.timing(dragY, { toValue: H, duration: 200, useNativeDriver: true }).start(onClose);
          } else {
            Animated.spring(dragY, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 6 }).start();
            resume();
          }
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [H],
  );

  if (!group || !slide) return null;
  const uri = photoSrc(slide.photo);
  const scale = dragY.interpolate({ inputRange: [0, H], outputRange: [1, 0.85], extrapolate: 'clamp' });
  const backdrop = dragY.interpolate({ inputRange: [0, H * 0.6], outputRange: [1, 0], extrapolate: 'clamp' });

  return (
    <View style={StyleSheet.absoluteFill}>
      <StatusBar barStyle="light-content" />
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: backdrop }]} />
      <Animated.View
        {...pan.panHandlers}
        style={[
          styles.stage,
          {
            opacity: enter,
            transform: [{ translateY: dragY }, { scale: Animated.multiply(scale, enter.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] })) }],
          },
        ]}
      >
        {uri ? (
          <>
            {/* фото из каталога небольшие: целиком по центру, а фон — то же фото, размытое */}
            <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={28} transition={180} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.18)' }]} />
            <View style={[StyleSheet.absoluteFill, { justifyContent: 'center', paddingHorizontal: space.lg, paddingBottom: H * 0.12 }]} pointerEvents="none">
              <Image source={{ uri }} style={styles.photo} contentFit="cover" transition={220} />
            </View>
          </>
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: slide.bg ?? colors.mango, alignItems: 'center', justifyContent: 'center' }]}>
            <View style={styles.bigIcon}>
              <Icon name={slide.icon ?? 'sparkle'} size={72} color={colors.white} strokeWidth={1.5} />
            </View>
          </View>
        )}
        <LinearGradient colors={['rgba(0,0,0,0.45)', 'transparent']} style={[styles.shadeTop, { height: insets.top + 110 }]} pointerEvents="none" />
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.72)']} style={styles.shadeBottom} pointerEvents="none" />

        {/* касания: слева — назад, справа — дальше, удержание — пауза */}
        <View style={StyleSheet.absoluteFill}>
          <View style={{ flex: 1, flexDirection: 'row' }}>
            <Pressable style={{ flex: 1 }} onPress={prev} onLongPress={pause} onPressOut={resume} delayLongPress={180} />
            <Pressable style={{ flex: 2 }} onPress={next} onLongPress={pause} onPressOut={resume} delayLongPress={180} />
          </View>
        </View>

        {/* полоски прогресса и шапка */}
        <View style={[styles.head, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
          <View style={styles.bars} pointerEvents="none">
            {group.slides.map((s, i) => (
              <View key={s.id} style={styles.bar}>
                <Animated.View
                  style={[
                    styles.barFill,
                    { width: i < si ? '100%' : i > si ? '0%' : progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
                  ]}
                />
              </View>
            ))}
          </View>
          <View style={styles.headRow} pointerEvents="box-none">
            <Cover uri={photoSrc(group.cover)} icon={group.icon} size={36} gap={0} />
            <T v="bodyStrong" color={colors.white} style={{ flex: 1, fontFamily: fonts.extrabold }} numberOfLines={1}>
              {group.label}
            </T>
            <Touchable onPress={onClose} hitSlop={12} accessibilityLabel="Закрыть">
              <Icon name="close" size={26} color={colors.white} />
            </Touchable>
          </View>
        </View>

        {/* текст и кнопка */}
        <View style={[styles.foot, { paddingBottom: insets.bottom + space.xl }]} pointerEvents="box-none">
          <T style={styles.title}>{slide.title}</T>
          {!!slide.text && (
            <T v="body" color="rgba(255,255,255,0.88)">
              {slide.text}
            </T>
          )}
          {slide.cta && (
            <Button
              title={slide.cta.label}
              kind="light"
              style={{ marginTop: space.sm }}
              onPress={() => {
                hapticImpact();
                const go = slide.cta!.onPress;
                onClose();
                setTimeout(go, 120);
              }}
            />
          )}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { width: BUBBLE + 6, height: BUBBLE + 6, borderRadius: (BUBBLE + 6) / 2, alignItems: 'center', justifyContent: 'center' },
  stage: { flex: 1, overflow: 'hidden', borderRadius: 18, backgroundColor: '#111' },
  photo: { width: '100%', aspectRatio: 1, borderRadius: 24 },
  bigIcon: { width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  shadeTop: { position: 'absolute', top: 0, left: 0, right: 0 },
  shadeBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '45%' },
  head: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: space.md, gap: space.md },
  bars: { flexDirection: 'row', gap: 4 },
  bar: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)', overflow: 'hidden' },
  barFill: { height: 3, backgroundColor: colors.white },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  foot: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space.xl, gap: 6 },
  title: { fontFamily: fonts.extrabold, fontSize: 30, lineHeight: 34, letterSpacing: -0.6, color: colors.white },
});
