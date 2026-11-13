# Proposal

## Why

在 Android 10 虚拟老机型（系统 WebView `74.0.3729.185`）上对现有 APK 执行全流程实测时，发现三项仅在老旧 Chromium 内核下暴露的真实界面与视频预览缺陷：
1. **CSS 安全区内边距全部塌陷为 `0px`**：`src/index.css` 与 `src/components/Workbench.tsx` 直接并列使用静态回退与 `max(..., var(--safe-*))`。由于 `max()` 内部包含 CSS 自定义属性 `var()`，Chrome 79 以下内核会在解析阶段放行覆盖前面的静态回退，到计算值阶段因不识别 `max()` 触发 IACVT（Invalid At Computed-Value Time）并回退为初始值 `0px`，导致全应用 6 个页面边缘紧贴屏幕边沿甚至贴近系统导航栏。
2. **空间标定首帧被系统默认大播放图标遮挡**：`GeometryStep.tsx` 的 `<video>` 未开启预加载且初次挂载停留在未寻帧状态，在 Android 10 WebView 上会渲染原生灰色大播放占位图，用户未点击播放前无法看清人物对齐三线。
3. **时间标定首次进入画面全黑**：`AudioStep.tsx` 在组件挂载 `useEffect` 中于 `readyState === 0` 时直接设置 `videoRef.current.currentTime = nextAnchor`，老旧 WebView 会静默忽略尚未加载元数据阶段的寻道请求，导致画面在点击播放前呈纯黑状态。

需要立即通过一次轻量修复彻底消除 Chrome 74 级别 WebView 的界面贴边塌陷与标定页首帧/锚点帧不可见问题，并固化一套可重复运行的 Android 10 模拟器自动巡检脚本以便每次构建后回归验证。

## What Changes

1. **老旧内核安全区 CSS 特性查询隔离（`@supports`）**：
   - 将 `src/index.css` 中所有含 `max(..., var(--safe-*))` 的安全区边距声明移入 `@supports (padding: max(0px))` 规则块内，确保 Chrome 79 以下内核严格生效固定像素回退，Chrome 79+ 内核正常叠加系统安全区变量。
   - 将 `src/components/Workbench.tsx` 中行内的 `paddingLeft: 'max(8px, var(--safe-left))'` 与 `paddingRight: 'max(8px, var(--safe-right))'` 抽离至 `src/index.css` 的 `.workbench-stage` 类并纳入同一 `@supports` 回退机制。
2. **空间标定视频首帧自动预寻道呈现**：
   - 在 `src/components/GeometryStep.tsx` 中为 `<video>` 补充 `preload="auto"`，并在 `loadedmetadata` 就绪时当 `currentTime === 0` 时安全轻寻道至首帧位置（如 `0.001s`），驱散 Android WebView 默认灰色播放占位图标，确保进入即见清晰视频首帧。
3. **时间标定锚点帧就绪后补寻道**：
   - 在 `src/components/AudioStep.tsx` 中为 `<video>` 补充 `preload="auto"`，并在 `loadedmetadata` 事件就绪后自动对齐当前 `anchorTime`（受 `[trimStart, trimEnd]` 约束），保证进入「CH1时间 / CH2时间」后无需点击播放即可直接呈现对拍锚点帧画面。
4. **Android 10 老机型自动化巡检脚本（`scripts/`）**：
   - 提供可重复执行的无头/有头检测脚本，连接本地 `legacy_android10` AVD 对构建产物执行冷启动、WebView 布局边距校验、双路视频导入与全向导步骤黑盒巡检。

## Capabilities

### New Capabilities
（无新建能力，复用现有能力边界）

### Modified Capabilities
- `video-workspace`: 明确老旧 Chromium（`< 79`）下 CSS 安全区边距回退必须通过 `@supports` 隔离，防止含 `var()` 的 `max()` 表达式触发 IACVT 导致全界面内边距归零。
- `geometric-alignment`: 明确空间标定页面进入后必须在视频元数据就绪时自动呈现可辨识的视频首帧画面，不得残留系统默认播放占位图标遮挡标定线。
- `timeline-audio-sync`: 明确时间标定页面进入后必须在视频元数据就绪时自动定位并渲染当前对拍锚点对应画面帧，不得呈现纯黑等待态。

## Impact

- **前端样式与组件**：`src/index.css`、`src/components/Workbench.tsx`、`src/components/GeometryStep.tsx`、`src/components/AudioStep.tsx`。
- **工程脚本**：新增 Android 10 模拟器巡检脚本 `scripts/inspect-android10.mjs`。
- **架构决策与原生同步**：新增一条架构决策记录 `docs/decisions/AgDR-0028-*.md`；构建后需执行 `npm run build && npx cap sync android` 并重打 debug APK 在 `legacy_android10` 上完成回归验证。
