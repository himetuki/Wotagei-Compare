---
id: AgDR-0031
date: 2026-11-13
status: executed
---

# Android 原生 GPU 零拷贝离线 MP4 导出管线

> 在【Android 10 及更早系统的老旧 WebView（Chrome < 94）缺乏 WebCodecs，而 `AgDR-0029` 采用的 `MediaRecorder` 降级方案必须耗费与成片等长的物理挂钟时间、仅能产出 `.webm` 且在 Android 端存在 Base64 写入 OOM 与 `blob:` 下载无效隐患】的处境下，面对【内置完整浏览器内核或 FFmpeg.wasm 会使 APK 体积暴涨 25~80MB 且高内存易崩】的顾虑，我决定【在 Android 原生平台废除 `MediaRecorder` 降级路径，改为由 Capacitor 原生插件使用系统内置 `MediaExtractor + MediaCodec + OpenGL ES + MediaMuxer` 执行 GPU 零拷贝离线硬件编码导出标准 `.mp4`，并直接通过 `MediaStore` 写入系统相册】，以达成【老手机导出耗时与真实播放时长彻底解耦（慢放导出比实时快数倍）、全版本统一输出标准 `.mp4`、APK 体积几乎零增长且 100% 相册可见】的目标，并接受【在 Android 原生侧编写 OpenGL ES 双纹理合成与音频离线混流代码】的代价。（本决定演进并取代 `AgDR-0029` 中关于 Android 端使用 `MediaRecorder` 降级导出的第 3 条决策）

## 考虑过的方案

| 方案 | 好处 | 代价 |
| --- | --- | --- |
| 方案 A：继续修补 `MediaRecorder`（补全权限与分块写磁盘） | 无需写原生视频编码代码 | **物理硬伤无法消除**：`MediaRecorder` 强绑实时挂钟，`0.1x` 慢放 10 秒必须等待 100 秒真实时间，且格式锁死在 `.webm` |
| 方案 B：打包 GeckoView / FFmpeg.wasm 软编码 | 前端一套逻辑通吃老机 | APK 暴涨 `25~80MB`，且老手机纯 CPU 软编码速度甚至慢于实时录制、极易 OOM 闪退 |
| 方案 C：JS Canvas 逐帧出图传给 Android 原生 `MediaCodec` 编码 | 原生不必写 OpenGL ES | 1280×720 RGBA 每帧约 3.6MB，跨桥序列化/拷贝 1000 帧即 3.6GB 数据流，且老 WebView `<video>` 逐帧 `seek` 依然慢 |
| 方案 D（本方案）：纯 JSON 配置驱动 Android 原生 `MediaCodec + OpenGL ES + MediaMuxer` GPU 零拷贝离线合成 | 0 第三方大库、APK 增量极小；GPU 纹理复用实现慢放超高速编码；统一输出 `.mp4` 并直入系统相册 | 需在 `android/` 实现原生 OpenGL ES 双视频合成、EGL 时间戳注入与离线音频编码 |

## 决定

选 **方案 D**，因为这是 Android API 23+ 原生壳下唯一同时满足“体积小、内存低、慢放导出快于实时、输出标准 MP4”的第一性原理方案：

1. **布局参数化桥接，原生不重算三线几何**：前端 `renderer.ts` 与 `geometry.ts` 保持为几何算法唯一真实源，点导出时将当前视口下的 CH1 / CH2 目标归一化贴图矩形（含分区窄屏背景衬底参数）、裁剪框、镜像、叠加透明度等直接计算为轻量化 JSON（`< 1KB`）传入原生层，原生 OpenGL ES 仅忠实执行矩阵贴图与透明度混合，杜绝双端算法漂移。
2. **双路硬解 + GPU 纹理慢放复用**：两路 `MediaExtractor + MediaCodec` 顺序解码至各自的 `SurfaceTexture`（自动应用 `getTransformMatrix` 处理手机拍摄的旋转角与 UV 翻转），编码器使用 `MediaCodec.createInputSurface()`。对于慢放期间连续多帧对应同一源视频帧的情况，直接复用当前 GPU 纹理并以确定性微秒递增时间戳 `EGLExt.eglPresentationTimeANDROID` 推入编码器，无需重复解码或 CPU 像素拷贝。
3. **音频零传输离线合成**：前端不传递音频 PCM 大数组；节拍器模式由原生按 `(exportStart, exportEnd, effectiveBpm, slowMotionRate)` 数学公式与限幅器直接合成 PCM，单侧原声模式由原生直接从对应视频 `content://` URI 抽取重采样并编码为 AAC，与 H.264 视频轨同步合封至 `.mp4`。
4. **原生相册持久化**：API 29+ 通过 `MediaStore.Video.Media` 写入 `Movies/WotageiCompare`；API 23~28 申请运行时存储权限写入公共 `Movies` 并触发媒体库扫描，彻底移除 Android 端的 `MediaRecorder` 路径与无效 `blob:` 下载链接。

## 代价

- 我们接受：需要维护原生 `MediaCodec` / OpenGL ES / `MediaMuxer` 管线以及部分老芯片硬件编码器尺寸与色彩格式兜底逻辑。
- 我们放弃：Android 原生端不再保留 `MediaRecorder` `.webm` 导出路径，也不再通过 `Filesystem.writeFile` Base64 中转导出文件。
- 后面要还的债：需在不同芯片模拟器/真机上核实硬件编码器对齐约束（如宽高 16 对齐或 720p/540p 回退）。

## 什么情况下需要重新讨论

- 若后续最低系统版本直接提升至全面支持硬件 WebCodecs 的 Android 12+（Chrome 94+），可评估是否下线原生导出插件以简化原生代码量。
