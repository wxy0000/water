// Widget 窗口根组件（04 阶段）
//
// 内容：💧 + 百分比 + total/goal 数字
// 交互：
// - 单击 → 开 popover
// - 双击 → 快速记 1 中杯
// - 拖动（mousedown anywhere）→ Tauri startDragging
//
// 单击/双击分桶用 e.detail（1=单击，2=双击）+ 200ms 延迟判定

import { useRef } from 'react';
import { motion } from 'framer-motion';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { emit } from '@tauri-apps/api/event';
import { records } from '@/db/records';
import { useTodayTotal } from '@/hooks/useTodayTotal';
import { useSettings } from '@/hooks/useSettings';
import { Counter } from '@/components/Counter';
import { popoverVariants } from '@/motion/variants';
import { springs } from '@/motion/springs';

export default function WidgetRoot() {
  const total = useTodayTotal();
  const { settings: s } = useSettings();
  const win = getCurrentWindow();
  const clickTimer = useRef<number | null>(null);

  const goal = s?.dailyGoalMl ?? 2000;
  const cupMedium = s?.cupMediumMl ?? 300;
  const percent = Math.min(100, Math.round((total / goal) * 100));

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    // 拖动：交给 Tauri 原生
    void win.startDragging();
    // 单击/双击分桶：200ms 延迟判定
    if (clickTimer.current !== null) {
      // 第二次点击（e.detail === 2）→ 双击：取消单击 timer
      window.clearTimeout(clickTimer.current);
      clickTimer.current = null;
      void records.add(cupMedium, 'widget-double-click').catch(console.error);
    } else {
      // 第一次点击：等 200ms 看有没有第二次
      const detail = e.detail;
      clickTimer.current = window.setTimeout(() => {
        clickTimer.current = null;
        if (detail === 1) {
          // 真的单击 → 通知 Rust 开 popover
          void emit('widget-clicked', {}).catch(console.error);
        }
      }, 200);
    }
  };

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={popoverVariants}
      transition={springs.widget}
      onMouseDown={onMouseDown}
      onContextMenu={(e) => {
        e.preventDefault();
        // 右键菜单：04 阶段先不实现，预留
        void emit('widget-context-menu', {});
      }}
      style={{
        width: 90,
        height: 56,
        borderRadius: 10,
        background: 'rgba(255, 255, 255, 0.78)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        cursor: 'move',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif',
        gap: 2,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 3,
          color: '#1A1A1A',
        }}
      >
        <span style={{ fontSize: 14 }}>💧</span>
        <Counter
          value={percent}
          format={(n) => `${n}%`}
          style={{ fontSize: 16, fontWeight: 600, color: '#4A9EFF' }}
        />
      </div>
      <div style={{ fontSize: 9, color: '#666', letterSpacing: 0.2 }}>
        {total}/{goal}
      </div>
    </motion.div>
  );
}
