// 订阅今日总量（useTodayTotal）
//
// 用法：
//   const total = useTodayTotal();
// 行为：
//   - 首次 mount → 拉一次 get_today_total
//   - 订阅 'today-changed' 事件 → 重新拉
//   - unmount → unlisten

import { useEffect, useState } from 'react';
import { records } from '@/db/records';
import { onTodayChanged } from '@/lib/tauri';

export function useTodayTotal(): number {
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let cancelled = false;
    records.getTodayTotal().then((t) => {
      if (!cancelled) setTotal(t);
    });
    const unlistenP = onTodayChanged(() => {
      records.getTodayTotal().then((t) => {
        if (!cancelled) setTotal(t);
      });
    });
    return () => {
      cancelled = true;
      unlistenP.then((fn) => fn()).catch(() => {});
    };
  }, []);

  return total;
}
