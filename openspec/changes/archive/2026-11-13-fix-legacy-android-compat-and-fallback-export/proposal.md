# Proposal

## Why

在 Android 10 模拟器（系统 WebView `Chrome 74.0.3729.185`）及经典 16:9 老手机横屏（`640×360` 逻辑像素 + `48px` 右侧虚拟三键导航）实测最新 APK 后，发现六项直接影响老版本手机可用性与全流程跑通的实质兼容性缺陷：
1. **Flexbox `gap` 在 Chrome < 84 全部失效为 `0px`**：实测确认 Chrome 74 下 `CSS.supports("gap", "10px")` 返回 `true`（仅支持 Grid `gap`），但 Flex 容器上的 `gap` 实际计算间距为 `0px`，导致全界面顶部导航、按钮图标文字、时间标定底栏及 BPM 徽章全部紧贴粘连。
2. **16:9 窄横屏下关键控件横向/纵向溢出截断**：在 `640×360` + `48px` 三键导航安全区下，「CH1/CH2时间」底栏右侧 `BPM` 输入框与 `+` 按钮、对比台叠加模式右下角 `SYNC BPM` 按钮均溢出屏幕右边界；导出页右侧面板底部的「开始渲染导出」按钮溢出视口底部。
3. **导出页重复新建 `<video>` 引发 4 路解码并发与首秒黑屏**：进入导出页时对比台保留 2 个隐藏 `<video>` 且导出页又新建 2 个 `<video>`，在 Chrome 74 下进入导出页前 `1000ms` 画布持续全黑/半残，`1500ms` 才双边就绪；在硬解槽位受限（2~3 路）的老旧低端手机上存在解码器耗尽黑屏风险。
4. **Chrome < 94 老旧 WebView 导出功能点击即报错**：Chrome 74 无 `VideoEncoder`（WebCodecs），但页面仍将「开始渲染导出」显示为可点击主按钮，点击即抛出异常失败，导致「导出视频」核心流程在老手机上彻底阻塞。实测 Chrome 74 原生支持 `canvas.captureStream(30)` + `AudioContext.createMediaStreamDestination()` + `MediaRecorder`（`video/webm;codecs=vp8,opus`）。
5. **老旧内核 API 与交互生命周期隐患**：`GeometryStep` 缺少 `ResizeObserver` 降级与三线拖拽 `setPointerCapture`；`Workbench` 叠加手势缺少 `setPointerCapture` 易在双指滑出时残留幽灵触点；`AudioStep` 每次试听均新建且不关闭 `AudioContext`，连续试听 6 次触发 Chromium 上下文配额崩溃；`ImportStep` 多 MIME `accept` 在部分老 ROM 文件选择器兼容不佳。
6. **Android 原生层状态栏/导航栏底色未显式置黑**：`styles.xml` 中 `AppTheme` 与 `AppTheme.NoActionBar` 继承浅色/日夜主题却未显式锁定 `statusBarColor` 与 `navigationBarColor` 为纯黑，部分 Android 8/9/10 老机可能出现浅色导航栏白条。

需要通过一次系统性的老版本手机全链路兼容优化，确保 APK 在 Chrome 70~84 级别的 Android 7~10 老机型及 16:9 窄屏设备上不仅界面布局零粘连零溢出，而且包含导出在内的全向导流程 100% 流畅跑通。

## What Changes

1. **全界面 Flex 间距跨代兼容重构**：
   - 将 `src/index.css` 与各组件 JSX 中所有依赖 Flexbox `gap` 的布局统一迁移为基于相邻兄弟选择器（`> * + *`）或明确组件类外边距的间距机制（保留 Grid 布局的 `gap`），确保 Chrome 50+ 至现代内核呈现完全一致的间距表现。
2. **16:9 经典老手机窄横屏（`640×360`）零溢出适配**：
   - 优化 `AudioStep` 底部控制栏与 `Workbench` 底部控制栏（含叠加模式透明度滑块与七档倍速）的紧凑自适应排版及窄屏媒体查询，确保在 `640×360` 叠加 `48px` 安全区下所有控件完整位于安全区内。
   - 优化 `ExportPage` 右侧面板紧凑结构与固定底部主操作区布局，保证在 `360px` 逻辑高度下「开始渲染导出」按钮始终完整展示在首屏内。
