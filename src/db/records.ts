// 喝水记录 DAO（前端）
//
// 包装 lib/tauri.ts 的 commands，业务层只调这里
import { commands, type Record, type RecordSource } from '@/lib/tauri';

export const records = {
  /** 插入一条喝水记录。后端会 emit('today-changed') → 订阅者刷新 */
  add: (amountMl: number, source: RecordSource): Promise<number> =>
    commands.addRecord(amountMl, source),

  /** 今日累计喝水量（毫升） */
  getTodayTotal: (): Promise<number> => commands.getTodayTotal(),

  /** 最近一次记录（用于 undo 展示 / 双击 widget 提示） */
  getLast: (): Promise<Record | null> => commands.getLastRecord(),

  /** 今日全部记录（倒序），供面板历史列表展示 */
  getTodayList: (): Promise<Record[]> => commands.getTodayRecords(),

  /** 撤销最后一次记录。后端会 emit('today-changed') */
  undoLast: (): Promise<void> => commands.undoLast(),

  /** 删除指定 id 的记录（面板历史列表逐条删除）。后端会 emit('today-changed') */
  deleteById: (id: number): Promise<void> => commands.deleteRecord(id),
};

export type { Record, RecordSource };
