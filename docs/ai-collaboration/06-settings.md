# 06 设置窗口

## 提示词

> 你是 Tauri 2 + React + Framer Motion 专家。基于 01-05 完整骨架，实现设置窗口。
>
> Rust 文件：
> - src-tauri/src/settings.rs（新建窗口）
> - src-tauri/src/lib.rs（追加 settings::init + listen open-settings）
> - src-tauri/src/tray.rs（右键菜单"设置"启用 + emit open-settings）
> - src-tauri/capabilities/default.json（加 settings 窗口权限）
>
> 前端文件：
> - src/windows/SettingsRoot.tsx
> - src/components/SettingRow.tsx
> - src/components/Toggle.tsx
> - src/components/Slider.tsx
> - src/components/TimePicker.tsx
> - src/components/NumberStepper.tsx
> - src/components/ConfirmDialog.tsx
> - src/hooks/useSettings.ts
> - src/main.tsx（加 settings 路由）
>
> 设置项：13 个（1 个 Slider + 3 个 NumberStepper + 2 个 TimePicker + 3 个 Toggle + 1 个 NumberInput 区间 + 2 个数据按钮）
>
> 关键约束：
> - **实时保存**：每个 onChange 立即 invoke('set_setting')
> - **联动**：set_setting 后 emit('settings-changed')，tray/widget/popover 订阅刷新
> - Vibrancy：window-vibrancy + Tailwind 半透明
> - Spring：所有控件切换/数值变化用 spring
> - 清空确认：ConfirmDialog 弹窗
> - 窗口尺寸：480x560

## AI 输出

5 个新 Rust 文件改动 + 9 个新前端文件：

Rust：
- [src-tauri/src/settings.rs](../../src-tauri/src/settings.rs)（新建）
- [src-tauri/src/lib.rs](../../src-tauri/src/lib.rs)（+ settings mod / init / listen）
- [src-tauri/src/tray.rs](../../src-tauri/src/tray.rs)（设置项 enabled + emit）
- [src-tauri/src/commands.rs](../../src-tauri/src/commands.rs)（+ clear_today / clear_all / set_setting emit）
- [src-tauri/capabilities/default.json](../../src-tauri/capabilities/default.json)（+ 'settings' 窗口）

前端：
- [src/components/SettingRow.tsx](../../src/components/SettingRow.tsx)
- [src/components/Toggle.tsx](../../src/components/Toggle.tsx)
- [src/components/Slider.tsx](../../src/components/Slider.tsx)
- [src/components/NumberStepper.tsx](../../src/components/NumberStepper.tsx)
- [src/components/TimePicker.tsx](../../src/components/TimePicker.tsx)
- [src/components/ConfirmDialog.tsx](../../src/components/ConfirmDialog.tsx)
- [src/hooks/useSettings.ts](../../src/hooks/useSettings.ts)
- [src/windows/SettingsRoot.tsx](../../src/windows/SettingsRoot.tsx)
- [src/lib/tauri.ts](../../src/lib/tauri.ts)（+ clearToday/clearAll + re-export getCurrentWindow）
- [src/main.tsx](../../src/main.tsx)（+ settings 路由）

## 我的修改

### 修改 1：lib/tauri.ts re-export `getCurrentWindow`

**改了什么**：
```ts
import { getCurrentWindow } from '@tauri-apps/api/window';
export { getCurrentWindow };
```

**为什么改**：SettingsRoot.tsx 写 `import { getCurrentWindow } from '@/lib/tauri'`——但 lib/tauri.ts 没 re-export。Vite 报 "Importing binding name 'getCurrentWindow' is not found"。

**取舍**：WidgetRoot.tsx 是从 `@tauri-apps/api/window` 直接 import，能跑。但 SettingsRoot 写的是从 lib/tauri 拿——保持 DAO 层封装原则（DAO 不直接 import @tauri-apps/api，**只**通过 lib/tauri.ts），需要在 lib/tauri re-export。

**AI 漏了吗**：AI 写 SettingsRoot 时直接复制 WidgetRoot 的 import，但 WidgetRoot 用的是 `@tauri-apps/api/window` 直接路径，lib/tauri.ts 没 re-export → 编译错。

**教训**：dao / windows 组件**只** import from `@/lib/tauri` 或 `@/db/*`——不直接 import `@tauri-apps/*`。这样后续换 plugin / mock / 测试只需改一处。

