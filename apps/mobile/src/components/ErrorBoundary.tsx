import React from 'react';
import { StyleSheet, View } from 'react-native';
import { reportError } from '../lib/crash';
import { colors, fonts, radius, space } from '../theme';
import { Icon } from './Icon';
import { Button, T } from './ui';

/**
 * Если экран упал — не белый экран, а понятное сообщение и кнопка «Продолжить».
 * Ошибка уходит на сервер в журнал сбоев.
 */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    reportError(error, 'fatal');
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={styles.root}>
        <View style={styles.icon}>
          <Icon name="info" size={36} color={colors.mango} />
        </View>
        <T v="h1" center>
          Что-то пошло не так
        </T>
        <T v="body" center color={colors.textMuted} style={{ maxWidth: 300 }}>
          Мы уже получили отчёт и исправим. Ваша корзина и заказы на месте.
        </T>
        <Button title="Продолжить" icon="arrowRight" onPress={() => this.setState({ error: null })} style={{ alignSelf: 'stretch', marginTop: space.lg }} />
        {__DEV__ && (
          <T v="small" color={colors.danger} style={{ fontFamily: fonts.semibold, marginTop: space.md }}>
            {this.state.error.message}
          </T>
        )}
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.sm },
  icon: { width: 72, height: 72, borderRadius: radius.xl, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: space.md },
});
