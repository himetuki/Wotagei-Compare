# Tasks

## 1. 核心同步引擎开发与算法验证

- [x] 1.1 创建 `src/core/sync-engine.ts`，实现 `SafeVideoController` 寻道状态机与队列防抖机制，杜绝 `seeking` 重入
- [x] 1.2 在 `src/core/sync-engine.ts` 中实现 `DualVideoSyncEngine` 核心类，封装发声通道主时钟与连续阻尼比例调速算法（Continuous Damped Velocity Controller）
- [x] 1.3 编写独立算法与控制状态机验证脚本 `src/core/sync-engine.verify.ts`，运行 `npx tsx src/core/sync-engine.verify.ts` 确认各项边界与调速收敛均按预期通过

## 2. 对比工作台 (Workbench) 接入与胶水代码清理

- [x] 2.1 重构 `src/components/Workbench.tsx`，彻底移除组件内部手写的 `safeSeek`、`isSeekingRef`、`pendingTargetRef`、`lastHardSeekTimeRef` 及原生 RAF 锁相环逻辑
- [x] 2.2 在 `Workbench.tsx` 中挂载并连接 `DualVideoSyncEngine`，通过引擎提供的高层语义方法驱动播放、暂停、跳转及慢放，保持 Canvas 2D 渲染流畅对齐

## 3. 导出预览页 (ExportPage) 接入与代码复用

- [x] 3.1 重构 `src/components/ExportPage.tsx`，拔除内部复制粘贴的 `safeSeek` 与寻道冷却状态变量，统一复用 `DualVideoSyncEngine`
- [x] 3.2 验证导出预览页的实时对齐播放、大跨度拖拽寻道以及与离线 WebCodecs 导出的边界衔接

## 4. 全局编译构建与决策闭环

- [x] 4.1 运行 `npm run build`（或 `npx tsc --noEmit`），确保项目 TypeScript 类型检查 100% 通过且打包产物无任何告警
- [x] 4.2 将 `docs/decisions/AgDR-0017-双视频同步时钟引擎重构与连续阻尼调速.md` 的状态从 proposed 更新为 executed

## Workflow follow-up

- 归档变更：`openspec archive dual-video-sync-engine`
- 验证规格合并至主 spec 并更新工程文档