### 修改 2：乐观更新 + 失败回滚

**改了什么**（useSettings.ts）：
```ts
const update = async (key, value) => {
  // 1. 立即改本地 state（UI 立刻响应）
  setS(prev => prev ? { ...prev, [key]: value } : prev);
  try {
    await settingsApi.set(key, value);
  } catch (e) {
    refresh();  // 2. 失败回滚
  }
};
```

**为什么改**：每个 onChange 立即调 `setSetting`（实时保存），但 await 期间 UI 卡顿会感觉不跟手。**乐观更新**先改本地 state，UI 立刻响应，后台调 RPC，失败时 refresh 拉回正确值。

**取舍**：失败回滚用 `refresh()`（重新拉 DB），简单可靠。生产环境可以**更精细**的回滚（保留旧值，catch 失败后 setS(prev)），但 MVP 阶段够用。

### 修改 3：clear_today / clear_all 都 emit('today-changed')

**改了什么**：两个新 command 删完后都 `app.emit("today-changed", ())`。
**为什么**：popover / widget / tray 数字靠 `today-changed` 事件刷新。清空后不 emit，tray 数字不变（DB 改了但前端不知）。

### 修改 4：tray.rs "设置"项 enabled + emit('open-settings')

**改了什么**：
```rust
let settings_item = MenuItem::with_id(app, "settings", "设置…", true, None::<&str>)?;  // 改 false → true
// on_menu_event:
"settings" => { let _ = app.emit("open-settings", ()); }
```

**为什么改**：MVP 阶段（02/03/04/05）"设置"项是 disabled（占位）。06 阶段启用 + emit event → lib.rs listen → settings::show。

**为什么 emit 不直接调 settings::show**：tray.rs 在 02 阶段 import 不包含 settings 模块（settings 是 06 阶段新加的）。emit 走事件总线更解耦，且 lib.rs 已经是中心调度点。

### 修改 5：Slider 用 mousedown 全局移动 + thumb 14px 圆形

**改了什么**（Slider.tsx）：
```tsx
onMouseDown={(e) => {
  dragging.current = true;
  handleMove(e.clientX);
}}
onMouseMove={(e) => dragging.current && handleMove(e.clientX)}
onMouseUp={() => (dragging.current = false)}
onMouseLeave={() => (dragging.current = false)}
```

**为什么改**：浏览器原生 `input[type=range]` 样式难定制（macOS 上是系统样式，颜色 / 高度都改不了）。自定义 mousedown + 状态机可控性最大。

**thumb 14px**（mvp-spec 没指定）：macOS HIG 推荐 thumb 直径 18-22px，14px 在 480px 宽窗口里比例舒服。

### 修改 6：TimePicker 用两个 number input

**改了什么**：两个 `<input type="number" min max value onChange>`，手动 pad 到 2 位。

**为什么不用 `<input type="time">`**：浏览器原生 time picker 在 macOS WebView 上样式难看，且和自定义 vibrancy 风格不搭。手动两个 input + clamp 是 06 阶段 MVP 简洁方案。

**为什么不做 dropdown picker**（滚动选择小时/分钟）：MVP 阶段 range 只有 0-23 / 0-59，键盘直接输够用。07 阶段可考虑 native popover picker。

### 修改 7：ConfirmDialog 用 position:fixed + 半透明遮罩

**改了什么**：fixed inset 0 遮罩（`rgba(0,0,0,0.35)` + backdrop-blur），center 对话框。
**为什么**：自己实现弹窗（不依赖浏览器 confirm / window.prompt）—— 这些是阻塞的、原生样式的，跟 macOS 原生 alert 一样丑。
**spring 进出**：AnimatePresence + 卡片 scale + opacity 过渡。

### 修改 8：capabilities 加 'settings' 窗口

**改了什么**：`"windows": ["main", "popover", "widget", "settings"]`
**为什么**：Tauri 2 capability 是**显式** deny-by-default。新窗口不加入 → 任何 invoke / event 都被拒。

## 关键 API 选型（备忘）

