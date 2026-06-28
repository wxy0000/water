// Tauri 2 API 浏览器 mock（Playwright 测试用）
//
// 注入 __TAURI_INTERNALS__ 全局，mock 11 个 commands + 3 个事件
// 通过 Playwright addInitScript 在 page 加载前调用
//
// 用法（Playwright spec 里）：
//   await page.addInitScript({ content: getMockScript() });

import type { Page } from '@playwright/test';

export async function injectTauriMock(page: Page, options?: { label?: string }) {
  await page.addInitScript(
    ({ initialLabel }) => {
      type Listener = { event: string; handler: (msg: { event: string; payload: unknown; id: number }) => void };

      // ===== 内存数据库 =====
      const settings: Record<string, string> = {
        cup_small_ml: '150',
        cup_medium_ml: '300',
        cup_large_ml: '500',
        daily_goal_ml: '2000',
        work_start: '09:00',
        work_end: '18:00',
        weekend_enabled: 'true',
        reminder_enabled: 'true',
        reminder_min_interval_min: '60',
        reminder_max_interval_min: '90',
        snooze_until: '0',
        widget_visible: 'true',
      };

      const records: Array<{ id: number; timestamp: number; amount_ml: number; source: string }> = [];
      let nextRecordId = 1;
      const widgetState = { id: 1, x: 100, y: 100, visible: 1 };

      // ===== 事件系统 =====
      const listeners = new Map<number, Listener>();
      let nextListenerId = 1;

      function emit(event: string, payload: unknown) {
        listeners.forEach((l) => {
          if (l.event === event) l.handler({ event, payload, id: Date.now() });
        });
      }

      // ===== Tauri Internals =====
      // 注意：Tauri 2 的 listen/emit 走 plugin 系统（invoke('plugin:event|listen'...))
      // invoke 入口就是 plugin + 自定义 commands
      (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {
        metadata: {
          currentWindow: { label: initialLabel },
          currentWebview: { label: initialLabel },
        },
        transformCallback: (callback: (response: unknown) => void, _once: boolean) => {
          // 给一个 id，调用 __TAURI__.callback(id, response) 触发
          const id = nextListenerId++;
          (window as unknown as Record<string, unknown>)[`__TAURI_CB_${id}`] = callback;
          return id;
        },
        invoke: async (cmd: string, args: Record<string, unknown>) => {
          // ===== plugin:event 事件系统 =====
          if (cmd === 'plugin:event|listen') {
            const id = nextListenerId++;
            const handler = (window as unknown as Record<string, (m: unknown) => void>)[
              `__TAURI_CB_${args.handler as number}`
            ];
            if (handler) {
              listeners.set(id, { event: args.event as string, handler: handler as Listener['handler'] });
            }
            return id;
          }
          if (cmd === 'plugin:event|unlisten') {
            listeners.delete(args.eventId as number);
            return null;
          }
          if (cmd === 'plugin:event|emit') {
            // emit('event', payload)
            emit(args.event as string, args.payload);
            return null;
          }

          // ===== 自定义 commands =====

          // Records
          if (cmd === 'add_record') {
            const id = nextRecordId++;
            records.push({
              id,
              timestamp: Date.now(),
              amount_ml: args.amount as number,
              source: args.source as string,
            });
            emit('today-changed', null);
            return id;
          }
          if (cmd === 'get_today_total') {
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);
            return records
              .filter((r) => r.timestamp >= startOfDay.getTime())
              .reduce((sum, r) => sum + r.amount_ml, 0);
          }
          if (cmd === 'get_last_record') {
            if (records.length === 0) return null;
            const last = records[records.length - 1]!;
            return {
              id: last.id,
              timestamp: last.timestamp,
              amount_ml: last.amount_ml,
              source: last.source,
            };
          }
          if (cmd === 'undo_last') {
            records.pop();
            emit('today-changed', null);
            return null;
          }
          if (cmd === 'clear_today') {
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);
            for (let i = records.length - 1; i >= 0; i--) {
              if (records[i]!.timestamp >= startOfDay.getTime()) records.splice(i, 1);
            }
            emit('today-changed', null);
            return null;
          }
          if (cmd === 'clear_all') {
            records.length = 0;
            emit('today-changed', null);
            return null;
          }

          // Settings
          if (cmd === 'get_settings') return { ...settings };
          if (cmd === 'set_setting') {
            settings[args.key as string] = args.value as string;
            emit('settings-changed', [args.key, args.value]);
            return null;
          }

          // Widget
          if (cmd === 'get_widget_pos') return [widgetState.x, widgetState.y];
          if (cmd === 'save_widget_pos') {
            widgetState.x = args.x as number;
            widgetState.y = args.y as number;
            return null;
          }
          if (cmd === 'set_widget_visible') {
            widgetState.visible = args.visible ? 1 : 0;
            return null;
          }

          // 7 天趋势（07 阶段）
          if (cmd === 'get_weekly_totals') {
            const out: Array<{ date: string; totalMl: number }> = [];
            const today = new Date();
            for (let i = 6; i >= 0; i--) {
              const d = new Date(today);
              d.setDate(d.getDate() - i);
              const start = new Date(d);
              start.setHours(0, 0, 0, 0);
              const end = new Date(d);
              end.setHours(23, 59, 59, 999);
              const total = records
                .filter((r) => r.timestamp >= start.getTime() && r.timestamp <= end.getTime())
                .reduce((sum, r) => sum + r.amount_ml, 0);
              out.push({
                date: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`,
                totalMl: total, // camelCase：与 Rust #[serde(rename_all="camelCase")] 一致
              });
            }
            return out;
          }

          console.warn('[mock] unhandled invoke:', cmd, args);
          return null;
        },
      };
    },
    { initialLabel: options?.label ?? 'main' },
  );
}
