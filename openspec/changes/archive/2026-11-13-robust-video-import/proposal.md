# Proposal: 健壮的双路视频导入与老旧 Android WebView 全链路容灾适配

## Why

在坚果 R2 等 Android 10 老旧机型（系统 WebView 内核低于 Chrome 80）上，用户通过系统选择器选取 MP4 视频返回应用后，界面无响应且槽位停留在「未载入」，无法进入后续流程。
经过第一性原理深挖，老旧 WebView 存在一系列可能导致流程卡死、画面黑屏、进程崩溃与样式错位的连锁隐患：
1. **状态更新因果倒置与离屏媒体死等**：原状态更新完全锁死在 `tempVideo.onloadedmetadata` 回调中；老旧 Chromium 移动端对未调用 `.load()` 且脱离 DOM 的元素默认不预加载元数据，缺少 `muted`/`playsinline` 和超时兜底会导致无限期停留在「未载入」；
2. **老旧 Web API 缺失与大文件堆内存 OOM 崩溃**：`File.prototype.arrayBuffer()` 在 Chrome 76 之前不存在；`AudioContext.decodeAudioData` 在旧内核上不支持 Promise；对数百 MB 的手机实拍视频进行全量 PCM 读取，极易触发老旧沙箱 V8 堆内存 OOM Killer 杀死渲染进程，导致页面自动刷新重置回首屏；
3. **Android 原生层内存上限与存储权限**：默认应用堆内存（128~192MB）限制加剧 OOM 风险；Android 10 分区存储对外部路径存在权限阻断；
4. **底层离屏视频 `display: none` 导致硬件解码断流**：在老旧定制系统中，脱离渲染树的 `<video>` 元素会被合成器停止帧刷新，导致 Canvas 绘制黑屏；
5. **CSS `max()` / `min()` 函数不支持**：Chrome 79 之前不支持，导致安全边距语法错误被忽略，内边距归零；
6. **老旧内核缺少 WebCodecs 导出的明确前置诊断**：Chrome < 94 不支持 WebCodecs，进入导出页需要友好前置提示而非操作后报错。

## What Changes

- **即时响应与乐观状态绑定**：用户一旦在系统选择器中完成文件选取，前端立刻基于已拿到的 `File` 对象创建基础视频条目，槽位状态立刻由「未载入」变为「已就绪」（展示真实文件名与文件大小，状态标记为「正在分析」），彻底终结无反馈界面冻结。
- **高兼容性视频元数据探测引擎**：构建具备完整保底的元数据提取管线，显式配置 `muted`、`playsInline` 与 `webkit-playsinline`，显式调用 `.load()`；双重监听 `loadedmetadata`、`canplay` 与 `error` 事件；配置 2.5 秒硬超时兜底，超时或解析失败时立即采用 1920×1080 标准分辨率与保底时长，保证用户绝对能继续进入下一步。
- **老旧内核与大文件音频解码双重加固**：
  - 音频解码层引入 `FileReader` 回退机制，彻底兼容不支持 `file.arrayBuffer()` 的老旧 WebView（Chrome < 76）；
  - 兼容 `AudioContext.decodeAudioData` 回调与 Promise 双模调用；
  - 对超过 80MB 的大视频文件开启防 OOM 保护，跳过全量 ArrayBuffer 读入与内存解压，采用保底 160 BPM 并引导用户通过顶栏徽章或 Tap Tempo 快速标定，彻底杜绝 WebView 渲染进程被杀闪退。
- **文件选择器交互防死锁**：选择完成后立即清空 `<input>` 的 `value`，确保同名文件或失败重选能正常触发 `change` 事件；补全 `accept="video/mp4,video/*"` 兼容性定义。
- **底层视频保活渲染（消除 `display: none` 纹理断流）**：将对比台与导出页的底层支撑 `<video>` 样式由 `display: none` 重构为真实的 1×1 极小透明活跃节点（`position: absolute, opacity: 0.01, pointer-events: none, z-index: -9999`），确保老旧定制系统 GPU 硬件加速合成器持续刷新纹理，杜绝 Canvas 绘制黑屏。
- **CSS 安全区边距回退兼容**：在 `index.css` 的所有 `max(..., var(--safe-*))` 规则前补充常规固定像素回退声明，确保 Chrome < 79 不因语法不支持而将边距归零。
- **Android 原生配置与大堆内存**：在 `AndroidManifest.xml` 中配置 `android:largeHeap="true"`、`android:requestLegacyExternalStorage="true"` 与 `android:hardwareAccelerated="true"`。
- **WebCodecs 兼容性友好引导**：在导出页前置探测 `isWebCodecsSupported()`，对 Chrome < 94 内核明确提示更新系统 WebView，避免操作受阻后才报错。

## Capabilities

### Modified Capabilities
- `video-workspace`: 增强双路本地视频文件导入契约，要求选择文件后立即呈现已载入状态与加载进度，在老旧内核/大文件/元数据异常时具备超时与降级容灾能力，确保任意 MP4 视频均能顺利导入并进入后续向导；加固底层视频元素渲染活跃性与 CSS 回退支持。

## Impact

- `src/components/ImportStep.tsx`：重构视频载入生命周期、乐观状态切换、元数据探测与异常兜底展示。
- `src/core/audio.ts`：增加 ArrayBuffer 兼容读取、decodeAudioData 双模兼容与大文件防 OOM 保底策略。
- `src/components/Workbench.tsx` & `src/components/ExportPage.tsx`：底层 `<video>` 样式脱离 `display: none`，消除纹理断流。
- `src/index.css`：为 CSS `max()` 补充回退声明。
- `android/app/src/main/AndroidManifest.xml`：配置 `largeHeap="true"`、`requestLegacyExternalStorage="true"`。
- `docs/decisions/AgDR-0024-高容灾视频导入管线与老旧WebView全链路防护.md`：记录架构决策。
