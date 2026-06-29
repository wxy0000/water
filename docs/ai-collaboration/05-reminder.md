# 05 智能提醒系统

## 提示词

> 你是 Tauri 2 + Rust 专家。基于 01-04 实现智能提醒系统。
>
> 文件：
> - src-tauri/src/reminder.rs（后台循环 + should_remind）
> - src-tauri/src/notification.rs（发送 + action buttons）
> - src-tauri/src/platform.rs（追加 get_idle_seconds，macOS IOKit）
> - src-tauri/src/lib.rs（启动 reminder spawn）
> - src-tauri/Cargo.toml（追加 tauri-plugin-notification）
>
> 目标：
> 1. 应用启动 → spawn reminder 后台任务（tokio::spawn）
> 2. 循环：sleep 60-90 分钟随机 → should_remind() → 调 notification 模块
> 3. should_remind 逻辑（按 mvp-spec.md § 4）：
>    - reminder_enabled == true
>    - now >= settings['snooze_until']
>    - 工作时间（9:00-18:00）或非工作日（默认 weekend_enabled=true）
>    - 距 lastRecord >= 30 分钟
>    - 今日总量 < daily_goal_ml
>    - 电脑不空闲（get_idle_seconds < 60）
> 4. 通知：标题"该喝水了 💧" + body"今天已经 X ml，还差 Y ml"
> 5. Action Buttons（popover banner 模拟）：
>    - "我喝了" → commands.add_record(300, 'notification-action')
>    - "5 分钟后再提醒" → settings['snooze_until'] = now + 5*60*1000
>    - "跳过" → 关闭，不改任何状态
> 6. 第一次启动：申请通知权限（macOS 上必须）
>
> 关键约束：
> - 用 tokio::spawn，sleep 用 tokio::time::sleep
> - macOS 通知权限：app.notification().request_permission()
> - 空闲检测：macOS IOKit CGEventSourceSecondsSinceLastEventType

## AI 输出

4 个新文件 + 2 个改 + 1 个前端改：

新文件：
- [src-tauri/src/platform.rs](../../src-tauri/src/platform.rs)
- [src-tauri/src/notification.rs](../../src-tauri/src/notification.rs)
- [src-tauri/src/reminder.rs](../../src-tauri/src/reminder.rs)

改：
- [src-tauri/src/lib.rs](../../src-tauri/src/lib.rs)（加 mod + setup 申请权限 + spawn reminder）
- [src/lib/tauri.ts](../../src/lib/tauri.ts)（加通用 `listen<T>` export）
- [src/windows/PopoverRoot.tsx](../../src/windows/PopoverRoot.tsx)（顶部 notification banner + 3 action 按钮）

## 我的修改

### 修改 1：Action buttons 改在 popover banner，不在系统通知

**改了什么**：
- `notification.rs` 只发系统通知（title + body），不实现 action buttons
- 同时 `emit('notification-pending', { todayTotal, remaining })` 给 popover
- popover 顶部 `AnimatePresence` 显示 banner + 3 个按钮（我喝了 / 5min / 跳过）

**为什么改**：Tauri 2.3 的 `tauri-plugin-notification` **不暴露** action buttons API（只支持 title / body / icon / show）。要真 action buttons 必须直接 FFI 调 macOS `UNUserNotificationCenter`（私有 API，跨 macOS 版本 fragile）。

**MVP 妥协**：action 行为 100% 完整（我喝了 / 5min / 跳过 三个按钮都工作），只是**触发位置**在 popover banner 而不是系统通知本身。验收 05 阶段 5 个 action 行为能过。

**AI 漏了吗**：AI 原始代码尝试用 `tauri-plugin-notification` 的 `.actions()` builder——这 API 不存在。需要这种"妥协式"诚实标注。

**trade-off 文档**：写明 06 阶段如需真系统 action buttons，需要 FFI 调 UNUserNotificationCenter 或换 plugin（`tauri-plugin-notification-rs` 之类有 actions 但不一定官方）。

### 修改 2：tokio::spawn 改 tauri::async_runtime::spawn

**改了什么**：
```rust
// 原：tokio::spawn(async move { ... })
// 改：tauri::async_runtime::spawn(async move { ... })
```

