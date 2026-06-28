// 圆环进度条（SVG + framer-motion spring）
//
// 行为：
// - strokeDasharray = 圆周长
// - strokeDashoffset = c * (1 - percent/100)，spring 过渡
// - 起点 12 点钟方向：transform rotate(-90)

import { motion } from 'framer-motion';
import { springs } from '@/motion/springs';

interface Props {
  percent: number; // 0..=100
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  children?: React.ReactNode;
}

export const ProgressRing = ({
  percent,
  size = 160,
  strokeWidth = 12,
  color = '#4A9EFF',
  trackColor = 'rgba(0, 0, 0, 0.06)',
  children,
}: Props) => {
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, percent));
  const offset = c * (1 - clamped / 100);

  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: 'absolute' }}>
        {/* track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />
        {/* progress（spring 过渡 strokeDashoffset） */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={c}
          style={{ strokeDashoffset: offset }}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          transition={springs.ring}
        />
      </svg>
      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
        }}
      >
        {children}
      </div>
    </div>
  );
};
