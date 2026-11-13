# Design

## Context

参考 `proposal.md` 中描述的老版本 WebView 导出痛点与背景。当前项目基线如下：
- **跨平台底座**：Capacitor 7 + React 19 + TypeScript，`android/variables.gradle` 配置 `minSdkVersion = 23`（Android 6.0）、`targetSdkVersion = 35`。
- **现有导入链路（`src/components/ImportStep.tsx` / `src/core/audio.ts`）**：依赖 `<input type="file">` 与 Web Audio `decodeAudioData`，超过 80MB 文件为防 OOM 直接跳过音频解码，且 JS 侧无法获取底层原生文件路径或持久化 `content://` URI。
- **现有导出链路（`src/core/exporter.ts` / `src/components/ExportPage.tsx`）**：现代内核走 `WebCodecs + mp4-muxer`，老旧内核走 `MediaRecorder` 实时录制；在 Android 原生壳下存在必须等待物理实时时长、Base64 跨桥内存压力、权限缺失及 `blob:` 下载无效等结构性缺陷。
- **前端渲染真实源（`src/core/geometry.ts` / `src/core/renderer.ts`）**：三线正交对齐与左右分区/半透明叠加的变换逻辑已经过完备验证，必须继续作为唯一几何计算真源。

## Goals / Non-Goals

**Goals:**
- 在 Android 6.0~15（API 23~35）全系列设备上，无论系统 WebView 版本是否支持 WebCodecs，统一提供不依赖物理挂钟时间的高速离线 `.mp4` 导出。
- 消除导入与导出全链路中的百兆级视频/音频内存拷贝、Base64 跨桥传输与 80MB 大视频音频解析拦截。
- 保证导出成片的几何位置、裁剪范围、镜像、相对透明度、节拍器锁相、慢放音调与时间轴交集映射与前端预览 100% 一致，并直接保存至系统相册可见目录。
- 保持代码模块化与最简实现，不引入任何重型第三方原生音视频框架（如 FFmpegKit / ExoPlayer），仅依赖 Android SDK 标准内置 `MediaExtractor`、`MediaCodec`、`MediaMuxer`、`OpenGL ES 2.0/3.0` 与 `MediaStore`。

**Non-Goals:**
- 不改造非原生纯 Web 浏览器调试路径下的底层引擎（桌面浏览器调试仍使用 `<input type="file">` 与 `WebCodecs`）。
- 不修改三线正交几何对齐数学模型、BPM 自相关算法与对比台实时播放同步引擎（`DualVideoSyncEngine`）。
- 不在 Android 原生端继续维护 `MediaRecorder` `.webm` 降级分支。

## Decisions

本次变更包含两条架构级决策，完整决策记录与备选对比见对应 AgDR：
1. **Android 原生持久化 URI 视频选择与本地流式访问**：见 [AgDR-0030](../../../docs/decisions/AgDR-0030-Android原生持久化URI视频选择与流式音频解码.md)
2. **Android 原生 GPU 零拷贝离线 MP4 导出管线**：见 [AgDR-0031](../../../docs/decisions/AgDR-0031-Android原生GPU零拷贝离线MP4导出管线.md)

### 整体模块架构与数据流

```text
+-----------------------------------------------------------------------------+
|                        Frontend (React + TypeScript)                        |
|                                                                             |
|  ImportStep / audio.ts          renderer.ts / geometry.ts    ExportPage.tsx |
|  - Android: NativeMedia.pick    - 计算归一化布局 JSON         - 进度监听     |
|  - Web: <input type="file">       (rect, bgRect, clip, alpha) - 取消控制     |
+------------------+---------------------------+--------------------+---------+
                   | JSON (URI)                | JSON (<1KB 参数)   | Event
                   v                           v                    ^
+-----------------------------------------------------------------------------+
|                Android Native Plugin: NativeMediaPlugin.java                |
|                                                                             |
|  1. ACTION_OPEN_DOCUMENT + persistable URI + MediaMetadataRetriever         |
|  2. LocalRangeProxyServer (127.0.0.1 HTTP 206 Range -> <video> 零拷贝播放)  |
|  3. NativeAudioExtractor (MediaExtractor/Codec -> 降采样单声道波形/BPM PCM) |
|  4. NativeOfflineExporter (后台线程):                                       |
|     - 双路 MediaExtractor + MediaCodec -> SurfaceTexture (OES 纹理)          |
|     - OpenGL ES 2.0 渲染 (分区衬底+主画面+分割线 / 叠加双纹理+线性透明度)     |
|     - 慢放纹理复用 + EGLExt.eglPresentationTimeANDROID (确定性 PTS)          |
|     - 原生音频合成 (节拍器数学合成 / 原声重采样) -> AAC MediaCodec           |
|     - MediaMuxer -> 临时 MP4 -> MediaStore / Movies 系统相册入库             |
+-----------------------------------------------------------------------------+
```

### 关键设计细节

