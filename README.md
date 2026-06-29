# Hydropace

桌面级喝水节奏提醒 App。

> 这个项目的核心不是"做一个 App"，是**训练 4 件事**：第一性原理拆解、MVP 思维、AI 协作、行为验证。

## 用户

**自己**（先自己用 7 天验证，再考虑扩展）。

不假装解决"所有人的喝水问题"。

## 核心问题

为什么人不主动喝水？

详见 [docs/first-principles.md](./docs/first-principles.md)。

## MVP 方向

极简记录 + 7 天后才解锁趋势反馈。

为什么是这个方向，详见第一性原理拆解。

## 技术栈

当前实现：**Tauri 2 + React 18 + Vite + TypeScript + Rust + SQLite**。

- Tauri 负责菜单栏、桌面浮窗、通知、窗口定位等原生能力。
- React 负责 popover、settings、widget 三个窗口 UI。
- SQLite 由 Rust 端通过 `rusqlite` 管理，前端只通过 typed commands 访问。
- Playwright 覆盖主要 Web UI 交互和截图验收。

## 目录结构

```
hydropace/
├── README.md                # 本文件
├── WORKLOG.md               # 本项目日志
├── .gitignore
├── docs/
│   ├── first-principles.md  # 第一性原理拆解
│   ├── decisions/           # 关键判断
│   ├── ai-collaboration/    # AI 协作记录（脱敏、可展示）
│   └── experiment-log.md    # 7 天自我验证
├── submission/              # 验收与交付材料
├── src/                     # 应用代码
├── assets/                  # 设计稿、图标
└── deploy/                  # 部署说明
```

## 状态

- [x] 项目骨架
- [x] 第一性原理拆解（初版）
- [x] MVP 功能定义
- [x] 技术栈选型
- [x] 实现
- [ ] 7 天自我验证
- [ ] 复盘

## 跑起来

```bash
npm install
npm run tauri:dev
```

常用验证：

```bash
npm run build
npm run test:e2e
cd src-tauri && cargo test && cargo check
```
