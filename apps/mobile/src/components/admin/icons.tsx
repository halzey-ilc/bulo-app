import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colors } from '../../theme';
import { Icon } from '../Icon';

/** Дополнительные линейные иконки офисных экранов в том же стиле (24×24, линия 1.6). */
const P: Record<string, React.ReactNode> = {
  users: (
    <>
      <Circle cx={9} cy={8.5} r={3.3} />
      <Path d="M3.2 19.5c.8-3.2 3.2-5 5.8-5s5 1.8 5.8 5" />
      <Path d="M15.5 5.6a3.2 3.2 0 0 1 0 6M17.2 14.6c2 .6 3.2 2.3 3.6 4.9" />
    </>
  ),
  shield: (
    <>
      <Path d="M12 3.5 19 6v5.5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6z" />
      <Path d="m9 12 2.2 2.2L15.5 10" />
    </>
  ),
  chart: (
    <>
      <Path d="M4 20h16" />
      <Rect x={5.5} y={11} width={3} height={6.5} rx={1} />
      <Rect x={10.5} y={6.5} width={3} height={11} rx={1} />
      <Rect x={15.5} y={13.5} width={3} height={4} rx={1} />
    </>
  ),
  wallet: (
    <>
      <Path d="M4.5 7.5A2 2 0 0 1 6.5 5.5h10v3" />
      <Rect x={4.5} y={8.5} width={15} height={11} rx={2} />
      <Circle cx={16} cy={14} r={1.2} />
    </>
  ),
  settings: (
    <>
      <Circle cx={12} cy={12} r={3} />
      <Path d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M18 6l-1.6 1.6M7.6 16.4 6 18M18 18l-1.6-1.6M7.6 7.6 6 6" />
    </>
  ),
  upload: (
    <>
      <Path d="M12 15.5V4.5M7.5 9 12 4.5 16.5 9" />
      <Path d="M4.5 15v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3" />
    </>
  ),
  download: (
    <>
      <Path d="M12 4.5v11M7.5 11l4.5 4.5 4.5-4.5" />
      <Path d="M4.5 15v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3" />
    </>
  ),
  share: (
    <>
      <Circle cx={17.5} cy={5.5} r={2.3} />
      <Circle cx={6.5} cy={12} r={2.3} />
      <Circle cx={17.5} cy={18.5} r={2.3} />
      <Path d="m8.6 10.8 6.8-4M8.6 13.2l6.8 4" />
    </>
  ),
  camera: (
    <>
      <Path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.3l1.5-2h5.4l1.5 2h2.3A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" />
      <Circle cx={12} cy={12.8} r={3.4} />
    </>
  ),
  image: (
    <>
      <Rect x={4} y={4.5} width={16} height={15} rx={2.5} />
      <Circle cx={9} cy={9.5} r={1.6} />
      <Path d="m4.5 17 4.5-4.5 3.5 3.5 2.5-2.5 4.5 4.5" />
    </>
  ),
  refresh: (
    <>
      <Path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
      <Path d="M19.5 4.5v4h-4" />
    </>
  ),
  eye: (
    <>
      <Path d="M2.8 12S6 5.8 12 5.8 21.2 12 21.2 12 18 18.2 12 18.2 2.8 12 2.8 12z" />
      <Circle cx={12} cy={12} r={2.8} />
    </>
  ),
  eyeOff: (
    <>
      <Path d="M10 6a9.6 9.6 0 0 1 2-.2c6 0 9.2 6.2 9.2 6.2a15 15 0 0 1-2.6 3.4M6.4 7.6C4 9.3 2.8 12 2.8 12S6 18.2 12 18.2c1.6 0 3-.4 4.2-1" />
      <Path d="M4 4l16 16" />
    </>
  ),
  lock: (
    <>
      <Rect x={5} y={10.5} width={14} height={10} rx={2.2} />
      <Path d="M8.2 10.5V8a3.8 3.8 0 0 1 7.6 0v2.5" />
      <Path d="M12 14.5v2" />
    </>
  ),
  unlock: (
    <>
      <Rect x={5} y={10.5} width={14} height={10} rx={2.2} />
      <Path d="M8.2 10.5V8a3.8 3.8 0 0 1 7.3-1.5" />
    </>
  ),
  alert: (
    <>
      <Path d="M12 4 21 19.5H3z" />
      <Path d="M12 10v4M12 16.8v.2" />
    </>
  ),
  dots: (
    <>
      <Circle cx={6} cy={12} r={1.2} />
      <Circle cx={12} cy={12} r={1.2} />
      <Circle cx={18} cy={12} r={1.2} />
    </>
  ),
  cash: (
    <>
      <Rect x={3.5} y={6.5} width={17} height={11} rx={2} />
      <Circle cx={12} cy={12} r={2.5} />
      <Path d="M6.5 9.5v.01M17.5 14.5v.01" />
    </>
  ),
  qr: (
    <>
      <Rect x={4} y={4} width={6} height={6} rx={1.2} />
      <Rect x={14} y={4} width={6} height={6} rx={1.2} />
      <Rect x={4} y={14} width={6} height={6} rx={1.2} />
      <Path d="M14 14h2.5v2.5M20 14v.01M14 20h.01M17 20h3v-3" />
    </>
  ),
  transfer: (
    <>
      <Path d="M4.5 8.5h14M15 5l3.5 3.5L15 12" />
      <Path d="M19.5 15.5h-14M9 12l-3.5 3.5L9 19" />
    </>
  ),
  undo: (
    <>
      <Path d="M8.5 8.5h7a4.5 4.5 0 0 1 0 9H10" />
      <Path d="M11.5 5 8 8.5l3.5 3.5" />
    </>
  ),
  sync: (
    <>
      <Path d="M5 10a7 7 0 0 1 12.4-3.2L19.5 9" />
      <Path d="M19.5 4.5V9H15" />
      <Path d="M19 14a7 7 0 0 1-12.4 3.2L4.5 15" />
      <Path d="M4.5 19.5V15H9" />
    </>
  ),
  trend: (
    <>
      <Path d="m4 16 5-5 3.5 3.5L20 7" />
      <Path d="M15 7h5v5" />
    </>
  ),
  filter: <Path d="M4.5 5.5h15l-5.8 7v5.3l-3.4 1.7v-7z" />,
  tag: (
    <>
      <Path d="M4 12.6V5.5A1.5 1.5 0 0 1 5.5 4h7.1l7.4 7.4a1.5 1.5 0 0 1 0 2.1l-6.5 6.5a1.5 1.5 0 0 1-2.1 0z" />
      <Circle cx={8.5} cy={8.5} r={1.4} />
    </>
  ),
  doc: (
    <>
      <Path d="M6.5 3.5h7.5l4.5 4.5v11a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 5 19V5a1.5 1.5 0 0 1 1.5-1.5z" />
      <Path d="M13.5 3.5V8.5h5M8.5 12.5h7M8.5 16h5" />
    </>
  ),
  sun: (
    <>
      <Circle cx={12} cy={12} r={4} />
      <Path d="M12 2.8v2M12 19.2v2M2.8 12h2M19.2 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M5.5 18.5l1.4-1.4M17.1 6.9l1.4-1.4" />
    </>
  ),
  moon: <Path d="M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10z" />,
  dice: (
    <>
      <Rect x={4} y={4} width={16} height={16} rx={3.5} />
      <Circle cx={8.7} cy={8.7} r={0.9} />
      <Circle cx={15.3} cy={15.3} r={0.9} />
      <Circle cx={12} cy={12} r={0.9} />
      <Circle cx={15.3} cy={8.7} r={0.9} />
      <Circle cx={8.7} cy={15.3} r={0.9} />
    </>
  ),
  handshake: (
    <>
      <Path d="M3 10.5 6.5 7l3 1.5L12 7l3.5 1.5L17.5 7 21 10.5" />
      <Path d="m6.5 13 3.5 3.5a1.4 1.4 0 0 0 2 0l5-5" />
      <Path d="M9 9.5 12 12.5" />
    </>
  ),
};

export type AIconName = keyof typeof P | string;

/** Иконка: сначала ищем в офисном наборе, иначе — в общем `Icon`. */
export function AIcon({
  name,
  size = 24,
  color = colors.text,
  strokeWidth = 1.6,
}: {
  name: AIconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  const node = P[name];
  if (!node) return <Icon name={name} size={size} color={color} strokeWidth={strokeWidth} />;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {node}
    </Svg>
  );
}