1. **前端布局参数化契约（`computeNativeExportLayout`）**：
   - 在 `src/core/renderer.ts` 旁抽出一组纯函数，把当前 `ComparisonRenderState`（含 `mode`、`video1Size`/`video2Size`、`triLine1`/`triLine2`、`triLineTransform`、`viewport`、`mirror1`/`mirror2`、`relativeOpacity`）在导出输出画幅 `(width, height)` 上直接算出标准化绘制参数：
     - **分区模式**：分别输出左右半屏的 `clipRect`、`mainRect` 与（当主图未填满半屏时）`bgRect`（透明度 `0.35`），以及镜像标记 `mirror`。
     - **叠加模式**：计算叠加底层与前景图经过 `calculateFitTransform` + `viewport` 缩放平移后的目标绘制矩形及两者混合透明度系数（精确匹配 `renderer.ts` 中 `relativeOpacity` 的 `-1 ~ 1` 线性计算）。
   - OpenGL ES 顶点/片元着色器仅按上述矩形将两张 `SurfaceTexture` 画入编码器 `InputSurface`，并通过 `SurfaceTexture.getTransformMatrix` 自动消除 Android 拍摄视频的旋转元数据（`90°/180°/270°`）与垂直方向差异。

2. **顺序流式解码与慢放纹理复用（高速关键）**：
   - 导出线程对 CH1/CH2 各自打开 `MediaExtractor` 并从 `startSourceTime` 之前的最近同步关键帧（`SEEK_TO_PREVIOUS_SYNC`）起顺次解码，丢弃早于目标起点的过渡帧。
   - 对于输出第 `frame` 帧（目标时刻 `tau = exportStart + (frame / fps) * slowMotionRate`，映射得 `t1, t2`）：仅当 `t_i` 超过当前解码帧时间戳（含半帧容差）时才向解码器拉取下一帧并执行 `updateTexImage()`；慢放时连续多帧直接复用同一张 GPU OES 纹理重新绘制并附带递增 `ptsUs` 推入编码器，不做冗余解码或回退 seek。
   - 当某通道不在有效时间区间 `span` 内（`!vActive`）时，跳过该通道绘制，仅保留黑底或有效侧画面。

3. **音频同步与硬件编码兼容性兜底**：
   - 若设备编码器不支持 `1280×720`（例如部分极老机型仅支持特定对齐或较低分辨率），在初始化 H.264 `MediaCodec` 失败时自动退回 `960×540`（16 对齐安全尺寸 `960×544` 或 `854×480` -> `1280×720` 本身高度 720 满足 16 倍数 `720=45*16`，`1280=80*16`；`960×544` 亦满足 16 对齐），并在前端导出规格展示真实配置。
   - 节拍器 PCM 在 Java 侧严格复用 `tau = 0` 锁相与 `k % 4 == 0` 重拍公式及砖墙限幅包络；单侧原声直接在 Java 侧读取对应 `content://` 的音轨解码重采样为 44100Hz 单声道并编码为 AAC（`audio/mp4a-latm`），最终与视频轨在 `MediaMuxer` 同一时间零点起跑。

4. **本地 HTTP Range 代理生命周期与安全边界**：
   - 代理服务器仅监听 `127.0.0.1` 随机可用端口（`new ServerSocket(0, 50, InetAddress.getByAddress(new byte[]{127,0,0,1}))`），仅允许以注册随机 token/ID 映射已选中的视频 URI，不暴露手机上任意文件；更换视频或销毁应用时释放旧 URI 映射条目与线程池资源。
   - 注意 Android 9+ 默认禁止非加密 `http://127.0.0.1` 明文流量除非配置或允许 localhost：需要在 `AndroidManifest.xml` / `network_security_config.xml` 中允许 `127.0.0.1` loopback 明文访问（或直接配置 `usesCleartextTraffic` 仅针对 `127.0.0.1`），确保 WebView `<video>` 顺利请求本地代理流！

5. **老旧 WebView（Chrome 74）接口兼容性**：
   - 遵循 `AgDR-0027` 约束，前端新增的 TypeScript 桥接代码严格遵循 `ES2018` 标准库边界（不使用 `Promise.allSettled`、`?.` 过深破坏等已验证兼容规范）。

## Risks / Trade-offs

- **不同芯片厂商硬编码器色彩格式 / 分辨率差异** → `createInputSurface()` 使用标准 `COLOR_FormatSurface`，绕过了各厂商复杂的 YUV Planar/SemiPlanar 内存排布差异；同时对编码器分辨率做 `1280×720 -> 960×544` 失败自动降档并捕获明确错误提示。
- **WebView 混合内容策略（HTTPS 页面加载 `http://127.0.0.1` 视频流）** → Capacitor 默认 `androidScheme: 'https'` 导致页面源是 `https://localhost`，在 Chrome 74 上 `<video src="http://127.0.0.1:port/...">` 属于 Mixed Content（注意：现代 Chrome 允许 `127.0.0.1` 作为 trustworthy origin，但 Chrome 74 对 `127.0.0.1` 在 `<video>` 中的混合内容判定及 Android `cleartextTrafficPermitted` 必须实测验证！）。**缓解方案**：在 `MainActivity.java` 显式允许 `WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE`（或 `MIXED_CONTENT_ALWAYS_ALLOW` 配合 `127.0.0.1` 仅限回环），并在 `network_security_config.xml` 允许 `127.0.0.1` 明文连接，同时在 `legacy_android10`（Chrome 74）模拟器实测确认无 Mixed Content 拦截。
- **原生与前端导出画面的像素对齐一致性** → 通过设计归一化布局坐标并在 `legacy_android10` 模拟器上对分区模式（含镜像、窄视频衬底）与叠加模式（含缩放平移、透明度调节）导出后的成片抽帧截图比对验收。
- **部分视频无音轨时的原声导出边界** → 当用户选择原声导出但原视频本身没有音轨时，原生层安全退化为导出纯视频轨（或静音轨）而不是崩溃卡死。
