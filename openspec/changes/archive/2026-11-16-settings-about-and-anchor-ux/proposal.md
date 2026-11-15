# Proposal

## Why

一线 WOTA 艺练习者在长期高频使用 Wotagei-Compare 过程中遇到了三项体验痛点：
1. **缺少默认工作流偏好与软件设置/更新入口**：每次冷启动软件后，用户仍需在标定页与对比台重复切换常用三线模型、对比模式、声音输出源（例如固定用「视频1」或「节拍器」）、BPM 对齐策略、慢放倍速和步进粒度；同时界面上缺少软件版本展示、GitHub 开源仓库跳转以及 Android 端内的更新通道；
2. **锚点「试听」重拍未与视频时钟绑定且与普通播放边界不清**：当前单视频标定页点击「试听」时采用纯 `setTimeout` 触发弱音正弦波脉冲，在移动端解码起播存在耗时延迟时容易提前走时错拍，且未复用节拍器标准重拍音色；需要明确并强化为“仅试听启动的播放在锚点处触发一次重拍，普通播放及循环不触发”；
3. **锚点手动输入框逐字改写导致极难输入**：当前在输入锚点秒数时 `onChange` 即刻调用 `commitAudioState` 并强制将输入框改写为 `toFixed(3)`，用户每次删改小数都会立刻补零回弹、光标跳动，需要改为与对比台「自定义步进粒度」一致的自由输入、失焦规整交互。

## What Changes

- **顶栏软件图标入口与「设置与关于」页面**：
  - 在顶部全局导航栏「导入」选项卡左侧放置软件专属双 V 光棒矢量图标按钮，并在图标右侧放置一条灰色竖线与后续步骤导航区隔开；
  - 保留顶栏导航条，点击软件图标后（图标按钮激活高亮）下方主工作区切换为「设置与关于」页面；再次点击图标、点击页内「返回」按钮或点击顶栏任意可用步骤均可切回原流程，完整保留已导入视频与标定状态；
  - 设置区支持选择并持久化保存至 `localStorage` 的 7 项默认配置：**默认三线模式**、**默认对比模式**、**默认音乐播放（声音源）**、**默认 BPM 对齐策略**（含手动默认 BPM）、**默认慢放倍速**、**默认步进粒度**以及**自定义步进粒度（秒）**；修改默认配置后除永久存储供下次启动读取外，还会实时同步当前会话中用户尚未手动修改过的对应工作流状态；
  - 关于与更新区展示软件名称、当前版本号、项目简介与仓库链接（`https://github.com/jollyxenon/Wotagei-Compare` 一键跳转），并提供「检查更新 / 自动更新」按钮：请求 GitHub Releases 最新版本接口对比版本；在 Android 原生端支持**端内下载最新 APK、进度反馈、未知应用来源权限引导、调起系统包安装器**，并在冷启动初始化、发起新下载前及安装界面取消/异常返回时自动删除 `cacheDir` 中遗留的历史安装包（`wotagei_update_*.apk`）；Web 与 Windows 桌面端支持版本比对并跳转 Releases 页面下载。
- **锚点「试听」视频时钟锁相重拍与普通播放严格隔离**：
  - 在 `CalibrationStep` 中复用 `SynthesizedMetronome.playClick(true)` 标准重拍音色替代原有的孤立 `setTimeout` 弱正弦音；
  - 仅在点击「试听」按钮启动播放时武装一次性试听重拍状态，在 60fps 视频时间追踪循环中监测 `video.currentTime` 真实跨过 `anchorTime` 的瞬间精准触发一次重拍并立即消费清除该标志；
  - 点击普通「播放」按钮、试听播放到达终点后自动循环重播、或拖动波形/手柄与暂停后再播放时，均绝不在锚点处自动播放重拍。
- **锚点手动输入框对齐自定义步进输入方式**：
  - 移除 `onChange` 过程中对 `anchorInputText` 的 `toFixed(3)` 强制覆写，允许用户在编辑态自由键入或删除小数位数（含临时空串或短小数），仅当解析值处于 `[trimStart, trimEnd]` 有效范围时静默更新锚点时间戳；
  - 在输入框失焦（`onBlur`）或按下 `Enter` 时统一执行有效区间 `[trimStart, trimEnd]` 钳位与 `toFixed(3)` 三位小数规整（输长了按三位格式化截断/舍入，输短了自动补齐三位；非法输入回退当前有效锚点值），与对比台及设置页「自定义步进粒度」秒数输入体验完全一致。

