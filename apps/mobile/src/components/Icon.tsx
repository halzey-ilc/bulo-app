import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colors } from '../theme';

/**
 * Линейные иконки в стиле брендбука BULO: сетка 24×24, линия 1.6, скруглённые концы.
 */
const P: Record<string, React.ReactNode> = {
  home: (
    <>
      <Path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z" />
      <Path d="M9.5 20.5v-5.5h5v5.5" />
    </>
  ),
  grid: (
    <>
      <Rect x={4} y={4} width={6.5} height={6.5} rx={2} />
      <Rect x={13.5} y={4} width={6.5} height={6.5} rx={2} />
      <Rect x={4} y={13.5} width={6.5} height={6.5} rx={2} />
      <Rect x={13.5} y={13.5} width={6.5} height={6.5} rx={2} />
    </>
  ),
  bag: (
    <>
      <Path d="M5.5 8h13l-1 11.2a1.5 1.5 0 0 1-1.5 1.3H8a1.5 1.5 0 0 1-1.5-1.3z" />
      <Path d="M9 10V7a3 3 0 0 1 6 0v3" />
    </>
  ),
  receipt: (
    <>
      <Path d="M6 3.5h12v17l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3z" />
      <Path d="M9 8h6M9 11.5h6M9 15h3.5" />
    </>
  ),
  user: (
    <>
      <Circle cx={12} cy={8.5} r={3.8} />
      <Path d="M4.8 20c.9-3.6 3.8-5.6 7.2-5.6s6.3 2 7.2 5.6" />
    </>
  ),
  login: (
    <>
      <Path d="M14 4h4a1.5 1.5 0 0 1 1.5 1.5v13A1.5 1.5 0 0 1 18 20h-4" />
      <Path d="M4 12h10.5M11 8.5l3.5 3.5-3.5 3.5" />
    </>
  ),
  logout: (
    <>
      <Path d="M10 4H6a1.5 1.5 0 0 0-1.5 1.5v13A1.5 1.5 0 0 0 6 20h4" />
      <Path d="M9.5 12H20M16.5 8.5 20 12l-3.5 3.5" />
    </>
  ),
  bell: (
    <>
      <Path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5H5z" />
      <Path d="M10 20.5a2.2 2.2 0 0 0 4 0" />
    </>
  ),
  search: (
    <>
      <Circle cx={11} cy={11} r={6.5} />
      <Path d="m16 16 4 4" />
    </>
  ),
  plus: <Path d="M12 5v14M5 12h14" />,
  minus: <Path d="M5 12h14" />,
  close: <Path d="M6 6l12 12M18 6 6 18" />,
  check: <Path d="m5 12.5 4.5 4.5L19 7.5" />,
  chevronRight: <Path d="m9.5 6 6 6-6 6" />,
  chevronLeft: <Path d="m14.5 6-6 6 6 6" />,
  chevronDown: <Path d="m6 9.5 6 6 6-6" />,
  arrowRight: <Path d="M4.5 12h15M14 6.5l5.5 5.5-5.5 5.5" />,
  pin: (
    <>
      <Path d="M12 20.5s-6.5-5.6-6.5-10.8a6.5 6.5 0 0 1 13 0c0 5.2-6.5 10.8-6.5 10.8z" />
      <Circle cx={12} cy={9.8} r={2.3} />
    </>
  ),
  phone: (
    <Path d="M8.2 4.5H5.6a1.2 1.2 0 0 0-1.1 1.3 14.4 14.4 0 0 0 13.7 13.7 1.2 1.2 0 0 0 1.3-1.1v-2.6l-3.4-1.5-1.8 1.8a10.7 10.7 0 0 1-4.5-4.5l1.8-1.8z" />
  ),
  clock: (
    <>
      <Circle cx={12} cy={12} r={8} />
      <Path d="M12 7.5V12l3 2" />
    </>
  ),
  calendar: (
    <>
      <Rect x={4} y={5.5} width={16} height={14.5} rx={3} />
      <Path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
    </>
  ),
  at: (
    <>
      <Circle cx={12} cy={12} r={3.5} />
      <Path d="M15.5 12v1.5a2.5 2.5 0 0 0 5 0V12a8.5 8.5 0 1 0-3.3 6.7" />
    </>
  ),
  instagram: (
    <>
      <Rect x={4} y={4} width={16} height={16} rx={5} />
      <Circle cx={12} cy={12} r={3.6} />
      <Circle cx={16.6} cy={7.4} r={0.6} fill="currentColor" />
    </>
  ),
  chat: <Path d="M5 18.5 6 15a7.5 7.5 0 1 1 3 3z" />,
  send: <Path d="M20 4 3.5 10.5l6.5 2.5 2.5 6.5zM10 13l4-4" />,
  spiral: (
    <Path d="M12 12.4a.9.9 0 1 1 .9-1.2 2.4 2.4 0 0 1-2.1 3.3 3.6 3.6 0 0 1-3.4-3.9 4.9 4.9 0 0 1 5.3-4.4 6 6 0 0 1 5.4 6.4 7.2 7.2 0 0 1-7.5 6.4" />
  ),
  croissant: (
    <>
      <Path d="M3.5 14.5c1-4.5 4.7-7.5 8.5-7.5s7.5 3 8.5 7.5l-3 1.5-2.5-4.5-3 4.5-3-4.5-2.5 4.5z" />
      <Path d="M12 7v2.5" />
    </>
  ),
  cake: (
    <>
      <Path d="M4.5 20h15v-6.5a2 2 0 0 0-2-2h-11a2 2 0 0 0-2 2z" />
      <Path d="M4.5 15.5c1.3 0 1.3 1 2.5 1s1.3-1 2.5-1 1.3 1 2.5 1 1.3-1 2.5-1 1.3 1 2.5 1 1.3-1 2.5-1" />
      <Path d="M12 11.5V8.5M12 6.5v-.2" />
    </>
  ),
  sandwich: (
    <>
      <Path d="M4 9.5 12 5l8 4.5z" />
      <Path d="M4.5 12.5c1.2.8 2.3.8 3.5 0s2.3-.8 3.5 0 2.3.8 3.5 0 2.3-.8 3.5 0" />
      <Path d="M4 15.5h16v2a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" />
    </>
  ),
  cookie: (
    <>
      <Path d="M19.8 12.8A8 8 0 1 1 11.2 4.2a3 3 0 0 0 3.6 3.6 3 3 0 0 0 5 5z" />
      <Path d="M9 10h.01M12.5 14.5h.01M8.5 15h.01" />
    </>
  ),
  bread: (
    <>
      <Path d="M5.5 19.5V11A3.5 3.5 0 0 1 4 8a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4 3.5 3.5 0 0 1-1.5 3v8.5z" />
      <Path d="m10 9 1.5-1.5M13 10l1.5-1.5" />
    </>
  ),
  coffee: (
    <>
      <Path d="M5 9.5h11v4.5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z" />
      <Path d="M16 11h1.2a2.3 2.3 0 0 1 0 4.6H15.6M4 21h13M9 3.5c-.8 1 .8 2 0 3M12.5 3.5c-.8 1 .8 2 0 3" />
    </>
  ),
  wheat: (
    <>
      <Path d="M12 21V9" />
      <Path d="M12 9c-2-1-2.5-3-2-5 2 .5 2.5 2.5 2 5zM12 9c2-1 2.5-3 2-5-2 .5-2.5 2.5-2 5zM12 13.5c-2.2-.2-3.5-2-3.5-3.8 2 0 3.5 1.6 3.5 3.8zM12 13.5c2.2-.2 3.5-2 3.5-3.8-2 0-3.5 1.6-3.5 3.8zM12 18c-2.2-.2-3.5-2-3.5-3.8 2 0 3.5 1.6 3.5 3.8zM12 18c2.2-.2 3.5-2 3.5-3.8-2 0-3.5 1.6-3.5 3.8z" />
    </>
  ),
  sparkle: (
    <>
      <Path d="M12 3.5c.6 4.2 2.3 5.9 6.5 6.5-4.2.6-5.9 2.3-6.5 6.5-.6-4.2-2.3-5.9-6.5-6.5 4.2-.6 5.9-2.3 6.5-6.5z" />
      <Path d="M18.5 16v4M16.5 18h4" />
    </>
  ),
  repeat: (
    <>
      <Path d="M4.5 11V9.5a3 3 0 0 1 3-3h12M16.5 3.5l3 3-3 3" />
      <Path d="M19.5 13v1.5a3 3 0 0 1-3 3h-12M7.5 20.5l-3-3 3-3" />
    </>
  ),
  gift: (
    <>
      <Rect x={4} y={8.5} width={16} height={4} rx={1} />
      <Path d="M5.5 12.5v6.5a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5v-6.5M12 8.5v12" />
      <Path d="M12 8.5C10.5 5 7 4.5 7 6.5s3.5 2 5 2zM12 8.5c1.5-3.5 5-4 5-2s-3.5 2-5 2z" />
    </>
  ),
  heart: <Path d="M12 19.5s-7.5-4.4-7.5-9.7A4.1 4.1 0 0 1 12 7.5a4.1 4.1 0 0 1 7.5 2.3c0 5.3-7.5 9.7-7.5 9.7z" />,
  leaf: (
    <>
      <Path d="M5 19c0-8 5-13.5 14-14 .5 9-5 14-13 14z" />
      <Path d="M5 19 13 11" />
    </>
  ),
  truck: (
    <>
      <Path d="M3.5 6.5h10.5v10H3.5zM14 10h3.5l3 3.3v3.2H14" />
      <Circle cx={7.5} cy={17.5} r={1.8} />
      <Circle cx={17} cy={17.5} r={1.8} />
    </>
  ),
  box: (
    <>
      <Path d="M4 8 12 4l8 4v8.5l-8 4-8-4z" />
      <Path d="M4 8l8 4 8-4M12 12v8.5" />
    </>
  ),
  chef: (
    <>
      <Path d="M7.5 14.5A3.8 3.8 0 0 1 8 7a4.5 4.5 0 0 1 8 0 3.8 3.8 0 0 1 .5 7.5V19a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1z" />
      <Path d="M7.5 16.5h9" />
    </>
  ),
  card: (
    <>
      <Rect x={3.5} y={6} width={17} height={12} rx={2.5} />
      <Path d="M3.5 10h17M7 14.5h3" />
    </>
  ),
  edit: <Path d="M14.5 5.5 18.5 9.5 9 19H5v-4zM12.5 7.5l4 4" />,
  trash: (
    <>
      <Path d="M5 7h14M10 4h4M7 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h5.4a1.5 1.5 0 0 0 1.5-1.4L17 7" />
    </>
  ),
  info: (
    <>
      <Circle cx={12} cy={12} r={8} />
      <Path d="M12 11v5M12 8h.01" />
    </>
  ),
  star: <Path d="m12 4 2.4 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.8 2.7 1.1-5.4-4-3.7 5.4-.6z" />,
  shop: (
    <>
      <Path d="M4 9.5 5.5 4.5h13L20 9.5a2.7 2.7 0 0 1-5.3 0 2.7 2.7 0 0 1-5.4 0 2.7 2.7 0 0 1-5.3 0z" />
      <Path d="M5.5 12v8h13v-8M10 20v-4.5h4V20" />
    </>
  ),
  key: (
    <>
      <Circle cx={8} cy={15} r={3.5} />
      <Path d="m10.5 12.5 8-8M15.5 7.5l2 2M17.5 5.5l2 2" />
    </>
  ),
  hourglass: (
    <>
      <Path d="M6.5 3.5h11M6.5 20.5h11M7.5 3.5c0 5 4.5 5.5 4.5 8.5s-4.5 3.5-4.5 8.5M16.5 3.5c0 5-4.5 5.5-4.5 8.5s4.5 3.5 4.5 8.5" />
    </>
  ),
  navigation: <Path d="M4 11 20 4l-7 16-2-7z" />,
  eye: (
    <>
      <Path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <Circle cx={12} cy={12} r={3} />
    </>
  ),
  eyeOff: (
    <>
      <Path d="M10 5.8c.6-.2 1.3-.3 2-.3 6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.6 3.4M6.4 7.2C3.9 8.9 2.5 12 2.5 12S6 18.5 12 18.5c1.7 0 3.2-.5 4.4-1.2" />
      <Path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M4 4l16 16" />
    </>
  ),
  lock: (
    <>
      <Rect x={5} y={10.5} width={14} height={10} rx={2.5} />
      <Path d="M8 10.5V8a4 4 0 0 1 8 0v2.5M12 14.5v2" />
    </>
  ),
  flame: <Path d="M12 20.5c-3.6 0-6-2.5-6-5.8 0-3.6 3-5.2 3.6-9.2 2.6 1.6 3.9 3.8 3.9 6 1-.5 1.7-1.6 1.9-2.8 1.6 1.3 2.6 3.4 2.6 5.9 0 3.4-2.4 5.9-6 5.9z" />,
  copy: (
    <>
      <Rect x={8} y={8} width={12} height={12} rx={2.5} />
      <Path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </>
  ),
};

export type IconName = keyof typeof P;

export function Icon({
  name,
  size = 24,
  color = colors.text,
  strokeWidth = 1.6,
  fill = 'none',
}: {
  name: IconName | string;
  size?: number;
  color?: string;
  strokeWidth?: number;
  /** Заливка (например, «закрашенное» сердечко избранного). */
  fill?: string;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      color={color}
    >
      {P[name] ?? P.info}
    </Svg>
  );
}

/** Подбирает иконку товара по названию категории. */
export function categoryIcon(name?: string | null): IconName {
  const n = (name ?? '').toLowerCase();
  if (n.includes('синнаб') || n.includes('булоч') || n.includes('рол')) return 'spiral';
  if (n.includes('торт') || n.includes('десерт') || n.includes('пирож')) return 'cake';
  if (n.includes('сэндв') || n.includes('сендв') || n.includes('бутер')) return 'sandwich';
  if (n.includes('печен')) return 'cookie';
  if (n.includes('хлеб')) return 'bread';
  if (n.includes('кофе') || n.includes('напит')) return 'coffee';
  if (n.includes('круас') || n.includes('выпеч')) return 'croissant';
  return 'wheat';
}
