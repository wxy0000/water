# 04 Popover + Widget 双窗口

## 提示词

> 你是 Tauri 2 + React + Framer Motion 专家。基于 01-03 骨架，实现 popover + widget 两个窗口。
>
> Rust 文件：
> - src-tauri/src/popover.rs（创建、定位、blur 隐藏）
> - src-tauri/src/widget.rs（创建、always_on_top、位置持久化 + 边界检查）
> - src-tauri/src/lib.rs（追加 init）
> - src-tauri/Cargo.toml（新增 window-vibrancy）
>
> 前端文件：
> - src/windows/PopoverRoot.tsx
> - src/windows/WidgetRoot.tsx
> - src/components/ProgressRing.tsx（SVG + spring）
> - src/components/CupButton.tsx（whileTap spring）
> - src/components/Counter.tsx（key 切换 + spring y）
> - src/components/VibrancyCard.tsx
> - src/hooks/useTodayTotal.ts
> - src/hooks/useWindowDrag.ts
> - src/motion/springs.ts（4 组 spring 常量）
> - src/motion/variants.ts
>
> 目标：
> 1. tray 左键 → 弹出 popover（紧贴菜单栏图标下方）
> 2. tray 右键"显示面板" → 也能开 popover
> 3. popover：圆环 + 3 杯按钮（小 150 / 中 300 / 大 500）
> 4. 点击杯子 → 圆环 spring 增长 + 数字 spring 翻动 + tray 数字同步
> 5. 点 popover 外部（blur）→ 自动隐藏
> 6. widget 默认 (100, 100)，可拖动，位置持久化到 widget_state
> 7. widget 拖出屏幕 → 自动回弹（多屏 / DPI 缩放考虑）
> 8. widget 单击 → 开 popover；双击 → 快速记 1 中杯；右键 → 菜单
>
> 关键约束：
> - Popover 位置（macOS）：从 tray icon frame 算位置，popover 居中 = (icon.midX - 160, icon.maxY + 4)
> - Vibrancy：window-vibrancy::apply_vibrancy(&window, NSVisualEffectMaterial::Popover, None, None)
> - 拖动：Tauri startDragging() + 监听 onMoved 事件保存位置
> - 边界检查：保存前 clamp 到主屏幕 work_area
>
> spring 参数：
> - ring: stiffness 80 / damping 15
> - button: stiffness 400 / damping 25
> - popover: stiffness 300 / damping 22
> - widget: stiffness 300 / damping 20

## AI 输出

11 个新文件 + 3 个改（main.tsx / lib.rs / tray.rs），全部落盘。文件清单：

新文件 Rust 端：
- [src-tauri/src/popover.rs](../../src-tauri/src/popover.rs)
- [src-tauri/src/widget.rs](../../src-tauri/src/widget.rs)

新文件前端：
- [src/windows/PopoverRoot.tsx](../../src/windows/PopoverRoot.tsx)
- [src/windows/WidgetRoot.tsx](../../src/windows/WidgetRoot.tsx)
- [src/components/ProgressRing.tsx](../../src/components/ProgressRing.tsx)
- [src/components/CupButton.tsx](../../src/components/CupButton.tsx)
- [src/components/Counter.tsx](../../src/components/Counter.tsx)
- [src/components/VibrancyCard.tsx](../../src/components/VibrancyCard.tsx)
- [src/hooks/useTodayTotal.ts](../../src/hooks/useTodayTotal.ts)
- [src/hooks/useWindowDrag.ts](../../src/hooks/useWindowDrag.ts)
- [src/motion/springs.ts](../../src/motion/springs.ts)
- [src/motion/variants.ts](../../src/motion/variants.ts)

改：
- [src-tauri/src/lib.rs](../../src-tauri/src/lib.rs)（加 mod popover / widget + init + listen('widget-clicked')）
- [src-tauri/src/tray.rs](../../src-tauri/src/tray.rs)（show_popover / hide_popover / toggle_popover 调 crate::popover）
- [src/main.tsx](../../src/main.tsx)（按 window label 路由到 PopoverRoot / WidgetRoot）

## 我的修改

