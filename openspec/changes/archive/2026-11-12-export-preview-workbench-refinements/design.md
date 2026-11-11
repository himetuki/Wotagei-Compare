# Design

## Context

在完成移动端横屏视口层级精简之后，用户对细节交互提出了进一步的直觉化要求：导出区间需要一条真正的单轨挂载左右活动端点、预览播放需要支持点击进度条不中断连续播放与真实音频输出、对比台工具栏需要显式且直观的长梯形拉手按钮。

相关架构决策见：[AgDR-0011](../../docs/decisions/AgDR-0011-单轨双端点导出区间与对比台梯形抽屉拉手交互.md)。

## Goals / Non-Goals

**Goals:**
- **单轨双端点**：用一条单一时间轴轨道与左右可拖动端点手柄替代原先分开的起点 A 与终点 B 独立滑块行，直观呈现并调整导出闭区间。
- **连续无中断预览**：在预览播放中，拖拽或点击时间轴进度条时，平滑重新寻道底层视频并保持播放，不触发暂停。
- **所见即所得音频发声**：预览时根据 `initialSoundSource` 真实发声（CH1/CH2 原声变速不变调或 WebAudio 合成节拍器），修复静音状态。
- **居中长梯形抽屉拉手**：在对比台顶栏正下方正中位置提供醒目的长梯形拉手按钮，直观引导第二行工具栏的收展。

**Non-Goals:**
- 不改变底层 MP4 离线视频导出的渲染管线与编码参数。
- 不引入外部复杂的时间轴 UI 依赖库，采用轻量级原生 HTML/CSS 与 Pointer Events 实现。

## Decisions

### 1. 单轨双端点区间标尺（Dual-Thumb Range Track）

- **DOM 与布局设计**：
  - 单一轨道容器占满宽度，高度约 28px，内部包含：
    - 底层全长交集背景导轨（`intersectStart` 至 `intersectEnd`）；
    - 中间高亮覆盖区域（自 `clipStart` 至 `clipEnd`，使用 `var(--accent-bg)` 与 `var(--accent)` 边框）；
    - 左端点手柄（IN / A）：可拖动滑块，标有 `A` 或垂直双细线抓手，点击/拖拽时通过 Pointer Capture 连续计算时间戳；
    - 右端点手柄（OUT / B）：可拖动滑块，标有 `B`；
    - 快速标记按钮「设当前为 A」与「设当前为 B」放置在轴线正上方两端，搭配高精度等宽数值反馈。
- **约束防交叉逻辑**：
  - 拖拽左端点时：$newA = \max(intersectStart, \min(clipEnd - 0.2, targetTau))$；
  - 拖拽右端点时：$newB = \min(intersectEnd, \max(clipStart + 0.2, targetTau))$；
  - 释放鼠标或触点时调用 `seekPreview` 快速更新预览画面。

### 2. 导出预览拖拽平滑寻道与连续播放

- 原实现中在 `slider` 的 `onChange` 里强行调用了 `if (isPreviewPlaying) togglePreviewPlay()`。
- 改为：
  - 拖动时仅执行 `seekPreview(newTau)`；
  - 若当前 `isPreviewPlaying` 为 `true`，`v1` 与 `v2` 在硬件更新 `currentTime` 后保持播放循环继续运行，RAF 主循环在下一次渲染时自然继续推进，完全消除不必要的强行暂停。

### 3. 导出预览音视频全链路同步与节拍器接入

- 移除 `ExportPage.tsx` 中 `<video>` 的硬编码 `muted` 属性；
- 引入 `SynthesizedMetronome` 实例：
  - 当 `initialSoundSource === 'metronome'`：`v1.muted = true; v2.muted = true;` 在 RAF 循环中调用 `metronomeRef.current.tick(currentTau, timeline.effectiveBpm, initialRate)` 触发节拍；
  - 当 `initialSoundSource === 'video1'`：`v1.muted = false; v1.volume = 1.0; v2.muted = true; v1.preservesPitch = true;`
  - 当 `initialSoundSource === 'video2'`：`v1.muted = true; v2.muted = false; v2.volume = 1.0; v2.preservesPitch = true;`
  - 当 `initialSoundSource === 'mute'`：`v1.muted = true; v2.muted = true;`
- 暂停或页面卸载时重置音频状态，防止后台走音。

### 4. 对比台正中长梯形展开/收起拉手按钮（Trapezoid Drawer Tab）

- **视觉形态**：
  - 宽度约 72px，高度约 16px，使用 CSS 梯形切角：
    - 收起状态：上底宽、下底窄倒梯形，内部包含小型向下箭头 `▼` 或 `ChevronDown`；
    - 展开状态：位于展开工具栏底部边缘，下底宽、上底窄正梯形，内部包含小型向上箭头 `▲` 或 `ChevronUp`；
  - 边框与背景采用深炭灰与微妙高光，贴合影视监视器暗黑风格；
- **交互逻辑**：
  - 点击梯形拉手按钮直接触发 `onToggleToolbar()`；
  - 保证在移动端横屏触控时有良好的点按区域与即时反馈。

## Risks / Trade-offs

- **[Risk]** 单轨双滑块在移动端触控时两个手柄距离过近可能产生点击冲突。
  - **Mitigation**: 限制 $OUT - IN \ge 0.2s$ 最小物理间距，并优化点击命中判定（优先拾取距离触摸点更近的端点手柄）。
- **[Risk]** 某些移动浏览器策略可能阻止未经用户手势激活的视频音轨发声。
  - **Mitigation**: 音频仅在用户主动点击「预览」按钮后解除静音并起播，符合所有现代浏览器关于用户手势激活音频的规范。