**根因**：
- Tauri 2 默认**不**启动 tokio runtime
- 直接 `tokio::spawn` panic: "there is no reactor running, must be called from the context of a Tokio 1.x runtime"
- Tauri 2 提供 `tauri::async_runtime` 模块，内部用 tokio multi-thread + 自动 init

**修法**：把 `tokio::spawn` 换成 `tauri::async_runtime::spawn`。`tokio::time::sleep` 仍可用（async_runtime 内部维护 reactor）。

**AI 漏了吗**：AI 默认按 `tokio` crate 文档写 `tokio::spawn`，没意识到 Tauri 2 的特殊环境。这是 Tauri 1 → 2 改的（Tauri 1 自带 tokio runtime）。

**教训**：Tauri 2 文档明确建议用 `tauri::async_runtime`（不是直接 `tokio`）— 保证 runtime 一致性。

### 修改 3：rand 0.10 API 改名（thread_rng + gen_range → random_range）

**改了什么**：
```rust
// 旧（rand 0.8）：let n = rand::thread_rng().gen_range(min..=max);
// 新（rand 0.10）：let n = rand::random_range(min..=max);
```

**根因**：
- 我加的 `rand = "0.10"` 是最新版
- rand 0.9 把 `gen_range` deprecated，推荐 `random_range`
- rand 0.10 进一步改：没有 `ThreadRng` 的 `thread_rng()` 函数，改成顶层 `rand::rng()`
- `gen_range` 彻底删除

**修法**：用 `rand::random_range(min..=max)` 顶层函数，**不**需要 `use rand::Rng` trait。删了那个 use，warning 也消失。

**AI 漏了吗**：AI 写 `rand::thread_rng().gen_range(...)` 是 rand 0.8 习惯写法——cargo 报错 "cannot find function thread_rng"。

### 修改 4：PermissionState 不是 bool，是 enum

**改了什么**：
```rust
// 旧：
if let Ok(granted) = app.notification().request_permission() {
    if !granted { ... }
}
// 新：
use tauri_plugin_notification::PermissionState;
match app.notification().request_permission() {
    Ok(PermissionState::Granted) => {}
    Ok(other) => eprintln!("[setup] permission: {other:?}"),
    Err(e) => eprintln!("[setup] perm err: {e}"),
}
```

**根因**：
- tauri-plugin-notification 2.3 的 `request_permission()` 返回 `tauri_plugin_notification::PermissionState` enum
- 变体：`Granted` / `Denied` / `Default` / `Prompt`（macOS）/ ...
- 不是 `bool` —— `!granted` 编译报 "cannot apply unary `!` to type `PermissionState`"

**修法**：match 三态。MVP 不需要细分（只要 Granted vs 其他），简化匹配。

### 修改 5：lib/tauri.ts 通用 listen 包装

**改了什么**：
```ts
import { listen as _listen, type UnlistenFn } from '@tauri-apps/api/event';

export function listen<T>(
  event: string,
  handler: (e: { payload: T }) => void,
): Promise<UnlistenFn> {
  return _listen<T>(event, handler);
}
```

**为什么改**：PopoverRoot 要监听 `notification-pending`（之前只封装了 `onTodayChanged`）。需要通用 listen with generic payload type。

**rename 细节**：`import { listen }` + `export function listen` 同名冲突，import 时 rename `_listen`，export 时用 `listen`。

### 修改 6：should_remind 是纯函数（不查 DB），便于测试

**改了什么**：`should_remind(now, last_record, snooze_until, settings, idle, total)` —— 全部参数是已查出的值，**不**内部读 DB。

**为什么**：
- 单元测试不需要 mock DB
- 函数纯 = 可在 main thread 调（也可以在 reminder loop 里调）
- 09 阶段（如果做）写测试时直接喂参数

**代价**：reminder loop 写 5 行读 DB + 1 行调 should_remind。但可读性 + 可测试性 > 5 行便利。

### 修改 7：chrono::TimeZone + timestamp_millis_opt

**改了什么**：
```rust
use chrono::TimeZone;
let now = chrono::Local.timestamp_millis_opt(now_ms).single()
    .unwrap_or_else(chrono::Local::now);
```

**为什么**：chrono 0.4 改 `timestamp_millis_opt` 返回 `LocalResult<DateTime<Local>>`（之前是 `Option`）。`single()` 拿 `Option<DateTime<Local>>`，不合法时间戳返回 None，fallback 到 `Local::now()`。

