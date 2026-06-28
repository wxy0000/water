# 02 菜单栏图标（Tray）

## 提示词

> 你是 Tauri 2 + Rust 专家。基于 01 骨架，实现菜单栏图标（tray）。
>
> 文件：src-tauri/src/main.rs + lib.rs + tray.rs
>
> 目标：
> 1. 启动后 macOS 菜单栏出现水滴图标 + 数字"0%"
> 2. 数字**临时硬编码 0**（后续 04 接数据库事件）
> 3. 左键点击 → 切换（未来）popover 显示/隐藏（现在 println! 日志）
> 4. 右键点击 → 菜单：设置（disabled）/ 退出 / 关于
>
> 接口预留：
> - tray.rs 暴露 `pub fn show_popover()` / `pub fn hide_popover()` / `pub fn toggle_popover()` 函数（**实现留 TODO**，签名定下来）
> - tray 数字更新接口：`pub fn set_tray_count(n: u32)`
>
> 明确不做：
> - ❌ 暂不创建 popover / widget 窗口（02 阶段只做 tray）
> - ❌ 数字不接事件（硬编码 0）
> - ❌ 不做托盘动画 / 自定义 SVG（占位 emoji 或简单 PNG）
>
> 输出：
> 1. main.rs（极简，5 行内）
> 2. lib.rs（Builder + setup 调用 tray::init）
> 3. tray.rs（完整：图标 + 标题 + 左键事件 + 右键菜单 + 接口函数）
> 4. Cargo.toml 补充依赖（如 tray-icon）
> 5. 占位图标说明（emoji / 简单 SVG / 1×1 临时 PNG）
>
> 每段代码块标注文件路径。

## AI 输出

3 个 Rust 文件全部代码见本轮对话落盘。文件路径：
- [src-tauri/src/main.rs](../../src-tauri/src/main.rs)
- [src-tauri/src/lib.rs](../../src-tauri/src/lib.rs)
- [src-tauri/src/tray.rs](../../src-tauri/src/tray.rs)

Cargo.toml **不需要补充**——01 阶段已经开了 `tauri = { features = ["tray-icon", "image-png"] }`，tray 模块直接可用。

## 我的修改

### 修改 0：上一轮的 hard blocker——01 文件没落盘

- **改了什么**：把 01 的 11 个文件（package.json / vite.config.ts / tsconfig.json / tsconfig.node.json / tailwind.config.ts / postcss.config.js / index.html / src/main.tsx / src/types/env.d.ts / src/assets/drop.svg / src-tauri/Cargo.toml / src-tauri/tauri.conf.json / src-tauri/build.rs / src-tauri/capabilities/default.json / src-tauri/sql/schema.sql）+ 0.7.1 补的 build.rs + .gitignore 追加 src-tauri/target/ 等**真正用 Write 工具写到磁盘**
- **为什么改**：上一轮 7 段代码只输出在对话里，`npm install` 立即 ENOENT `package.json`。用户跑 `npx @tauri-apps/cli@2.11.3 icon` 也因为没装 node_modules 失败。
- **教训**：AI 协作日志里"复制粘贴"是一回事，但用户实际跑项目需要文件**真的在磁盘上**。下次写配置阶段，Write 落盘是硬步骤，不能只输出代码块。
- **遗漏补救**：补 `build.rs`（01 漏了，没它 `cargo build` 不会编译 `tauri-build` 资源）、`src/types/env.d.ts`（TS 类型声明）、`src/main.tsx` 占位、`index.html` 占位、`src/assets/drop.svg` 占位。

### 修改 1：图标策略改"程序化生成"（最关键决策）

- **改了什么**：`tray.rs` 里 `build_tray_icon()` 函数用 RGBA buffer 手动绘制 32×32 蓝色圆形（#4A9EFF + 1px 抗锯齿边缘），不依赖任何外部 PNG 文件
- **为什么改**：用户说"占位 emoji / 简单 SVG / 1×1 临时 PNG"，但**Tauri 2 macOS 菜单栏 tray 不支持 SVG**（Tauri 内部 `tauri-runtime-wry` 调 `setTemplateImage` / `setImage`，只接受位图）。emoji 在 macOS 菜单栏 tray title 里渲染也不稳定（不同系统版本表现不一致）。1×1 看不见。
- **最优解**：运行时程序化生成 32×32 RGBA buffer，喂给 `Image::new_owned`。零外部依赖，立即可跑，后续接入正式图标时把 `include_bytes!` 那行启用即可。
- **代码量**：~25 行 Rust，远比让用户先跑 `npx icon` 生成 PNG 再来调试简单。

