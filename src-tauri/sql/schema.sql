-- L01 Water 数据库 schema
-- 幂等：IF NOT EXISTS，启动时每次执行不会报错

-- 1. 喝水记录
CREATE TABLE IF NOT EXISTS records (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp   INTEGER NOT NULL,        -- 毫秒
  amount_ml   INTEGER NOT NULL,        -- 毫升
  source      TEXT    NOT NULL         -- 'click-small' | 'click-medium' | 'click-large' | 'undo' | 'notification-action' | 'widget-double-click'
);
CREATE INDEX IF NOT EXISTS idx_records_timestamp ON records(timestamp);

-- 2. 设置（KV）
CREATE TABLE IF NOT EXISTS settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);

-- 3. 桌面浮窗状态
CREATE TABLE IF NOT EXISTS widget_state (
  id       INTEGER PRIMARY KEY,
  x        INTEGER NOT NULL,
  y        INTEGER NOT NULL,
  visible  INTEGER NOT NULL DEFAULT 1
);

-- 4. 默认设置（首次启动插入，重复启动 INSERT OR IGNORE 跳过）
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('cup_small_ml',                '150'),
  ('cup_medium_ml',               '300'),
  ('cup_large_ml',                '500'),
  ('daily_goal_ml',               '2000'),
  ('work_start',                  '09:00'),
  ('work_end',                    '18:00'),
  ('weekend_enabled',             'true'),
  ('reminder_enabled',            'true'),
  ('reminder_min_interval_min',   '60'),
  ('reminder_max_interval_min',   '90'),
  ('snooze_until',                '0'),
  ('widget_visible',              'true');

-- 5. widget_state 默认行（id=1，初始位置屏幕左上偏移）
INSERT OR IGNORE INTO widget_state (id, x, y, visible) VALUES
  (1, 100, 100, 1);
