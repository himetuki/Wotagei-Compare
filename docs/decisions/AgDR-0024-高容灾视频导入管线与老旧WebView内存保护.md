---
id: AgDR-0024
date: 2026-11-13
status: executed
---

# 高容灾视频导入管线与老旧 WebView 全链路防护

> 在坚果 R2 等 Android 10 老旧机型（系统 WebView 内核低于 Chrome 80）运行出现选取 MP4 视频返回后界面无响应仍停留在「未载入」的处境下，面对老旧移动端 Chromium 脱离 DOM 媒体元素不自动加载元数据、缺少 `file.arrayBuffer()` API、大视频全量解码极易触发 WebView 堆内存 OOM 崩溃导致页面重载、`display: none` 导致 Canvas 纹理断流以及 CSS `max()` 语法不兼容的顾虑，我决定实施「乐观状态即刻前置 + 显式加载双重监听与 2.5s 超时保底 + FileReader 降级兼容与大文件防 OOM 保护 + 原生 LargeHeap 与 Legacy 存储配置 + 活跃 1px 纹理保活与 CSS 回退」的全链路容灾加固方案，以达成任意有效 MP4 视频在老旧内核设备上均能稳定即时载入并无缝流转的目标，并接受超大视频跳过自动 BPM 分析（采用 160 BPM 保底并支持点按微调）的代价。

## 考虑过的方案

| 方案 | 好处 | 代价 |
| --- | --- | --- |
| 方案 A：维持现状，仅增加 `tempVideo.load()` 和错误捕获 | 改动最小，不引入状态与流程调整 | 无法解决因果倒置造成的界面停滞等待，大视频依然会因 ArrayBuffer 导致老旧内核 OOM 崩溃重载，低于 Chrome 76 内核仍然无法读取文件，Canvas 仍有黑屏风险 |
| 方案 B：全链路容灾加固：乐观状态前置 + DOM注入显式探测与2.5s超时 + FileReader兜底与大文件防OOM保护 + 原生LargeHeap/Legacy存储 + 活跃1px视频保活与CSS回退（本方案） | 全链路封死无反馈卡死、API缺失、OOM闪退、元数据死等、Canvas黑屏与布局错位，用户选完文件立刻获得视觉反馈，任意视频均能顺利推进全流程 | 对大于 80MB 的超大文件跳过音频自动测速（使用 160 BPM 保底），元数据失败时采用 1080p 标准保底 |
| 方案 C：引入第三方原生插件接管视频选取与参数提取 | 原生层提取时长和分辨率更底层 | 破坏纯跨平台单画布架构，引入繁琐的原生权限配置与原生层文件传递开销，增加维护复杂度 |

## 决定

选 **方案 B**。
1. **彻底消除因果倒置与死等单点**：文件对象一旦由用户选定，已掌握 `file.name` 与 `file.size`。状态必须立即前置挂载，让卡片立刻变成「已就绪/解析中」，严禁将 UI 响应寄生在脆弱的媒体事件之后。
2. **解决老旧移动端 Chromium 媒体探测死穴**：针对脱离 DOM 元素默认不预加载的问题，必须配置 `muted`、`playsinline` 并挂载至安全容器，显式调用 `.load()`，同时监听 `loadedmetadata`、`canplay` 与 `error`；设置 2.5s 硬超时兜底，超时或失败直接使用 1920×1080 与安全时长保底，绝不阻断用户。
3. **老旧 API 兼容与堆内存防崩保护**：老旧内核 Chrome < 76 缺少 `file.arrayBuffer()`，以 `FileReader` 兜底；大文件（> 80MB）直接分配全量 ArrayBuffer 必然导致 Android 沙箱进程 OOM，跳过全量解码不仅瞬间完成导入，且彻底消除闪退。
4. **原生 Android LargeHeap 与 Legacy 存储**：配置 `android:largeHeap="true"` 突破 192MB 进程内存瓶颈，开启 `android:requestLegacyExternalStorage="true"` 兼容 Android 10 老旧文件管理器返回的路径。
5. **底层视频 1px 活跃保活，消除 `display: none` 导致的黑屏**：老旧 Chromium 对脱离 RenderTree 的视频元素会停止向 GPU 合成器推送帧纹理。将 `display: none` 替换为不可见的 1×1 活跃节点，确保 Canvas 能够稳定持续抓取最新画面。
6. **CSS 安全区回退**：对 Chrome < 79 不支持的 CSS `max()` 函数补充静态回退声明，防止内边距归零。

## 代价

- 我们接受：超过 80MB 的大文件不进行耗时的全曲 PCM 频谱自相关测速，采用保底 160 BPM（WOTA 艺典型速度）并引导用户通过已有 BPM 徽章或 Tap Tempo 快速标定。
- 我们接受：极度损坏或元数据超时视频采用 1920×1080 标准宽高保底。
- 后面要还的债：无。

## 什么情况下需要重新讨论

- 如果未来项目最低系统要求提升至 Android 13+ 且全设备 WebView 保证自动升级至最新 Chromium 正式版。
