# Tauri 项目初始化

## 提示词

> 你是 Tauri 2 + React 专家。请在当前目录初始化一个 Tauri 2 项目。
>
> 技术栈：
> - Tauri 2（最新稳定版）
> - 前端：React 18 + Vite + TypeScript
> - 动画：Framer Motion
> - 样式：Tailwind CSS
> - 数据：tauri-plugin-sql + SQLite
>
> 功能范围（MVP，详细规格见 docs/mvp-spec.md）：
> 1. 菜单栏图标（Tray Icon）+ 数字显示今日进度
> 2. 桌面浮窗（90x56px，always_on_top，transparent，位置记忆）
> 3. Popover 窗口（点击菜单栏/浮窗打开）
> 4. 智能提醒（系统通知 + action buttons: 我喝了 / 5分钟后再提醒 / 跳过）
> 5. 数据持久化（SQLite）
>
> UI 要求：
> - 极简、macOS 原生风格（vibrancy）
> - spring physics 动画，不用 linear / ease-in-out
> - 配色：#4A9EFF 主色，半透明白背景
> - 字体：SF Pro
>
> 不要写实现，先给我项目结构规划（文件树 + 每个文件的作用），等我确认后再写代码。
>
> ---
>
> **第二轮：决策确认（基于 review）**
>
> - 包管理器：npm 11
> - 多窗口：单 bundle + URL/label 分发（按 window.__TAURI_INTERNALS__.metadata.currentWindow.label 路由）
> - 状态管理：zustand
> - 浮窗拖动：Tauri startDragging() + 位置持久化到 SQLite
> - SQL：schema.sql 放 src-tauri/sql/，用 tauri-plugin-sql 迁移模式
> - 图标：MVP 阶段占位 SVG，bundle icon 后期生成
> - 错误：Rust 用 thiserror + anyhow；前端 typed invoke wrapper
>
> **额外建议（3 条已采纳）**
> - 图标先占位
> - 错误处理分层
> - 日志先关闭
>
> 按以下顺序输出：
> 1. package.json（完整依赖列表 + scripts）
> 2. vite.config.ts + tsconfig.json
> 3. src-tauri/Cargo.toml
> 4. src-tauri/tauri.conf.json（含 3 个窗口的 label 定义）
> 5. src-tauri/capabilities/default.json（细粒度权限）
> 6. src-tauri/sql/schema.sql
> 7. 空目录占位（src/windows/ 等）
>
> 每段代码块标注文件路径，方便我直接复制落盘。

## AI 输出

完整代码见本轮对话（上文 7 段代码块 + 占位）。

关键版本号（已查 npm + crates.io 截至 2026-06 实际最新）：

| 包 | 版本 |
|---|---|
| tauri (Rust) | 2.11.3 |
| tauri-plugin-sql | 2.4.0 |
| tauri-plugin-notification | 2.3.3 |
| tauri-plugin-log | 2.8.0 |
| @tauri-apps/api | 2.11.1 |
| @tauri-apps/cli | 2.11.3 |
| @tauri-apps/plugin-sql | 2.4.0 |
| @tauri-apps/plugin-notification | 2.3.3 |
| framer-motion | 12.42.0 |
| zustand | 5.0.14 |
| react / react-dom | 18.3.1 |
| vite | 8.1.0 |
| @vitejs/plugin-react | 6.0.3 |
| typescript | 5.9.3 |
| tailwindcss | 3.4.19（**特意用 v3，不用 v4**） |
| window-vibrancy | 0.7.1（仅 macOS） |
| thiserror | 2.0.18 |
| anyhow | 1.0.103 |
| serde | 1.0.228 |
| serde_json | 1.0.150 |
| tokio | 1.52.3 |
| rand | 0.10.1 |
| chrono | 0.4.45 |

## 我的修改

### 修改 1：Tailwind 锁 v3.4.19，不用 v4

- **改了什么**：`tailwindcss: "3.4.19"` + `postcss.config.js` 用 `tailwindcss: {}` 插件名
- **为什么改**：Tailwind 4 在 2025 已稳定（最新 4.3.1），但 v4 是 breaking change——PostCSS 插件改成 `@tailwindcss/postcss`、CSS-first 配置（`@import "tailwindcss"` 替代 `@tailwind base/components/utilities` 三条指令）、不再需要 `tailwind.config.ts`。MVP 阶段踩 v4 早期坑不划算（v4 文档生态还在追赶），用 v3.4.x（最后一个 v3 稳定）最稳。等 MVP 跑通后再考虑升级。
- **来源**：`npm view tailwindcss@3 version` 拿到 3.4.19。

