# 03 数据层（Database + Commands）

## 提示词

> 你是 Tauri 2 + Rust + React 专家。基于 01-02 骨架，实现数据层。
>
> 文件：
> - src-tauri/src/db.rs（启动执行 schema + 连接管理）
> - src-tauri/src/commands.rs（#[tauri::command]）
> - src-tauri/src/lib.rs（注册 commands + 启动 db）
> - src/lib/tauri.ts（前端 typed invoke wrapper）
> - src/db/records.ts
> - src/db/settings.ts
> - src/db/widget.ts
>
> 目标：
> 1. 应用启动 → db.rs 执行 schema.sql 建表 + INSERT OR IGNORE 默认设置
> 2. 前端能 invoke('add_record', { amount: 300, source: 'click-medium' }) 插入记录
> 3. 前端能 invoke('get_today_total') 拿到今日总量
> 4. add_record 后 emit('today-changed') → tray::set_tray_count 替换硬编码 0
> 5. 前端订阅 'today-changed' → React 状态同步
>
> Commands 列表（9 个，省略号）：
> - add_record(amount, source) -> i64
> - get_today_total() -> i32
> - get_last_record() -> Option<Record>
> - undo_last()
> - get_settings() -> HashMap
> - set_setting(key, value)
> - get_widget_pos() -> (i32, i32)
> - save_widget_pos(x, y)
> - set_widget_visible(b)
>
> 关键约束：
> - Mutex<Connection> 单例
> - thiserror + anyhow 错误处理
> - 前端 typed invoke wrapper 签名集中到 src/lib/tauri.ts
> - 默认值 INSERT OR IGNORE 在 Rust 端做
> - emit 单一事件 'today-changed'（payload: {}）

## AI 输出

6 个新文件 + 3 个改：

新文件：
- [src-tauri/src/db.rs](../../src-tauri/src/db.rs)
- [src-tauri/src/commands.rs](../../src-tauri/src/commands.rs)
- [src/lib/tauri.ts](../../src/lib/tauri.ts)
- [src/db/records.ts](../../src/db/records.ts)
- [src/db/settings.ts](../../src/db/settings.ts)
- [src/db/widget.ts](../../src/db/widget.ts)

改：
- [src-tauri/Cargo.toml](../../src-tauri/Cargo.toml)（加 rusqlite）
- [src-tauri/src/lib.rs](../../src-tauri/src/lib.rs)（注册 db state + 9 commands + 订阅 today-changed + refresh_tray_from_db）
- [src/main.tsx](../../src/main.tsx)（临时 dev UI：3 杯 + undo + 日志 + onTodayChanged 订阅）

## 我的修改

### 修改 1：DbError 加手写 `impl Serialize`（Tauri 2 IpcResponse 要求）

**改了什么**：
```rust
impl Serialize for DbError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}
```

**为什么改**：Tauri 2 的 `#[tauri::command]` 要求 `Result<T, E>: IpcResponse`，而 `IpcResponse` 对 `E` 的约束是 `Serialize`。`thiserror::Error` 派生只实现 `std::error::Error` + `Display`，**不**派生 Serialize。需要手写。

**取舍**：序列化成 Display 字符串（"sqlite error: database is locked"），前端 invoke 失败时 `e.message === "..."`。结构化信息（哪一类错）丢失——MVP 阶段够用。04 阶段如果要细分（区分 sql 错 / 设置错 / widget 错），可以加 `#[serde(tag = "type")]` 给每种变体打 tag。

**AI 漏了吗**：AI 用了 `#[derive(Error, Debug)]` 没加 Serialize，cargo build 11 个错全报 "blocking_kind trait bounds not satisfied"。

### 修改 2：lib.rs 加 `use tauri::Listener;`

**改了什么**：
```rust
use tauri::{Listener, Manager};
```

**为什么改**：`app.listen("today-changed", handler)` 的 `listen` 方法在 Tauri 2 的 `Listener` trait，不是 `Manager` trait。`Manager` 提供 `state` / `manage` / `path` / `try_state`，但**不**提供 `listen` / `once`。

Tauri 2 的 trait 拆分：
- `Manager` —— state / path / manage
- `Listener` —— listen / once
- `Emitter` —— emit / emit_to

**AI 漏了吗**：AI 只 use 了 Manager，编译报 "no method named `listen` found for mutable reference `&mut tauri::App`"。

### 修改 3：commands.rs 末尾删 `_DbErrorReExport` 废代码

**改了什么**：删除 `pub use DbError as _DbErrorReExport;` 这一行。

**为什么改**：AI 写这行的本意大概是"让 lib.rs 引用 DbError 方便"，但 DbError 已经是 `pub` 枚举（定义在 `db.rs`），lib.rs 用 `db::DbError` 就能访问。`pub use ... as ...` 这种 re-export 在 DbError 已经 pub 的情况下是冗余，且命名奇怪，编译报 "DbError is private, and cannot be re-exported"。

**教训**：不要为了"看着对称"加 re-export——只在外部 crate 跨 boundary 暴露时才用。

### 修改 4：db.rs 删 `AppDataDir` 变体

**改了什么**：`DbError::AppDataDir` 变体删了。

**为什么改**：lib.rs 里 `app.path().app_data_dir()` 返回 `tauri::Error`（不是 DbError），我手动 `map_err` 转 `std::io::Error` 再到 DbError。`AppDataDir` 变体从来没被构造，rustc 警告 "variant `AppDataDir` is never constructed"。

**取舍**：保留 `AppDataDir` 变体的代价是 1 个 dead code 警告；删除更干净。后续如果要从 DbError 区分 app_data_dir 失败，再加回来。

