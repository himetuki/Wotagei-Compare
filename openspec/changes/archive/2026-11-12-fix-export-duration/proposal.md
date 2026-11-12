# Proposal

## Why

当前导出功能存在严重的成片时长失控缺陷：用户在 A-B 区间仅截取数秒的短视频，导出后的视频文件却异常膨胀至数十秒甚至数分钟，且画面动作被严重拉慢卡顿、音频在数秒后提前静音。

经排查，根本原因在于当前的离线导出引擎（`VideoExporter`）在逐帧异步寻道（`seekVideo`）和渲染 Canvas 时，错误地接入了基于系统物理挂钟时间（Wall-clock time）的实时录制管线（`canvas.captureStream` 与 `MediaRecorder`）。由于视频元素解码寻道在真实物理世界中单帧耗时 50ms~300ms，`MediaRecorder` 将离线渲染所消耗的漫长物理耗时直接录制为成片时长，导致视频被严重拉长；同时，离线音频缓冲在挂钟原点实时播放，导致音画在数秒后严重脱节并静音，且 CH1/CH2 原声音轨缺失离线混音逻辑。必须彻底重构导出管线，将帧时间戳与物理渲染耗时解耦，保证成片时长、帧率与音画严格精确对齐。

## What Changes

- **解耦离线渲染与编码时钟**：废除将逐帧异步寻道画面直接喂给实时 `MediaRecorder(canvas.captureStream())` 的错误模式；重构为基于确定性时间戳（Presentation Timestamp, PTS）的离线编码管线，确保输出视频的时长严格等于 `(clipEnd - clipStart) / slowMotionRate`，每一帧的 PTS 由 `frameIndex / fps` 精确数学计算生成，彻底免疫物理挂钟寻道耗时。
- **引入现代 WebCodecs + 纯 JS 容器封包引擎**：利用现代浏览器与 Android WebView 原生提供的硬件加速 `VideoEncoder` 与 `AudioEncoder`，配合轻量级 `mp4-muxer`，实现真·离线逐帧确定性 MP4 封装；若运行环境不支持 WebCodecs，提供基于真实倍速播放录制或离线虚拟时钟的可靠降级方案。
- **打通 CH1 / CH2 原声音轨离线提取与变速混流**：补充 `VideoExporter` 中原声导出逻辑缺失的缺陷，通过 `AudioContext.decodeAudioData` 或离线音频切片，按统一时间轴速率比与慢放倍率提取截取区间内的音频采样，送入音频编码器，实现节拍器、CH1 原声、CH2 原声在导出成片中全链路声画同步。
- **导出参数与成片元数据一致性校准**：校准导出页面中的预计时长与总帧数展示，确保实际导出的 MP4 文件时长、总帧数与界面显示分毫不差。

## Capabilities

### New Capabilities
（无新能力，本变更专注于修复现有导出管线）

### Modified Capabilities
- `comparison-export`: 修订「同步音频混流与 MP4 编码」要求，明确规定成片时长 MUST 精确等于截取区间除以慢放倍率，严禁受渲染物理挂钟耗时影响；编码管线 MUST 基于确定性时间戳（PTS）进行离线封装；音频混流 MUST 覆盖 CH1/CH2 视频原声的变速离线截取与完整声画对齐。

## Impact

- **核心算法层**：重构 `src/core/exporter.ts`，重写视频逐帧送编与音频离线采样混合管线，实现解耦挂钟时间的确定性编码器。
- **依赖库**：引入现代化轻量纯 JS 封装库 `mp4-muxer`（无 WASM，零原生依赖），用于封装 WebCodecs 产生的音视频包；若有需要同步更新 `package.json`。
- **界面与交互**：`src/components/ExportPage.tsx` 中的成片统计、进度反馈以及导出取消逻辑与新编码器生命周期深度对齐。
- **架构决策**：在 `docs/decisions/` 新增 `AgDR-0015-基于WebCodecs与确定性时间戳的离线视频导出重构.md`。
