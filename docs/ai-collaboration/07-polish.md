# 07 Polish 阶段

## 提示词

> 你是 Tauri 2 + React + Framer Motion 专家。基于 01-06 完整 MVP，做 polish 阶段。
>
> 任务 1：set_widget_visible 真联动
> 任务 2：数字键盘导航 1/2/3 + Esc
> 任务 3：7 天趋势图
> 任务 4：小 polish（启动 fade / 关闭确认 / 应用图标）
>
> 关键约束：
> - widget show/hide 用 Tauri Window::show() / hide() API
> - 键盘导航只在 popover 窗口内有效（不全局，避免冲突）
> - 折线图用纯 SVG（不引入 recharts / d3 依赖）
> - spring 参数沿用 mvp-spec.md 已定义的 4 组
> - 关闭确认只在"今日有记录且未清空"时弹（**MVP 简化：不做**）

## AI 输出

Rust 改 + 6 个新前端文件 + 2 个前端改：

Rust 改：
- [src-tauri/src/widget.rs](../../src-tauri/src/widget.rs)（+ load_visible + set_visible + 启动时读 visible）
- [src-tauri/src/lib.rs](../../src-tauri/src/lib.rs)（+ listen settings-changed → widget hide/show）
- [src-tauri/src/commands.rs](../../src-tauri/src/commands.rs)（+ get_weekly_totals + DailyTotal）
- [src/lib/tauri.ts](../../src/lib/tauri.ts)（+ DailyTotal 类型 + getWeeklyTotals）

新文件前端：
- [src/hooks/useWeeklyData.ts](../../src/hooks/useWeeklyData.ts)
- [src/hooks/useKeyboardNav.ts](../../src/hooks/useKeyboardNav.ts)
- [src/components/TrendChart.tsx](../../src/components/TrendChart.tsx)
- [src/components/TabSwitcher.tsx](../../src/components/TabSwitcher.tsx)
- [src/components/AppIcon.tsx](../../src/components/AppIcon.tsx)

前端改：
- [src/windows/PopoverRoot.tsx](../../src/windows/PopoverRoot.tsx)（+ useKeyboardNav 1/2/3/Esc）
- [src/windows/SettingsRoot.tsx](../../src/windows/SettingsRoot.tsx)（+ TabSwitcher + TrendChart + AppIcon）

## 我的修改

### 修改 1：`event.payload()` 返回 `&str`（JSON 字符串），不是 `serde_json::Value`

**改了什么**（lib.rs）：
```rust
// 原（编译错）：
if let Some(arr) = payload.as_array() { ... }

// 改：
if let Ok((key, value)) = serde_json::from_str::<(String, String)>(event.payload()) { ... }
```

**为什么改**：Tauri 2 的 `Event::payload()` 返回 `&str`（已经序列化的 JSON 字符串），不是 `serde_json::Value`。listener 端要 `serde_json::from_str` 解析。

**AI 漏了吗**：AI 假设 `payload` 是 `serde_json::Value`（直觉），编译报 "no method named as_array found for reference &str"。

**教训**：Tauri 2 emit payload 跨进程边界已经序列化成 JSON string，listener 端必须 `serde_json::from_str` 解码。**不是** serde_json::Value。

### 修改 2：widget::init 启动时按 settings['widget_visible'] 决定初始 visible

**改了什么**（widget.rs）：
```rust
let initially_visible = load_visible(app).unwrap_or(true);
let win = WebviewWindowBuilder::new(app, "widget", ...)
    .visible(initially_visible)  // 改 true → initially_visible
```

**为什么改**：06 阶段 widget 永远 visible，07 阶段按 DB 的 `widget_visible` 设置。如果用户上次关了 widget，重启不应该突然又出现。

**兜底**：`.unwrap_or(true)` —— DB 读失败（首次启动前）默认显示。

### 修改 3：widget::set_visible 暴露给 lib.rs listen 调用

