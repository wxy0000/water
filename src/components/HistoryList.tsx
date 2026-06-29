// 今日喝水历史列表
//
// 第一性原理：列表就是一个普通可滚动 div + 静态行。
// 不用 framer-motion 的 layout / height 动画——它们会在滚动时反复重算布局、
// 劫持滚动手势，导致"上下滑动和删除冲突"。删除用最简 opacity 过渡，高度交由
// React 自然重排（删一条列表短一截，无需动画化高度，避免和滚动打架）。
// 删除按钮 stopPropagation + 独立点击区，滚动时不会误触。

import { useState } from 'react';
import type { Record } from '@/lib/tauri';
import { records } from '@/db/records';

interface Props {
  list: Record[];
}

const formatTime = (ms: number) =>
  new Date(ms).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

export const HistoryList = ({ list }: Props) => {
  // 本地 pending 态：删除请求中该项置灰，防重复点击
  const [deleting, setDeleting] = useState<number | null>(null);

  if (list.length === 0) {
    return (
      <div style={{ width: '100%', fontSize: 11, color: '#999', textAlign: 'center', padding: '6px 0' }}>
        今日还没有记录
      </div>
    );
  }

  return (
    <div
      style={{
        width: '100%',
        maxHeight: 96,
        overflowY: 'auto',
        overscrollBehavior: 'contain',
        WebkitOverflowScrolling: 'touch',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      {list.map((r) => {
        const busy = deleting === r.id;
        return (
          <div
            key={r.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '3px 8px',
              borderRadius: 6,
              background: 'rgba(255, 255, 255, 0.35)',
              fontSize: 12,
              color: '#1A1A1A',
              fontVariantNumeric: 'tabular-nums',
              opacity: busy ? 0.4 : 1,
              transition: 'opacity 0.15s ease',
            }}
          >
            <span>
              {formatTime(r.timestamp)} · {r.amountMl} ml
            </span>
            <button
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation();
                setDeleting(r.id);
                records
                  .deleteById(r.id)
                  .catch((err) => console.error('[history] delete failed:', err))
                  .finally(() => setDeleting(null));
              }}
              aria-label="删除此条记录"
              style={{
                background: 'none',
                border: 'none',
                color: '#999',
                cursor: busy ? 'default' : 'pointer',
                fontSize: 14,
                lineHeight: 1,
                padding: '0 4px',
                fontFamily: 'inherit',
                flexShrink: 0,
              }}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
};
