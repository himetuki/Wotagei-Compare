# Tasks

## 1. 左右分屏几何算法与渲染导出微调

- [x] 1.1 在 `src/core/geometry.ts` 中重构 `calculateTriLineSplitScreenPlacement`，增加半区标识参数 `channel: 'left' | 'right'`，将左半区目标中轴线设为 `width * 0.475`、右半区设为 `width * 0.525`，将目标特征高度比例由 0.69 微调为 0.655，并同步更新 `src/core/geometry.verify.ts` 测试断言，通过命令 `npx tsx src/core/geometry.verify.ts` 验证通过。
- [x] 1.2 在 `src/core/renderer.ts` 和 `src/core/exporter.ts` 中调用 `calculateTriLineSplitScreenPlacement` 时显式传入 `'left'` 与 `'right'` 半区标识，运行 `npx tsx src/core/renderer.verify.ts` 验证分屏画布与导出管线正常工作。

## 2. 时间标定锚点 Clamp 与拖拽寻帧循环播放交互

- [x] 2.1 在 `src/components/AudioStep.tsx` 中实现锚点（`anchorTime`）强制 Clamp：在拖拽起止手柄更新区间时，若当前锚点小于新起点则 clamp 至新起点，大于新终点则 clamp 至新终点；在直接输入数字或点击「设为锚点」时亦强制 clamp 在 $[trimStart, trimEnd]$ 范围内，验证输入框与波形图锚点标记不超出截取选区。
- [x] 2.2 在 `src/components/AudioStep.tsx` 中实现手柄拖拽实时寻帧与自动停播：当按动手柄进入拖拽时若正在播放则立即调用 `video.pause()` 暂停；在拖拽移动过程中将底层视频的 `video.currentTime` 与游标 `currentTime` 实时同步为当前拖动手柄的时间戳，实现即时画面寻帧。
- [x] 2.3 在 `src/components/AudioStep.tsx` 中改造播放控制为区间闭环循环：点击播放时若处于区间外或终点则从 $trimStart$ 起播，播放推进到达 $trimEnd$ 时自动跳回 $trimStart$ 循环播放，再次点击播放按钮可正常暂停。

## 3. 全链路验证与构建验收

- [x] 3.1 运行全量测试套件（`npx tsx src/core/*.verify.ts`），验证几何投影、时间轴映射、渲染器等测试全部无断言错误通过。
- [x] 3.2 运行完整构建脚本（`npm run build`），验证 TypeScript 类型检查、React 编译与 Vite 生产打包零报错。

## Workflow follow-up

- 实施阶段（apply）完成后将 `docs/decisions/AgDR-0014-时间截取锚点约束与分区分屏视角微调.md` 的 status 更新为 `executed`。
- 确认全部变更与验收合格后，由用户调用 `/opsx:archive` 完成归档。
