# Proposal

## Why

在 Android 10 及更早版本的老旧系统 WebView（Chrome < 94，缺乏 WebCodecs）上实测，当前降级采用的 `MediaRecorder` + `canvas.captureStream` 方案受限于实时流时钟，导致慢放导出必须耗费与成片等长的物理挂钟时间（例如 0.1x 慢放 10 秒动作需干等 100 秒），且存在输出 `.webm` 非统一格式、大文件 Base64 跨桥内存溢出（OOM）、Android WebView 中 `blob:` 下载链接失效以及原生写入私有目录导致系统相册不可见等问题。由于本项目发布形态为 Android 原生应用（`minSdkVersion = 23`），直接引入 Android 原生媒体选择器与基于 `MediaCodec + OpenGL ES + MediaMuxer` 的 GPU 零拷贝离线编码管线，即可彻底摆脱老旧 WebView 限制，在所有 Android 6+ 设备上实现高速离线 `.mp4` 导出。

## What Changes

1. **Android 原生零拷贝视频选择与流式媒体访问（Capacitor 原生插件）**：
   - 在 Android 原生平台上，CH1 / CH2 导入点击触发系统原生视频选择器（`ACTION_OPEN_DOCUMENT`）直接获取持久化 `content://` URI，不再通过 WebView `<input type="file">` 中转沙盒 `File` 对象。
   - 原生侧提供轻量流式本地代理 URL（支持 HTTP Range 随机寻道）供前端 `<video>` 零拷贝预览与标定，并通过原生 `MediaExtractor + MediaCodec` 流式抽取单声道降采样 PCM 供波形显示、BPM 自动检测与单侧原声预览，**解除**原有超过 80MB 大视频直接跳过音频解析的防崩截断限制（**BREAKING** 调整导入页 Android 原生路径的数据源获取方式；纯 Web 浏览器调试仍沿用 `<input type="file">`）。
2. **Android 原生 GPU 零拷贝离线视频合成与 MP4 导出引擎**：
   - 在 Android 原生插件中实现离线编码管线：双路 `MediaExtractor + MediaCodec` 硬件解码至 `SurfaceTexture`，经 OpenGL ES 着色器精确复现左右分区（含铺底模糊/暗化衬底、三线对齐裁剪与独立镜像）与半透明叠加（含三线对齐变换、视口缩放平移与 `-1 ~ 1` 相对线性透明度混合），通过 `EGLExt.eglPresentationTimeANDROID` 写入确定性微秒时间戳（PTS）直接送入 `MediaCodec`（H.264 `createInputSurface`）硬件编码，并由 `MediaMuxer` 封装为标准 `.mp4`。
   - 音频轨由原生离线生成：节拍器模式由原生直接按锚点锁相参数合成带限幅的脉冲 PCM；单侧原声模式由原生直接读取对应视频 `content://` URI 音轨并按 `rate` 与 `slowMotionRate` 重采样；最终与视频轨一同编码为 AAC 写入 `.mp4`，JS 与原生之间仅传递纯 JSON 配置参数（零大数组/Base64 跨桥拷贝）。
3. **移除 Android 原生端的 `MediaRecorder` 降级与 Base64 跨桥导出路径**：
   - **BREAKING**：在 Android 原生平台彻底废除依赖实时挂钟的 `MediaRecorder` `.webm` 兼容录制分支及 `Filesystem.writeFile` Base64 写入逻辑；Android 全机型统一走原生离线高速 `.mp4` 导出。
   - 导出完成后在原生层直接通过 `MediaStore`（Android 10+）或公共 `Movies` 目录 + 媒体扫描（Android 6~9）写入系统相册并回传可读路径，移除 Android 端无效的 `blob:` `<a>` 下载按钮。

## Capabilities

### New Capabilities
（无新增独立能力模块，能力演进归入既有工作区与导出契约）

### Modified Capabilities
- `video-workspace`: 在 Android 原生平台下，双通道视频导入改用原生系统视频选择器直接持有持久化 URI 与流式本地预览地址，并通过原生流式解码音轨消除大体积视频（>80MB）被迫跳过波形与原声分析的限制；保留纯 Web 端 `<input type="file">` 路径以支持浏览器调试。
- `comparison-export`: 在 Android 原生平台下，废除老旧 WebView 受限于物理挂钟的 `MediaRecorder` `.webm` 实时录制降级路径与 Base64 跨桥保存，统一采用不依赖 WebView 内核版本的 Android 原生 `MediaCodec + OpenGL ES + MediaMuxer` GPU 零拷贝离线硬编码管线输出标准 `.mp4` 并直接入库系统相册；导出渲染时间与物理挂钟彻底解耦。

## Impact

- **Android 原生代码**：新增 Capacitor 原生插件（位于 `android/app/src/main/java/com/wotagei/compare/`），涵盖文档选择与持久授权、流式本地 HTTP Range 媒体服务、原生音轨抽取、OpenGL ES 双路合成与 `MediaCodec + MediaMuxer` 离线导出、`MediaStore` 相册持久化及运行期权限申请；必要时更新 `MainActivity.java` 注册插件及 `AndroidManifest.xml`。
- **前端核心与组件**：
  - `src/components/ImportStep.tsx`、`src/core/audio.ts`：接入 Android 原生视频选择与原生音轨 PCM 获取，纯 Web 环境保持原有逻辑。
  - `src/core/exporter.ts`、`src/components/ExportPage.tsx`：接入原生离线导出调用、进度事件监听与取消控制；精简移除 Android 端 `MediaRecorder` 降级分支、Base64 `Filesystem` 写入与无效 `blob:` 下载链接展示。
- **架构决策与验证**：新增架构决策记录 `docs/decisions/AgDR-0030-*.md` 与 `AgDR-0031-*.md`（演进取代 `AgDR-0029` 中的 `MediaRecorder` 导出降级条款），并在 `legacy_android10` 模拟器通过端到端实测验证离线导出速度、声画同步与系统相册可见性。
