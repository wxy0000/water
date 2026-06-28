// 订阅设置（实时保存 + 跨窗口同步）
//
// 用法：
//   const { settings, update } = useSettings();
//
// 行为：
// - 首次 mount → 拉一次 getAll
// - 订阅 'settings-changed' event → 重新拉（settings 窗口改了 / reminder 改了 / 任何地方改了）
// - update(key, value) 立即调 setSetting + 本地乐观更新

import { useEffect, useState, useCallback } from 'react';
import { settings as settingsApi, type Settings } from '@/db/settings';
import { listen } from '@/lib/tauri';

export function useSettings() {
  const [s, setS] = useState<Settings | null>(null);

  const refresh = useCallback(() => {
    settingsApi.getAll().then(setS);
  }, []);

  useEffect(() => {
    refresh();
    const unlistenP = listen('settings-changed', () => refresh());
    return () => {
      unlistenP.then((fn) => fn()).catch(() => {});
    };
  }, [refresh]);

  const update = useCallback(
    async <K extends keyof Settings>(key: K, value: Settings[K]) => {
      // 乐观更新：先改本地 state（UI 立刻响应），失败回滚
      setS((prev) => (prev ? { ...prev, [key]: value } : prev));
      try {
        await settingsApi.set(key, value);
      } catch (e) {
        console.error('[useSettings] update failed:', e);
        refresh(); // 回滚
      }
    },
    [refresh],
  );

  return { settings: s, update, refresh };
}