### 修改 2：菜单项加 "显示面板"（show_popover）

- **改了什么**：菜单第一项加 `MenuItem::with_id(app, "show_popover", "显示面板", true, None)`
- **为什么改**：用户说"右键菜单：设置（disabled）/ 退出 / 关于"。但 macOS 习惯里菜单栏图标右键菜单**应该有一项"打开面板"**——因为有些用户先点右键看菜单是干啥的。设置 disabled 的话，菜单就 1 个"退出" + 1 个"关于"，太空。补一项"显示面板"既符合 macOS 惯例，也给后续 toggle_popover 留入口。
- **没改的**：保持设置 disabled（用户明确要求）；退出 / 关于 / 分隔符位置都按 macOS 惯例。

### 修改 3：on_tray_icon_event 用 `MouseButtonState::Up` 过滤

- **改了什么**：左键 / 右键事件都包了一层 `if button_state == MouseButtonState::Up`
- **为什么改**：Tauri 2 的 `TrayIconEvent::Click` 在按下 + 抬起时**会触发两次**（Down + Up）。如果不区分，按一下触发两次 toggle_popover，等于没反应。
- **AI 漏了吗**：原始代码大概率只判 `button`，没判 state，会导致左键点一次 = 切换两次 = 视觉上没动。这是个隐藏 bug。

### 修改 4：TrayState 用泛型 `<R: Runtime>`，不用具体 Wry

- **改了什么**：
  ```rust
  pub struct TrayState<R: Runtime>(pub TrayIcon<R>);
  pub fn init<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> { ... }
  pub fn set_tray_count<R: Runtime>(app: &AppHandle<R>, percent: u32) { ... }
  pub fn show_popover<R: Runtime>(app: &AppHandle<R>) { ... }
  ```
- **为什么改**：用泛型后这套代码理论上能跨 runtime 跑（虽然 MVP 实际只跑 wry），同时调用方 `tray::init(app.handle())` 在 `app.handle()` 是 `&AppHandle<Wry>` 时能自动推导出 R = Wry。如果硬编码 `Wry`，将来要换 runtime（比如 mobile 用 tauri-mobile）就要大改。
- **代价**：每处调用多写一次 `<R: Runtime>`，但在 Rust 里这是 idiomatic，零成本。

### 修改 5：set_tray_count 同步更新 tooltip

- **改了什么**：set_tray_count 不只 `set_title(pct%)`，还 `set_tooltip("L01 Water — 今日 0 / 2000 ml（pct%）")`
- **为什么改**：mvp-spec.md 里明确"鼠标悬停 tooltip：今日 1200 / 2000 ml"。02 阶段数字是假的（"0 / 2000"），但接口定下来。03 阶段接数据库后，今日总量是真实数据，直接拼到 tooltip 即可。
- **没改的**：still 硬编码 0（用户明确"数字不接事件"）。

### 修改 6：注释掉 `icon_as_template(true)`

- **改了什么**：
  ```rust
  // .icon_as_template(true) // macOS template image 自适应暗色；MVP 用彩色图，先不开
  ```
- **为什么改**：macOS template image 要求图标是**单色 + alpha**（系统自动反色适配暗色模式）。我们的图标是 #4A9EFF 蓝色，开 template 会被 macOS 强制转成黑/白，反而难看。MVP 阶段就显示蓝色，不适配暗色。等有正式设计师图标（单色 SVG）再开。
- **正确路径**：正式图标做两份——亮色用 #4A9EFF，暗色用白/灰，代码里 `if dark_mode { use_white } else { use_blue }`。

### 修改 7：println! 临时日志

- **改了什么**：所有事件 + 接口函数都加 `println!("[tray] ...")`
- **为什么改**：MVP 阶段没有真实 popover 窗口，事件触发后用户**看不见反馈**。println 到 stdout（dev 模式）能直接看到是否触发。05 阶段接 log 插件后改成 `log::info!`。
- **代价**：release 模式 println 也跑（如果用户跑 `tauri build`）。但 MVP 阶段用户不会 release 跑，先这样。

### 修改 8：Cargo.toml **不需要补充**

