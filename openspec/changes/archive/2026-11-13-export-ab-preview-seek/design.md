# Design

## Context

在 Wotagei-Compare 的导出工作台（`ExportPage.tsx`）中，用户通过单轨双滑块交互定义 A-B 剪辑区间。当前实现中，当用户在播放状态下直接拖动手柄或点击轨道时，未显式暂停播放，导致底层视频被寻道逻辑中断但界面 `isPreviewPlaying` 状态未复位，左下角控制按钮保持在「暂停」文案与图标；同时，由于单次触发的 `drawPreviewFrame()` 在视频寻道未就绪时被底层清屏逻辑置为纯黑，且高频拖拽导致 `onComplete` 回调被丢弃，预览画面出现持续黑屏。具体背景与问题成因见 [proposal.md](./proposal.md)。

## Goals / Non-Goals

**Goals:**
- **起止点调整前置停止与按钮状态自愈**：在用户按下 A/B 手柄、在区间轨道上点击或点击快捷设点按钮时，立即显式暂停视频驱动引擎，将播放状态切为停止，左下角播放控制按钮即刻置为「预览」（Play 图标）。
- **拖动 A/B 时的精准单帧寻道**：拖动起点 A 滑块时，预览时间指针与画面即时切至 A；拖动终点 B 滑块时，切至 B；轨道点击时切至点击时刻。
- **RAF 驱动的实时渲染循环与防黑屏保障**：在导出页组件内建立 `requestAnimationFrame` 驱动的单帧画布渲染机制，彻底替代仅靠单次事件调用的脆弱刷新；在视频寻道中间态保持旧帧，视频就绪后下一刷新帧即刻呈现，拖动过程中全程画面清晰、不闪黑、不黑屏。

**Non-Goals:**
- 不改变导出离线渲染算法（WebCodecs / Canvas PTS 编码管线）及参数继承。
- 不改变对比工作台（`Workbench.tsx`）的现有布局与控制逻辑。
- 不引入外部动画或状态机库，使用 React 内置状态与 Web 原生 RAF API。

## Decisions

### 1. 调整起止点前置显式停止与播放状态机联动

架构决策详见：[AgDR-0025 导出区间调整停止与单帧预览渲染机制](../../docs/decisions/AgDR-0025-导出区间调整停止与单帧预览渲染机制.md)。

- **触发入口收敛**：在 `handlePointerDown('A' | 'B')`、`handleTrackClick` 以及「设当前为 A」和「设当前为 B」按钮的点击处理函数顶部，统一调用：
  ```ts
  const ensureStopped = () => {
    if (isPreviewPlaying || engineRef.current?.getIsPlaying()) {
      engineRef.current?.pause();
      setIsPreviewPlaying(false);
    }
  };
  ```
- **寻道模式锁定**：在停止状态下调用 `seekPreview(targetTau)`，向引擎传递确定的静态寻道意图（`keepPlaying: false`），严禁触发 `playFrom` 会合重播逻辑。

### 2. ExportPage 引入持续渲染帧驱动（RAF Render Loop）

- **替代单次手动刷新**：参考 `Workbench.tsx` 的成功设计模式，在 `ExportPage.tsx` 中建立受生命周期管辖的 `requestAnimationFrame` 循环。在导出页展示期间，每一帧自动从当前 `v1Ref` 与 `v2Ref` 获取最新缓冲帧并绘制到 `previewCanvasRef`。
- **解耦寻道与渲染**：高频拖动指针只需更新 `currentTau` 并向视频元素推送目标寻道时间；只要底层解码器解析出该时间点的最新画面帧（无论是哪一路完成），下一帧 RAF 循环立即自动将其绘制在画布上，无需依赖脆弱的多层事件回调链（`onComplete` / `seeked`）。

### 3. 非就绪帧旧帧缓冲保护（Zero-Black Screen Defense）

- **问题分析**：`renderComparisonFrame` 会在每次调用起始无条件调用 `ctx.fillRect(0, 0, width, height)` 填充全黑，若此时两路视频中某一路因正在寻道而返回 `isCanvasSourceReady === false`，则该路画面直接被纯黑覆盖。
- **保护策略**：
  - 在持续 RAF 循环中，若视频处于 `video.seeking === true` 或 `video.readyState < 2`，且上一帧已有画面，则跳过本次清屏与重绘，保持画布上现存的上一帧稳定图像；
  - 待双侧视频真正完成 `seeked` 并达到 `readyState >= 2` 时，立即执行全新帧的绘制覆盖。这消除了拖动过程中的高频黑闪或白死。

### 4. 拖动寻道节流与 PointerUp 终点校准

- **节流保护**：在 `handlePointerMove` 期间，采用轻量级标志位或 RAF 节流，避免在 1 毫秒内多次向 HTML5 Video 元素硬赋值 `currentTime`；
- **PointerUp 强制对齐**：当指针松开（`handlePointerUp` / `handlePointerCancel`）时，对当前最终确定的 `clipStart` 或 `clipEnd` 执行一次保证落地的最终静态定位 `seekPreview`，确保 A-B 端点与预览画面在停止拖动后 100% 绝对一致。

## Risks / Trade-offs

- **[Risk]** 在导出页挂载期间持续运行 RAF 循环是否会消耗过多移动端 CPU/GPU 电量？
  - **Mitigation**：导出页仅在用户进入导出片段时处于激活状态，且在用户返回对比台或组件卸载时立即通过 `cancelAnimationFrame` 彻底注销；此外，在无拖动且未播放期间，若画面静态未变化，可仅在 tau 变化或视频更新时绘制，也可做简单的 dirty 标记优化。
- **[Risk]** 快速连续拖动 A 与 B 是否可能引起交叉越界？
  - **Mitigation**：沿用已有的端点安全间距守卫：A 的最大值不超过 `clipEnd - 0.2`，B 的最小值不小于 `clipStart + 0.2`，严格保证区间长度不小于 0.2 秒。
