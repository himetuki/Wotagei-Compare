---
id: AgDR-0030
date: 2026-11-13
status: executed
---

# Android 原生持久化 URI 视频选择与流式音频解码

> 在【Android 原生壳下若沿用 WebView `<input type="file">`，只能拿到沙盒 `File` 对象而无法把原始文件路径零拷贝交给原生导出引擎，且现有 `decodeAudioFromFile` 为防 WebView OOM 对 >80MB 视频直接跳过音频解析】的处境下，面对【保留 `<input type="file">` 并在导出时通过桥接向磁盘拷贝数百 MB 临时视频会导致老手机内存爆炸或卡死】的顾虑，我决定【在 Android 原生平台下改为调用自定义 Capacitor 原生插件通过 `ACTION_OPEN_DOCUMENT` 获取持久化 `content://` URI，并由轻量本地 HTTP Range 代理供 `<video>` 零拷贝流式预览、由原生 `MediaExtractor + MediaCodec` 流式抽取降采样单声道 PCM 供波形与 BPM 分析】，以达成【全链路零大文件内存拷贝、解除 80MB 大视频波形与原声失效限制、原生导出直读原文件】的目标，并接受【在 Android 原生层维护约 150~250 行文件选择与本地 Range 流服务代码，纯 Web 浏览器仍保留 `<input type="file">` 入口】的代价。

## 考虑过的方案

| 方案 | 好处 | 代价 |
| --- | --- | --- |
| 方案 A：保留 `<input type="file">`，导入后读取 `ArrayBuffer`/Base64 转存到 App 私有缓存文件 | 前端导入代码零改动 | 100~300MB 手机录像在老手机 WebView 内存/桥接往返必触发 OOM 或拷贝阻塞数秒，且多占一倍手机存储 |
| 方案 B：引入第三方文件选择插件 + `Capacitor.convertFileSrc` 直接读 URI | 不用自己写原生文件选择 Intent | 实测 Android 多机型 `DocumentProvider` 返回的 `content://` URI 在默认 `WebViewLocalServer` 下对 HTTP `206 Partial Content` 随机寻道（`<video>` `seek`）兼容性差，且第三方插件无法流式抽取原生音轨 PCM |
| 方案 C（本方案）：自定义轻量原生媒体插件（`ACTION_OPEN_DOCUMENT` + 本地 HTTP Range 代理 + 原生音轨流式降采样解码） | 0 临时视频拷贝、支持任意体积视频毫秒级 `seek`、突破 80MB 音频解析限制、与原生导出共用同一 `content://` URI | 需在 `android/` 新增受控的原生插件代码；纯 Web 浏览器端与 Android 原生端在视频加载入口处做一层平台分支 |

## 决定

选 **方案 C**，因为从第一性原理看，视频文件动辄百兆，**把“几字节的 URI 句柄”留在原生层直接流式读取**是老手机唯一不会内存溢出的架构边界：

1. **持久化 URI 选择**：Android 端点击 CH1/CH2 导入卡片时，原生插件拉起 `Intent.ACTION_OPEN_DOCUMENT`（`video/*`）并调用 `takePersistableUriPermission` 取得长期读权限，同时用 `MediaMetadataRetriever` 立即读出真实的视频宽高、旋转角度（校正竖拍 `90°/270°` 维度）与时长。
2. **本地 HTTP Range 代理供 `<video>` 零拷贝预览**：插件内按需启动绑定 `127.0.0.1` 随机空闲端口的轻量 HTTP 服务，根据 `Range: bytes=start-end` 头通过 `ContentResolver.openAssetFileDescriptor` 随机读取片段返回 `206 Partial Content`，确保任意老旧系统 WebView 的 `<video>` 都能顺畅加载与秒级 `seek`。
3. **流式音频抽提解除 80MB 限制**：原生侧用 `MediaExtractor + MediaCodec` 流式解码音轨并按低采样率（如 11025Hz）降采样混合成单声道 PCM 传回前端仅用于绘制波形与 BPM 检测；原声播放由 `<video>` 自带流承担，原声导出由原生导出管线直读 `content://` URI 承担，JS 与原生间不再存在百兆音频/视频内存搬运。

## 代价

- 我们接受：Android 原生端导入入口与纯 Web 调试入口存在平台分支（`Capacitor.isNativePlatform()`）。
- 我们放弃：Android 端使用 `<input type="file">` 与 Web Audio `decodeAudioData` 全量加载文件的方式。
- 后面要还的债：需注意 `Activity` 销毁重建或更换视频时清理不再使用的代理映射条目，避免端口句柄泄漏。

## 什么情况下需要重新讨论

- 若未来全面转向纯桌面/Web 端分发而不再发布 Android 原生 APK，则需回退为纯 Web 文件读取与 WebCodecs 方案。
