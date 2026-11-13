# Proposal

## Why

在上一次提交将 Android 端视频导出迁移至原生 `MediaCodec + OpenGL ES + MediaMuxer` 管线时，`NativeOfflineExporter.java` 中的 `mapTauToSourceTime` 方法误将 `anchorTime + tau * rate` 写成了 `anchorTime + tau / rate`。这导致只要双通道存在 BPM 对齐换算（`rate != 1.0`，例如开启「随 CH1」「随 CH2」或「手动」BPM 对齐），原生导出成片中需要加速的视频会被反向减速，出现两侧视频倍速严重不对齐、起始帧漂移以及单侧原声变速错乱的缺陷。

## What Changes

- 修复 `android/app/src/main/java/com/wotagei/compare/NativeOfflineExporter.java` 中 `mapTauToSourceTime(tau, anchorTime, rate)` 的时间映射公式，使其与前端唯一真实源 `src/core/timeline.ts` 严格保持一致（`anchorTime + tau * rate`）。
- 补全并明确 `comparison-export` 规格中关于非 `1.0` BPM 对齐速率比下原生离线导出的音画同步要求与可观测验收场景。
- 补充可复现的验证用例（含非 `1.0` 速率比下的原生时间映射公式验证与 `exporter.verify.ts` 校验场景），避免后续迁移回归。

## Capabilities

### New Capabilities

（无新增独立能力）

### Modified Capabilities

- `comparison-export`: 明确 Android 原生离线 MP4 导出在双通道 BPM 速率比 `rate != 1.0` 条件下，双路视频解码时间戳与单侧原声重采样时间戳 MUST 严格按 `anchorTime + tau * rate` 计算，保证导出成片与工作台预览倍速完全一致。

## Impact

- 受影响文件：`android/app/src/main/java/com/wotagei/compare/NativeOfflineExporter.java`（时间轴映射公式修复）
- 受影响验证与测试：`src/core/exporter.verify.ts`、`android/app/src/test/...`（JUnit 映射校验，无运行时生产副作用）
- 决策留痕：`docs/decisions/AgDR-0032-Android原生导出统一时间轴正向乘法映射约束.md`
