// 7 天数据 hook（07 阶段，bugfix：订阅 today-changed 自动刷新）
import { useEffect, useState } from 'react';
import { commands, listen, type DailyTotal } from '@/lib/tauri';

export function useWeeklyData(): DailyTotal[] | null {
  const [data, setData] = useState<DailyTotal[] | null>(null);

  const refresh = () => {
    commands.getWeeklyTotals().then(setData);
  };

  useEffect(() => {
    refresh();
    const unlistenP = listen('today-changed', () => {
      refresh();
    });
    return () => {
      unlistenP.then((fn) => fn()).catch(() => {});
    };
  }, []);

  return data;
}
