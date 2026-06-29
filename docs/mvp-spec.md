# MVP 功能规格

## 平台

- **macOS**（优先，Tauri 2 + 系统托盘 / 菜单栏）
- **Windows**（次优，Tauri 2 + 系统托盘）

## 技术栈

| 层 | 选型 | 理由 |
|---|---|---|
| 框架 | **Tauri 2** | 轻量、Rust 后端、原生菜单栏 / 通知 API |
| 前端 | React 18 + Vite | 生态成熟、AI 协作痕迹明显 |
| 动画 | **Framer Motion** | spring physics 原生支持、非线性 easing |
| 样式 | Tailwind CSS | 快速原型、设计 token 统一 |
| 数据 | **SQLite**（Tauri 内置插件） | 本地、零配置、零后端 |
| 图标 | SF Symbols + 自定义 SVG | macOS 视觉一致 |
| 字体 | SF Pro / Inter | 系统原生 + 跨平台 |

## 功能列表

### 1. 菜单栏图标（Tray Icon）

**展示**：

- 图标 + 数字（今日百分比）
- 例如："💧 60%" 或自定义水滴图标
- 鼠标悬停 tooltip："今日 1200 / 2000 ml"

**交互**：

- 左键点击 → 切换 popover（不抢焦点）
- 右键点击 → 菜单（设置 / 退出 / 关于）

### 2. 桌面浮窗（Desktop Widget）— ★ 新增

**目的**：让进度在桌面上"看得见"，不用点开 popover 也能瞄一眼。

**形态**：

```
┌────────────┐
│  💧 60%   │
│ 1200/2000 │
└────────────┘
```

- 极小尺寸（约 **90 x 56 px**）
- 半透明背景（macOS vibrancy）
- 显示：图标 + 百分比 + 数字
- 圆角 10px
- 浅色 / 暗色自适应

**行为**：

- 启动时显示，可拖动到桌面任意位置
- 位置持久化（重启后恢复）
- 边界检查（拖出屏幕自动回弹）
- 可在设置中开关（**默认开启**）
- **始终在最前**（`always_on_top`），但不抢焦点
- **单击** → 打开完整 popover
- **双击** → 快速记录 1 杯（默认 300ml）
- **右键** → 菜单（设置 / 退出）

**技术实现**：

- Tauri 窗口配置：`always_on_top: true`、`decorations: false`、`transparent: true`
- 窗口位置持久化到 SQLite `widget_state` 表
- 启动时恢复上次位置 + 边界检查
- 监听 `onDragDrop` 事件保存位置

### 3. Popover 窗口

**布局**：

```
┌────────────────────────────────┐
│       ╭───────────────╮        │
│       │    [进度圆环] │        │
│       │    1200/2000  │        │
│       │      60%      │        │
│       ╰───────────────╯        │
│                                │
│   ┌──────┐ ┌──────┐ ┌──────┐  │
│   │ 小杯 │ │ 中杯 │ │ 大杯 │  │
│   │ 150ml│ │ 300ml│ │ 500ml│  │
│   └──────┘ └──────┘ └──────┘  │
│                                │
│     [清空今日]      [设置]     │
└────────────────────────────────┘
```

**交互细节**：

- 点击杯子按钮 → 圆环数字 spring 增长 + 轻微震动反馈
- 进度圆环 → spring 动画从 60% → 72%（不是线性插值）
- Popover 出现 → cubic-bezier(0.34, 1.56, 0.64, 1) 轻微 overshoot
- 数字变化 → tween + spring 过渡，不是突变

### 4. 智能提醒 — ★ 增强

**触发规则**（核心逻辑）：

```ts
function shouldRemind(now, lastRecord, snoozeUntil, settings) {
  if (!settings.reminderEnabled) return false;
  if (now < snoozeUntil) return false;                    // 用户选了"5 分钟后再提醒"
  if (!isWorkHour(now, settings.workHours) && !settings.weekendOverride) return false;
  if (isWeekend(now) && !settings.weekendEnabled) return false;  // 默认 weekend_enabled=true → 周末也提醒
  if (now - lastRecord < 30 * 60 * 1000) return false;
  if (todayTotal() >= settings.dailyGoal) return false;
  if (isComputerIdle()) return false;
  return true;
}
```