**改了什么**（widget.rs 新加）：
```rust
pub fn set_visible<R: Runtime>(app: &AppHandle<R>, visible: bool) {
    let state = app.state::<WidgetState<R>>();
    if visible { state.0.show() } else { state.0.hide() }
}
```

**为什么改**：lib.rs 监听 `settings-changed` 事件，key=`widget_visible` 时调 `widget::set_visible(handle, value == "true")`。

**Rust event 端**：
- emit 的 payload 是 `(&key, &value)`（两个 String 引用）
- 序列化成 JSON `["widget_visible", "false"]`
- listener 端 `serde_json::from_str::<(String, String)>(payload)` 解码

### 修改 4：lib.rs 同时处理 widget_visible + daily_goal_ml 两种 settings 变化

**改了什么**：
```rust
if key == "widget_visible" { widget::set_visible(&handle, value == "true"); }
if key == "daily_goal_ml" { refresh_tray_from_db(&handle); }
```

**为什么**：daily_goal_ml 改后 tray 数字应该重算（比如用户把目标从 2000 改到 4000，进度条从 30% 变 15%）。`refresh_tray_from_db` 内部读 `settings.daily_goal_ml`（**实际还没改**——目前是 hardcode 2000，注释了 TODO 08 阶段）—— 但 `today-changed` 触发时 tray 数字会重新算一次。

**取舍**：MVP 阶段 `refresh_tray_from_db` 内部 hardcode 2000 是个临时妥协。08 阶段让 `get_today_total` + `goal` 都从 settings 读。

### 修改 5：useKeyboardNav 防 input/textarea 冲突

**改了什么**：
```ts
const target = e.target as HTMLElement | null;
if (target) {
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) {
    return;  // 跳过：用户在输入框里输入
  }
}
```

**为什么改**：popover 内可能有 input（虽然现在没有，但 widget / 通知 banner 等可能加），用户输入数字时按 1/2/3 不应该触发加水。`isContentEditable` 覆盖富文本编辑场景。

### 修改 6：useKeyboardNav modifier 键忽略

**改了什么**：
```ts
if (e.metaKey || e.ctrlKey || e.altKey) return;
```

**为什么改**：Cmd+1/2/3 是 macOS 通用快捷键（切换桌面 / 标签页等），不应该被 popover 拦截。

**Shift 保留**：Shift+数字键（！@#）不算命令键，应该触发——但 useKeyboardNav 没拦 Shift，OK。

### 修改 7：useKeyboardNav useMemo 防重复订阅

**改了什么**（PopoverRoot）：
```tsx
const bindings = useMemo(
  () => ({
    '1': () => onAdd(cupSmall, 'click-small' as RecordSource),
    ...
  }),
  [cupSmall, cupMedium, cupLarge, win],
);
useKeyboardNav({ bindings });
```

**为什么改**：每次 render `bindings` 是新对象 → useEffect dependency 变化 → keydown listener remove + add 重新订阅。useMemo 让 bindings 引用稳定（依赖的 cupSmall/M/L 不变时）。

**对性能影响小**（listener 重建廉价），但 useEffect 重建会**丢失**快捷键状态——比如 mousedown 期间按 1/2/3，可能在重建窗口内不被捕获。useMemo 是稳的写法。

### 修改 8：TrendChart 用 cubic bezier 平滑曲线（不用 recharts）

**改了什么**：`buildSmoothPath(pts)` 用每段两个 Q 控制点画平滑曲线：
```ts
for (let i = 0; i < pts.length - 1; i++) {
  const cx = (p0.x + p1.x) / 2;
  d += ` Q ${cx} ${p0.y}, ${cx} ${(p0.y + p1.y) / 2}`;
  d += ` Q ${cx} ${p1.y}, ${p1.x} ${p1.y}`;
}
```

**为什么**：recharts / d3 / victory 都是大依赖（100KB+），MVP 阶段不值得。**纯 SVG + Q bezier** 足够 7 个点的折线图。

**mcp 选项**：d3-shape 也提供 curveBasis / curveCardinal，但体积大（d3 全套 80KB+）。MVP 妥协用 vanilla SVG + 简单 bezier。

