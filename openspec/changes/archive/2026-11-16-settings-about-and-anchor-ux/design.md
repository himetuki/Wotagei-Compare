# Design

## Context

当前 [App.tsx](../../../src/App.tsx) 在初始化阶段将三线模型、对比模式与 BPM 策略直接硬编码为 `'two-horizontal-one-vertical'`、`'split-screen'` 与 `'left'`，而声音源（`'metronome'`）、慢放倍速（`1.0`）、步进粒度（`'frame'`）与自定义步数（`0.033`）则局部驻留在 [Workbench.tsx](../../../src/components/Workbench.tsx) 中，既无法跨会话保存用户习惯，在切出对比台返回时也缺少跨步骤统一保持。顶栏目前仅包含 5 个步骤按钮，尚未提供应用图标入口或关于/更新界面。

此外，在 [CalibrationStep.tsx](../../../src/components/CalibrationStep.tsx) 中：
1. `jumpToAnchor` 通过 `setTimeout(..., delayMs)` 播放 1200Hz 单频提示音，未对齐真实视频播放进度且音色与对比台节拍器不统一；
2. `commitAudioState` 在每次调用时都会执行 `setAnchorInputText(clampedAnchor.toFixed(3))`，而输入框 `onChange` 在键入有效数字时立即触发 `commitAudioState`，导致每次击键都被强制改写为三位小数。

全项目必须继续遵守 `tsconfig.json` 与 `vite.config.ts` 锁定的 **ES2018** 运行时边界与 Chrome 74+ 兼容 CSS 规范（禁用 Flexbox `gap`，使用 `.fx-row-*` / `.fx-col-*` 与 `@supports (padding: max(0px))` 回退）。

## Goals / Non-Goals

**Goals:**
- 在顶栏「导入」左侧新增软件图标按钮与灰色竖线分隔符，保留顶栏实现无损切入/返回「设置与关于」页面，完整保留已导入视频与标定状态。
- 实现 7 项默认工作流偏好的 `localStorage` 持久化（`triLineModel`、`comparisonMode`、`soundSource`、`bpmStrategy`、`customBpm`、`slowMotionRate`、`stepPreset`、`customStepSec`），并在用户未手动覆盖当前会话状态时实时联动生效。
- 在「设置与关于」页面呈现项目信息、GitHub 仓库直达与自动检查更新；Android 原生端支持端内下载 `.apk`、进度回调、未知应用来源权限引导、调起安装器，以及多节点彻底删除历史 `.apk` 安装包；Web/桌面端支持版本检测与跳转 Releases 下载。
- 重构 `CalibrationStep`「试听」为视频时钟同步的一次性节拍器重拍（`SynthesizedMetronome.playClick(true)`），并与普通「播放」和区间循环彻底隔离。
- 修复 `CalibrationStep` 锚点输入框逐字覆写问题，对齐对比台「自定义步进粒度」秒数自由输入、失焦/回车钳位与 `toFixed(3)` 格式化交互。

**Non-Goals:**
- 不引入第三方状态管理库或更新框架（如 Electron/CodePush）。
- 不做强制静默后台自动更新弹窗，版本检查与下载由用户在设置页主动点击触发。
- 不修改现有双视频同步锁相核心算法（`DualVideoSyncEngine`）或几何变换算法（`geometry.ts`）。

## Decisions

### 1. 默认偏好持久化与未改会话状态实时同步架构
参见决策记录：[AgDR-0038](../../../docs/decisions/AgDR-0038-应用默认偏好持久化与未改会话状态同步架构.md)