### 修改 5：`refresh_tray_from_db` 函数放在 lib.rs（不在 tray.rs）

**改了什么**：
```rust
// lib.rs
fn refresh_tray_from_db<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    let state = app.state::<db::DbState>();
    let total = commands::get_today_total(state) ...;
    let goal: i32 = 2000;
    let pct = ((total as f64 / goal as f64) * 100.0) as u32;
    tray::set_tray_count(app, pct.min(100));
}
```

**为什么放 lib.rs 不放 tray.rs**：
- tray.rs 不知道 DbState 类型（要 `use crate::db::DbState`）
- tray.rs 不知道 commands（要 `use crate::commands`）
- 耦合方向：tray.rs 是底层 UI 工具，db/commands 是数据层——让数据层主动驱动 UI 比让 UI 主动连数据层清晰
- 未来如果加 widget 窗口、popover 窗口，refresh_tray_from_db 在 lib.rs 一处调用就够

**代价**：lib.rs 现在依赖 commands + tray + db 三个模块。模块依赖图：
```
lib.rs
├── tray.rs
├── commands.rs
│   └── db.rs
└── db.rs
```

不循环。OK。

### 修改 6：dev 调试 UI 在 main.tsx（不是 popover）

**改了什么**：03 阶段没 popover 窗口（04 阶段才建），但要验证"add_record → today-changed → tray 数字联动"链路。在 main.tsx 写一个临时 dev 面板：3 个加水按钮 + undo + 日志 + onTodayChanged 订阅。

**为什么**：3 阶段的核心验证目标（你 review 重点第 4 条）需要 GUI 交互触发。临时 dev UI 是最小代价。

**04 阶段**：把 main.tsx 改回极简占位，UI 移到 popover 窗口（vibrancy + 圆环 + spring 动画）。

### 修改 7：package.json `dev` script 不变

**保持原状**：`npm run dev` 只起 vite，tauri:dev 调 npm run dev 起前端 + 调 cargo run 起后端。03 阶段不需要拆。

## 验证

```
=== DB 文件存在 ===
-rw-r--r--  4096 water.db
-rw-r--r-- 32768 water.db-shm    ← WAL shared memory
-rw-r--r-- 53592 water.db-wal     ← WAL log

=== schema 内容 ===
CREATE TABLE records (...)
CREATE TABLE settings (...)
CREATE TABLE widget_state (...)
CREATE INDEX idx_records_timestamp ON records(timestamp);

=== settings 默认值（12 条全在） ===
cup_large_ml|500
cup_medium_ml|300
cup_small_ml|150
daily_goal_ml|2000
reminder_enabled|true
reminder_max_interval_min|90
reminder_min_interval_min|60
snooze_until|0
weekend_enabled|true
widget_visible|true
work_end|18:00
work_start|09:00

=== widget_state ===
1|100|100|1

=== records 表（空）===
（待用户点击 dev UI 按钮后才有数据）
```

**结论**：
- ✅ DB 文件创建在 macOS 标准位置 `~/Library/Application Support/com.daishixiong.l01water/water.db`
- ✅ WAL 模式生效（`.db-wal` / `.db-shm` 文件存在）
- ✅ 3 张表 + 索引建好
- ✅ 12 条默认设置全部写入
- ✅ widget_state 默认行 (1, 100, 100, 1)

## 用户手动验证（GUI 交互）

打开应用后（task br9ki3s89 在跑）：

1. 看到主窗口（dev panel）：3 个加水按钮 + 撤销 + 日志
2. 点 "中杯 300" → 日志显示 `add 300ml (click-medium) → id=1` + `event: today-changed`
3. **macOS 菜单栏右上角**应自动从 "0%" 变成 "15%"（300 / 2000 = 15%）
4. 鼠标悬停 → tooltip 变成 "L01 Water — 今日 300 / 2000 ml（15%）"
5. 再点 "中杯 300" → 30% / 45% / ... / 100% 直至封顶
6. 点 "撤销" → 数字回退
7. 在终端 `sqlite3 ~/Library/Application Support/com.daishixiong.l01water/water.db "SELECT * FROM records"` 看 records 表

## 关键 API 选型（备忘）

| 选型 | 理由 |
|---|---|
| `rusqlite = "0.32"` + `bundled` | 静态链接 SQLite，不依赖系统库；避开与 `tauri-plugin-sql` 的 sqlx 重复 |
| `Mutex<Connection>` 单例 | SQLite 单文件 + 进程内单连接，避免并发写冲突；MVP 单线程够用 |
| `include_str!("../sql/schema.sql")` | 编译期嵌入 schema，schema 与代码同步发布 |
| `PRAGMA journal_mode=WAL` | 读写并发更友好（虽然 MVP 单写，习惯好） |
| `#[serde(rename_all = "camelCase")]` | Rust snake_case 字段 → wire camelCase，前端用驼峰 |
| 手写 `impl Serialize for DbError` | Tauri 2 IpcResponse 要求 E: Serialize |
| `app.listen("today-changed", ...)` in `Listener` trait | Tauri 2 拆分 Manager / Listener / Emitter 三个 trait |
| `app.emit("today-changed", ())` 单一事件 | 简化订阅者逻辑（所有"今日总量变化"统一发一个事件） |

## 待办

- [x] 03 数据层 6 个新文件 + 3 个改
- [x] cargo build 干净（1 个 warning：hide_popover 预留，04 阶段用）
- [x] tauri:dev 启动成功（task br9ki3s89 running）
- [x] DB + schema + WAL + 默认值全部验证
- [ ] 用户手动验证：点 dev UI 按钮 → tray 数字 + tooltip 更新
- [ ] 04 阶段：建 popover 窗口 + widget 窗口 + 用真 UI 替换 dev panel