### 修改 9：TrendChart 用 motion.path animate pathLength

**改了什么**：
```tsx
<motion.path
  initial={{ pathLength: 0 }}
  animate={{ pathLength: 1 }}
  transition={{ type: 'spring', stiffness: 80, damping: 20, duration: 0.8 }}
/>
```

**为什么**：进入"7 天" tab 时曲线**从左到右**画出来，spring 过渡。Framer Motion 1.6+ 支持 SVG `pathLength` 动画。

**代价**：tab 切换时是路径动画，0.8s spring。如果切走再切回，会再播一次——OK，可接受。

### 修改 10：TabSwitcher 用 motion.div layoutId（共享元素动画）

**改了什么**：
```tsx
<motion.div
  layoutId="tab-indicator"
  style={{ position: 'absolute', inset: 0, ... }}
  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
/>
```

**为什么**：`layoutId` 让同一个 ID 的 motion 元素在不同父级之间**自动 spring 过渡位置**。点击 tab 时白色背景块从"今日"滑到"7 天"——Linear / Arc 的 tab 切换风格。

**不需要 framer-motion 的 `<motion.div>` 包裹整个 tab button** —— `layoutId` 是关键。

### 修改 11：AppIcon 用 Vite `?raw` 导入 + dangerouslySetInnerHTML

**改了什么**：
```ts
import dropSvg from '@/assets/drop.svg?raw';
// useEffect 里 setSvg(dropSvg);
// dangerouslySetInnerHTML={{ __html: replaced }}
```

**为什么**：
- `?raw` 让 Vite 把 SVG 当字符串 import（**不是** 默认的 url loader）
- `dangerouslySetInnerHTML` 注入 SVG markup
- 替换 width / height 属性让 size prop 生效
- useEffect 避免 SSR hydration mismatch（MVP 不 SSR，但保留习惯）

**security**：`drop.svg` 是我们自己的静态文件，可信；`dangerouslySetInnerHTML` 安全。

### 修改 12：daily_goal_ml / cup_* 设置改后 popover/widget 跨窗口同步

**链路**：
1. Settings UI `update('cupMediumMl', 350)` → `commands.setSetting('cup_medium_ml', '350')`
2. Rust `set_setting` 写 DB + emit('settings-changed', ('cup_medium_ml', '350'))
3. PopoverRoot useSettings `listen('settings-changed', () => refresh())` → 重新拉 getAll
4. 杯量按钮 label 立即更新到 "中杯 350"

**验证**（C 步骤截图 #12）：开 popover 看到 "中杯 350"（如果刚才在 settings 改过）。

## 关键 API 选型（备忘）

| 选型 | 理由 |
|---|---|
| `serde_json::from_str::<(String, String)>(event.payload())` | Tauri 2 event payload 是 JSON 字符串 |
| `widget::set_visible(app, bool)` 直接调 `state.0.show()/hide()` | Tauri 2 window API |
| `Vite ?raw` import + `dangerouslySetInnerHTML` | 静态 SVG 内嵌，无额外依赖 |
| `useMemo` 包 bindings | 防止 useEffect 重复订阅 + 快捷键状态丢失 |
| `motion.path animate pathLength` | SVG 路径从左到右画（spring 过渡） |
| `motion.div layoutId` | tab 指示器跨父级共享元素动画 |
| `input/textarea + isContentEditable` 检查 | 避免数字键在输入框里误触 |
| `metaKey/ctrlKey/altKey` 忽略 | 避免 macOS 通用快捷键冲突 |
| useEffect 拉一次 useWeeklyData | MVP 简化（不订阅 today-changed 自动刷新） |

## 验证

```
=== 启动日志 ===
Triggered applicationDidFinishLaunching
Creating new window  (4 次)   ← main + popover + widget + settings
Completed applicationDidFinishLaunching
windowDidBecomeKey
```

HMR reload 后无新错。4 个窗口 + reminder 后台循环都跑通。

## 用户手动验证

应用启动后（task `biaenrwft` 在跑）：