## Capabilities

### New Capabilities

- `app-preferences-and-updates`: 负责应用级默认工作流偏好的本地持久化（`localStorage`）与未修改会话实时同步、顶栏图标触发的「设置与关于」页面、GitHub 仓库跳转以及基于 GitHub Releases API 的版本检测和 Android 端内 APK 下载安装与历史安装包自动清扫。

### Modified Capabilities

- `video-workspace`: 顶栏最左侧在「导入」之前新增软件图标入口与灰色竖线分隔符，支持主区切换进入「设置与关于」页面且维持窄横屏零溢出；应用冷启动与会话初始状态从默认偏好加载（替代原先对比模式/三线模式硬编码默认值）。
- `timeline-audio-sync`: 明确单视频标定「试听」由视频播放时钟跨越 `anchorTime` 触发一次节拍器重拍，非试听启动的播放及循环不触发锚点重拍；修订锚点秒数输入框行为为输入期自由编辑、失焦/回车钳位并 `toFixed(3)` 格式化；对比台默认声音源、BPM 策略、慢放倍速与步进粒度接入应用默认偏好。

## Impact

- **Affected Frontend Code**:
  - `src/types/preferences.ts` (或扩展 `src/types/wizard.ts`、`src/types/index.ts`): 定义默认配置契约与更新状态类型。
  - `src/core/preferences.ts`: 提供默认配置的加载、校验、持久化与安全边界工具。
  - `src/core/updater.ts`: GitHub Releases 最新版本查询、语义化版本比较与跨平台更新调度逻辑。
  - `src/core/nativeMedia.ts`: 扩展 Android 原生桥接方法 `getAppVersion`、`downloadAndInstallApk`、`openExternalUrl` 与下载进度事件监听。
  - `src/components/SettingsAboutPage.tsx`: 新增设置与关于页面组件（默认参数表单、自定义步进粒度输入、版本/GitHub 信息与自动更新交互）。
  - `src/App.tsx`: 顶栏最左侧渲染软件图标按钮与灰色竖线、接入默认偏好与「用户是否已手动修改」标记以实现未改状态实时同步、管理设置页切入与返回。
  - `src/components/CalibrationStep.tsx`: 修复 `commitAudioState` 对 `anchorInputText` 的逐字覆盖缺陷；接入 `SynthesizedMetronome` 与视频时钟跨锚点一次性试听重拍逻辑。
  - `src/components/Workbench.tsx`: 从默认偏好初始化 `soundSource`、`slowMotionRate`、`stepPreset`、`customStepSec`，并在对应项未被用户在本页手动改动时响应全局默认配置变更。
  - `src/index.css`、`vite.config.ts`: 补充顶栏图标与灰色竖线、设置页横屏双栏紧凑布局样式，注入编译期 `__APP_VERSION__`。
- **Affected Android Native Code**:
  - `android/app/src/main/AndroidManifest.xml`: 新增 `android.permission.REQUEST_INSTALL_PACKAGES`。
  - `android/app/src/main/java/com/wotagei/compare/NativeMediaPlugin.java`: 实现版本读取、APK 流式下载（含重定向处理与进度事件）、未知应用安装授权引导、`FileProvider` 拉起系统包安装器以及冷启动/下载前/取消返回时的 `wotagei_update_*.apk` 清理。
  - `android/app/src/test/java/com/wotagei/compare/ResourceCleanupTest.java`: 补充更新安装包文件清扫单元测试。
- **Architecture Decisions**:
  - 新增 `docs/decisions/AgDR-0038` 与 `docs/decisions/AgDR-0039`（记录偏好实时同步边界、Android 端内更新与安装包生命周期清扫方案、以及试听重拍视频时钟锁相重构）。
- **Dependencies**: 无新增第三方 NPM 或 Gradle 依赖。
