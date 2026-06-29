// Popover 窗口根组件（04 + 05 阶段）
//
// 内容：
// - 圆环进度（spring strokeDashoffset 过渡）
// - 数字翻牌（Counter）
// - 3 杯按钮（小/中/大）
// - 撤销 + 上次记录
//
// 交互：点击杯子 → records.add() → 后端 emit today-changed → 圆环 + 数字 + tray 同步

import { useEffect, useMemo, useState } from 'react';
import { ProgressRing } from '@/components/ProgressRing';
import { CupButton } from '@/components/CupButton';
import { Counter } from '@/components/Counter';
import { VibrancyCard } from '@/components/VibrancyCard';
import { HistoryList } from '@/components/HistoryList';
import { useTodayTotal } from '@/hooks/useTodayTotal';
import { useKeyboardNav } from '@/hooks/useKeyboardNav';
import { useSettings } from '@/hooks/useSettings';
import { records } from '@/db/records';
import { onTodayChanged, getCurrentWindow } from '@/lib/tauri';
import type { Record, RecordSource } from '@/lib/tauri';

export default function PopoverRoot() {
  const total = useTodayTotal();
  const { settings: s } = useSettings();
  const [last, setLast] = useState<number | null>(null);
  const [history, setHistory] = useState<Record[]>([]);
  const win = getCurrentWindow();

  useEffect(() => {
    const refresh = () => {
      records.getLast().then((r) => setLast(r?.amountMl ?? null));
      records.getTodayList().then(setHistory);
    };
    refresh();

    const u1 = onTodayChanged(refresh);

    return () => {
      u1.then((fn) => fn()).catch(() => {});
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
        width: 'min(320px, 100vw)',
        height: 'min(540px, 100vh)',
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif',
      }}
    >
      <ProgressRing percent={percent} size={142} strokeWidth={11}>
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

      <HistoryList list={history} />

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
