import { Stack } from 'expo-router';
import { colors } from '../../src/theme';

export default function LoginLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'slide_from_right' }} />;
}