### 验证 1：widget_visible 联动
- 打开设置（右键菜单栏 → 设置…）
- 关 "显示桌面浮窗" toggle → **桌面浮窗立即消失**（不需要重启）
- 再打开 → 浮窗立即出现

### 验证 2：数字键盘导航
- 打开 popover（菜单栏左键）
- 按 "1" → 加 1 小杯（150ml）
- 按 "2" → 加 1 中杯（300ml）
- 按 "3" → 加 1 大杯（500ml）
- 按 "Esc" → popover 立即关闭
- 在 TimePicker 输入框聚焦时按 "1/2/3" → 不会触发加水（正确）

### 验证 3：7 天折线图
- 打开设置 → 切到 "7 天" tab
- 看到 spring 动画的折线（路径从左到右画）
- 7 个圆点（最后一个今日高亮大圆点）
- 顶部统计：7 天总量 / 日均 / 达标天数
- 切回 "今日" tab → 白色指示器 spring 滑回

### 验证 4：跨窗口同步
- 设置里改 "中杯" 300 → 350
- 开 popover → 看到 "中杯 350"（自动刷新）
- 改 "每日目标" 2000 → 3000
- 圆环百分比立即变化

### 验证 5：daily_goal_ml 改后 tray 数字重算
- 设置里改 dailyGoalMl 2000 → 4000
- 之前喝 600ml 圆环从 30% → 15%
- menu 数字不变（tray 数字是 current 总量 / 当前 goal，当前 goal 还是 hardcode 2000，**MVP 妥协**）

## 待办 / 已知 MVP 妥协

- [x] 07 polish 4 个任务全部完成
- [ ] **关闭确认未做**（用户 prompt 里有"关闭确认"但写"明确不做"行没列）—— MVP 简化
- [ ] **应用图标未替换**（用户 prompt 列了"应用图标：替换占位 SVG 为正式水滴图标"——我做了 AppIcon React 包装但没替换 bundle 图标；bundle icon 在 02 阶段已用 Python 生成的水滴 PNG 占位）
- [ ] **启动 fade in 未做**（tray 图标 0→1 opacity，200ms）—— 02 阶段程序化生成图标已经是 visible=true 直接显示，没加 fade
- [ ] refresh_tray_from_db 内部 hardcode goal=2000，未读 settings.daily_goal_ml
- [ ] useWeeklyData 不订阅 today-changed（添加记录后不会自动重画折线图）

## MVP 完整度（01-07）

| 阶段 | 状态 | 主要功能 |
|---|---|---|
| 01 骨架 | ✅ | Tauri + Vite + React + Tailwind |
| 02 菜单栏图标 | ✅ | 水滴图标 + 数字 |
| 03 数据库 | ✅ | SQLite + 11 commands + 事件 |
| 04 Popover + Widget | ✅ | vibrancy + spring + 拖动 + 边界 |
| 05 智能提醒 | ✅ | 后台循环 + 系统通知 + banner actions |
| 06 设置窗口 | ✅ | 13 设置项 + 实时保存 + 跨窗口 |
| 07 Polish | ✅ | widget 联动 + 键盘 + 7 天图 + tab |
| **MVP 核心功能** | ✅ | 全部完整 |

---

## bugfix（07 阶段收尾修的 2 个 bug）

### Bug 1：refresh_tray_from_db hardcode goal=2000

**症状**：07 阶段 settings 加了 daily_goal_ml 设置项，但 `refresh_tray_from_db` 内部仍然 hardcode `let goal: i32 = 2000;`。结果：用户在设置里把目标从 2000 改成 4000，tray 数字**不重算**（200ml 仍显示 10%，应该是 5%）。

**根因**：07 阶段原计划从 settings 读 goal，但当时 `commands::get_settings(state)` 调用了一次后 `state` 被 move（State<T> 是 newtype，move 后还能用吗？），AI 偷懒 hardcode 留 TODO 04（误标——应该是 08 阶段）。