| 选型 | 理由 |
|---|---|
| `lib/tauri.ts` re-export `getCurrentWindow` | DAO / windows 组件不直接 import `@tauri-apps/*`（封装） |
| 乐观更新 + refresh 回滚 | onChange 立即响应 + 失败恢复 |
| `app.emit('settings-changed', (&key, &value))` | tray 数字 / widget 数字依赖 daily_goal_ml，settings 改后 emit 触发 refresh |
| `app.emit('open-settings', ())` | tray menu → settings 窗口（跨模块解耦） |
| 滑块自定义 mousedown | 浏览器原生 range 样式难定制（macOS 系统样式） |
| 浏览器 `confirm` 自己实现 ConfirmDialog | 原生阻塞 + 系统样式丑 |
| 拖动用 `useRef` + 状态机（dragging） | 不依赖 framer-motion 的 drag（边界控制更稳） |
| Slider thumb 14px / 滑轨 4px | macOS HIG 推荐比例 |

## 验证

```
=== Tauri 启动日志（关键） ===
Triggered `applicationDidFinishLaunching`  ← Tauri 启动
Creating new window  (4 次)                  ← main + popover + widget + settings
Completed `applicationDidFinishLaunching`
windowDidBecomeKey                          ← widget 拿到焦点
```

Vite HMR reload 后无新错误（修 getCurrentWindow import 后）。

## 用户手动验证

应用启动后（task `be02qwj6h` 在跑）：

### 验证 1：菜单栏打开设置
- 左键菜单栏图标 → popover 弹出
- 关闭 popover（点外部）
- 右键菜单栏图标 → 弹菜单 → 看到 "设置…" 已**不再灰色**
- 点 "设置…" → 设置窗口弹出，**居中**显示（480×560）

### 验证 2：设置项实时保存
- 改 "每日目标" 滑块 2000 → 2500 → DB 立即写（sqlite3 验证）
  ```bash
  sqlite3 ~/Library/Application\ Support/app.hydropace.desktop/water.db "SELECT * FROM settings WHERE key='daily_goal_ml'"
  # 应该显示 2500
  ```
- 改 "中杯" 300 → 350 → DB 立即写
- 改 "工作开始" 09:00 → 10:00 → DB 立即写
- **关键**：开 popover → 看到 "中杯 350" 文字（说明 popover 订阅了 settings-changed event，自动刷新）

### 验证 3：Toggle
- "启用提醒" toggle 关 → DB `reminder_enabled` 变 "false"
- "周末也提醒" toggle 关 → DB `weekend_enabled` 变 "false"
- 关 "显示桌面浮窗" → 桌面浮窗**不消失**（06 阶段 MVP 不实现 set_widget_visible 联动；07 阶段）

### 验证 4：清空确认弹窗
- 点 "清空今日" → 弹出 ConfirmDialog（半透明遮罩 + 卡片 spring 进入）
- 点 "取消" → 弹窗消失，记录保留
- 点 "清空今日" → 弹窗 → 点 "清空" → DB 今日 records 全删
- 验证：
  ```bash
  sqlite3 ~/Library/Application\ Support/app.hydropace.desktop/water.db "SELECT COUNT(*) FROM records WHERE timestamp >= (strftime('%s', 'now', 'start of day') * 1000)"
  # 应该 0
  ```
- 同样测 "清空全部"

### 验证 5：失焦自动隐藏
- 设置窗口打开后 → 点其他窗口 / 桌面 → 设置窗口自动隐藏

## 待办

- [x] 06 settings 窗口 + 13 个设置项 + 实时保存 + 跨窗口同步
- [x] 4 个窗口都创建
- [ ] 用户手动验证 5 个场景
- [ ] 07 阶段：set_widget_visible 联动（关掉 toggle 时 widget 真的隐藏）+ 数字键盘导航 + macOS 原生 time picker

## MVP 完整度（01-06 全部完成）

| 阶段 | 状态 | 文件数 |
|---|---|---|
| 01 骨架 | ✅ | 16 |
| 02 菜单栏图标 | ✅ | +3 Rust |
| 03 数据库 + commands | ✅ | +7 (3 Rust + 4 前端) |
| 04 Popover + Widget | ✅ | +11 (2 Rust + 9 前端) |
| 05 智能提醒 | ✅ | +4 Rust + 1 前端 |
| 06 设置窗口 | ✅ | +1 Rust + 8 前端 + 1 capability |
| **总计** | ✅ | **~50 文件** |
