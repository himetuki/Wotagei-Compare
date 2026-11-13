# Design

## Context

详见 `proposal.md - Why`。当前代码基线中：
- 前端时间轴真源 `src/core/timeline.ts` 定义：`rate = targetBpm / videoBpm`，`span = [(trimStart - anchorTime) / rate, (trimEnd - anchorTime) / rate]`，`mapTauToSourceTime(tau, anchorTime, rate) = anchorTime + tau * rate`。
- 前端实时预览（`DualVideoSyncEngine`）与 Web 端 `WebCodecs` 导出（`src/core/exporter.ts`）均直接调用上述函数，表现完全正常。
- Android 原生导出器 `android/app/src/main/java/com/wotagei/compare/NativeOfflineExporter.java` 通过 `NativeMediaPlugin` 接收完全一致的 `anchor1/rate1/anchor2/rate2/exportStartTau/exportEndTau`，但在其内部私有方法 `mapTauToSourceTime`（第 777–779 行）误写成 `anchorTime + tau / rate`，而全文件共有 6 处视频帧解码与原声重采样调用依赖于该方法。
- 同时，`src/core/exporter.verify.ts` 中当前仅覆盖了 `rate = 1.0` 的布局案例，未能暴露 `rate != 1.0` 时的乘法/除法方向错误。

## Goals / Non-Goals

**Goals:**
- 修复 `NativeOfflineExporter.java` 中 `mapTauToSourceTime` 的数学公式为 `anchorTime + tau * rate`，使初始寻道（`prepareAtSourceTime`、`seekToSourceTime`）、逐帧视频推进（`advanceToSourceTime`）和单侧原声重采样（`sampleAt`）全部恢复正确速率比。
- 增加覆盖非 `1.0` 速率比（`rate > 1` 与 `rate < 1`）的自动化验证，确保构建与验证命令可直接暴露公式方向错误。

**Non-Goals:**
- 不改动前端与原生插件之间的 JSON 接口结构（`NativeExportRequest` / `NativeVideoLayerLayout` 字段含义本身已是正确的）。
- 不调整 `calculateUnifiedTimeline`、`DualVideoSyncEngine` 或 WebCodecs 导出管线逻辑。

## Decisions

本次修复涉及统一时间轴跨端映射契约的修正与防回归约束，完整决策记录见 [AgDR-0032](../../../docs/decisions/AgDR-0032-Android原生导出统一时间轴正向乘法映射约束.md)。

1. **保持纯参数契约，直接修复原生映射公式**：
   - 将 `NativeOfflineExporter.java` 中 `mapTauToSourceTime`（提升为包级可见或保留静态工具函数供同包测试调用）由 `anchorTime + tau / rate` 修正为 `anchorTime + tau * rate`。
   - 同时保留 `SequentialVideoDecoder`、`SequentialAudioSourceReader` 现有调用链不变，6 处源时间计算同步生效。

2. **补强非 `1.0` 速率比的可观测校验**：
   - 在 `android/app/src/test/java/com/wotagei/compare/` 新增 JUnit 单元测试直接验证 `NativeOfflineExporter.mapTauToSourceTime` 在 `rate != 1.0`（例如 `rate = 1.25`、`rate = 0.8`、负 `tau` 与正 `tau`）下与前端计算结果一致，作为 `./gradlew testDebugUnitTest` 可复现构建/测试输出的一部分。
   - 在 `src/core/exporter.verify.ts` 补充非 `1.0` 速率比的时间轴布局与源时间预期打印校验，覆盖「随 CH1 / 随 CH2 / 手动」对齐场景。

## Risks / Trade-offs

- **真机/模拟器端到端回归依赖 Android 构建环境** → 在应用实现阶段至少完成 TypeScript 类型检查、`npm run build`、`exporter.verify.ts` 验证以及 `android` 单元测试与 Debug APK 编译；若可用则补充模拟器实测。
- **除 `mapTauToSourceTime` 外是否存在隐藏的时长/帧率偏差** → 已通读排查 `NativeOfflineExporter.java` 全文，帧显示时间戳 `ptsNs = round((frame / fps) * 1e9)`、总帧数 `round((exportDur / slowMotionRate) * fps)` 及 `currentTau = exportStartTau + (frame / fps) * slowMotionRate` 均与前端 `exporter.ts` 完全一致，仅 `mapTauToSourceTime` 存在除号笔误。
