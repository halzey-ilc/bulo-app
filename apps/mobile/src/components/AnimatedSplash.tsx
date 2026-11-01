import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors, fonts } from '../theme';
import { Logo } from './Logo';

/**
 * Заставка: логотип «вырастает» на овсяном фоне, ниже — слоган.
 * Висит, пока не загрузятся шрифты и сессия, затем плавно исчезает.
 */
export function AnimatedSplash({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const logo = useRef(new Animated.Value(0)).current;
  const slogan = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const intro = useRef(false);

  useEffect(() => {
    Animated.sequence([
      Animated.spring(logo, { toValue: 1, useNativeDriver: true, speed: 6, bounciness: 10 }),
      Animated.timing(slogan, { toValue: 1, duration: 420, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start(() => {
      intro.current = true;
    });
  }, [logo, slogan]);

  useEffect(() => {
    if (!ready) return;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      onDone();
    };
    const delay = intro.current ? 250 : 1300;
    const t = setTimeout(() => {
      Animated.timing(fade, { toValue: 0, duration: 380, useNativeDriver: true }).start(finish);
    }, delay);
    // Подстраховка: если анимации не идут (вкладка в фоне), всё равно убираем заставку.
    const fallback = setTimeout(finish, delay + 900);
    return () => {
      clearTimeout(t);
      clearTimeout(fallback);
    };
  }, [ready, fade, onDone]);

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, { opacity: fade }]}>
      <Svg style={StyleSheet.absoluteFill} viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice">
        <Circle cx={360} cy={90} r={120} fill={colors.softYellow} opacity={0.7} />
        <Circle cx={30} cy={720} r={150} fill={colors.iceCube} opacity={0.55} />
        <Circle cx={330} cy={690} r={36} fill="#FBD9E8" opacity={0.8} />
      </Svg>
      <Animated.View
        style={{
          opacity: logo,
          transform: [
            { scale: logo.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
            { rotate: logo.interpolate({ inputRange: [0, 1], outputRange: ['-8deg', '0deg'] }) },
          ],
        }}
      >
        <Logo width={200} />
      </Animated.View>
      <Animated.View
        style={{
          alignItems: 'center',
          marginTop: 28,
          opacity: slogan,
          transform: [{ translateY: slogan.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
        }}
      >
        <Animated.Text style={styles.slogan}>Taste at Your Pace</Animated.Text>
        <Animated.Text style={styles.sub}>Вкус — в своём темпе</Animated.Text>
      </Animated.View>
      <View style={styles.footer}>
        <Animated.Text style={styles.footerText}>ПЕКАРНЯ · БИШКЕК</Animated.Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.oatMilk, alignItems: 'center', justifyContent: 'center', zIndex: 2000 },
  slogan: { fontFamily: fonts.extrabold, fontSize: 22, color: colors.cambodia, letterSpacing: -0.3 },
  sub: { fontFamily: fonts.medium, fontSize: 15, color: colors.textMuted, marginTop: 4 },
  footer: { position: 'absolute', bottom: 56 },
  footerText: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 3, color: colors.textSoft },
});
