# Design: 健壮的双路视频导入与老旧 Android WebView 全链路容灾适配

## Context

在坚果 R2 等 Android 10 老旧机型（系统 WebView 低于 Chrome 80）上，用户选取 MP4 视频后界面无任何变化，依旧保持「未载入」，无法导入视频。
分析表明问题涉及多个技术断点：
1. 状态更新锁死在未调 `.load()` 且脱离 DOM 的 `tempVideo.onloadedmetadata` 回调中；
2. 缺失 `file.arrayBuffer()` 支持（Chrome < 76）与 `AudioContext.decodeAudioData` 回调模式兼容；
3. 手机实拍大视频（数百 MB）全量读入 ArrayBuffer 导致老旧沙箱 V8 堆内存 OOM 崩溃重载；
4. `<input type="file">` 的 `value` 未清空导致重选同一文件无法触发 `change` 事件；
5. `display: none` 导致老旧 WebView 对底层视频停止向合成器刷新帧纹理，Canvas 绘制有黑屏风险；
6. CSS `max()` 函数在 Chrome < 79 不被支持，导致安全边距语法解析失败被丢弃；
7. Android 进程默认仅 128~192MB 堆内存，缺少 `largeHeap` 配置。

详细背景与动机见 [proposal.md](./proposal.md)。

## Goals / Non-Goals

**Goals:**
- 用户在文件选择器完成选取后，界面在毫秒级内呈现已选文件状态（文件名、文件大小），状态即刻置为就绪，主流程解锁。
- 构建具备 DOM 挂载、显式 `.load()`、`muted`、`playsinline` 及 2.5 秒硬超时的健壮元数据探测器，失败/超时自愈保底。
- 音频解码层兼容不支持 `file.arrayBuffer()` 的老旧内核（`FileReader` 回退），兼容 `decodeAudioData` 双模。
- 引入大文件（> 80MB）防 OOM 内存保护机制，跳过全量 PCM 解码，杜绝进程闪退。
- 在 AndroidManifest 中配置 `largeHeap="true"` 与 `requestLegacyExternalStorage="true"`。
- 将底层视频样式由 `display: none` 改为活跃 1px 节点，杜绝纹理断流；补全 CSS `max()` 回退规则。
- 在导出页增加对老旧内核（Chrome < 94）WebCodecs 的友好引导。

**Non-Goals:**
- 不引入第三方原生插件（如原生 Media 库或原生视频选择器），保持纯跨平台 Web/Canvas 架构。
- 不针对 WebCodecs 算法进行降级重写，仅保障引导清晰与不报错崩溃。

## Decisions

- **架构决策 AgDR-0024**：详见 [docs/decisions/AgDR-0024-高容灾视频导入管线与老旧WebView内存保护.md](../../../docs/decisions/AgDR-0024-高容灾视频导入管线与老旧WebView内存保护.md)。
  - **决策 1：乐观状态即刻前置挂载**
    用户一旦返回并带来 `File` 对象，立即以此创建 `baseItem`（默认赋予 1920×1080 与基于文件大小预估的安全时长）并推入 React 状态，同步解除向导流转阻塞；随后异步探测真实参数并在成功后静默更新。
  - **决策 2：DOM 注入 + 显式唤醒 + 2.5s 硬超时兜底的元数据提取器**
    针对老旧 Chromium 移动端节能与脱离 DOM 媒体限制，将探测用临时 video 元素注入不可见的隐藏宿主容器，显式配置 `muted`、`playsInline` 与 `webkit-playsinline`，显式调用 `.load()`，双重监听 `loadedmetadata`、`canplay` 与 `error`，配合 2.5 秒超时定时器，无论是解码失败、网络挂起还是老旧内核缺陷均能自愈返回。
  - **决策 3：FileReader 兼容回退与超大视频防 OOM 熔断**
    封装 `readFileAsArrayBuffer`，当 `file.arrayBuffer` 缺失时回退至 `FileReader`；对 > 80MB 的视频文件直接熔断音频全量解码，赋予保底 160 BPM 并生成模拟波形，避免老旧 32/64 位沙箱分配大内存导致渲染进程 OOM 崩溃重载。
  - **决策 4：交互防死锁与 Android 10 原生大堆内存支持**
    选择事件触发后立即重置 `input.value = ''`；在 `AndroidManifest.xml` 中配置 `android:largeHeap="true"` 与 `android:requestLegacyExternalStorage="true"`。
  - **决策 5：底层视频活跃 1px 挂载与 CSS 边距回退**
    对比台与导出页的视频节点脱离 `display: none`，以绝对定位 1px 活跃节点渲染；在 `index.css` 的所有 `max()` 规则前补齐像素回退。

## Risks / Trade-offs

- [大视频跳过全量音频解码可能导致 BPM 为默认 160] → 用户可在对比台顶栏直接点击 BPM 徽章手动修改，或在时间对齐页进行 Tap Tempo 测速，权衡后保证应用不崩溃的优先级远高于自动测速。
- [元数据超时回退到 1920×1080] → 在后续三线标定步骤中用户依然可以直接基于视频画布进行交互拖拽对齐，不会导致软件无法使用。
