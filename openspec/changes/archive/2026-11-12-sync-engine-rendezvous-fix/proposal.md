# Proposal: 双视频寻道互斥与严格会合起播状态机重构 (sync-engine-rendezvous-fix)

## Why

在同台对比播放或导出预览中，当用户拖动时间轴进度条或点击「锚点前 1s」时，经常出现单侧视频严重卡顿或双侧同时掉帧；且在此时点击「暂停」往往只暂停其中一侧，另一侧不仅未停下反而脱离控制单侧流畅播放。

经第一性原理排查，病灶源于三重深层机制缺陷：
1. **幽灵异步唤醒回调 (Ghost Play Callback)**：此前在每帧时钟循环中对落后视频调用了带有唤醒副作用的寻道回调（`seek(..., () => play())`）。当用户下达「暂停」后，早先排队的底层 `seeked` 异步事件才姗姗来迟触发，其携带的残留回调将该侧视频强行重新拉起播放；此时因为循环已停，该侧视频独占了系统解码器，因而表现为“未停下但变流畅了”的双端撕裂状态；
2. **寻道与播放循环互斥缺失 (Seek/Play Concurrency Collision)**：用户在进度条滑动或点击预卷起播时，时间轴的离散主动寻道与正在高频运行的 RAF 锁相环（PLL）调速逻辑发生竞争，底层解码器同时接收到多源时间戳冲击，引发连续寻道重入与卡顿；
3. **缺乏严格会合起播屏障 (Deterministic Rendezvous Barrier)**：执行起播跳转时，若未等待双视频完全退出寻道且物理解码数据均就绪，先就绪的一侧提前开跑，使从属侧产生瞬间巨大相位差，继而频繁触发硬对齐与调速震荡。

必须在核心同步引擎中建立显式的**代数守卫（Epoch Guard）**、**寻道/时钟互斥机制**以及**双端严格会合起播屏障**，从机制上彻底根除这一类异步状态竞争。

## What Changes

- **核心同步引擎升级 (`src/core/sync-engine.ts`)**：
  - **彻底移除循环内的带有唤醒副作用的延迟回调**：在 `stepSync` 播放循环中，绝不传递具有 `play()` 唤醒动作的完成回调，消除幽灵播放可能；
  - **引入代数守卫与显式意图标记 (Epoch & Playback Intent Guard)**：引擎维护全局操作代数 `currentEpoch` 与用户播放意图 `intendedPlaying`；所有底层异步 `seeked` 事件触发时，若代数不匹配或意图已变为暂停，立即丢弃任何后续操作，严防异步事件穿透暂停态；
  - **寻道与时钟严格互斥 (Seek-First Mutual Exclusion)**：当调用 `seekToTau`（拖动滑块或快捷跳转）时，引擎立即原子化挂起时钟循环（进入 `SEEKING` 静息态），阻止锁相环在寻道未完成期间发送干扰指令；
  - **双端严格会合起播屏障 (Deterministic Rendezvous Barrier)**：无论是点击「播放」还是「锚点前 1s 预卷起播」，引擎必须通过 Promise 等待双通道全部完成底层寻道且满足 `readyState >= 2` 后，在同一微任务拍点同步派发双端 `play()` 并激活主时钟循环，确保零初始相位差。
- **视图层交互管道规范化 (`Workbench.tsx` 与 `ExportPage.tsx`)**：
  - 时间轴 Slider 拖动过程纯粹调度 `seekToTau`，拖动期间彻底静默后台时钟；
  - 「锚点前 1s」操作直接下发高层语义命令 `playFrom(targetTau)`，由引擎内部闭环完成“挂起 $\rightarrow$ 双端寻道会合 $\rightarrow$ 联合起跑”的全流程，组件不再手动写嵌套回调。

## Capabilities

### New Capabilities

无（业务模型仍归属于 `timeline-audio-sync` 域）。

### Modified Capabilities

- `timeline-audio-sync`: 细化与强化「绝对主时钟与 PLL 锁相环同步引擎」的要求规范，明确增加寻道/时钟互斥机制、代数守卫丢弃脏回调、以及双端严格会合起播屏障（Rendezvous Barrier）契约，消除任何单侧脱缰播放与跳转起步卡顿。

## Impact

- **受影响代码**：
  - `src/core/sync-engine.ts`（核心引擎状态机与代数屏障重构）
  - `src/core/sync-engine.verify.ts`（增加代数守卫与会合屏障测试用例）
  - `src/components/Workbench.tsx`（规范预卷播放与时间轴拖拽交互）
  - `src/components/ExportPage.tsx`（规范预览跳转交互）
- **依赖与系统开销**：纯原生 TypeScript 状态机，零外部依赖，极小 CPU 内存开销，大幅降低解码器并发冲突。
