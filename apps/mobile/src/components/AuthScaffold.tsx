import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { colors, space } from '../theme';
import { Header } from './layout';
import { Logo } from './Logo';
import { T } from './ui';

/** Общий каркас экранов входа: логотип, заголовок, контент, нижние кнопки. */
export function AuthScaffold({
  title,
  subtitle,
  children,
  footer,
  onBack,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onBack?: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior="padding">
      <Svg style={StyleSheet.absoluteFill} viewBox="0 0 400 800" preserveAspectRatio="xMidYMin slice" pointerEvents="none">
        <Circle cx={380} cy={60} r={110} fill={colors.softYellow} opacity={0.8} />
        <Circle cx={330} cy={170} r={14} fill={colors.strawberryMilk} opacity={0.8} />
      </Svg>
      <Header transparent onBack={onBack} />
      <ScrollView
        contentContainerStyle={{ padding: space.xl, paddingTop: space.sm, gap: space.xl, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={{ gap: space.sm }}>
          <Logo width={84} />
          <T v="display" style={{ marginTop: space.md }}>
            {title}
          </T>
          {typeof subtitle === 'string' ? (
            <T v="body" color={colors.textMuted} style={{ fontSize: 16, lineHeight: 23 }}>
              {subtitle}
            </T>
          ) : (
            subtitle
          )}
        </View>
        {children}
      </ScrollView>
      {footer && <View style={{ padding: space.xl, paddingTop: space.sm, paddingBottom: insets.bottom + space.lg, gap: space.sm }}>{footer}</View>}
    </KeyboardAvoidingView>
  );
}