3. **对比台与导出页共享底层视频解码节点（4 路降为 2 路）**：
   - 取消 `ExportPage` 内部重复创建 `<video>` 元素，改为由 `Workbench` 将持久化管理的 `videoRef1` / `videoRef2` 共享移交至 `ExportPage` 的 `DualVideoSyncEngine`，并在视图切换时正确重绑与寻道，消除进入导出页时的重新加载黑屏与多路硬解槽位争抢。
4. **Chrome < 94 老旧 WebView 兼容导出降级管线（`MediaRecorder`）**：
   - 在 `src/core/exporter.ts` 中新增 `MediaRecorder` 兼容录制分支：当 `isWebCodecsSupported()` 为 `false` 时，利用预合成 `AudioBuffer`（节拍器或重采样原声）接入 `MediaStreamAudioDestinationNode` 与 `canvas.captureStream(30)` 混合流，通过 `DualVideoSyncEngine` 按设定倍速实时回放 A-B 区间录制输出 `.webm` 视频文件，支持进度反馈、取消与原生存储保存。
   - 保留 Chrome 94+ 现代设备的 `WebCodecs + mp4-muxer` 离线高速确定性 MP4 编码路径不变。
5. **老旧内核 JS API、指针捕获与 Android 原生栏位加固**：
   - `GeometryStep` 增加 `ResizeObserver` 降级至 `window.resize` 的容灾分支，三线拖拽补充 `setPointerCapture`；`Workbench` 叠加手势补充 `setPointerCapture` 与容灾清理；
   - `AudioStep` 复用单一 `AudioContext` 并在试听点击同步阶段 `resume()`，消除 6 次上限报错与自动播放静音；
   - `ImportStep` 文件输入 `accept` 调整为 `video/*`；
   - `android/app/src/main/res/values/styles.xml` 显式配置黑色 `statusBarColor` 与 `navigationBarColor`。
6. **全流程自动化兼容性巡检增强**：
   - 扩展 `scripts/inspect-android10.mjs`（覆盖间距检测、叠加模式切换、CH2 全步骤、导出页首帧即时呈现与 Chrome 74 `MediaRecorder` 导出全链路验证）并新增 `640×360` 窄横屏 Playwright 自动回归校验。

## Capabilities

### New Capabilities
（无新建独立能力，均属于现有工作区、几何、音频与对比导出能力的兼容性演进）

### Modified Capabilities
- `video-workspace`: 明确全界面 Flex 布局间距不得依赖 Chrome 84+ 的 Flexbox `gap` 属性，并在 `640×360` 窄横屏叠加 `48px` 虚拟三键安全区下所有按钮与控件零截断零溢出；Android 原生样式显式锁定状态栏与导航栏为纯黑；文件选择器采用单 `video/*` 兼容声明。
- `geometric-alignment`: 明确空间标定容器尺寸监听在缺少 `ResizeObserver` 的老旧内核下自动回退 `window.resize`，三线拖拽与叠加视口手势具备指针捕获与防残留机制。
- `timeline-audio-sync`: 明确时间标定界面在 `640×360` 窄屏安全区内完整展示底栏与 `BPM` 控件；试听功能复用音频上下文严禁触及浏览器上下文配额上限。
- `comparison-export`: 明确导出工作台复用主对比台的活跃视频解码源（总解码器不超过 2 路），进入即现清晰画面无重加载黑屏；在不支持 WebCodecs 的老旧 WebView（Chrome < 94）下提供 `MediaRecorder` 兼容音画合成导出降级路径；导出右侧主操作区在 `360px` 高度横屏下「开始渲染导出」按钮完整首屏可见。

## Impact

- **前端样式与组件**：`src/index.css`、`src/components/ImportStep.tsx`、`src/components/GeometryStep.tsx`、`src/components/AudioStep.tsx`、`src/components/Workbench.tsx`、`src/components/ExportPage.tsx`。
- **核心算法与导出引擎**：`src/core/exporter.ts`（新增兼容录制导出路径与轻量 AudioBuffer 创建）。
- **Android 原生样式**：`android/app/src/main/res/values/styles.xml`。
- **测试与巡检脚本**：`scripts/inspect-android10.mjs`、`src/core/exporter.verify.ts`（或新增窄屏自动化检测脚本）。
- **架构决策**：新增 `docs/decisions/AgDR-0029-*.md` 记录老旧 WebView Flex 间距、共享视频解码器与 `MediaRecorder` 降级导出架构决策。
