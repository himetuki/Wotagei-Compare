# Proposal: 重构双视频同步时钟引擎 (DualVideoSyncEngine)

## Why

目前在对比播放工作台（`Workbench.tsx`）与导出预览页（`ExportPage.tsx`）中，为了规避 HTMLVideoElement 异步解码带来的寻道雪崩（Seek Thrashing）与播放时钟漂移，两个组件各自手写并重复了数百行 `safeSeek` 队列防抖、冷却隔离、起播就绪检查以及硬编码的二值化锁相环（$1.08 / 0.92$）调速逻辑。这些胶水代码与 React 视图深度纠缠，代码重复率高且控制算法较为粗放，在微小误差收敛时容易产生微震荡。

借鉴工业界与 W3C TimingObject / MediaSync 的成熟架构设计，将所有针对底层媒体元素的时钟管理、安全寻道队列、起播栅栏与连续阻尼调速控制下沉为独立、纯净、无 UI 绑定的核心同步引擎 `DualVideoSyncEngine`，不仅能彻底清空 UI 组件内的脆弱“修修补补”，更能显著提升双视频在拖拽、起播和超慢放下的流畅性与帧对齐稳定性。

## What Changes

- **新增独立纯 TS 同步引擎 (`src/core/sync-engine.ts`)**：
  - **虚拟时间轴与自适应主时钟管理**：将时间抽象为统一的虚拟时钟向量，支持发声通道作为硬件绝对主时钟驱动、静音/节拍器模式下虚拟系统时钟平滑驱动。
  - **封装安全寻道控制器 (`SafeVideoController`)**：严格基于事件队列与状态锁阻断 `seeking === true` 期间的重复设值，彻底杜绝单侧寻道死锁（Seek Thrashing）。
  - **连续阻尼比例调速算法 (Continuous Damped Velocity Controller)**：用基于误差的连续阻尼微调曲线替代原有离散粗暴的固定倍率（$1.08 / 0.92$），在消除漂移的同时消除声画调速顿挫感。
  - **开箱即用的生命周期与区间循环**：统一内置起播就绪防抖栅栏（双端就绪联合起播）以及截取交集区间（Intersection Interval）的自动无缝循环控制。
- **彻底精简组件视图层 (`Workbench.tsx` 与 `ExportPage.tsx`)**：
  - 彻底拔除两处组件中重复维护的 `isSeekingRef`、`pendingTargetRef`、`lastHardSeekTimeRef`、`safeSeek` 及自研 RAF 同步控制代码。
  - 组件仅持有引擎实例，向其下发 `play()`、`pause()`、`seekTo(tau)`、`setRate(rate)` 等高层语义命令，并响应引擎的时间更新与状态事件。
- **精准帧呈现感知（可选接入 `requestVideoFrameCallback`）**：
  - 在支持的现代 Chromium / Android WebView 环境中，引擎内部优先配合 rVFC 捕捉真实硬件解码呈现帧，提供更加稳固的帧对齐表现。

## Capabilities

### New Capabilities

无（业务契约仍收敛在现有的时间轴与音视频同步域内）。

### Modified Capabilities

- `timeline-audio-sync`: 细化与升级「绝对主时钟与 PLL 锁相环同步引擎」的要求规范，明确双视频控制器需具备统一安全寻道队列、连续阻尼调速曲线与起播就绪栅栏，消除组件视图层的偶发性时钟漂移与寻道雪崩。

## Impact

- **受影响模块与文件**：
  - `src/core/sync-engine.ts`（新建，核心同步引擎）
  - `src/core/sync-engine.verify.ts`（新建，核心算法与状态机验证）
  - `src/components/Workbench.tsx`（重构，移除重复同步修补逻辑，接入引擎）
  - `src/components/ExportPage.tsx`（重构，移除重复同步修补逻辑，接入引擎）
- **外部依赖**：无新增第三方 npm 重量级依赖，采用纯 TypeScript 结合 Web 标准 API 实现，保持零冗余与极高执行性能。
- **架构收益**：彻底实现视图层与音视频时钟控制层的关注点分离，消除近 300 行脆弱重复代码，保障移动端横屏监看与导出预览体验的高度丝滑一致。