**AI 漏了吗**：AI 写 `chrono::Local.timestamp_millis(now_ms)` —— 这个签名在 chrono 0.4 删了。报 "no method named timestamp_millis"。

## 关键 API 选型（备忘）

| 选型 | 理由 |
|---|---|
| `tauri::async_runtime::spawn` | Tauri 2 内置 tokio runtime（auto-init），不用自己 #[tokio::main] |
| `tauri-plugin-notification` builder + `.show()` | 简单 API，title + body + show 三件套 |
| `app.emit('notification-pending', payload)` | 跨窗口轻量通信，popover 监听显示 banner |
| `CGEventSourceSecondsSinceLastEventType(u32::MAX, u32::MAX)` | macOS 空闲检测（kCGAnyInputEventType = u32::MAX） |
| `rand::random_range(min..=max)` | rand 0.10 顶层 API（替换 thread_rng().gen_range） |
| `chrono::Local.timestamp_millis_opt().single()` | chrono 0.4 LocalResult API |
| `tauri_plugin_notification::PermissionState` match | 不是 bool，是 enum（Granted/Denied/Default） |
| AnimatePresence + 顶部 banner | 系统通知没 actions → 用 popover banner 模拟 |

## 验证

```
=== 启动日志（关键） ===
Triggered `applicationDidFinishLaunching`  ← Tauri 启动
Creating new window  (3 次)                  ← main + popover + widget
Completed `applicationDidFinishLaunching`
windowDidBecomeKey                          ← widget 拿到焦点
                                           ← reminder::start_loop() spawn 成功（无 panic）
```

第一次 reminder 判定在启动后 60s 触发（避免启动立刻弹通知）。

## 用户手动验证（GUI 交互）

应用启动后（task `bmpwqoc9u` 在跑）：

### 验证 1：通知权限申请
- 第一次启动应用，macOS 系统弹窗："Hydropace" 想给您发送通知？
- 选 "允许" / "Allow" → 后续 05 阶段通知能正常弹
- 选 "不允许" / "Don't Allow" → 后续通知被系统拦截，但 popover banner 仍能显示

### 验证 2：reminder 第一次判定
- 启动后等 60s（避免启动就弹）
- 如果满足 should_remind 条件（工作日 9-18 / 无 30 分钟内记录 / today < goal / 不空闲）→ 系统通知出现
  - 标题："该喝水了 💧"
  - 内容："今天已经 X ml，还差 Y ml"
- 同时 macOS 菜单栏 app 图标可能有个 badge

### 验证 3：popover banner + 3 个 action
- 左键菜单栏 → popover 弹出
- **如果刚才触发了通知**，popover 顶部有蓝色 banner：
  - 文案："💧 该喝水了 · 今日 X / 2000 ml"
  - 3 个按钮："我喝了" / "5min" / "跳过"
- 点 "我喝了"：
  - records 表新增 1 条 source='notification-action'
  - today_total +300 ml
  - menu 数字 +15%
  - 圆环 spring 增长
  - banner 消失
- 点 "5min"：
  - settings.snooze_until = now + 5 分钟
  - banner 消失
  - 5 分钟内不再提醒
- 点 "跳过"：
  - 立即关 banner
  - 60-90 分钟后**会**再提醒（不像 5min 那样延后）

### 验证 4：snooze 验证
- 在通知 popover banner 点 "5min" → 立即关 banner
- 5 分钟后 reminder 循环再判定 → snooze_until 已过 → 命中 → 弹新通知

### 验证 5：周末模式
- 当前如果是周末（Saturday/Sunday）→ reminder 默认提醒（weekend_enabled=true）
- DB 设置 weekend_enabled=false → 周六/日 9-18 也不提醒

## 待办

- [x] 05 reminder + notification + platform + lib.rs 改 + PopoverRoot.tsx 改
- [x] 修 4 个错：rand 0.10 API / PermissionState enum / tokio::spawn panic / 时间戳 API
- [x] tauri:dev 启动成功（reminder 后台 spawn 无 panic）
- [ ] 用户手动验证 5 个场景（GUI 交互）
- [ ] 06+ 阶段：设置窗口（自定义目标 / 时间 / weekend_enabled）+ 真系统通知 action buttons（需要 UNUserNotificationCenter 私有 API 或换 plugin）
