import { Platform, ViewStyle } from 'react-native';
import { BRAND_COLORS } from '../shared';

export const colors = {
  ...BRAND_COLORS,
  bg: BRAND_COLORS.oatMilk,
  surface: '#FFFFFF',
  surfaceWarm: '#FFFBF0',
  text: BRAND_COLORS.cambodia,
  textMuted: 'rgba(38, 66, 43, 0.62)',
  textSoft: 'rgba(38, 66, 43, 0.42)',
  border: 'rgba(38, 66, 43, 0.10)',
  borderStrong: 'rgba(38, 66, 43, 0.18)',
  primary: BRAND_COLORS.mango,
  primaryPressed: '#CF4511',
  primarySoft: '#FDE5DA',
  coffeeSoft: '#F3DEDF',
  greenSoft: '#E3EDE1',
  success: '#2E7D4F',
  danger: '#C7362B',
  dangerSoft: '#FBE3E0',
  overlay: 'rgba(38, 66, 43, 0.45)',
  white: '#FFFFFF',
};

/** Шкала отступов: 4-кратная. */
export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;

export const radius = { sm: 10, md: 14, lg: 18, xl: 24, xxl: 32, pill: 999 } as const;

export const fonts = {
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  extrabold: 'Manrope_800ExtraBold',
} as const;

export const type = {
  display: { fontFamily: fonts.extrabold, fontSize: 26, lineHeight: 32, letterSpacing: -0.5 },
  h1: { fontFamily: fonts.extrabold, fontSize: 22, lineHeight: 28, letterSpacing: -0.3 },
  h2: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 24, letterSpacing: -0.2 },
  h3: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 21 },
  body: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 21 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 21 },
  small: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 14, letterSpacing: 0.4 },
} as const;

function shadow(elevation: number, opacity: number, radiusPx: number, y: number): ViewStyle {
  return Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#5A3B1E',
      shadowOpacity: opacity,
      shadowRadius: radiusPx,
      shadowOffset: { width: 0, height: y },
    },
    android: { elevation, shadowColor: '#5A3B1E' },
    default: { boxShadow: `0px ${y}px ${radiusPx * 2}px rgba(90, 59, 30, ${opacity})` } as ViewStyle,
  })!;
}

export const shadows = {
  soft: shadow(2, 0.06, 10, 3),
  card: shadow(4, 0.09, 14, 6),
  float: shadow(10, 0.16, 18, 8),
};

/** Мягкие «плитки» для категорий и заглушек фото. */
export const tileColors = [
  { bg: BRAND_COLORS.softYellow, fg: BRAND_COLORS.mango },
  { bg: BRAND_COLORS.iceCube, fg: BRAND_COLORS.blueberry },
  { bg: '#FBD9E8', fg: BRAND_COLORS.coffee },
  { bg: '#E6EBC4', fg: BRAND_COLORS.cambodia },
  { bg: '#FDE0D2', fg: BRAND_COLORS.mango },
];

export function tileFor(key: string | undefined | null) {
  const s = key ?? '';
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return tileColors[h % tileColors.length];
}