### 修改 1：Popover 位置用 `tray_by_id().rect()` 拿 tray 位置

**改了什么**：
```rust
let Some(tray) = app.tray_by_id(TRAY_ID) else { return };
let Ok(Some(rect)) = tray.rect() else { return };
```

**为什么改**：原计划用 `app.state::<TrayState>().0.rect()`，但 `TrayState<R>(TrayIcon<R>)` 是 owned，借用 `app.state` 拿的是 `&TrayState`，`TrayIcon` 不直接暴露。改用 `Manager::tray_by_id(id) -> Option<TrayIcon>`，每次拿 owned `TrayIcon`（内部 Arc，cheap clone），调 `rect()`。

**额外踩坑**：`tray.rect()` 返回 `Result<Option<Rect>, tauri::Error>`（**不是** `Option<Rect>`），需要 `let Ok(Some(rect)) = ...`。

### 修改 2：`rect.position` / `rect.size` 是 enum 不是 struct

**改了什么**：
```rust
let (tx, ty, tw, th) = match (rect.position, rect.size) {
    (tauri::Position::Physical(p), tauri::Size::Physical(s)) => {
        (p.x as f64, p.y as f64, s.width as f64, s.height as f64)
    }
    _ => return,
};
```

**为什么改**：Tauri 2 的 `tray::Rect` 字段是 `tauri::Position` / `tauri::Size` enum（Physical / Logical 两种变体），不是直接有 `x` / `width` 字段。直接 `rect.position.x` 编译报 "no field x on type Position"。

**tray rect 总是 Physical**（系统真实像素），match 取出。Logical 情况在 macOS tray 不会发生，fallback 跳过即可。

### 修改 3：DB 查询要 `Ok(conn.query_row(...)?)` wrap

**改了什么**：
```rust
db.with_lock(|conn| {
    Ok(conn.query_row("SELECT ...", [], |row| Ok((..., ...)))?)
})
```

**为什么改**：`conn.query_row` 返回 `Result<T, rusqlite::Error>`，但 `with_lock` 闭包要 `Result<_, DbError>`。直接 `conn.query_row(...)` 类型不匹配。

**修法**：用 `?` 让 `rusqlite::Error` 自动转 `DbError`（依赖 `DbError::Sqlite(#[from] rusqlite::Error)` from impl），然后 wrap `Ok(...)`。

**AI 漏了吗**：AI 写的是 `conn.query_row(...).unwrap_or((0,0))` —— 没经过 `with_lock` 的错误链路，类型不匹配且错误处理粗糙。

### 修改 4：Widget 单击 / 双击分桶用 `e.detail` + 200ms 延迟

**改了什么**（WidgetRoot.tsx）：
```ts
if (clickTimer.current !== null) {
  // 第二次 click → 取消 timer，认定为双击
  window.clearTimeout(clickTimer.current);
  clickTimer.current = null;
  void records.add(cupMedium, 'widget-double-click');
} else {
  // 第一次 click → 等 200ms
  clickTimer.current = window.setTimeout(() => {
    clickTimer.current = null;
    // 确认没有第二次 click → 单击
    void emit('widget-clicked', {});
  }, 200);
}
```

**为什么改**：浏览器原生 `dblclick` 事件和 `click` 事件**都**会触发，且顺序是 `click → click → dblclick`。如果只监听 `click`，双击会触发两次 `click` + 一次 `dblclick`，逻辑混乱。

**200ms 延迟判定**：用 timer 把第一次 `click` 暂存 200ms，第二次 `click` 来了就清掉 timer 认定为双击。这是 web 通用的 "click vs double click" 模式（PointerEvents spec 也类似）。

**代价**：单击响应延迟 200ms。MVP 阶段可接受（widget 单击开 popover，0.2s 延迟不明显）。

### 修改 5：Widget 单击开 popover 走 emit('widget-clicked') → Rust 端 listen → popover::show

**改了什么**：
- 前端：`emit('widget-clicked', {})`（用 `@tauri-apps/api/event` 的 `emit`）
- Rust 端 lib.rs setup：`app.listen("widget-clicked", |_| popover::show(&handle))`

