# Technical Design: 双视频寻道互斥与严格会合起播状态机 (sync-engine-rendezvous-fix)

## Context

在真实设备测试中，用户在播放中点击时间轴进度条或点击「锚点前 1s」操作时，偶发严重的单侧视频卡顿甚至双侧掉帧；且点击「暂停」后仅单侧暂停，卡顿侧反而变流畅继续播放（详见 proposal.md - Why）。

该问题的物理本质是：浏览器音视频解码器的异步寻道事件与 JavaScript 的高频时钟循环（RAF）之间缺乏严格的生命周期代数隔离和互斥屏障。

## Goals / Non-Goals

**Goals:**
- **消除幽灵播放回调 (No Ghost Play)**：暂停动作具有绝对最高优先级，确保调用 `pause()` 后双视频 100% 停留在当前帧，绝不被滞后的异步回调重新激活。
- **寻道与时钟原子互斥 (Mutual Exclusion)**：拖拽进度条或调用 `seekToTau` 期间立即挂起后台锁相环时钟循环，杜绝外部输入与内部调速的并发冲突。
- **双端严格会合屏障 (Deterministic Rendezvous Barrier)**：执行起播跳转时，等待双通道完全退出寻道且可渲染数据全部就绪，在同一微任务时刻同步下发 `play()` 并拉起主时钟，初速度与相位严格归零。
- **提供高阶预卷起播接口 (`playFrom`)**：组件只需调用 `engine.playFrom(tau)`，由引擎自动完成挂起、寻道对齐、双端会合与联合起播。

**Non-Goals:**
- 不改变现有的连续阻尼调速公式（`calculateDampedPlaybackRate`）和交集区间映射算法。
- 不引入外部第三方状态机依赖库，纯 TS 原生实现。

## Architecture

```
+-----------------------------------------------------------------------------------------+
|                                    Sync Engine State Machine                            |
+-----------------------------------------------------------------------------------------+

              seekToTau(t) / 用户拖拽滑块
        +-----------------------------------+
        |                                   |
        v                                   |
  +------------+   双端 seek 完成且 ready   +------------+   用户调用 pause()   +------------+
  |  SEEKING   | -------------------------> |  PLAYING   | -------------------> |   PAUSED   |
  | (时钟静默) |                            | (阻尼跟踪) |                      | (代数递增) |
  +------------+                            +------------+                      +------------+
        ^                                                                             |
        |                         用户点击 play() / playFrom()                         |
        +-----------------------------------------------------------------------------+
                                (会合屏障：等待双端 ready)

+-----------------------------------------------------------------------------------------+
|                                      Epoch Guard 机制                                   |
+-----------------------------------------------------------------------------------------+

  1. pause() / seekToTau() 触发时:
     this.currentEpoch++;
     this.intendedPlaying = false; // 若为 pause

  2. 异步 seek(t) 触发时，记录 taskEpoch = this.currentEpoch;

  3. 底层 seeked 事件唤醒时:
     if (this.currentEpoch !== taskEpoch || !this.intendedPlaying) {
         // 丢弃任何后续 play 唤醒动作，严格静止！
         return;
     }
```

## Decisions

### 1. 引入操作代数守卫 (Epoch Guard) 淘汰滞后异步回调
- **决策说明**：引擎维护全局自增计数器 `currentEpoch`。每次状态发生根本性改变（如调用 `pause()`、开始新一次 `seekToTau()`）时，`currentEpoch++`。底层异步事件完成时，若携带的 `taskEpoch` 已经落后于全局代数，或者用户意图已变更为 `intendedPlaying === false`，则直接静默丢弃，严禁调用任何具有启动播放副作用的代码。
- **决策留痕**：详见 [AgDR-0018-双视频代数守卫与严格会合起播状态机](../../docs/decisions/AgDR-0018-双视频代数守卫与严格会合起播状态机.md)。

### 2. 寻道期间强制挂起时钟循环
- **决策说明**：调用 `seekToTau` 时，引擎立即 `stopLoop()` 并将内部状态标记为 `SEEKING`。只有当寻道完成且当前意图依然为播放（如通过 `playFrom` 或跳转前正处于播放态）时，才触发双端会合起播逻辑重新启动时钟。
- **权衡分析**：彻底消除了滑块拖拽过程中 RAF 还在以 60fps 试图通过旧 currentTime 调整 playbackRate 或硬 seek 造成的激烈冲突。

### 3. 提供原子化的 `playFrom(targetTau)` 接口
- **决策说明**：废除组件中先手写 `seekToTau` 再在普通回调里调 `play()` 的两段式写法，改为引擎内聚的 `playFrom(targetTau)`：
  1. 挂起时钟，递增代数，设 `intendedPlaying = true`；
  2. 双通道并行 seek 到各自的目标绝对时间；
  3. 双端进入 Rendezvous 会合屏障，等待双端 `ctrl.isReady()`（即退出 seeking 且 readyState >= 2）；
  4. 同步下发双端 `play()`，复位节拍器，重启时钟驱动循环。

## Risks / Trade-offs

- **[Risk]** 在特定极端掉帧或解码器严重卡顿的手机上，会合屏障可能出现单侧 ready 等待较久。
  - **Mitigation**：设置 250ms 超时保护；超时后强制就地起播，由阻尼 PLL 继续收敛。

## Migration Plan

1. 在 `src/core/sync-engine.ts` 中实现代数守卫、`intendedPlaying` 标记、原子 `playFrom` 及寻道互斥。
2. 更新验证测试 `src/core/sync-engine.verify.ts`，加入代数丢弃与暂停阻断测试。
3. 改造 `Workbench.tsx`，将「锚点前 1s」和进度条交互重构为 `playFrom` 与静默寻道。
4. 改造 `ExportPage.tsx`，统一使用原子预卷起播。
5. 验证编译与重新打出 Android APK 交付用户验证。