### 修改 2：tauri Rust crate 锁 caret "2.11" 而非 "=2.11.3"

- **改了什么**：`Cargo.toml` 里 `tauri = { version = "2.11", features = [...] }`
- **为什么改**：npm 端用精确版本是因为 lockfile 会卡住；Rust 端 Cargo 也会生成 Cargo.lock，caret 允许 patch 升级（2.11.x）但不会跨 minor。如果想完全钉死，写 `"=2.11.3"`。MVP 阶段我倾向 caret——如果 Tauri 2.11.4 修了什么 bug，能自动拿到。
- **保留项**：其他 crate 全部 caret（`"2.4"`、`"2.3"` 等），理由同上。

### 修改 3：tauri.conf.json 主窗口设为 1×1 隐藏

- **改了什么**：`app.windows[0]` 改成 1×1 不可见窗口（label="main"），popover/widget 由 Rust 运行时创建
- **为什么改**：MVP 阶段 popover/widget 还没写代码，如果 `tauri.conf.json` 里直接声明 3 个窗口，capability 文件对得上但窗口行为不对（特别是 widget 的 `alwaysOnTop: true` + `transparent: true` 配错会导致启动就 crash）。先用 1 个隐藏的 anchor 窗口跑通"启动不 crash"，后续模块逐步加。
- **AI 原始输出**是这么做的吗？是的，这是按"单 bundle + label 分发"决策的合理实施。

### 修改 4：capabilities 加 `core:event:allow-emit-to`

- **改了什么**：capabilities/default.json 显式列了 `core:event:allow-emit-to`
- **为什么改**：Tauri 2 的 capability 是 deny-by-default，`emit_to` 默认不开。后续 widget → popover 跨窗口消息必需。MVP 阶段先开，省得到时候报错再补。
- **AI 漏了吗**：AI 原始列表里漏了，加上去。

### 修改 5：schema.sql 加 `idx_records_timestamp`

- **改了什么**：`CREATE INDEX IF NOT EXISTS idx_records_timestamp ON records(timestamp);`
- **为什么改**：MVP 数据少（一天最多几十条），索引看起来是过度设计。但"今日总量"查询是热路径（每点一次杯子按钮 + 每次前端轮询 + tray 图标更新都查），加索引几乎零成本（SQLite B-tree 索引几 KB），查询从 O(n) 变 O(log n)。
- **AI 漏了吗**：是的，原始 schema.sql 没有这条。加上。

### 修改 6：widget_state 默认行 `(1, 100, 100, 1)`

- **改了什么**：schema.sql 里 INSERT 默认行：x=100, y=100, visible=1
- **为什么改**：避免前端首次启动拿到 NULL panic（即使 Rust 端兜底，前端 React 渲染 widget 也没位置信息可用）。100,100 是安全默认（屏幕左上角偏移，不会挡菜单栏）。
- **后续**：用户在设置里拖动后，Rust 端会 UPDATE 这一行。

### 修改 7：`source` 字段加 `widget-double-click`

- **改了什么**：schema.sql 注释里 source 的可能值加了 `widget-double-click`
- **为什么改**：mvp-spec.md 里没列这个值，但桌面浮窗"双击快速记 1 杯"是核心交互，得有可追溯的 source。统一在这里加注释，DAO 层引用同一份枚举。

### 修改 8：额外补的"跑起来前 3 步"

- **改了什么**：在 7 项代码外，AI 输出里没有，我手动补了：
  1. `npx @tauri-apps/cli icon` 生成图标
  2. `~/.zshrc` 加 `export PATH="$HOME/.cargo/bin:$PATH"`
  3. 占位 `src/main.tsx` + `index.html`（不然 Tauri 启动 React 渲染会失败，capability 不会报错但页面空白）
- **为什么改**：这三步不在"7 项输出"里，但对第一次跑通是 blocker。AI 没主动补——这是它的盲点，因为它不知道"用户环境里 cargo 不在 PATH"和"bundle icon 数组里的文件不存在会编译失败"。

## 待办

- [ ] 代码落盘（package.json / vite.config / tsconfig / tailwind / postcss / Cargo.toml / tauri.conf.json / capabilities / schema.sql）
- [ ] `npm install`
- [ ] `npx @tauri-apps/cli icon` 生成 bundle 图标
- [ ] 写 `src/main.tsx` + `index.html` 占位
- [ ] `npm run tauri:dev` 验证启动不 crash
- [ ] 下一步：写 `src-tauri/src/lib.rs` + `main.rs` 注册 plugin + tray + widget + popover 三个窗口