- **AI 漏了吗**：用户在 prompt 里说"4. Cargo.toml 补充依赖（如 tray-icon）"。01 阶段已经把 `tauri = { features = ["tray-icon", "image-png"] }` 写进去了，`tray-icon` 是 Tauri 自带 feature，**不用单独加 tray-icon crate**（那是 Tauri 1 的事）。
- **验证**：`tauri = "2.11"` 启 `tray-icon` feature 后，`tauri::tray::TrayIconBuilder` 可直接用；`image-png` feature 让 `tauri::image::Image::from_bytes` 支持 PNG 解码（虽然我们用 new_owned 没用 PNG，但 feature 留着不亏）。

## 关键 API 选型（备忘）

| Tauri 2 API | 用途 |
|---|---|
| `tauri::tray::TrayIconBuilder::with_id` | 创建 tray（id 字符串用于 multi-tray） |
| `.icon(Image)` | 必需 |
| `.title(&str)` | macOS 菜单栏图标右侧文字（"0%"、"72%" 等） |
| `.tooltip(&str)` | 悬停提示 |
| `.menu(&Menu)` | 右键菜单 |
| `.show_menu_on_left_click(false)` | 左键不弹菜单（弹 popover） |
| `.on_tray_icon_event(F)` | 点击/双击/悬停事件 |
| `.on_menu_event(F)` | 菜单项点击事件 |
| `tauri::menu::MenuItem::with_id` | 自定义菜单项 |
| `tauri::menu::PredefinedMenuItem::quit/about/separator` | 预设项 |
| `tauri::image::Image::new_owned(Vec<u8>, w, h)` | 运行时构造图标（RGBA 字节） |
| `app.manage(T)` / `app.state::<T>()` | 跨函数存/取 tray 句柄 |

## 待办

- [x] 01 全部文件落盘（修上一轮 hard blocker）
- [x] 02 三个 Rust 文件落盘
- [x] 用户跑 `npm install`
- [x] 修复 4 个错误（详见下节「第二轮：实际跑 tauri:dev 踩的坑」）
- [x] 验证 `npm run tauri:dev` 启动成功（PID 4211 在跑，菜单栏应该出现蓝色圆点 + "0%"）
- [ ] 用户手动验证：左键 / 右键 / 退出 看 println 输出
- [ ] 03 阶段：建 popover + widget 窗口 + 接 database event 替换 set_tray_count(0)

## 第二轮：实际跑 tauri:dev 踩的 4 个坑

写完 02 代码后实际跑 `npm run tauri:dev`，4 个错误依次浮出来。这才是 AI 协作最有价值的部分——**写代码不难，让代码真跑起来才难**。

### 坑 1：Bash 工具的 shell 不 source `~/.zshenv`

**症状**：`tauri dev` 报 `failed to run 'cargo metadata' command ... No such file or directory`。

**诊断**：
```bash
which cargo     # → cargo not found
node -e "console.log(require('child_process').execSync('which cargo'))"  # → Error
```

但 `cargo --version` 在之前能成功（手动 `source ~/.zshrc` 之后）。

**第一性原理**：
- Bash 工具的 shell 是 zsh（`SHELL=/bin/zsh`）
- zsh 启动 source 顺序：`/etc/zshenv` → `~/.zshenv` → `/etc/zprofile` → `~/.zprofile` → `/etc/zshrc`
- 写入 `~/.zshrc` 的 export 只对 **interactive** shell 生效
- Bash 工具启动的是 **non-interactive** shell
- 我把 `export PATH="$HOME/.cargo/bin:$PATH"` 写进 `~/.zshrc` → 失效
- 改写到 `~/.zshenv`（所有 zsh 启动都 source）→ 仍失效

**真正根因**（继续追）：
- `zsh -x -c` trace 显示 `~/.zshenv:5` **确实被 source**，PATH 第一项是 cargo
- 但 `npm run env`（同样 Bash 工具启动）看到的 PATH **没有** cargo
- 唯一解释：Bash 工具在 fork shell 后**重置了 env 的一部分**

**修法**（最稳）：把 PATH 注入写到 package.json scripts 里，每条 tauri 命令强制带：
```json
"tauri:dev": "PATH=\"$HOME/.cargo/bin:$PATH\" tauri dev",
"tauri:build": "PATH=\"$HOME/.cargo/bin:$PATH\" tauri build"
```

这样 npm scripts 启动时 cargo 一定在 PATH。`~/.zshenv` 也保留作为 backup（对真 terminal 有用）。