- **数据结构与存储**：新增 `src/types/preferences.ts` 定义 `AppPreferences` 与 `StepPreset`，由 `src/core/preferences.ts` 以扁平 JSON 读写 `localStorage` 键 `wotagei_compare_preferences_v1`（容灾解析并按合法枚举/区间校正）。
- **状态上移与脏标志隔离**：将原本在 `Workbench.tsx` 内部管理的 `soundSource`、`slowMotionRate`、`stepPreset`、`customStepSec` 上移至 `App.tsx`，与 `triLineModel`、`mode`、`bpmStrategy`、`customBpm` 一并初始化自 `loadAppPreferences()`。在 `App.tsx` 中维护轻量 `sessionEdited` 记录各配置是否在当前会话中被用户于标定页或对比台手动修改过；在设置页更改默认偏好并写入 `localStorage` 时，对 `sessionEdited[key] === false` 的字段同步更新 `App.tsx` 当前状态。
- **顶栏图标入口与灰色竖线**：在 `App.tsx` 的 `.top-nav` 左侧（`.step-track` 之前）添加软件图标按钮（内联/静态引用双 V 光棒图标，尺寸 `26×26px` 左右以适配窄屏）与 `<span className="nav-brand-divider" />` 灰色竖线；用独立布尔态 `isSettingsOpen` 控制 `view-body` 渲染 `<SettingsAboutPage />` 而不改变 `step` 状态，从而在点击「返回」、再点软件图标或点击顶栏任意可用步骤 tab 时无损切回原视图，已挂载视频信息零丢失。

### 2. GitHub Releases 版本检测与 Android 端内 APK 下载安装及清扫闭环
参见决策记录：[AgDR-0039](../../../docs/decisions/AgDR-0039-Android端内GitHub自动更新与安装包生命周期清扫.md)

- **版本号单一真实源**：`vite.config.ts` 读取 `package.json` 的 `version` 注入编译期常量 `__APP_VERSION__`（在 `src/vite-env.d.ts` 声明）；Android 端由 `NativeMedia.getAppVersion()` 直接读取 `PackageManager.getPackageInfo().versionName`（构建发布时与 `package.json` 保持同步）。
- **版本检测与跨平台更新路径**（`src/core/updater.ts`）：
  - 仓库常量固定指向 `jollyxenon/Wotagei-Compare`（`https://github.com/jollyxenon/Wotagei-Compare` 与 `https://api.github.com/repos/jollyxenon/Wotagei-Compare/releases/latest`）。
  - Android 原生端新增 `NativeMedia.checkLatestRelease()`（Java `HttpURLConnection` 携带 `User-Agent: Wotagei-Compare`，避免旧 WebView CORS/请求头兼容问题），Web/桌面端使用标准 `fetch`。通过三段式 SemVer 比较远端 `tagName` 与本地版本，识别是否存在 `.apk` 资产。
- **Android 原生下载、权限引导与三重 APK 清扫**（`NativeMediaPlugin.java` + `AndroidManifest.xml`）：
  - `AndroidManifest.xml` 增加 `<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />`。
  - 新增 `NativeMedia.downloadAndInstallApk({ url, version })`：
    1. 在单线程更新执行器中先调用 `cleanupStaleUpdateApkFiles(cacheDir)` 删除旧安装包；
    2. 通过 `HttpURLConnection` 循环处理 301/302/303/307/308 重定向下载至 `cacheDir/wotagei_update_<sanitizedVer>.apk`，按已读取字节 / `Content-Length` 发射 `updateDownloadProgress` 事件；
    3. 下载完成后在 API 26+ 检查 `PackageManager.canRequestPackageInstalls()`：若未授权，先通过 `startActivityForResult` 跳转 `Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES`；在 `@ActivityCallback` 中若已授权则继续拉起安装，若仍拒绝则立即删除该 APK 并返回提示；
    4. 拉起系统安装器（API 24+ 使用 `FileProvider.getUriForFile` + `FLAG_GRANT_READ_URI_PERMISSION`，API 23 设置可读后使用 `Uri.fromFile`）并通过 `startActivityForResult(..., "handleInstallApkResult")` 启动。
  - **三道删除保障**：(a) `NativeMediaPlugin.load()` 冷启动时与 `cleanupStaleExportTempFiles` 一并扫描 `cacheDir` 删除全部 `wotagei_update_*.apk`（覆盖成功覆盖安装后重启场景）；(b) 每次新下载启动前清理；(c) `handleInstallApkResult` 回调返回时（安装取消或失败未杀进程）立即删除临时安装包。

### 3. 锚点试听视频时钟一次性重拍与自由秒数编辑契约
参见决策记录：[AgDR-0040](../../../docs/decisions/AgDR-0040-锚点试听视频时钟一次性重拍与自由秒数编辑契约.md)

