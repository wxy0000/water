# Hydropace 代码瘦身进度

## 2026-06-30
- 创建瘦身计划文件，开始第一阶段：文档与源码盘点。
- 现有未提交改动包括通知菜单入口和 macOS 原生通知增强，需要纳入审计而不是盲删。
- 已阅读核心产品文档、MVP 规格、01-07 AI 协作记录，并统计源码规模。
- 完成依赖与引用扫描，定位第一批低风险瘦身候选：未用前端依赖、未用 Cargo 依赖、widget 旧 command、未用前端 widget/drag helper。
- 第一批低风险瘦身已实施，`npm run build` 与 `cargo test` 均通过。`cargo clippy` 因本机未安装组件无法运行。
- 第二批依赖瘦身完成：移除 `tauri-plugin-log` 和 `image-png` feature，验证仍通过。
- 清理运行时代码中的阶段式注释，把历史说明留在 `docs/ai-collaboration/`。
- 完整验证通过：`npm run build`、`cargo test`、`npm run test:e2e`、`npm run tauri:build`。
