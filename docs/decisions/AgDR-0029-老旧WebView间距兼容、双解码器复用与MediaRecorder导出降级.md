---
id: AgDR-0029
date: 2026-11-13
status: executed
---

# 老旧 WebView Flex 间距兼容、双解码器复用与 MediaRecorder 导出降级

> 在 Android 10（Chrome 74 WebView）与 16:9 窄横屏（`640×360` + `48px` 三键导航）实测出现全应用 Flexbox `gap` 失效粘连、导出页创建 4 路 `<video>` 导致首秒黑屏与硬解压力、窄屏底栏/按钮溢出以及 Chrome < 94 老手机导出功能点击报错彻底不可用的处境下，面对引入重型 PostCSS/FFmpeg.wasm 依赖违背最简原则或直接阉割老手机导出能力的顾虑，我决定统一将 Flex `gap` 迁移为全内核通用的子元素邻接外边距，让对比台与导出页共享同一对 `<video>` 解码源（4 路降至 2 路），并在 `!isWebCodecsSupported()` 时启用基于预合成 `AudioBuffer` + `canvas.captureStream` + `MediaRecorder` 的兼容录制导出路径，以达成老版本手机视觉零粘连、窄屏零溢出与含导出在内的全向导跑通目标，并接受老旧设备兼容导出耗时约等于成片时长且输出为 `.webm` 格式的代价。

## 考虑过的方案

| 方案 | 好处 | 代价 |
| --- | --- | --- |
| 方案 A：Flex `gap` 用 `@supports (gap: 1px)` 回退；导出页保留独立 2 个 `<video>` 并仅禁用不支持 WebCodecs 的按钮 | 表面改动较小 | **两处致命缺陷**：1) 实测 Chrome 74 支持 Grid `gap`，`CSS.supports("gap", "10px")` 返回 `true` 但 Flex `gap` 实际间距为 `0px`，`@supports` 回退必然失效；2) 4 个 `<video>` 在低端老机极易耗尽硬解槽位且导致首秒黑屏；直接禁用导出按钮导致需求核心功能在老机不可用 |
| 方案 B：引入 PostCSS flex-gap-polyfill + FFmpeg.wasm 软编码 | 自动转换样式且老机可纯 CPU 编 MP4 | 引入 >25MB WASM 与大量构建插件，在低内存老 Android WebView 极易 OOM 闪退，违背最简原则 |
| 方案 C（本方案）：用 CSS 相邻兄弟外边距（`> * + *`）和组件间距类替换 Flex `gap`；`Workbench` 与 `ExportPage` 共享 2 个 `<video>` 引用；Chrome < 94 降级至 `MediaRecorder` + `canvas.captureStream` + `AudioBufferSourceNode` 实时录制 WebM | 零第三方依赖增量、从 Chrome 50 到现代内核间距 100% 一致；并发视频解码器砍半为 2 路、进入导出页 0ms 首帧即显；老手机无需升级 WebView 即可完整跑通视频导出 | Flex 子项间距需遵守统一的布局类规范；无 WebCodecs 的老手机兼容导出速度为 1x 成片物理时长且导出格式为 WebM（Android 原生支持播放） |

## 决定

选 **方案 C**。

1. **为什么不用 `@supports (gap: 1px)` 来兜底 Flexbox `gap`**：
   在 `legacy_android10`（Chrome `74.0.3729.185`）实测：`CSS.supports("gap", "10px")` 返回 `true`（因为 Chromium 66 起已支持 CSS Grid 的 `gap`），但 `display: flex; gap: 10px` 实测间距为 `0px`（Flexbox `gap` 直到 Chrome 84 才落地）。因此只能彻底移除 Flex 容器上的 `gap`（仅保留 Grid 容器如 `.slot-grid`、`.export-grid` 的 `gap`），改用 `.flex-gap-*` / `> * + *` 邻接边距或子项明确 `margin`，实现零成本跨代统一。
2. **为什么对比台与导出页共享同一对 `<video>`（演进自 `AgDR-0019`）**：
   `AgDR-0019` 曾指出若低端设备限制后台 `<video>` 数量导致冲突需重新评估。在 Chrome 74 实测进入导出页前 `1000ms` 一直黑/半屏、`1500ms` 才双边就绪。由于 `ExportPage` 本来就是 `Workbench` 的子视图，两者永远不会同时播放：将 `Workbench` 的 `videoRef1` / `videoRef2` 直接作为 `prop` 传给 `ExportPage` 的 `DualVideoSyncEngine` 接管控制，并发解码器数量从 4 路降为 2 路，不仅保护老机 MediaCodec 槽位，而且进入导出页时视频早已 `readyState === 4`，实现秒出预览画面。切回对比台时已有 `attachVideos` + `seekToTau` 自动重新接管。
3. **为什么 Chrome < 94 采用 `MediaRecorder` + 预合成 `AudioBuffer` 降级导出（落地 `AgDR-0015` 降级条款）**：
   `AgDR-0015` 曾否决“离线逐帧寻道 + `MediaRecorder`”，原因是异步寻道卡顿会被实时录制拉长成片。本次兼容降级**不采用离线逐帧寻道**，而是直接利用已有的 `DualVideoSyncEngine` 按当前 `slowMotionRate` 连续播放 A-B 区间（同时 `requestAnimationFrame` 将对比画面画在离屏/预览 Canvas 上），并用已有的 `synthesizeMetronomeBuffer` / `createSourceAudioBuffer` 预先合成精确时长的 `AudioBuffer` 通过 `AudioBufferSourceNode` 送入 `MediaStreamAudioDestinationNode` 与 `canvas.captureStream(30)` 合并录制。经 Chrome 74 真机实测，`video/webm;codecs=vp8,opus` 可稳定产出有效视频流，且无需将 `<video>` 接入 `MediaElementAudioSourceNode`（避免单页多次绑定限制与跨域污染）。Chrome 94+ 设备仍 100% 走 `WebCodecs + mp4-muxer` 离线高速 MP4 导出，互不干扰。

## 代价

- 我们接受：无 WebCodecs 的老版本手机导出格式为 `.webm`（VP8+Opus，Android 系统及主流播放器均支持），且耗时约为 `(clipEnd - clipStart) / slowMotionRate` 实时时长。
- 我们接受：前端 Flexbox 容器不再使用 `gap` 属性，改由样式表邻接间距类控制。
- 后面要还的债：无。

## 什么情况下需要重新讨论

- 当最低支持的 Android System WebView 全面达到 Chrome 94+ 时，可移除 `MediaRecorder` 兼容导出分支与 Flex 邻接边距兼容规则。
