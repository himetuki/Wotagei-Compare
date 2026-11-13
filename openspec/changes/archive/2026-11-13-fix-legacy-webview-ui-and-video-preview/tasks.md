# Tasks

## 1. 老旧内核 CSS 安全区特性查询隔离

- [x] 1.1 在 `src/index.css` 中移除所有主选择器内的 `max(..., var(--safe-*))` 声明、保留固定像素静态边距并新增 `.workbench-stage` 类，再统一于文末 `@supports (padding: max(0px))` 块内覆盖安全区 `max()` 规则，验证 `rg -n "padding.*max\(" src/index.css` 仅出现在 `@supports` 块内。
- [x] 1.2 修改 `src/components/Workbench.tsx` 画布外层容器，移除行内 `paddingLeft` / `paddingRight` 的 `max()` 表达式并应用 `className="workbench-stage"`，验证 `rg -n "max\(.+var\(--safe" src/` 无 `@supports` 外部残留且 `npm run build` 零报错通过。

## 2. 空间与时间标定页老旧 WebView 首帧自动呈现

- [x] 2.1 修改 `src/components/GeometryStep.tsx`，为 `<video>` 补充 `preload="auto"` 并监听 `loadedmetadata`（含 `readyState >= 1` 同步分支），在 `currentTime === 0` 时安全轻寻道至首帧位置（如 `0.01s`），验证 `npm run build` 通过且在 Android 10 模拟器进入「CH1空间」不出现默认灰色播放占位图。
- [x] 2.2 修改 `src/components/AudioStep.tsx`，为 `<video>` 补充 `preload="auto"` 并监听 `loadedmetadata`（含 `readyState >= 1` 同步分支）自动定位至受 `[trimStart, trimEnd]` 约束的 `anchorTime`，验证 `npm run build` 通过且在 Android 10 模拟器进入「CH1时间」不呈纯黑等待画面。

## 3. 自动化巡检脚本与全链路真机/虚拟机回归验证

- [x] 3.1 将 Android 10（`legacy_android10` AVD）自动化巡检脚本固化至 `scripts/inspect-android10.mjs`（支持自动检测 `webview_devtools_remote_*`、校验各页计算内边距非 `0px`、双视频导入与播放、截屏输出与零控制台异常检查），验证 `node --check scripts/inspect-android10.mjs` 通过。
- [x] 3.2 执行 `npm run build && npx cap sync android` 并通过 `android/gradlew assembleDebug` 重打 Debug APK，在 `legacy_android10` 模拟器上运行 `node scripts/inspect-android10.mjs` 验证所有页面边距非 `0px`、空间/时间标定首帧清晰可见、对比台播放正常且无异常报错，并将 `docs/decisions/AgDR-0028-CSS安全区特性查询回退与老旧WebView首帧预寻道.md` 状态更新为 `executed`。

## Workflow follow-up

- 全部任务实现并验证通过后，运行 `/openspec:archive` 将本次规格增量合并至 `openspec/specs/` 并归档变更（归档前确认 `AgDR-0028` 状态已离开 `proposed`）。
