// 7 天趋势折线图（纯 SVG + spring，07 阶段）
//
// 行为：
// - 7 个数据点，今天在右端
// - 平滑曲线（用 cubic bezier 控制点）
// - 今日高亮（粗线 + 大圆点）
// - 数据点 spring 缩放进入
// - 数值标签在每点上

import { motion } from 'framer-motion';
import type { DailyTotal } from '@/lib/tauri';

interface Props {
  data: DailyTotal[]; // length = 7，最后一个是今天
  goal: number; // daily_goal_ml（用于画虚线目标线）
  width?: number;
  height?: number;
}

const PADDING = { top: 24, right: 16, bottom: 28, left: 36 };

export const TrendChart = ({
  data,
  goal,
  width = 320,
  height = 160,
}: Props) => {
  if (data.length === 0) return null;

  const innerW = width - PADDING.left - PADDING.right;
  const innerH = height - PADDING.top - PADDING.bottom;

  const maxValue = Math.max(goal * 1.2, ...data.map((d) => d.totalMl));
  const stepX = innerW / Math.max(1, data.length - 1);

  const toX = (i: number) => PADDING.left + i * stepX;
  const toY = (v: number) => PADDING.top + innerH * (1 - v / maxValue);

  // 平滑曲线控制点
  const points = data.map((d, i) => ({ x: toX(i), y: toY(d.totalMl), v: d.totalMl, i }));
  const pathD = buildSmoothPath(points.map((p) => ({ x: p.x, y: p.y })));

  const goalY = toY(goal);

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      {/* 目标线（虚线） */}
      <line
        x1={PADDING.left}
        y1={goalY}
        x2={PADDING.left + innerW}
        y2={goalY}
        stroke="rgba(74, 158, 255, 0.4)"
        strokeWidth={1}
        strokeDasharray="4 4"
      />
      <text
        x={PADDING.left + innerW - 4}
        y={goalY - 4}
        fontSize={9}
        fill="#4A9EFF"
        textAnchor="end"
      >
        目标 {goal}
      </text>

      {/* 平滑曲线（spring 动画路径长度） */}
      <motion.path
        d={pathD}
        fill="none"
        stroke="#4A9EFF"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ type: 'spring', stiffness: 80, damping: 20, duration: 0.8 }}
      />

      {/* 数据点 */}
      {points.map((p) => {
        const isToday = p.i === points.length - 1;
        return (
          <g key={p.v === undefined ? p.i : `${p.i}-${p.v}`}>
            <motion.circle
              cx={p.x}
              cy={p.y}
              fill={isToday ? '#4A9EFF' : '#fff'}
              stroke="#4A9EFF"
              strokeWidth={isToday ? 3 : 1.5}
              initial={{ r: 0, opacity: 0 }}
              animate={{ r: isToday ? 5 : 3, opacity: 1 }}
              transition={{
                type: 'spring',
                stiffness: 300,
                damping: 20,
                delay: 0.3 + p.i * 0.05,
              }}
            />
            {/* 日期标签 */}
            <text
              x={p.x}
              y={height - PADDING.bottom + 14}
              fontSize={9}
              fill={isToday ? '#4A9EFF' : '#999'}
              textAnchor="middle"
              fontWeight={isToday ? 600 : 400}
            >
              {shortDate(data[p.i]?.date ?? '')}
            </text>
            {/* 数值标签 */}
            {p.v > 0 && (
              <text
                x={p.x}
                y={p.y - 8}
                fontSize={9}
                fill={isToday ? '#1A1A1A' : '#666'}
                textAnchor="middle"
              >
                {p.v}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
};

function shortDate(iso: string) {
  // "2026-06-28" -> "6/28"
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  const m = Number.parseInt(parts[1] ?? '', 10);
  const d = Number.parseInt(parts[2] ?? '', 10);
  if (Number.isNaN(m) || Number.isNaN(d)) return iso;
  return `${m}/${d}`;
}

/** 用 cubic bezier 平滑折线（MVP 简单版：每段一个控制点） */
function buildSmoothPath(pts: Array<{ x: number; y: number }>): string {
  if (pts.length === 0) return '';
  const first = pts[0]!;
  if (pts.length === 1) return `M ${first.x} ${first.y}`;
  let d = `M ${first.x} ${first.y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i]!;
    const p1 = pts[i + 1]!;
    const cx = (p0.x + p1.x) / 2;
    d += ` Q ${cx} ${p0.y}, ${cx} ${(p0.y + p1.y) / 2}`;
    d += ` Q ${cx} ${p1.y}, ${p1.x} ${p1.y}`;
  }
  return d;
}
