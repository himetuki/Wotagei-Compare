# Design

## Context

参见 `proposal.md` 中对 Android 10（Chrome 74 WebView）及 16:9 窄横屏（`640×360` + `48px` 三键导航）实测缺陷的描述。本项目前端已收紧至 ES2018 编译目标（`AgDR-0027`），安全区 `max()` 已由 `@supports` 隔离（`AgDR-0028`），本次进一步解决 CSS Flex `gap` 失效、窄横屏排版溢出、4 路视频解码冗余黑屏、Chrome < 94 无法导出及原生系统栏配色与老旧 API 兼容问题。

## Goals / Non-Goals

**Goals:**
- 全界面在 Chrome 70~83（含 Chrome 74）下保持与现代内核完全一致的按钮、图标、标签间距；
- 在 `640×360` 逻辑视口叠加 `48px` 右侧虚拟三键安全区下，所有向导步骤与对比模式（分区/叠加）零横向/纵向溢出截断；
- 进入「导出片段」时总 `<video>` 解码实例保持 2 个，预览画面即刻呈现不出现 1 秒黑屏等待；
- 在不支持 WebCodecs 的老旧 WebView 下，通过 `MediaRecorder` 兼容管线实际导出可下载/可保存的音画同步 `.webm` 视频；
- 消除 `ResizeObserver` 缺失、多 `AudioContext` 溢出、触控断触与老版 Android 导航栏浅色底条隐患。

**Non-Goals:**
- 不引入大型 WASM 转码器（如 FFmpeg.wasm）或在不支持 WebCodecs 的老旧设备上强行软件编码 MP4（保留 WebM 兼容录制即可）；
- 不修改 `docs/requirements/` 只读基线。

## Decisions

本变更的关键架构决策已按规范沉淀于：[AgDR-0029](../../../docs/decisions/AgDR-0029-%E8%80%81%E6%97%A7WebView%E9%97%B4%E8%B7%9D%E5%85%BC%E5%AE%B9%E3%80%81%E5%8F%8C%E8%A7%A3%E7%A0%81%E5%99%A8%E5%A4%8D%E7%94%A8%E4%B8%8EMediaRecorder%E5%AF%BC%E5%87%BA%E9%99%8D%E7%BA%A7.md)，要点如下：

1. **以 CSS 相邻兄弟外边距（`> * + *`）取代 Flexbox `gap`**：
   - 保留 Grid 容器（`.slot-grid`、`.export-grid`）的 `gap`（Chrome 66+ 原生支持）；
   - 所有 Flex 容器（包括 `src/index.css` 中基础类及各组件 JSX 内的 flex 容器）统一移除 `gap`，改为由 `> * + *` 邻接边距类（如 `.gap-x-4`, `.gap-x-6`, `.gap-x-8`, `.gap-y-6`, `.gap-y-8` 或组件专属规则）控制间距，规避 `CSS.supports("gap", "10px")` 在 Chrome 74 误报 `true` 的陷阱。
2. **16:9 窄横屏（`640×360` + `48px` 安全区）响应式收紧**：
   - 通过 `@media (max-width: 760px)` 与组件紧凑样式调整 `AudioStep` 底栏、`Workbench` 底栏以及 `ExportPage` 右侧面板垂直间距与字号/按钮内边距，确保小屏不溢出。
   - 在 `ExportPage` 右侧面板将底部导出按钮区固定于底部不随内部信息块被挤出 `360px` 视口。
3. **对比台与导出页共享双路 `<video>` 引用**：
   - `Workbench` 传出 `sharedVideo1Ref` 与 `sharedVideo2Ref`（以及统一的互斥控制权）给 `ExportPage`；
   - `ExportPage` 不再渲染自带 `<video>`，而是在挂载期间直接把 `sharedVideo1Ref.current` / `sharedVideo2Ref.current` 接入自己的 `DualVideoSyncEngine`；退出导出页并销毁导出引擎后，由 `Workbench` 的 `useEffect` 自动 `attachVideos` 并 `seekToTau` 接回控制权。
4. **Chrome < 94 `MediaRecorder` 兼容导出路径**：
   - 在 `src/core/exporter.ts` 中，`VideoExporter.export()` 检测到 `!isWebCodecsSupported()` 时，调用 `exportViaMediaRecorder()`；
   - 创建与目标画幅（默认 `1280×720` 或 `960×540` 以减轻老机 CPU/GPU 负担）匹配的离屏绘制 Canvas 并调用 `canvas.captureStream(30)`；
   - 复用 `synthesizeMetronomeBuffer` / `createSourceAudioBuffer` 预生成精确时长的 `AudioBuffer`（若 `AudioContext` 构造需兼容），通过 `AudioBufferSourceNode -> MediaStreamAudioDestinationNode` 输出音轨流；
   - 使用 `DualVideoSyncEngine` 将两路离屏/共享 `<video>` 定位到 `clipStart` 并以 `slowMotionRate` 联合起播，通过 RAF 持续将画面按当前对比状态绘入导出 Canvas，同时按实际经过时间推进百分比进度并支持 `cancel()` 中断，到点或到达 `clipEnd` 时停止 `MediaRecorder` 封装出 `video/webm` Blob（支持原生保存 `.webm`）。
5. **老旧 API 与原生样式细节修复**：
   - `GeometryStep.tsx` 增加 `typeof ResizeObserver !== 'undefined'` 判断与 `window.resize` 回退，并对三线拖拽加 `setPointerCapture`；
   - `Workbench.tsx` 叠加手势 `handlePointerDown` 加 `setPointerCapture` 并在 `pointerup` / `pointercancel` 清理指针；
   - `AudioStep.tsx` 复用持久化 `auditionAudioCtxRef`，点击「试听」同步 `resume()` 并在卸载时 `close()`；
   - `ImportStep.tsx` 文件选择改为 `accept="video/*"`；
   - `android/app/src/main/res/values/styles.xml` 在 `AppTheme` 与 `AppTheme.NoActionBar` 显式添加 `android:statusBarColor` 和 `android:navigationBarColor` 为 `@android:color/black`。

## Risks / Trade-offs

- **MediaRecorder 实时录制期间用户不能操作页面参数** → 导出期间已禁用返回按钮并遮罩/锁定工作流控制，录制完成后自动恢复。
- **共享 `<video>` 节点在 `ExportPage` 内以 `slowMotionRate` 播放时，需注意切回 `Workbench` 后 `DualVideoSyncEngine` 重新接管播放速率和静音状态** → `Workbench` 在 `isExportActive` 变为 `false` 时已调用 `attachVideos`、`applyAudioSettings` 与 `seekToTau(tauRef.current)`，并在重新绑定时同步恢复 `slowMotionRate` 与 `soundSource`。
- **邻接兄弟选择器 `> * + *` 对隐藏元素或条件渲染元素可能多出几像素起始边距** → 对 `<input type="file" style={{ display: 'none' }}>` 等非视觉子元素放置在视觉列表之外或使用专有选择器排除 `[type="file"]` / `hidden`。
