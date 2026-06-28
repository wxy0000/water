// 设置 DAO（前端）
//
// 后端存的是 snake_case key + string value 的 KV。前端拿强类型 Settings 对象。
// 缺字段时 fallback 到 DEFAULTS（DB 默认值是 INSERT OR IGNORE 写入的，但保险起见前端再合并一次）。
import { commands } from '@/lib/tauri';

export interface Settings {
  cupSmallMl: number;
  cupMediumMl: number;
  cupLargeMl: number;
  dailyGoalMl: number;
  workStart: string;
  workEnd: string;
  weekendEnabled: boolean;
  reminderEnabled: boolean;
  reminderMinIntervalMin: number;
  reminderMaxIntervalMin: number;
  snoozeUntil: number;
  widgetVisible: boolean;
}

const DEFAULTS: Settings = {
  cupSmallMl: 150,
  cupMediumMl: 300,
  cupLargeMl: 500,
  dailyGoalMl: 2000,
  workStart: '09:00',
  workEnd: '18:00',
  weekendEnabled: true,
  reminderEnabled: true,
  reminderMinIntervalMin: 60,
  reminderMaxIntervalMin: 90,
  snoozeUntil: 0,
  widgetVisible: true,
};

const KEY_MAP: Record<keyof Settings, string> = {
  cupSmallMl: 'cup_small_ml',
  cupMediumMl: 'cup_medium_ml',
  cupLargeMl: 'cup_large_ml',
  dailyGoalMl: 'daily_goal_ml',
  workStart: 'work_start',
  workEnd: 'work_end',
  weekendEnabled: 'weekend_enabled',
  reminderEnabled: 'reminder_enabled',
  reminderMinIntervalMin: 'reminder_min_interval_min',
  reminderMaxIntervalMin: 'reminder_max_interval_min',
  snoozeUntil: 'snooze_until',
  widgetVisible: 'widget_visible',
};

function parse(key: keyof Settings, raw: string): Settings[keyof Settings] {
  const dbKey = KEY_MAP[key];
  // 数值类
  if (
    dbKey.endsWith('_ml') ||
    dbKey === 'snooze_until' ||
    dbKey.includes('interval')
  ) {
    return Number.parseInt(raw, 10);
  }
  // 布尔类
  if (dbKey.endsWith('_enabled') || dbKey === 'widget_visible') {
    return raw === 'true';
  }
  // 字符串类（work_start / work_end / 未知 key）
  return raw;
}

export const settings = {
  /** 读全部设置，缺字段 fallback DEFAULTS */
  async getAll(): Promise<Settings> {
    const raw = await commands.getSettings();
    const out = { ...DEFAULTS };
    (Object.keys(KEY_MAP) as Array<keyof Settings>).forEach((k) => {
      const dbKey = KEY_MAP[k];
      if (dbKey in raw) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (out[k] as any) = parse(k, raw[dbKey]!);
      }
    });
    return out;
  },

  /** 写单个设置（自动转 string 存 DB） */
  async set<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
    const dbKey = KEY_MAP[key];
    return commands.setSetting(dbKey, String(value));
  },
};

export { DEFAULTS as settingsDefaults };
