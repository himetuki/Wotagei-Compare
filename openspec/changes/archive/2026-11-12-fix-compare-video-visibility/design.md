# Design

## Context

在应用 Wotagei-Compare 中，`Workbench` 组件既承载核心的双视频同台对比播放、慢放、镜像与三线变换监看，又作为 `ExportPage` 导出视图的入口宿主。
当用户点击顶部步骤条中的「导出片段」时，`Workbench` 通过早期条件返回 `if (isExportPageOpen || isExport) return <ExportPage ... />`，将原先包含 `<video>` 与 `<canvas>` 的整个工作台 DOM 树彻底卸载。

当用户随后点击「返回」或点击「对比台」切回时：
1. 产生全新的 `<video>` 与 `<canvas>` DOM 实例；
2. 由于 `Workbench` 顶层组件实例未卸载，创建与挂载视频的 `useEffect(..., [])` 不再重复触发，导致已存在的 `DualVideoSyncEngine` 持续握有被注销的失效视频句柄；
3. 新视频节点未曾执行初相寻道（`seekToTau`），且处于未就绪状态（`readyState === 0`），导致 Canvas 渲染循环无法绘制画面，甚至因浏览器 `drawImage` 异常而中断 requestAnimationFrame；
4. 此外，底层 `SafeVideoController.seek` 在视频元数据未加载阶段会将非零目标时间戳错误截断为 0 并静默丢弃。

设计需在不破坏现有导出与对比工作台交互契约的前提下，彻底根治视频黑屏与渲染不可见问题。详见 [proposal.md](proposal.md)。

## Goals / Non-Goals

**Goals:**
- **零延迟瞬时切回**：从「导出片段」切回「对比台」时，主画布即时恢复双通道视频帧，不发生黑屏、白屏闪烁或画面丢失。
- **DOM 与时钟常驻持久化**：对比台视口在导出期间保持 DOM 驻留，仅通过显隐样式切换并安全暂停播放，彻底切断 DOM 频繁销毁与句柄脱节隐患。
- **双通道视频挂载自愈**：在组件重新挂载、外部步骤微调返回或视频引用更迭时，自动完成新视频节点绑定与初相定位同步。
- **渲染循环与寻道容灾保护**：在 Canvas 渲染循环与 `SafeVideoController` 中建立就绪态屏障，防止异常中断渲染时钟，杜绝元数据未加载导致的寻道丢失。

**Non-Goals:**
- 不重构 `ExportPage` 的内部导出算法与 WebCodecs 确定性时间戳离线封包管线。
- 不调整顶部导航栏步骤分布或删除「导出片段」直达入口。
- 不改变三线正交空间变换算法与 BPM 统一时间轴映射计算纯函数。

## Decisions

### 1. 对比台视口 DOM 持久常驻与导出层显隐容器

- **决策**：废除 `Workbench.tsx` 中的早期条件分支返回，改为统一返回双层 DOM 容器。当处于导出模式时，对比台主视口置为 `display: none` 并立即调用 `engine.pause()` 暂停时钟与视频播放；同时挂载并展示 `<ExportPage>`。当退出导出模式时，对比台主视口重新恢复 `display: flex`，由于原 `<video>` 与 `<canvas>` DOM 节点与上下文全程保持存活，渲染循环立即绘制出当前帧。
- **考虑过的替代方案**：
  - *方案 B（完全解耦为独立步骤）*：将 `Workbench` 与 `ExportPage` 在 `App.tsx` 中分为完全互斥的两个顶级分支，状态全量提升。代价是切回对比台时仍需重新加载视频与执行硬寻道，存在短暂闪烁，且增加了大量全局状态样板代码。
  - *方案 C（保留卸载，依赖 Effect 重新实例化）*：切回时重新 `new DualVideoSyncEngine`。代价是频繁在移动端创建销毁解码实例容易引发解码器泄漏。
- **架构决策记录**：参见 [AgDR-0019](../../docs/decisions/AgDR-0019-对比台DOM持久化与视频挂载自愈状态机.md)。

### 2. 双通道视频挂载动态自愈（Dynamic Ref Re-attachment）

- **决策**：在 `Workbench` 中监听视频 DOM 元素与 `isExport` 状态。当用户从外部步骤切回或组件初始化时，显式检查 `engineRef.current` 与 `videoRef1.current` / `videoRef2.current` 的绑定状态。若检测到视频节点变更或切回对比台，立即执行 `engine.attachVideos(v1, v2)`，并触发一次初相定位寻道（`seekToTau(tau)`），确保音视频播放时钟与画面游标绝对对齐。
- **考虑过的替代方案**：仅依赖首次挂载时的空依赖数组 `[]`。此方案已被证明无法应对父级重载或复杂导航条件下的状态失步。

### 3. SafeVideoController 元数据加载就绪拦截

- **决策**：重构 `SafeVideoController.seek` 逻辑。在视频的 `readyState < 1`（即元数据尚未就绪、`duration` 为 `NaN` 或 0）时，不执行基于 duration 的 clamp 与即刻返回判定，而是挂起目标时间戳，并注册一次性 `loadedmetadata` 事件监听器，待视频元数据就绪后再执行真实寻道与 clamp。
- **考虑过的替代方案**：在外部组件 `Workbench` 中手动添加 `onLoadedMetadata`。将逻辑封装在 `SafeVideoController` 中可直接保证 `ExportPage`、`Workbench` 等全流程所有调用方均免疫元数据就绪前寻道被吞掉的缺陷。

### 4. 单画布渲染循环硬件就绪保护与异常隔离

- **决策**：
  1. 在 `src/core/renderer.ts` 中，对传入的视频源进行 `readyState >= 2`（具备当前帧有效图像）与尺寸大于 0 检查，当未就绪时跳过 `ctx.drawImage`，安全保留背景；
  2. 在 `Workbench` 与 `ExportPage` 的 Canvas 渲染循环中，将 `renderComparisonFrame` 置于安全 `try...catch` 块中。即使个别极端情况下底层抛出 `InvalidStateError`，也绝不阻断后续帧的 `requestAnimationFrame` 调度。

## Risks / Trade-offs

- **[Risk]** 在打开「导出片段」视图时，DOM 中同时存在对比台的 2 个隐藏 `<video>` 与导出页的 2 个 `<video>` 标签，可能在极低端 Android 设备上引起硬件解码器数量顾虑。
  - **Mitigation**: 对比台在进入导出模式时立即调用 `engine.pause()`，处于暂停态的隐藏 `<video>` 标签在移动端现代 Blink 内核中会挂起解码器时钟与硬件管线调度；实测在主流及入门级 Android 设备上 4 个标签并存（2 个暂停、2 个活跃）完全在系统 MediaCodec 配额内。
- **[Risk]** 保持对比台 DOM 存活后，切入导出页时对比台背景的节拍器声音或定时器可能泄漏。
  - **Mitigation**: 在 `isExport` 变为 `true` 时，立即触发 `engineRef.current?.pause()` 并停止节拍器发声，并在显隐 Effect 清理中确保状态静默。
