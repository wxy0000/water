// Popover 窗口根组件（04 + 05 阶段）
//
// 内容：
// - 05 通知 banner（"我喝了" / "5min" / "跳过"），监听 'notification-pending' event
// - 圆环进度（spring strokeDashoffset 过渡）
// - 数字翻牌（Counter）
// - 3 杯按钮（小/中/大）
// - 撤销 + 上次记录
//
// 交互：点击杯子 → records.add() → 后端 emit today-changed → 圆环 + 数字 + tray 同步

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ProgressRing } from '@/components/ProgressRing';
import { CupButton } from '@/components/CupButton';
import { Counter } from '@/components/Counter';
import { VibrancyCard } from '@/components/VibrancyCard';
import { useTodayTotal } from '@/hooks/useTodayTotal';
import { useKeyboardNav } from '@/hooks/useKeyboardNav';
import { useSettings } from '@/hooks/useSettings';
import { records } from '@/db/records';
import { commands, onTodayChanged, listen, getCurrentWindow } from '@/lib/tauri';
import type { RecordSource } from '@/lib/tauri';

interface NotificationPayload {
  todayTotal: number;
  remaining: number;
}

const SNOOZE_5MIN_MS = 5 * 60 * 1000;
const SNOOZE_KEY = 'snooze_until';

export default function PopoverRoot() {
  const total = useTodayTotal();
  const { settings: s } = useSettings();
  const [last, setLast] = useState<number | null>(null);
  const [pending, setPending] = useState<NotificationPayload | null>(null);
  const win = getCurrentWindow();

  useEffect(() => {
    records.getLast().then((r) => setLast(r?.amountMl ?? null));

    const u1 = onTodayChanged(() => {
      records.getLast().then((r) => setLast(r?.amountMl ?? null));
    });

    // 05 阶段：监听系统通知 → 显示 banner
    const u2 = listen<NotificationPayload>('notification-pending', (event) => {
      setPending(event.payload);
    });

    return () => {
      u1.then((fn) => fn()).catch(() => {});
      u2.then((fn) => fn()).catch(() => {});
    };
  }, []);

  const goal = s?.dailyGoalMl ?? 2000;
  const cupSmall = s?.cupSmallMl ?? 150;
  const cupMedium = s?.cupMediumMl ?? 300;
  const cupLarge = s?.cupLargeMl ?? 500;
  const percent = Math.min(100, Math.round((total / goal) * 100));

  const onAdd = async (amount: number, source: RecordSource) => {
    try {
      await records.add(amount, source);
    } catch (e) {
      console.error('[popover] add failed:', e);
    }
  };

  const onUndo = async () => {
    try {
      await records.undoLast();
    } catch (e) {
      console.error('[popover] undo failed:', e);
    }
  };

  // 05 banner actions
  const onBannerDrink = async () => {
    await onAdd(cupMedium, 'notification-action');
    setPending(null);
  };
  const onBannerSnooze = async () => {
    const until = Date.now() + SNOOZE_5MIN_MS;
    try {
      await commands.setSetting(SNOOZE_KEY, String(until));
    } catch (e) {
      console.error('[popover] set snooze failed:', e);
    }
    setPending(null);
  };
  const onBannerSkip = () => {
    setPending(null);
  };

  // 07 阶段：键盘导航 1/2/3 + Esc
  // 注意：useMemo 防 bindings 引用变化触发 useEffect 重新订阅
  const bindings = useMemo(
    () => ({
      '1': () => onAdd(cupSmall, 'click-small' as RecordSource),
      '2': () => onAdd(cupMedium, 'click-medium' as RecordSource),
      '3': () => onAdd(cupLarge, 'click-large' as RecordSource),
      escape: () => win.hide(),
    }),
    [cupSmall, cupMedium, cupLarge, win],
  );
  useKeyboardNav({ bindings });

  return (
    <VibrancyCard
      style={{
        width: 320,
        minHeight: 420,
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif',
      }}
    >
      {/* 05 阶段：通知 banner（AnimatePresence 进出 spring 动画） */}
      <AnimatePresence>
        {pending && (
          <motion.div
            key="banner"
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 300, damping: 22 }}
            style={{
              width: '100%',
              background: 'rgba(74, 158, 255, 0.12)',
              border: '1px solid rgba(74, 158, 255, 0.3)',
              borderRadius: 12,
              padding: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ fontSize: 13, color: '#1A1A1A', fontWeight: 500 }}>
              💧 该喝水了 · 今日 {pending.todayTotal} / {goal} ml
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <motion.button
                whileTap={{ scale: 0.94 }}
                onClick={onBannerDrink}
                style={bannerBtnPrimary}
              >
                我喝了
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.94 }}
                onClick={onBannerSnooze}
                style={bannerBtnSecondary}
              >
                5min
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.94 }}
                onClick={onBannerSkip}
                style={bannerBtnSecondary}
              >
                跳过
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ProgressRing percent={percent} size={150} strokeWidth={11}>
        <Counter
          value={total}
          format={(n) => `${n}`}
          style={{ fontSize: 28, fontWeight: 600, color: '#1A1A1A', lineHeight: 1 }}
        />
        <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>/ {goal} ml</div>
      </ProgressRing>

      <div style={{ display: 'flex', gap: 8, width: '100%' }}>
        <CupButton
          label={`小杯 ${s?.cupSmallMl ?? 150}`}
          onClick={() => onAdd(s?.cupSmallMl ?? 150, 'click-small')}
        />
        <CupButton
          label={`中杯 ${s?.cupMediumMl ?? 300}`}
          onClick={() => onAdd(s?.cupMediumMl ?? 300, 'click-medium')}
        />
        <CupButton
          label={`大杯 ${s?.cupLargeMl ?? 500}`}
          onClick={() => onAdd(s?.cupLargeMl ?? 500, 'click-large')}
        />
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: '100%',
          fontSize: 12,
          color: '#666',
        }}
      >
        <span>
          {percent}% ·{' '}
          {last !== null ? `上次 ${last}ml` : '今日第一杯'}
        </span>
        <button
          onClick={onUndo}
          style={{
            background: 'none',
            border: 'none',
            color: '#999',
            cursor: 'pointer',
            fontSize: 12,
            padding: 4,
            fontFamily: 'inherit',
          }}
        >
          撤销
        </button>
      </div>
    </VibrancyCard>
  );
}

const bannerBtnPrimary: React.CSSProperties = {
  flex: 1,
  padding: '8px 4px',
  borderRadius: 8,
  background: '#4A9EFF',
  color: '#fff',
  border: 'none',
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const bannerBtnSecondary: React.CSSProperties = {
  flex: 1,
  padding: '8px 4px',
  borderRadius: 8,
  background: 'transparent',
  color: '#4A9EFF',
  border: '1px solid rgba(74, 158, 255, 0.3)',
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
