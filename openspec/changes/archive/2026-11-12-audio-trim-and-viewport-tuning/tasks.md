# Tasks

## 1. 契约类型与算法层扩展 (Core & Types)

- [x] 1.1 扩展 `src/types/timeline.ts`：在 `VideoAudioInfo` 中新增 `trimRange?: TimeInterval` 与 `rawChannelData?: Float32Array`，在 `VideoTimelineParams` 中支持起止截取时间参数；更新 `src/core/timeline.ts` 中的 `calculateUnifiedTimeline` 算法，使其基于各通道各自的截取区间计算映射后的 $span_1, span_2$ 与重叠交集 $intersectInterval$，并运行算法验证脚本。
- [x] 1.2 扩展 `src/core/audio.ts` 与 `src/components/ImportStep.tsx`：确保音频解码后将单声道 PCM 数据 `rawChannelData: Float32Array` 保留在 `VideoAudioInfo` 中，并新增基于时间窗口切片的局部自相关测算函数 `detectBpmFromSlice(pcm, sampleRate, startSec, endSec)`。
- [x] 1.3 调整 `src/core/geometry.ts` 中的 `calculateTriLineSplitScreenPlacement` 算法：将脚底对齐目标 $targetBottomY$ 设为 $0.95$、特征高度比例 $targetFeatureH$ 提升至 $0.69$（使头顶对应在约 $0.26$），并运行单元测试/验证脚本确保左右分区人物主体显著放大且上方保留约 26% 光弧空间。

## 2. 空间标定指示框视觉统一 (Geometry UI)

- [x] 2.1 重构 `src/components/GeometryStep.tsx` 中的三线标定标签布局：将垂直中轴线（x0）、左脚线（xA）与右脚线（xB）的指示框样式从侧偏（`left/right: 26px`）改为水平居中在线上（`left: '50%', transform: 'translateX(-50%)'`），并在浏览器中验证两横一竖与两竖一横模型下所有指示框均准确骑在标定线上，无视觉偏位。

## 3. 时间标定截取与局部 BPM 测算 (Time & Audio UI)

- [x] 3.1 改造 `src/components/AudioStep.tsx` 为时间标定组件：在波形时间轴两端增加类似 `[` 和 `]` 的起止截取可拖拽手柄及选区高亮遮罩，支持指针事件（Pointer Events）与触控扩充区，可自由拖拽微调目标招式的 `trimRange`。
- [x] 3.2 实现局部区间 BPM 实时重算与锚点数值保持：在拖拽 `[` 或 `]` 时调用局部切片测算 BPM，自动更新当前通道的 `userBpm` 与节拍刻度；验证拖动时 `anchorTime` 绝对时间戳数值与标记位置严格不变（即使锚点落于截取区间之外亦不强行篡改数值）。

## 4. 对比台、导出台与全局导航对齐 (Workbench & Workspace Integration)

- [x] 4.1 更新 `src/App.tsx` 与全局步骤契约：将步骤标签、向导流转文案与顶栏导航项从「CH1/CH2 对拍」全面更新为「CH1/CH2 时间」，保持全局步骤分段直达条无缝切换。
- [x] 4.2 更新 `src/components/Workbench.tsx` 与 `src/components/ExportPage.tsx`：对比台和导出台消费基于两通道截取区间生成的对齐重叠交集区间，验证对比台播放进度条、锚点前 1s 快捷播放及导出片段均仅在截取交集内运作。
- [x] 4.3 全量构建与端到端运行验收：运行 `npm run build` 确保 TypeScript 编译零错误零警告，并在浏览器中验证左右分区大画面、指示框居中以及时间标定截取重算全流程顺畅。
