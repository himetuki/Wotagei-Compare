# Tasks

## 1. 导出台寻道状态互斥与起播就绪重构 (ExportPage)

- [x] 1.1 在 `ExportPage.tsx` 中建立双视频独立寻道跟踪状态（包含 `isSeeking` 锁、`pendingTargetTime` 及一次性 `seeked` 事件侦听），重构 `seekPreview` 纯净跳转逻辑，确保视频在 `seeking` 期间绝不接收重复的 `currentTime` 赋值，运行 `npm run build` 验证类型与语法通过。
- [x] 1.2 在 `ExportPage.tsx` 中重构 `togglePreviewPlay` 起播流程，实现起播就绪栅栏（Ready Gate）：当用户触发播放时，若存在未就绪或正在寻道的视频，等待双端 `seeked` / `canplay` 达成后再联合启动 `play()`，杜绝单侧寻道未完成时的竞争起播。
- [x] 1.3 在 `ExportPage.tsx` 中重构 RAF 播放同步主循环：引入根据 `initialSoundSource` 动态选定主时钟的机制，并实现从属视频三级防雪崩追赶（柔性变速微调、`!seeking` 判定及 600ms 冷却隔离），同时平滑 A-B 区间终点回跳逻辑。

## 2. 对比台寻道状态互斥与防雪崩重构 (Workbench)

- [x] 2.1 在 `Workbench.tsx` 中优化 `seekToTau` 同步定位逻辑，引入寻道互斥与节流机制，防止时间滑块拖拽时高频重设 `currentTime`。
- [x] 2.2 在 `Workbench.tsx` 中重构 `togglePlay` 起播流程，加入起播就绪栅栏等待机制，确保在大步长拖动进度条后点击播放时双视频均已就绪才启动播放。
- [x] 2.3 在 `Workbench.tsx` 中重构 PLL 锁相环同步循环：对从属视频的硬对齐跳转施加 `!video.seeking` 互斥保护与 600ms 冷却隔离，彻底消除对比台在播放与追赶中的寻道震荡。

## 3. 全量构建与端到端交互流验证

- [x] 3.1 运行 `npm run build`，确保 TypeScript 检查 100% 零错误且 Vite 生产打包顺利生成产物。
- [x] 3.2 验证黑盒操作流：在导出工作台与对比工作台中，分别测试暂停时拖动进度条后立即播放、播放中连续拖动滑块，验证双侧画面均丝滑起播、无单侧顿挫卡死、音画完全同步。
