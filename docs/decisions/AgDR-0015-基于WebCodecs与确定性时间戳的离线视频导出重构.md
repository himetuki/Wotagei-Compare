---
id: AgDR-0015
date: 2026-11-12
status: executed
---

# 基于 WebCodecs 与确定性时间戳的离线视频导出重构

> 在 A-B 区间对比视频导出中，面对“离线逐帧寻道渲染耗时被 MediaRecorder 挂钟时间录入导致视频时长严重膨胀失控、音画脱节且原声缺失”的致命问题，我决定：废除 `MediaRecorder(canvas.captureStream())` 实时录制模式，重构为基于 WebCodecs (`VideoEncoder` + `AudioEncoder`) 与纯 TypeScript/JS `mp4-muxer` 的确定性时间戳（PTS）离线编码封包管线，并打通双通道原声的离线采样变速混音，以达成成片时长分秒不差、音画帧级对齐的高性能导出，并接受需引入轻量封装依赖及在不支持 WebCodecs 时提供安全降级的代价。

## 考虑过的方案

| 方案 | 好处 | 代价 |
| --- | --- | --- |
| **方案 A（入选）：WebCodecs (`VideoEncoder` / `AudioEncoder`) + `mp4-muxer` 离线封包** | 每一帧视频的显示时间戳（PTS）由纯数学公式 `frame / fps` 精确控制，彻底与寻道物理耗时解耦；利用移动端与浏览器原生硬件 GPU 编码器，速度极快且内存极低；无需大型 WASM | 需要引入一个轻量纯 JS 容器封装库 `mp4-muxer`；极老旧内核需具备降级策略 |
| **方案 B：以目标慢放倍速实时播放并使用 MediaRecorder 录制** | 无需新依赖，直接使用浏览器内置 API | 无法做到离线逐帧渲染，弱网或设备卡顿会导致掉帧与音画不同步；0.1x 超慢放下浏览器视频解码器常出现不发声或跳帧；导出耗时必须等同于成片物理播放时间，无法加速 |
| **方案 C：FFmpeg.wasm 离线逐帧转码** | 支持任意格式转码与各种滤镜参数 | 体积巨大（>25MB WASM），加载慢，且移动端 WebView 内存极其紧张（容易导致 OOM 崩溃杀进程） |

## 决定

选 **方案 A**，因为：
1. **彻底根治时钟错位**：离线逐帧步进渲染（Offline Frame Stepping）的核心要求是“编码时间戳必须是离散决定的，不受渲染现实物理时间流逝的影响”。WebCodecs 的 `VideoFrame` 与 `VideoEncoder.encode` 允许开发者逐帧显式传入 `timestamp`（微秒）和 `duration`。无论异步 `seekVideo` 耗费了 50ms 还是 500ms，送进编码器的 PTS 始终保持精准的 $\frac{N}{\text{fps}}$，彻底消除了成片被无限拉长、动作卡顿成 PPT 的病灶。
2. **硬件级高效编码与极简依赖**：WebCodecs 直接调用 Android 底层 MediaCodec 与桌面 GPU 硬件编码器，性能和能效极高。搭配纯 JS 的 `mp4-muxer`（无 WASM、零原生依赖、仅十数 KB），直接在内存中流式封装为规范的 fast-start MP4 格式，无缝兼容 Android 相册与各主流播放器。
3. **闭环音频全链路离线混流**：通过离线 AudioBuffer（或离线提取原视频 AudioTrack 的 PCM 采样），按照统一时间轴上的速率比与慢放倍率提取截取区间内音频，送入 `AudioEncoder`（AAC 编码）封装进同一 MP4 文件，彻底解决此前原声无声、节拍器提前放完后静音的严重缺陷。

## 代价

- 我们接受：在 `package.json` 中引入轻量依赖 `mp4-muxer`；
- 我们接受：需编写针对 WebCodecs 支持度的特征检测（`typeof window.VideoEncoder !== 'undefined'`），在不支持的环境下给出明确友好的环境提示或安全兜底；
- 后面要还的债：如果未来需要支持更高维度的多段非线性拼接，可在离线时间轴采样层进一步扩展多轨道音视频混音器。

## 什么情况下需要重新讨论

- 如果目标运行环境的主流 Android 设备 WebView 存在硬件 H.264 编码器兼容性异常或特定厂商私有拦截，重开此记录评估是否增加 WebM/VP9 或轻量降级管线。
