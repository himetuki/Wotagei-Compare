# Tasks

## 1. 偏好契约、持久层与版本注入底座

- [x] 1.1 在 `src/types/preferences.ts`（并在 `src/types/index.ts` 统一导出）定义 `StepPreset`、`AppPreferences` 与出厂默认值常量；在 `vite.config.ts` 读取 `package.json` 版本号注入 `__APP_VERSION__` 并于 `src/vite-env.d.ts` 补充类型声明，运行 `npx tsc --noEmit` 确认编译通过。
- [x] 1.2 实现 `src/core/preferences.ts`（`loadAppPreferences`、`saveAppPreferences`、`sanitizeCustomStepSec` 与容灾边界校验）及黑盒验证脚本 `src/core/preferences.verify.ts`（覆盖默认读出、残缺存储回退、`0.005s` 下限钳位与 `localStorage` 往返持久化），运行 `npx tsx src/core/preferences.verify.ts` 确认通过。

## 2. 锚点试听视频时钟一次性重拍与自由秒数编辑

- [x] 2.1 重构 `src/components/CalibrationStep.tsx` 的 `commitAudioState` 与锚点输入框事件：键入期间保留 `anchorInputText` 原文不强行触发 `toFixed(3)` 改写，仅在数值有效落入 `[trimStart, trimEnd]` 时同步锚点时间戳；在 `onBlur` 与 `Enter` 时统一钳位并按 `toFixed(3)` 格式化补全（非法输入回退当前有效 `anchorTime.toFixed(3)`）；通过交互验证输入 `1.2` 与 `1.2349` 过程无光标回弹且失焦后规整为 `1.200` 与 `1.235`。
- [x] 2.2 在 `src/components/CalibrationStep.tsx` 中以复用单一 `SynthesizedMetronome` 实例与一次性 `auditionPendingRef` 武装状态取代 `setTimeout` 弱音定时提示：点击「试听」时先在用户手势中预热音频上下文、回退预留时间起播并武装重拍，在 60fps 追踪循环内校验 `!video.paused && !video.seeking && video.readyState >= 2` 且跨越 `anchorTime` 时播放一次 `playClick(true)` 重拍并立即清除武装；点击普通「播放」、暂停、拖拽波形/手柄或触发区间循环回绕时显式清除武装状态，验证普通播放与二周目循环绝不在锚点触发重拍。

## 3. 跨平台版本检查、Android 端内 APK 更新与安装包清扫

- [x] 3.1 扩展 `src/core/nativeMedia.ts` 增加 `getAppVersion`、`checkLatestRelease`、`downloadAndInstallApk`、`openExternalUrl` 与 `updateDownloadProgress` 监听契约，并实现 `src/core/updater.ts`（SemVer 比较、GitHub Releases 查询、`.apk` 资产提取与跨平台更新调度）及验证脚本 `src/core/updater.verify.ts`，运行 `npx tsx src/core/updater.verify.ts` 确认版本比对与资产解析通过。
- [x] 3.2 更新 `android/app/src/main/AndroidManifest.xml` 添加 `REQUEST_INSTALL_PACKAGES` 权限，在 `android/app/src/main/java/com/wotagei/compare/NativeMediaPlugin.java` 实现 `getAppVersion`、`checkLatestRelease`、`openExternalUrl`、`downloadAndInstallApk`（含重定向追踪、`cacheDir/wotagei_update_*.apk` 落盘与进度发射、API 26+ `canRequestPackageInstalls()` 授权回调续接、API 24+ `FileProvider` 与 API 23 降级拉起安装），并在 `load()`、新下载前与 `handleInstallApkResult` 回调中清理 `wotagei_update_*.apk`；在 `android/app/src/test/java/com/wotagei/compare/ResourceCleanupTest.java` 增加安装包清理单测并运行 `cd android && ./gradlew testDebugUnitTest` 通过。

## 4. 顶栏图标入口、设置与关于页面及未改会话状态同步

- [x] 4.1 新建 `src/components/SettingsAboutPage.tsx`（含 7 项默认偏好表单、与锚点同款的自定义步进秒数自由输入与失焦规整、软件版本/简介、GitHub 仓库及 Releases 直达链接与自动检查/下载更新进度控制面板），并在 `src/index.css` 新增顶栏图标按钮、灰色竖线与设置页暗黑紧凑布局样式（严守 Chrome 74 禁用 Flex `gap` 与 `@supports` 安全区回退规范）。
- [x] 4.2 改造 `src/App.tsx` 与 `src/components/Workbench.tsx`：在顶栏「导入」左侧放入双 V 光棒图标按钮与灰色竖线并支持无损切换设置页；将 `soundSource`、`slowMotionRate`、`stepPreset`、`customStepSec` 上移至 `App.tsx` 并维护 `sessionEdited` 脏标志，实现冷启动加载默认偏好与设置页修改后实时同步未手动改动的当前会话状态；为对比台自定义步进输入框补充 `Enter` 提交规整；运行 `npx tsc --noEmit && npm run build` 确认构建无错误。

## 5. 集成验收、Android 构建同步与决策状态收口

- [x] 5.1 使用 Playwright 对构建产物执行桌面横屏与 `640×360` 叠加 `48px` 安全区窄屏黑盒验收（含顶栏图标与灰色竖线、设置页 7 项偏好跨刷新持久化与未改状态联动、GitHub 跳转与模拟更新交互状态、标定页锚点自由输入失焦规整、试听重拍与普通播放隔离、以及窄横屏零溢出截断），并全量运行 `src/core/*.verify.ts` 验证脚本。
- [x] 5.2 运行 `npm run build && npx cap sync android && cd android && ./gradlew testDebugUnitTest assembleDebug` 验证全量构建、原生同步、JUnit 单测与 APK 打包成功，并将 `docs/decisions/AgDR-0038`、`AgDR-0039`、`AgDR-0040` 状态更新为 `executed`（如有偏离同步回 specs）。

## Workflow follow-up

- 全部任务实现与验收完成后，提醒用户运行 `/opsx:archive` 将本变更规格合并进 `openspec/specs/` 并归档。