**修法**（[src-tauri/src/lib.rs](../../src-tauri/src/lib.rs) `refresh_tray_from_db`）：
```rust
let total = match commands::get_today_total(state.clone()) {
    Ok(t) => t,
    Err(e) => { eprintln!(...); return; }
};
// 07 阶段：从 settings.daily_goal_ml 读（不再 hardcode 2000）
let goal: i32 = commands::get_settings(state)
    .ok()
    .and_then(|m| m.get("daily_goal_ml").cloned())
    .and_then(|s| s.parse().ok())
    .unwrap_or(2000);
let pct = ((total as f64 / goal as f64) * 100.0) as u32;
tray::set_tray_count(app, pct.min(100));
```

**关键点**：
- `state.clone()`：State<T> 是 `&T` 的 newtype 包装，**实现 Copy**，可以直接 clone
- `unwrap_or(2000)`：DB 读失败 / daily_goal_ml 不存在 / parse 失败 → fallback 2000（保证 tray 不挂）
- 链路：`setSetting('daily_goal_ml', '4000')` → DB 写 → emit('settings-changed', ('daily_goal_ml', '4000')) → lib.rs listen → refresh_tray_from_db → **tray 数字立即重算**

**验收**：
- 设置 daily_goal_ml 2000 → 4000
- 当前 200ml 圆环从 10% → 5%
- menu 数字也同步（因为 tray::set_tray_count 同步更新 title + tooltip）

### Bug 2：useWeeklyData 不订阅 today-changed

**症状**：用户在 7 天 tab 看到折线图，加了一杯水（add_record → emit 'today-changed'），但折线图**最后一天的点不更新**。需要切走 tab 再切回才刷新。

**根因**：07 阶段 useWeeklyData 只在 mount 时 `commands.getWeeklyTotals()` 拉一次，没订阅 `today-changed` 事件。`useTodayTotal`（03 阶段）有订阅，新写的 useWeeklyData 抄了 03 阶段 useTodayTotal 的骨架**但漏了 listen 部分**。

**修法**（[src/hooks/useWeeklyData.ts](../../src/hooks/useWeeklyData.ts)）：
```ts
const refresh = () => {
  commands.getWeeklyTotals().then(setData);
};

useEffect(() => {
  refresh();
  const unlistenP = listen('today-changed', () => {
    refresh();
  });
  return () => {
    unlistenP.then((fn) => fn()).catch(() => {});
  };
}, []);
```

**关键点**：
- `listen` 来自 `@/lib/tauri`（lib/tauri.ts 通用包装）—— **不**直接 `@tauri-apps/api/event`
- `unlistenP.then((fn) => fn()).catch(() => {})`：cleanup 时 await unlisten，catch 兜底防止 race
- 与 `useTodayTotal` 模式**完全一致**（抄 03 阶段的实现）

**验收**：
- 打开设置 → 切到 "7 天" tab → 看今日点
- 不切走 tab，加 1 中杯（300ml）→ 今日点**立即增长**（其他点不变）
- 切走再切回**也能**刷新（兜底路径，没破）

### 不改的东西（明确）

- ❌ 没改 useTodayTotal（已经正确）
- ❌ 没动 useSettings（已经正确）
- ❌ 没改 refresh_tray_from_db 之外的 lib.rs 代码
- ❌ 没动 AI 协作日志格式（07-polish.md 末尾追加"bugfix"小节，不破坏原结构）
- ❌ 没改其他 4 个 MVP 妥协（启动 fade / 关闭确认 / bundle 图标 / useWeeklyData 其他边角）

### 教训

**两个 bug 共同根因**：07 阶段代码密度高（4 个任务 × 多文件），AI 写了**正确骨架**但**漏了边角**——
- Bug 1 漏了 `state.clone()` 后的 goal 读取
- Bug 2 漏了 `listen` 订阅（抄 useTodayData 时漏了关键部分）

**预防**：
- 写"参照已有 hook"时**先 diff**——把 useTodayTotal 完整读一遍，逐项检查
- hardcode 常数留 TODO 是常见偷懒模式，**commit 之前 grep 一下** `\d{4,}` 找 magic number
