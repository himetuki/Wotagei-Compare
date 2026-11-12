# Technical Design: 双视频同步时钟引擎 (DualVideoSyncEngine)

## Context

在对比播放工作台（`Workbench.tsx`）与导出预览页（`ExportPage.tsx`）中，为了确保两路视频在用户拖拽进度条、起播及慢放时不发生单侧卡死（Seek Thrashing）和声画漂移，前期实现了起播就绪防抖栅栏与二值化锁相环（参见 proposal.md - Why）。然而这些实现作为零散修补直接硬编码在 React 组件中，带来了大量的重复状态管理（6 个以上的 `useRef` 与事件监听器）和脆弱的边界控制。

本设计旨在确立一套领域无关、无 UI 绑定的独立纯 TypeScript 引擎 `DualVideoSyncEngine`，规范双路视频控制管道，统一时钟、寻道与平滑阻尼追赶。

## Goals / Non-Goals

**Goals:**
- **单一职责与关注点分离**：将所有 HTMLVideoElement 的寻道队列、就绪检查、时钟维护、锁相环调速和交集循环完全封装在 `DualVideoSyncEngine` 类中。
- **连续阻尼平滑调速**：替代二值化硬微调，使从属视频在误差范围内以连续阻尼曲线平滑贴合主时钟，杜绝视听顿挫。
- **组件胶水代码清零**：使 `Workbench.tsx` 和 `ExportPage.tsx` 仅作为声明式视图与交互入口，消灭组件内直接操作 `currentTime`、`play()` 与 `seeking` 的冗余代码。
- **可测试性与高健壮性**：引擎核心状态机与阻尼数学算法具备独立自动化单元验证，不依赖浏览器 DOM 环境即可模拟验证。

**Non-Goals:**
- 本次重构不改变现有的统一时间轴计算数学逻辑（`calculateUnifiedTimeline`）和 Canvas 2D 画面合成算法（`renderComparisonFrame`）。
- 本次重构不涉及全量 WebCodecs 实时播放器改造（实时播放依然基于 HTMLVideoElement，离线导出保持现有的 WebCodecs 导出管线）。

## Architecture

```
+-----------------------------------------------------------------------------------------+
|                                  DualVideoSyncEngine                                    |
|                                                                                         |
|  +-----------------------------------------------------------------------------------+  |
|  |                                  Clock Master                                     |  |
|  |  (根据 soundSource: 'video1' | 'video2' | 'metronome' 动态选定物理硬件时钟/虚拟时钟)  |  |
|  +-----------------------------------------+-----------------------------------------+  |
|                                            |                                            |
|                       +--------------------+--------------------+                       |
|                       v                                         v                       |
|         +---------------------------+             +---------------------------+         |
|         |    SafeVideoController    |             |    SafeVideoController    |         |
|         |         (Video 1)         |             |         (Video 2)         |         |
|         | - 排队寻道队列 (Queue)      |             | - 排队寻道队列 (Queue)      |         |
|         | - seeking 互斥与就绪栅栏    |             | - seeking 互斥与就绪栅栏    |         |
|         +-------------+-------------+             +-------------+-------------+         |
|                       |                                         |                       |
|                       +--------------------+--------------------+                       |
|                                            |                                            |
|                                            v                                            |
|  +-----------------------------------------------------------------------------------+  |
|  |                      Continuous Damped Velocity Controller                        |  |
|  |         rate = baseRate * (1 + (expectedT - currentTime) / tau_damping)           |  |
|  |                (小误差连续收敛，大误差 >0.3s 且冷却 >600ms 时硬跳转)                  |  |
|  +-----------------------------------------+-----------------------------------------+  |
|                                            |                                            |
+--------------------------------------------+--------------------------------------------+
                                             | 暴露极简 API: play, pause, seekTo, setRate
                      +----------------------+----------------------+
                      v                                             v
             +-----------------+                           +-----------------+
             |  Workbench.tsx  |                           | ExportPage.tsx  |
             +-----------------+                           +-----------------+
```

## Decisions

### 1. 采用独立领域引擎类而不是 Custom Hook
- **决策说明**：新建 `DualVideoSyncEngine` 纯 TypeScript 类管理双通道媒体，组件内仅通过 ref 挂载其实例并订阅事件。
- **权衡分析**：Custom Hook 会与 React 组件的 re-render 机制绑死，当 `tau` 以 60fps 刷新时会触发昂贵的 React 树协调；而独立引擎使用标准的观察者模式（Observer），仅在必要时通知状态，渲染循环完全交由 Canvas 驱动。
- **决策留痕**：详见 [AgDR-0017-双视频同步时钟引擎重构与连续阻尼调速](../../docs/decisions/AgDR-0017-双视频同步时钟引擎重构与连续阻尼调速.md)。

### 2. 连续阻尼比例调速算法 (Continuous Damped Velocity Controller)
- **决策说明**：针对从属通道时间偏差 $\Delta t = t_{\text{expected}} - t_{\text{current}}$，当 $|\Delta t| \in [0.01s, 0.3s]$ 时，采用一阶阻尼连续调速：
  $$\text{playbackRate} = \text{baseRate} \times \left(1 + \text{clamp}\left(\frac{\Delta t}{\tau_{\text{damping}}}, -0.15, +0.15\right)\right)$$
  其中 $\tau_{\text{damping}} = 0.5s$。
- **权衡分析**：相比原有硬编码的 $1.08 / 0.92$，连续比例曲线在误差接近 0 时自动平滑衰减，彻底避免在死区边界反复震荡（Chattering）。
- **硬跳转兜底**：当 $|\Delta t| > 0.3s$ 且距离上次硬跳转已过 600ms 冷却时间，触发一次安全的硬跳转同步。

### 3. SafeVideoController 封装寻道排队状态机
- **决策说明**：每个 HTMLVideoElement 拥有一个受保护的控制句柄。调用 `seek(t)` 时，若当前处于 `seeking === true`，新目标时间存入 `pendingTarget`；待 `seeked` 事件触发后再自动取出最新的 `pendingTarget` 执行寻道。
- **权衡分析**：彻底切断 RAF 循环或用户连续拖拽滑条时打断底层解码器的死循环。

## Risks / Trade-offs

- **[Risk]** 在移动端低端设备上，频繁设置 `playbackRate` 可能引起微弱的音频重采样开销。
  - **Mitigation**：设置死区阈值（$|\Delta t| < 10\text{ms}$ 时不调整），此时保持 `baseRate`，避免无效的高频微调。
- **[Risk]** 组件卸载时引擎循环未清理造成内存泄漏。
  - **Mitigation**：引擎提供标准 `destroy()` 方法，统一注销事件监听并停止 RAF/rVFC 驱动循环。

## Migration Plan

1. 在 `src/core/sync-engine.ts` 中实现 `DualVideoSyncEngine` 并编写算法校验 `src/core/sync-engine.verify.ts`。
2. 改造 `Workbench.tsx`，将内部的 `safeSeek`、`isSeekingRef`、同步 RAF 循环替换为 `syncEngine`。
3. 改造 `ExportPage.tsx`，同样接入 `syncEngine`。
4. 运行 `pixi run build` 与验证脚本，确认编译无报错且双工作台交互丝滑。