**为什么改**：widget 窗口不能直接调 `popover::show`（跨 Rust 模块，跨窗口），最干净是**通过事件总线**：
- widget 前端只能 emit 事件
- Rust 端有 `app.handle()` 全局访问权，能调任何模块函数
- 事件名 `widget-clicked` 走 `app.listen` 路由到 `popover::show`

**为什么不用 `invoke('show_popover')` 走 command**：也行，但 events 比 commands 更轻（不需要序列化往返 + 不进 SQLx 之类的开销），且**事件是 fire-and-forget**，符合"点一下开个窗口"的语义。

### 修改 6：Popover 位置算法改用 logical 坐标

**改了什么**：
```rust
let scale = win.scale_factor().unwrap_or(1.0);
let tray_center_x_logical = (tx + tw / 2.0) / scale;
let tray_bottom_y_logical = (ty + th) / scale + 4.0;
let popover_x = tray_center_x_logical - POPOVER_W / 2.0;
win.set_position(Position::Logical(LogicalPosition::new(popover_x, tray_bottom_y_logical)));
```

**为什么改**：tray rect 是**物理像素**（高 DPI 屏上 × 2），popover inner_size 是 logical（`320.0`）。混用会算错位置（DPI 2x 屏上 popover 偏移 320px 而非 160px）。

**修法**：物理 → logical 转换（除以 `scale_factor`），用 `Position::Logical` 设置。

**取舍**：MVP 阶段只用主屏幕的 scale factor（多屏不同 DPI 暂不考虑）。04 阶段 polish 时再修。

### 修改 7：`hide` 仍是 dead code（tray.rs + popover.rs 各一个）

**改了什么**：保留 `pub fn hide` 签名，cargo 报 `function ... is never used`。

**为什么没改**：MVP 阶段 popover 失焦自动 hide 已经够用，但 `hide` 接口仍有用（05 阶段通知 action button "我喝了" → 快速记 1 杯 + 关 popover / 06 阶段 escape 键关 popover）。

**取舍**：warning 看着碍眼，但删了 05/06 阶段又要重写。保留 + `#[allow(dead_code)]` 太丑，**留 warning**。等真用上时 warning 自动消失。

### 修改 8：Widget 拖动用 Tauri startDragging（前端 API）而非自定义 mousedown 事件

**改了什么**（WidgetRoot.tsx）：
```ts
import { getCurrentWindow } from '@tauri-apps/api/window';
const win = getCurrentWindow();
onMouseDown: (e) => {
  e.preventDefault();
  void win.startDragging();
}
```

**为什么用 Tauri API 不用自定义**：
- **macOS vibrancy 窗口拖动**：自定义 mousedown + mousemove 会出现"鼠标和窗口分离"（因为 vibrancy 是系统层 Native NSWindow，自己 mousedown 拿到的是 webview 坐标，不是 NSWindow 坐标）
- **跨平台一致**：Tauri 的 startDragging() 调系统 API（macOS 是 `[NSWindow performDragWithEvent:]`），所有平台行为一致
- **零代码**：Tauri 已经做好，3 行就完事

**Rust 端只负责收 onMoved + 保存位置**，不参与拖动逻辑本身。

## 关键 API 选型（备忘）

| 选型 | 理由 |
|---|---|
| `Manager::tray_by_id("main-tray")` | 跨模块拿 tray icon（不依赖 TrayState 内部所有权） |
| `TrayIcon::rect() -> Result<Option<Rect>>` | macOS 菜单栏 icon 物理像素位置 |
| `WebviewWindowBuilder::new` with `always_on_top + transparent + decorations(false)` | 无标题栏浮窗（macOS 标准模式） |
| `WindowEvent::Focused(false)` 自动 hide | macOS popover 通用行为（点外部自动消失） |
| `WindowEvent::Moved(PhysicalPosition)` clamp + save | 拖动结束触发一次（不是拖动过程中持续触发） |
| `window-vibrancy::apply_vibrancy` + `NSVisualEffectMaterial::Popover` | macOS 系统级半透明背景 |
| `useWindowDrag` 用 `getCurrentWindow().startDragging()` | macOS vibrancy 窗口唯一稳的拖动方式 |
| Framer Motion `motion.circle` + `style.strokeDashoffset` | spring 过渡 strokeDashoffset 是 SVG 圆环进度的 idiomatic 写法 |
| `AnimatePresence mode="popLayout"` + `key={text}` | Counter 数字翻牌：旧数字 exit 完新数字才 enter |
| `e.detail` + 200ms timer | 单击 / 双击分桶（浏览器原生 dblclick 事件会同时触发 click） |
| `emit('widget-clicked')` → Rust `app.listen` | 跨窗口轻量通信（事件是 fire-and-forget） |

