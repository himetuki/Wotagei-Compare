# Tasks

## 1. 寻道接口签名与播放意图分流重构

- [x] 1.1 在 `src/components/ExportPage.tsx` 中增强 `seekPreview` 签名，支持可选参数 `keepPlaying?: boolean`；若未显式指定，默认继承当前播放状态（`isPreviewPlaying || engineRef.current?.getIsPlaying()`），在播放中调用时透传至 `engine.seekToTau(..., effectiveKeepPlaying)` 触发原子会合与连续续播
- [x] 1.2 在 `src/components/ExportPage.tsx` 的左侧预览时间滑块（Timeline Slider）`onChange` 事件中调用 `seekPreview(val)`，验证在播放中拖动或点击时间滑块时不中断播放，视频从新位置无缝继续平滑推进，左下角控制按钮保持为「暂停」

## 2. 起止点 A/B 静态寻道强隔离

- [x] 2.1 在 `src/components/ExportPage.tsx` 中核验并重构起止点端点调整通道：在 `handlePointerDown('A' | 'B')`、`throttledSeek`、`handlePointerUp`、`handleTrackClick` 以及「设当前为 A/B」中，统一显式调用 `ensureStopped()` 并向底层寻道透传 `keepPlaying: false`，形成严格的静态寻道隔离
- [x] 2.2 验证在播放状态下拖动 A/B 手柄或点击区间轨道时，系统立即停止播放、左下角按钮即刻变更为「预览」，且画面精确切换至手柄拖动位置进行单帧无黑屏预览

## 3. 全局构建与双通道交互验证

- [x] 3.1 运行 TypeScript 类型检查与 Vite 生产打包命令 `npm run build`，确保无类型与编译错误
- [x] 3.2 运行核心算法验证脚本，执行操作流回归验证：左侧时间滑块在播放时点击/拖拽保持连续播放，右侧起止点 A/B 拖拽/点击时强制停止并单帧预览
