# Hydropace 代码瘦身发现

## 待填充
- 需求文档核心价值：低摩擦记录喝水、菜单栏/桌面浮窗可见、60-90 分钟低频智能提醒、不做强提醒和复杂账号云同步。
- README 与 mvp-spec 存在轻微漂移：README 说“7 天后才解锁趋势反馈”，当前代码已实现 7 天趋势；mvp-spec 把桌面浮窗、popover、设置、提醒列为 MVP 核心。
- `docs/ai-collaboration/*` 多数是课程协作记录，很多内容是历史阶段说明，不应作为当前运行时设计的唯一依据，也不建议删除。
- 当前手写业务代码约 4k 行；Tauri 生成 schema 约 5k 行，不属于可瘦身对象。
- 重点大文件：`src/windows/SettingsRoot.tsx` 417 行、`src-tauri/src/reminder.rs` 345 行、`src-tauri/src/commands.rs` 285 行、`native_notify.rs/.m` 合计约 375 行。
- 通知原生桥代码量偏大，但刚用于解决真实 macOS 前台通知/action 问题，不能简单视为无用代码。
- 前端依赖 `zustand` 未被源码引用；`@tauri-apps/plugin-notification` 前端包也未被源码引用。Rust 端 `tauri-plugin-notification` 仍被 `notification.rs` 用作 fallback。
- Cargo 依赖 `anyhow` 未被源码引用；`tokio` 当前只直接使用 `tokio::time::sleep`，`features = ["full"]` 可能过重。
- `src/db/widget.ts` 与 `src/hooks/useWindowDrag.ts` 未被任何运行时代码引用。
- `get_widget_pos` / `save_widget_pos` / `set_widget_visible` 这组三个 Tauri command 只剩 wrapper 和测试 mock 引用；真实 widget 位置/显隐已由 Rust `widget.rs` 直接处理。
- 已实施第一批低风险瘦身：删除旧 widget 前端 DAO/drag hook、删除旧 widget commands、移除 `zustand` 与前端 notification plugin、移除 `tauri-plugin-log`、移除直接 `anyhow` 依赖、将 `tokio` feature 从 `full` 收窄到 `time`。
- `cargo clippy` 无法运行：本机 stable toolchain 未安装 `cargo-clippy` 组件。
