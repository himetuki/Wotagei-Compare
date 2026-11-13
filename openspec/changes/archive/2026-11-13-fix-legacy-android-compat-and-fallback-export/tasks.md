# Tasks

## 1. 跨代 Flex 间距兼容性与 16:9 窄横屏布局适配

- [x] 1.1 重构 `src/index.css` 与各组件 JSX 中所有 Flexbox 容器间距，移除对 Flex `gap` 属性的依赖（保留 Grid 容器 `.slot-grid` / `.export-grid` 的 `gap`），改用邻接子元素外边距规则（`> * + *`）与紧凑间距类，并增加 `@media (max-width: 760px)` / `@media (max-height: 400px)` 窄屏收紧样式，验证 `rg -n "gap" src/` 不再出现 Flex 容器 `gap`。
- [x] 1.2 优化 `src/components/AudioStep.tsx` 底栏、`src/components/Workbench.tsx` 底栏（含叠加模式透明度区）及 `src/components/ExportPage.tsx` 右侧面板垂直紧凑布局，运行 `npm run build` 后使用 Playwright 在 `640×360` 逻辑视口叠加 `48px` 右侧安全区下验证导入、CH1/CH2空间、CH1/CH2时间、对比台（分区+叠加）及导出页所有控件 100% 零截断零溢出。

## 2. 老旧内核 API 兜底、原生样式与指针防断触加固

- [x] 2.1 在 `src/components/GeometryStep.tsx` 为 `ResizeObserver` 增加 `typeof ResizeObserver !== 'undefined'` 检查与 `window.resize` 回退，并为三线标尺拖拽补充 `setPointerCapture` / `releasePointerCapture`；在 `src/components/Workbench.tsx` 叠加手势 `handlePointerDown` 补充 `setPointerCapture`；在 `src/components/AudioStep.tsx` 复用单一 `AudioContext` 并在「试听」点击手势中同步 `resume()`；在 `src/components/ImportStep.tsx` 将文件输入改用 `accept="video/*"`，运行 `npm run build` 零报错。
- [x] 2.2 更新 `android/app/src/main/res/values/styles.xml`（显式配置纯黑 `android:statusBarColor` 与 `android:navigationBarColor`）及 `android/app/src/main/AndroidManifest.xml`（将 `WRITE_EXTERNAL_STORAGE` `maxSdkVersion` 扩至 `29` 覆盖 Android 10 并增加私有目录写入回退），验证 `npx cap sync android` 同步无报错。

## 3. 导出页视频解码器复用与老旧 WebView MediaRecorder 兼容降级

- [x] 3.1 修改 `src/components/Workbench.tsx` 与 `src/components/ExportPage.tsx`，由对比台共享移交 `videoRef1` / `videoRef2` 给导出工作台复用（移除 `ExportPage` 自身新建 `<video>`），并在 `ExportPage` 未获得有效帧前不锁死半黑残帧、退出导出后由对比台重新绑定与同步寻道；验证在 Android 10 模拟器进入导出页时文档内 `<video>` 总数严格为 2 且切换后即刻显示预览画面。
- [x] 3.2 修改 `src/core/exporter.ts` 与 `src/components/ExportPage.tsx`，在 `!isWebCodecsSupported()` 时通过 `DualVideoSyncEngine` 驱动共享/离屏视频按 `slowMotionRate` 回放并用 `canvas.captureStream(30)` + `AudioBufferSourceNode -> MediaStreamAudioDestinationNode` 经 `MediaRecorder` 导出 `.webm`（支持节拍器、原声重采样、进度更新、取消导出与原生保存），更新提示文案并验证 `bun src/core/exporter.verify.ts` 及 `npm run build` 通过。

## 4. 全流程循环回归验证与 Android 10 真机/模拟器 APK 验收

- [x] 4.1 升级 `scripts/inspect-android10.mjs`，新增验证项目：Flex 按钮/标签实际水平像素间距 > 0、CH2空间与两竖一横切换、对比台叠加模式与工具栏展开收起、导出页 `<video>` 总数为 2 且 500ms 内画面非黑、以及 Chrome 74 下点击「开始渲染导出」完成真实 `MediaRecorder` WebM 导出全流程零报错。
- [x] 4.2 执行 `npm run build && npx cap sync android` 并用 Windows Gradle 编译最新 `app-debug.apk`，在 `legacy_android10` 模拟器安装运行升级后的 `node scripts/inspect-android10.mjs` 与 Playwright `640×360` 窄屏检查，肉眼查验最新截图确认无粘连、无黑屏、无溢出，将 `docs/decisions/AgDR-0029-*.md` 状态更新为 `executed`。

## Workflow follow-up

- 全部任务完成后运行 `/openspec:archive` 将规格增量合并至 `openspec/specs/` 并归档变更。
