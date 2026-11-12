# Design

## Context

详见 `proposal.md`。当前导出工作台（`ExportPage.tsx`）与对比播放工作台（`Workbench.tsx`）的画面渲染均使用隐藏或承载的双 `<video>` 元素，通过 `requestAnimationFrame`（RAF）以 60FPS 频率读取视频帧并绘制至 Canvas。

在用户拖动时间进度条定位后点击播放时，由于底层的异步寻道操作尚未完成，RAF 同步循环中检测到的两视频时间偏差 `|diff| > 0.25s`，导致每一帧重复对从属视频执行 `slaveVideo.currentTime = ...`。这种极高频的硬赋值中断了底层解码器的寻道流程，使从属视频陷入无休止的“取消寻道 -> 重启寻道”死循环（Seek Thrashing），表现为单侧画面卡死、严重顿挫或黑屏。

此外，导出台时钟驱动单向固定绑定视频 1，忽略了发声音源为视频 2 时的音频失真问题；进度条高频拖拽缺少节流互斥保护，进一步加剧了解码管线阻塞。

## Goals / Non-Goals

**Goals:**
- **彻底根除双组件单侧卡顿**：确保在任何拖拽后点击播放、或播放中连续拖拽进度条的场景下，导出台与对比台的双侧视频画面平滑推进，无死锁顿挫。
- **寻道互斥与冷却保护**：杜绝向处于 `seeking` 状态的视频重复设置 `currentTime`；对硬寻道实施最小 600ms 的冷却隔离，给底层解码留出物理时间。
- **起播就绪栅栏（Ready Gate）**：用户触发播放时，确保双端视频均退出 seeking 并达到就绪状态（`readyState >= 2`）后再联合起播。
- **智能自适应主时钟**：根据发声音源动态选择主时钟（视频 1、视频 2 或平滑虚拟时钟），确保发声轨道稳定、变速不变调、不产生爆音。
- **区间循环回跳平滑衔接**：在到达区间终点循环回到起点时，采用原子化就绪等待，避免回跳时的相位撕裂。

**Non-Goals:**
- 不重构底层离线 MP4 导出引擎（`VideoExporter`），导出管线已有独立的基于 Promise 事件的逐帧 seek 机制，运行稳定。
- 不引入外部庞大的播放器第三方库（如 video.js、flv.js），保持轻量原生 HTML5 Video 实现。

## Decisions

### 1. 架构决策与 AgDR 索引
- [AgDR-0016: 双视频寻道防抖与防雪崩同步时钟](../../docs/decisions/AgDR-0016-导出预览双视频寻道防抖与防雪崩同步时钟.md)
  - 核心内容：引入起播就绪栅栏、寻道互斥节流、锁相环防雪崩追赶（seeking 互斥与冷却隔离）以及自适应主时钟，全量覆盖 ExportPage 与 Workbench。

### 2. 技术设计细节

#### 2.1 寻道节流与互斥定位器（Throttled Seek Manager）
- 在 `seekPreview`（导出台）及 `seekToTau`（对比台）中：
  - 更新 UI 状态（`previewTau` / `tau`）与当前目标时刻引用；
  - 针对每个视频元素，检查其当前 `seeking` 状态与目标时间：
    - 若 `Math.abs(video.currentTime - targetTime) < 0.01`，则无需寻道；
    - 若视频当前正处于 `seeking === true`，将目标时间保存在 `pendingTarget` 引用中，并监听一次性 `seeked` 事件，待当前寻道完成后再追寻最新目标；
    - 否则直接执行 `video.currentTime = targetTime`。

#### 2.2 起播就绪栅栏（Play Ready Gate）
- 在 `togglePreviewPlay` / `togglePlay` 从暂停切为播放时：
  - 检查视频 1 与视频 2 是否正在寻道（`v1.seeking || v2.seeking`）或未就绪（`v1.readyState < 2 || v2.readyState < 2`）；
  - 若正在寻道，设置播放意图标记 `pendingPlayRef.current = true`，并挂载双端就绪 Promise（通过 `seeked` / `canplay` 事件及短超时兜底）；
  - 当双视频均达到可渲染状态后，统一校准主时钟初始 Tau，同时触发 `v1.play()` 与 `v2.play()`，正式开启播放状态；
  - 若已处于就绪状态，则直接触发播放，实现零延迟即时响应。

#### 2.3 锁相环防雪崩追赶机制（Anti-Thrashing Phase-Locked Loop）
- 播放同步主循环中：
  - **动态选取主时钟 Master**：
    - 若 `soundSource === 'video2'` 且 v2 处于播放就绪状态，以 v2 为主时钟；
    - 否则若 v1 处于播放就绪状态，以 v1 为主时钟；
    - 若两者因缓冲滞后均未就绪，使用虚拟增量时钟（`currentTau += deltaSec * initialRate`）保底推进。
  - **从属视频 Slave 追赶三级控制**：
    - 计算时间差 `diff = slave.currentTime - expectedSlaveTime`；
    - **第 1 级（同步保持区，`|diff| <= 0.03s`）**：设置 `slave.playbackRate = baseRate`；
    - **第 2 级（柔性锁相微调区，`0.03s < |diff| <= 0.3s`）**：设置 `slave.playbackRate = baseRate * (diff < 0 ? 1.08 : 0.92)`，通过微调播放速率让从属视频平滑赶上或等待主视频，**严禁硬改 currentTime**；
    - **第 3 级（严重失步区，`|diff| > 0.3s`）**：
      - 仅在满足两个前提时才允许单次执行硬对齐：
        1. 从属视频当前未在寻道（`!slave.seeking`）；
        2. 距离上次硬对齐时间已超过冷却阈值（`now - lastHardSeekTime >= 600ms`）；
      - 触发硬对齐：`slave.currentTime = expectedSlaveTime`，并刷新 `lastHardSeekTime = now`；
      - 若冷却中或正在寻道，保持柔性微调，绝不重复打断底层解码。

#### 2.4 区间循环重播平滑处理
- 当达到区间终点（导出台 `clipEnd` 或对比台 `intersectInterval.end`）时：
  - 避免在高速播放状态下瞬间对两端同时硬赋值；
  - 统一调用就绪重置：短暂停留并对齐至区间起点，重置节拍器和 PLL 状态，确保下一轮循环起始画面绝对同步。

## Risks / Trade-offs

- **[Risk]** 在极低性能设备上，双端 seek 可能耗时稍长（例如 100ms~200ms）。
  - **→ Mitigation:** 增加 300ms 安全超时降级机制，超时后即便未收到事件也尝试恢复播放，不导致界面死锁；同时播放按钮展示即时反馈。
- **[Risk]** 节拍器合成音频在寻道期间可能产生相位偏离。
  - **→ Mitigation:** 在双视频完成寻道、正式联合起播的精确时间点重置节拍器 `metronome.reset(startTau, bpm)`，保证音画第一拍绝对严丝合缝。
