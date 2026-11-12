# Design

## Context

见 `proposal.md - Why`。当前 `src/core/exporter.ts` 的离线逐帧渲染循环中，使用了基于系统挂钟时间的 `MediaRecorder(canvas.captureStream())`，导致异步寻道解码产生的真实物理等待耗时被误作为成片播放时长录入，造成导出视频时长严重拉长、画面卡顿 PPT 化且声音提早断流。系统需要一条基于确定性时间戳（PTS）的真正离线编码封装流水线。

## Goals / Non-Goals

**Goals:**
- **成片时长严格受控**：导出的 MP4 文件物理播放总时长严格等于 `(clipEnd - clipStart) / slowMotionRate`，误差控制在单帧以内（< 33ms）。
- **帧时间戳与物理耗时解耦**：每一视频帧的时间戳由其在输出时间轴上的离散序号 `frameIndex / fps`（单位微秒）严格确定，无论单帧寻道渲染耗费 10ms 还是 500ms，成片始终按设定帧率平滑播放。
- **音视频全程声画同步**：导出的音轨总时长与视频总时长完全一致；不仅支持节拍器，还支持 CH1 与 CH2 视频原声的截取、速率比对齐与慢放变速离线混流。
- **硬件级高性能封装**：优先基于现代浏览器与 Android WebView 原生提供的 WebCodecs 硬件加速编码器，结合轻量纯 TS/JS 的 `mp4-muxer` 流式封装，避免引入臃肿的 WASM。

**Non-Goals:**
- 不引入体积超过 100KB 的外部多媒体重型全功能库（如 FFmpeg.wasm）。
- 不变更导出工作台现有的单轨双端点 A-B 剪辑手柄、成片统计指示与视口交互。

## Decisions

主要架构决策详见决策记录：
- [AgDR-0015: 基于 WebCodecs 与确定性时间戳的离线视频导出重构](../../docs/decisions/AgDR-0015-基于WebCodecs与确定性时间戳的离线视频导出重构.md)

### 1. 离线编码管线数据流设计

整体架构采用「离散时间推进 -> 离屏单帧绘制 -> 显式 PTS 视频编码 -> 离线音频切片混流 -> MP4 流式封装」的分层架构：

```text
[A-B 时间区间 + 慢放倍率]
        │
        ├─► [离线音轨生成器]
        │        ├─ 节拍器: OfflineAudioContext 脉冲离线合成
        │        └─ 原声(CH1/CH2): decodeAudioData -> PCM 时域抽取变速
        │        │
        │        ▼
        │   [AudioData / PCM] ──► [AudioEncoder (AAC)] ──┐
        │                                                │
        └─► [离散步进帧循环: frame 0 .. totalFrames-1]   │
                 │                                       │
                 ▼                                       ▼
        [seekVideo1 & 2] (异步等待解码)            [mp4-muxer Muxer]
                 │                                       │
                 ▼                                       ▼
        [renderComparisonFrame(ctx)]                 [MP4 Blob]
                 │                                       │
                 ▼                                       ▼
        [new VideoFrame(canvas, { timestamp })]    [Android 相册保存 /
                 │                                  浏览器直接下载]
                 ▼
        [VideoEncoder.encode(H.264)] ────────────────────┘
```

1. **确定性帧时间戳控制**：
   - 设目标帧率 $fps = 30$，成片时长 $T_{\text{out}} = \frac{clipEnd - clipStart}{slowMotionRate}$，总帧数 $N = \max(1, \text{round}(T_{\text{out}} \times fps))$。
   - 第 $k$ 帧（$k \in [0, N-1]$）在输出时间轴上的时间戳为：
     $$\text{timestamp}_{\mu\text{s}} = \text{round}\left( k \times \frac{1,000,000}{fps} \right)$$
     $$\text{duration}_{\mu\text{s}} = \text{round}\left( \frac{1,000,000}{fps} \right)$$
   - 将渲染完成的离屏 Canvas 包装为 `new VideoFrame(canvas, { timestamp, duration })` 并送入 `videoEncoder.encode(videoFrame, { keyFrame: k % (fps * 2) === 0 })`，随后立即执行 `videoFrame.close()` 释放显存。

2. **音频离线提取与变速管线**：
   - 当声音源为 `metronome` 时，继续使用 `OfflineAudioContext` 渲染时长为 $T_{\text{out}}$ 的节拍音轨。
   - 当声音源为 `video1` 或 `video2` 时，利用源视频的 `audioInfo` 缓存或通过 `fetch(videoUrl) -> arrayBuffer() -> audioCtx.decodeAudioData()` 获得源音频的原始 PCM 数据。
   - 根据源视频在 A-B 截取区间内的映射时间范围，截取对应音频片段，并根据有效播放速率 $k \cdot r_i$ 进行重采样拉伸或通过离线音频图生成时长严格为 $T_{\text{out}}$ 的单声道/双声道音频缓冲区。
   - 将合成的音频流分片创建为 `AudioData` 帧，送入 `AudioEncoder` 编码为 AAC 码流（或直接将 PCM 帧写入 Muxer）。

3. **MP4 容器流式封包（`mp4-muxer`）**：
   - 使用轻量级 `mp4-muxer`（纯 JS 实现，兼容 Web 与移动端环境），创建配置为 Fast Start（`fastStart: 'in-memory'`）的 MP4 封装器。
   - `VideoEncoder` 的 `output` 回调接收到 `EncodedVideoChunk` 后，直接调用 `muxer.addVideoChunk(chunk, meta)`。
   - `AudioEncoder` 的 `output` 回调接收到 `EncodedAudioChunk` 后，直接调用 `muxer.addAudioChunk(chunk, meta)`。
   - 帧循环结束后，依次调用 `videoEncoder.flush()`、`audioEncoder.flush()` 和 `muxer.finalize()`，直接导出包含完整音视频轨的标准 MP4 Blob。

### 2. 环境兼容性与优雅降级

- 在开始导出前，系统检测当前运行环境是否支持 WebCodecs：
  ```ts
  const isWebCodecsSupported =
    typeof window.VideoEncoder !== 'undefined' &&
    typeof window.VideoFrame !== 'undefined';
  ```
- 现代 Android WebView（Android 7+ 更新系统 WebView / Android 10+ 标配 Chrome 94+）均原生支持 WebCodecs。若遇到不支持的极特殊环境，系统在界面抛出清晰指引，或通过锁定挂钟节奏的实时录制模式进行安全降级。

## Risks / Trade-offs

- **[风险] 频繁创建 VideoFrame 导致显存泄漏**  
  *缓解措施*：每一帧在 `videoEncoder.encode()` 之后，必须严格同步调用 `videoFrame.close()`，确保移动端 GPU 纹理显存即刻回收。
- **[风险] 原视频音频解码 fetch 带来额外网络/磁盘 IO**  
  *缓解措施*：源视频已是本地 Blob URL（从相册选取）或本地文件，`fetch(blobUrl)` 读取 ArrayBuffer 在内存中瞬时完成，不会产生额外网络消耗；且单次截取时长通常在 5~30 秒，解码内存开销在数兆以内。
- **[风险] 用户在中途点击“取消导出”**  
  *缓解措施*：在每一帧循环开头检查 `this.isCancelled`，一旦置位立即中断循环，调用 `videoEncoder.close()` 释放编码器句柄，安全清理资源。