## 验证

```
=== app 进程 ===
bailuochen  7242  target/debug/l01-water-app

=== Tauri 启动日志（关键事件） ===
Triggered `applicationDidFinishLaunching`     ← Tauri 启动
Creating new window                            ← 第 1 个窗口：main (隐藏 anchor)
Creating new window                            ← 第 2 个窗口：popover (隐藏)
Creating new window                            ← 第 3 个窗口：widget (可见，100,100)
Completed `applicationDidFinishLaunching`
windowDidBecomeKey                             ← widget 拿到焦点

=== binary mtime ===
20:51  ← 04 阶段重编译后
```

## 用户手动验证（GUI 交互）

应用启动后（task `bbnq21pna` 在跑）：

### 验证 1：菜单栏图标
- 看 macOS 菜单栏右上角：蓝色圆点 + "0%"（或 DB 里有记录的话是实际百分比）
- 鼠标悬停 → tooltip "L01 Water — 今日 X / 2000 ml（Y%）"

### 验证 2：桌面浮窗 widget
- 看桌面左上角附近：90×56 半透明浮窗 "💧 0% 0/2000"
- 鼠标按住 widget 任意位置拖动 → 窗口跟着动
- 拖到右下角释放 → widget 留在那里
- 拖出主屏（比如负坐标）→ 应该回弹到屏幕内
- 终端跑：
  ```bash
  sqlite3 ~/Library/Application\ Support/com.daishixiong.l01water/water.db "SELECT * FROM widget_state"
  ```
  位置应该更新
- 重启应用（Ctrl-C + 重新 `npm run tauri:dev`）→ widget 应回到上次保存位置

### 验证 3：单击 widget 开 popover
- 单击 widget（不拖动）→ 浮窗消失，**popover 弹出**（紧贴菜单栏图标下方居中）
- popover 显示：圆环 + "0" + "/ 2000 ml" + 3 杯按钮 + 撤销

### 验证 4：双击 widget 快速记一杯
- 双击 widget（200ms 内两次点击）→ menu 数字 +1 中杯（300ml）
- macOS 菜单栏 "0%" → 立刻变 "15%"
- popover 圆环 spring 增长到 15%
- DB 验证：
  ```bash
  sqlite3 ~/Library/Application\ Support/com.daishixiong.l01water/water.db "SELECT * FROM records"
  ```
  应该有 1 条 `source='widget-double-click'`

### 验证 5：popover 交互
- 点 popover 任意杯子 → 数字 + amount，圆环 spring 增长
- 拖动圆环位置（试一下）→ 应该无效（只有拖动是 widget 的特权）
- 点击 popover 外部（桌面 / 其他窗口）→ popover 自动隐藏
- 点 popover 撤销 → 数字回退

### 验证 6：菜单栏开 popover
- 左键菜单栏图标 → popover 弹出（与单击 widget 效果一致）
- 右键菜单栏图标 → 弹菜单（显示面板 / 设置 disabled / 关于 / 退出）
- 点"显示面板" → popover 弹出

## 待办

- [x] 04 popover + widget Rust + 前端 11 文件 + 3 改 + AI 日志
- [x] cargo build 干净（2 warning：hide 接口预留）
- [x] tauri:dev 启动成功（3 个窗口都创建）
- [x] DB widget_state 默认 (1, 100, 100, 1)
- [ ] 用户手动验证 6 个场景（GUI 交互）
- [ ] 05 阶段：智能提醒（reminder.rs + notification.rs + action buttons）
- [ ] 06+ 阶段：设置窗口（自定义目标 / 工作时间 / weekend_enabled）