- **试听视频时钟一次性触发**：
  - `CalibrationStep` 持有单一 `SynthesizedMetronome` 实例（卸载时 `dispose()`），取代零散 `auditionAudioCtxRef` 与 `setTimeout`。
  - 点击「试听」时：先在点击手势同步周期内调用一次 `AudioContext` 预热/唤醒逻辑（复用节拍器内单例音频上下文），计算 `preRoll = Math.max(0, anchorTime - 0.6)`，设置 `video.currentTime = preRoll` 并武装 `auditionPendingRef`（记录 `{ anchor: anchorTime, armed: true, observedPreAnchor: anchorTime <= 0.05 }`），然后启动播放。
  - 在 60fps `requestAnimationFrame` 更新循环中，仅当 `auditionPendingRef.current.armed && !video.paused && !video.seeking && video.readyState >= 2` 时：
    - 若尚未观测到到达锚点前的已就绪帧（`video.currentTime < anchor`），记录 `observedPreAnchor = true`（防止寻道完成前的残留旧时间帧误触发）；
    - 当 `observedPreAnchor && video.currentTime >= anchor` 时，调用 `metronomeRef.current.playClick(true)` 播放一次强拍并立即将 `armed = false`。
  - 普通「播放」按钮（`togglePlay`）、暂停、拖拽波形寻帧、拖拽 `[` / `]` 手柄或到达 `trimEnd` 自动回绕至 `trimStart` 时，均立即重置 `auditionPendingRef.current.armed = false`。
- **锚点输入框编辑/提交分离**：
  - 修改 `CalibrationStep` 中的 `commitAudioState(nextBpm, nextAnchor, nextTrim, syncAnchorText = true)`：默认非输入态（点击「设为锚点」、手柄缩窄钳位、异步音轨同步）会更新 `anchorInputText`；而输入框 `onChange` 内调用时不覆盖 `anchorInputText`，仅在数值有效且落入 `[trimStart, trimEnd]` 时静默更新 `anchorTime` 与 `onAudioChange`。
  - `onBlur` 与 `onKeyDown (Enter)` 执行 `parseFloat(anchorInputText)` → 钳位 `[trimStart, trimEnd]` → `setAnchorInputText(clamped.toFixed(3))`（非法则恢复 `anchorTime.toFixed(3)`）。对设置页及对比台的「自定义步进粒度」输入框采用完全一致的 `onChange` 自由编辑 + `onBlur`/`Enter` 钳位（`>= 0.005`）与 `toFixed(3)` 格式化交互。

## Risks / Trade-offs

- **[Risk] GitHub API 匿名请求存在每小时 60 次 IP 频率限制或国内网络波动** → 在设置页点击按钮时才按需请求，明确捕获网络/状态码错误（如 HTTP 403 限流或超时）并返回友好中文提示与「手动前往 GitHub Releases」按钮作为兜底。
- **[Risk] 当前发布的 Debug APK 与用户自行签名构建的 Release APK 签名不同时，Android 系统包安装器会拒绝覆盖安装** → 属于 Android 平台正常安全约束，在安装器返回取消/失败时自动删除临时安装包并告知用户可前往 Releases 核对签名/版本。
- **[Risk] 锚点为 `0.000s` 或紧贴视频开端时 `preRoll === anchorTime`，视频起播帧即处于锚点位置** → 当 `preRoll >= anchorTime - 0.02` 时初始化 `observedPreAnchor = true`，并在 `!video.seeking && video.readyState >= 2` 首个推进帧即刻触发重拍并消费状态，不吞音。
- **[Risk] 640×360 窄横屏顶栏左侧多出软件图标与灰色竖线** → 将图标容器控制在紧凑尺寸（如 `26×26px`、内边距收敛），与 `@media (max-width: 760px)` 下 5 个步骤按钮配合验证，确保单视频标定与对比台顶栏右侧控件零溢出。

## Migration Plan

- 本地存储键 `wotagei_compare_preferences_v1` 为全新引入；首次读取为空或字段残缺时安全回退默认出厂配置（两横一竖、左右分区、节拍器、随视频1、1.0x、1帧、`0.033s`），无历史迁移负担。
