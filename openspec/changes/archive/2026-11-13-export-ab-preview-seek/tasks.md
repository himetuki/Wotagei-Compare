# Tasks

## 1. 播放状态机与前置停止联动

- [x] 1.1 在 `src/components/ExportPage.tsx` 中建立统一的前置停止函数 `ensureStopped`，并在 `handlePointerDown('A' | 'B')`、`handleTrackClick`、以及「设当前为 A」和「设当前为 B」快捷操作中优先调用，显式暂停 `DualVideoSyncEngine` 并将 `isPreviewPlaying` 设为 `false`，确保左下角按钮文案与图标立即变更为「预览」（Play 图标）
- [x] 1.2 在 `src/core/sync-engine.ts` 中核验 `seekToTau` 与 `pause` 逻辑，确保在静态寻道模式下 `keepPlaying: false`，断开任何残留的 `playFrom` 意图，保证引擎实际播放状态与外部回调完全同步

## 2. 单帧预览渲染引擎与防黑屏机制

- [x] 2.1 在 `src/components/ExportPage.tsx` 中引入由 `requestAnimationFrame` 驱动的单帧画布渲染循环，在导出页挂载期间实时追踪底层视频元素解码缓冲并持续合成画面，并在组件卸载时执行 `cancelAnimationFrame` 安全回收
- [x] 2.2 在导出预览画布渲染中引入旧帧保持与就绪保护策略，在两路视频处于 `seeking` 或 `readyState < 2` 的寻道瞬态期间保持上一有效渲染帧，严禁全黑清屏覆盖，待底层视频完成 `seeked` 并就绪后直接无缝刷新目标画面

## 3. 拖拽定位寻道防抖与端点落地点校准

- [x] 3.1 优化 `handlePointerMove` 中拖动 A/B 手柄时的目标时间指针联动与寻道调度（拖动 A 即时将预览指针切至 A，拖动 B 即时切至 B），增加寻道节流保护，避免向视频元素产生高频硬寻道冲突
- [x] 3.2 在 `handlePointerUp` 与 `handlePointerCancel` 指针抬起事件中执行最终端点对齐寻道，保证释放手柄后画面帧、进度滑块与数值显示 100% 精确锁定在最终端点

## 4. 全局构建与全操作流端到端验证

- [x] 4.1 运行 TypeScript 类型检查与 Vite 生产打包命令 `npm run build`，确保无类型错误且构建顺利生成产物
- [x] 4.2 执行操作流验证：在预览播放状态下拖动 A/B 手柄或点击区间轨道，验证播放即刻终止、左下角按钮显示为「预览」、预览画面精准跟随拖动手柄当前时刻且全程清晰无黑屏