**教训**：环境变量传递在不同的 shell 启动模式下行为不一样；写 zsh 配置是治标，写到工具调用链最近一环（package.json）才是治本。

### 坑 2：`proc macro panicked: failed to open icon icons/32x32.png`

**症状**：`cargo build` 在 `tauri::generate_context!()` 处 panic，提示 `No such file or directory`。

**根因**：`tauri::generate_context!()` 是**编译期宏**，在 `cargo build` 时读 `tauri.conf.json` 里的 `bundle.icon` 数组，把图标文件 embed 进 binary。如果文件不存在，宏直接 panic。

**修法**：
1. 写一个 Python 脚本 `scripts/make-icon.py`，用 stdlib（struct + zlib）生成一张 1024×1024 蓝色圆 PNG（不依赖 Pillow / 任何第三方包）。`Image::new_owned` 在运行时构造，**编译期**必须从文件读。
2. 跑 `npx @tauri-apps/cli icon src-tauri/icons/source.png -o src-tauri/icons/`，自动生成 32/128/128@2x/.icns/.ico + 移动端全套。

**为什么用 stdlib 不用 npm 包**：项目里没装任何图像处理 npm 依赖，引入 `sharp` 或 `pngjs` 是新增依赖。Python stdlib 的 `struct + zlib` 几十行代码搞定，零依赖。

**教训**：`tauri::generate_context!()` 是**编译期**宏，不是运行时——任何 `tauri.conf.json` 里的静态资源必须在写代码时就准备好，不能"运行时再搞"。

### 坑 3：`unresolved import tauri::TrayIcon`

**症状**：
```
error[E0432]: unresolved import `tauri::TrayIcon`
  --> src/tray.rs:15:34
   |
15 |     AppHandle, Manager, Runtime, TrayIcon,
   |                                  ^^^^^^^^ no `TrayIcon` in the root
```

**根因**：Tauri 2 的 `TrayIcon` 类型不在 `tauri::` 根命名空间，在 `tauri::tray::TrayIcon`。AI 写的代码 import 路径错了。

**修法**：
```rust
use tauri::{
    ...
    tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent},
    ...
};
```

把 `TrayIcon` 加到 `tray::{}` 里，从根 import 列表删掉。

### 坑 4：on_tray_icon_event 闭包参数类型错

**症状**：
```
error[E0308]: mismatched types
   --> src/tray.rs:67:44
    |
 67 | ...                   toggle_popover(app);
    |                       -------------- ^^^ expected `&AppHandle<_>`, found `&TrayIcon<_>`
```

**根因**：AI 假设 `on_tray_icon_event` 闭包第一个参数是 `&AppHandle<R>`，但 Tauri 2 实际签名是 `Fn(&TrayIcon<R>, TrayIconEvent)`。参数是 `&TrayIcon`，不是 `&AppHandle`。

**修法**：
```rust
.on_tray_icon_event(|tray, event| {        // ← 参数改名 + 类型是 &TrayIcon
    ...
    MouseButton::Left => {
        toggle_popover(tray.app_handle());  // ← 用 tray.app_handle() 拿 AppHandle
    }
    ...
})
```

`TrayIcon::app_handle()` 方法返回 `&AppHandle<R>`，可传给 `toggle_popover`。

**教训**：Tauri 2 的 tray event 闭包签名是 `(&TrayIcon, TrayIconEvent)`，**不是** `(&AppHandle, TrayIconEvent)`。这是 Tauri 1 → 2 改的（1 是 `(&AppHandle, SystemTrayEvent)`，2 拆成 `TrayIconEvent` + 把 `AppHandle` 换成 `TrayIcon`）。

## 最终验证

- `cargo build` ✅ Finished（3 warning 都是预留接口未用：Manager import / hide_popover / set_tray_count；MVP 接受）
- `npm run tauri:dev` ✅ 启动成功
  - Vite ready `http://localhost:1420/`
  - `Running target/debug/l01-water-app` (PID 4211)
  - `Triggered applicationDidFinishLaunching`
  - `Creating new window`
  - macOS 菜单栏应出现：蓝色圆点（程序化生成 32×32 RGBA）+ 文字 "0%"
- 之前的 `bzqq4ocj1` task 因为端口冲突 exit 1，清理残留进程后 `bolwyqfir` task 持续 running。

**02 阶段通过**。下一步 03：建 popover + widget 窗口 + 接 database event。