**提醒参数**：

- 间隔：60-90 分钟随机化（避免通知节奏可预测）
- 工作时间：默认 9:00-18:00（可配置）
- 周末：**默认提醒**（weekend_enabled=true，可关闭）
- 单日目标：默认 2000ml（按体重可调）
- snooze 时间：5 分钟（用户从通知选"5 分钟后再提醒"）

**通知样式**：

- 系统通知，标题"该喝水了 💧"
- 内容"今天已经 X ml，还差 Y ml"
- **★ Action Buttons**：
  - **"我喝了"** → 打开 popover + 默认记 1 杯（300ml）
  - **"5 分钟后再提醒"** → snoozeUntil = now + 5min，5 分钟后强制触发一次
  - **"跳过"** → 关闭通知，下次按正常间隔（60-90 分钟后）触发
- 点击通知主体 → 打开 popover
- **不强提醒**：5 秒后自动消失

### 5. 数据结构

```sql
-- 喝水记录
CREATE TABLE records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,        -- 毫秒
  amount_ml INTEGER NOT NULL,        -- 毫升
  source TEXT NOT NULL                -- 'click-small' | 'click-medium' | 'click-large' | 'undo' | 'notification-action'
);

-- 设置
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 桌面浮窗状态
CREATE TABLE widget_state (
  id INTEGER PRIMARY KEY,
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  visible INTEGER NOT NULL DEFAULT 1
);
```

**默认设置**：

```sql
'cup_small_ml' → '150'
'cup_medium_ml' → '300'             -- ★ 改
'cup_large_ml' → '500'              -- ★ 改
'daily_goal_ml' → '2000'
'work_start' → '09:00'
'work_end' → '18:00'
'weekend_enabled' → 'true'           -- ★ 改（默认周末也提醒）
'reminder_enabled' → 'true'
'reminder_min_interval_min' → '60'
'reminder_max_interval_min' → '90'
'snooze_until' → '0'                 -- 时间戳，0 表示无 snooze
'widget_visible' → 'true'            -- ★ 新增
```

**关键查询**：

```sql
-- 今日总量
SELECT SUM(amount_ml) FROM records
WHERE timestamp >= start_of_today;

-- 最近一次记录
SELECT timestamp FROM records
ORDER BY timestamp DESC LIMIT 1;
```

## UI/UX 设计原则

### 视觉

| 维度 | 规格 |
|---|---|
| 配色 | 柔和低饱和，背景接近系统色（macOS vibrancy） |
| 字体 | SF Pro（macOS）/ Inter（Windows） |
| 字号 | 进度数字 32px、按钮文字 14px、副标题 12px |
| 间距 | 宽松（24-32px 边距），不拥挤 |
| 圆角 | 12-16px（按钮 / 卡片），8-10px（小元素 / 桌面浮窗） |
| 阴影 | 微妙（0 4px 12px rgba(0,0,0,0.08)） |

**配色方案**：

```css
--water-primary: #4A9EFF      /* 主色：天空蓝 */
--water-secondary: #7DBDFF    /* 辅助色：浅蓝 */
--water-bg: rgba(255,255,255,0.85)  /* 背景：半透明白 */
--water-text: #1A1A1A         /* 主文字 */
--water-text-secondary: #666  /* 副文字 */
```

### 动画（非线性 easing 强制要求）

**进度圆环**：

```tsx
<motion.circle
  strokeDashoffset={...}
  transition={{
    type: "spring",
    stiffness: 80,
    damping: 15,
  }}
/>
```

**按钮点击**：

```tsx
<motion.button
  whileTap={{ scale: 0.92 }}
  transition={{
    type: "spring",
    stiffness: 400,
    damping: 25,
  }}
>
```

**Popover 出现**：

```tsx
<motion.div
  initial={{ opacity: 0, scale: 0.9, y: -8 }}
  animate={{ opacity: 1, scale: 1, y: 0 }}
  transition={{
    type: "spring",
    stiffness: 300,
    damping: 22,
  }}
>
```

