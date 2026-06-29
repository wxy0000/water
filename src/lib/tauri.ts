// 前端 typed invoke wrapper（03 阶段）
//
// 所有 Tauri commands 集中在这里 + 强类型。DAO 层（src/db/*）调这个，不直接 invoke。
// 字段命名：
//   - Rust 端用 #[serde(rename_all = "camelCase")]，所以 wire 格式是驼峰
//   - SQL 列名是 snake_case，存到 DB 是原样
// 错误：
//   - Rust 端 Result<T, DbError> 在前端 invoke 失败时抛 Error，message 是 #[error("...")] 格式

import { invoke } from '@tauri-apps/api/core';
import { listen as _listen, type UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

// Re-export 常用 API，让 DAO / windows 不用直接 import @tauri-apps
export { getCurrentWindow };

// ===== DTOs =====

export interface Record {
  id: number;
  timestamp: number; // 毫秒
  amountMl: number;
  source: RecordSource;
}

export interface DailyTotal {
  date: string; // "YYYY-MM-DD"
  totalMl: number;
}

export type RecordSource =
  | 'click-small'
  | 'click-medium'
  | 'click-large'
  | 'undo'
  | 'notification-action'
  | 'widget-double-click';

// ===== Commands =====

export const commands = {
  // Records
  addRecord: (amount: number, source: RecordSource): Promise<number> =>
    invoke('add_record', { amount, source }),

  getTodayTotal: (): Promise<number> => invoke('get_today_total'),

  getLastRecord: (): Promise<Record | null> => invoke('get_last_record'),

  getTodayRecords: (): Promise<Record[]> => invoke('get_today_records'),

  undoLast: (): Promise<void> => invoke('undo_last'),

  deleteRecord: (id: number): Promise<void> => invoke('delete_record', { id }),

  // Settings
  // 用对象类型而非 Record（@tauri-apps/api/event 2.x 内部覆盖了 Record 名）
  getSettings: (): Promise<{ [key: string]: string }> => invoke('get_settings'),

  setSetting: (key: string, value: string): Promise<void> =>
    invoke('set_setting', { key, value }),

  // Widget
  getWidgetPos: (): Promise<[number, number]> => invoke('get_widget_pos'),

  saveWidgetPos: (x: number, y: number): Promise<void> =>
    invoke('save_widget_pos', { x, y }),

  setWidgetVisible: (visible: boolean): Promise<void> =>
    invoke('set_widget_visible', { visible }),

  // Data Management（06 阶段）
  clearToday: (): Promise<void> => invoke('clear_today'),

  clearAll: (): Promise<void> => invoke('clear_all'),

  // Trend（07 阶段）
  getWeeklyTotals: (): Promise<DailyTotal[]> => invoke('get_weekly_totals'),

  // Reminder：手动测试提醒（返回 notified + message，让用户看到权限/失败原因）
  testReminder: (): Promise<{ notified: boolean; message: string }> => invoke('test_reminder'),
} as const;

// ===== Events =====

/** 通用 listen 包装（保持类型安全） */
export function listen<T>(
  event: string,
  handler: (e: { payload: T }) => void,
): Promise<UnlistenFn> {
  return _listen<T>(event, handler);
}

/** 订阅今日总量变化（add_record / undo_last 触发） */
export function onTodayChanged(handler: () => void): Promise<UnlistenFn> {
  return listen('today-changed', () => handler());
}