**桌面浮窗数字变化**：

```tsx
<motion.span
  key={count}
  initial={{ opacity: 0, y: 6 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ type: "spring", stiffness: 300, damping: 20 }}
/>
```

**原则**：

- ❌ 不用 linear
- ❌ 不用 ease-in-out
- ✅ 全部 spring 或 cubic-bezier(0.34, 1.56, 0.64, 1)
- ✅ 微妙但明显，不能"动得太少"
- ✅ 参考 Linear / Raycast / Arc 的设计语言

## AI 协作要求（项目协作核心）

**记录到 `docs/ai-collaboration/`**：

每段 AI 生成的代码标注：

1. **AI 工具**：Cursor / Claude Code / Copilot / v0 / ...
2. **提示词原文**：完整复制（不能改写）
3. **AI 输出**：完整复制
4. **修改记录**：你改了什么（diff）
5. **修改原因**：为什么改 / AI 错在哪

**关键场景**（必记录）：

- Tauri 配置（菜单栏、桌面浮窗 `always_on_top`、通知权限、popover）
- 桌面浮窗实现（窗口位置持久化、边界检查、拖动）
- UI 布局（popover 设计 + 圆环 SVG）
- 动画参数（spring 数值调优——会反复调）
- 智能提醒逻辑（条件组合 + snooze 状态）
- 通知 action buttons（macOS 通知 API 用法）
- 数据库 schema + 查询

## 验收标准

| 标准 | 测量方式 |
|---|---|
| macOS 上能跑 | 启动应用，菜单栏出现图标 |
| 菜单栏显示进度 | 数字 / 图标更新 |
| **桌面浮窗显示** | 启动后桌面出现浮窗，可拖动 |
| **桌面浮窗拖动 + 位置记忆** | 拖到位置 → 重启 → 位置保留 |
| **桌面浮窗点击** | 单击打开 popover / 双击快速记录 |
| **桌面浮窗关闭后设置开关** | 设置关闭 → 浮窗消失 |
| 点击菜单栏 → popover | 手动测试 |
| 点击杯子按钮 → 记录成功 | 手动 + 数据验证 |
| **通知 action buttons** | "我喝了" / "5 分钟后再提醒" / "跳过" 都正确响应 |
| **5 分钟 snooze 行为** | 选 snooze → 5 分钟后准时再提醒 |
| **周末也提醒** | 周末测试默认行为 |
| 进度圆环 spring 动画丝滑 | 视觉对比（vs Linear / Raycast） |
| 智能提醒触发正确 | 1 小时观察 + 边界测试 |
| 数据本地持久化 | 重启应用数据不丢 |
| AI 协作日志完整 | docs/ai-collaboration/ 文件齐全 |

## 时间预算

| 阶段 | 预计 | 实际 |
|---|---|---|
| 文档（本文件） | 30 分钟 | |
| Tauri 骨架 + 菜单栏 + 桌面浮窗 + popover | 2 小时 | |
| UI + spring 动画 | 1-2 小时 | |
| 智能提醒（含 snooze）+ 数据持久化 | 1.5 小时 | |
| 通知 action buttons | 1 小时 | |
| 自用 1-7 天验证 | 24-168 小时 | |
| AI 协作日志整理 | 30 分钟 | |
| **总计** | **2-3 天（不含验证期）** | |

## 风险

| 风险 | 概率 | 应对 |
|---|---|---|
| Tauri `always_on_top` 在 macOS 上的行为差异 | 中 | 测试 Sonoma / Sequoia，确认浮窗体验 |
| 桌面浮窗拖动 + 边界检查边界 case | 中 | 多屏幕测试、DPI 缩放测试 |
| 通知 action buttons 在不同 macOS 版本支持度 | 中 | 用最新 Notification API，文档化降级 |
| Spring 动画调参反复 | 中 | 多试几组，对比 Linear / Arc |
| macOS 通知权限申请被拒 | 低 | 文档化处理流程 |
| 本人用不上（验证第 7 类） | 高 | 这是诚实结论，不是失败 |
| 7 天内未完成 | 中 | 核心功能优先，桌面浮窗可后置 |

---