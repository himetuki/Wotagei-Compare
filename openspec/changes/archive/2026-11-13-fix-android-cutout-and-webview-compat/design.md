# Design: Android 打孔屏横屏视口延伸与 WebView 启动兼容兜底

## Context

见 [proposal.md](./proposal.md) 了解故障根因与修复动机。
目前应用锁定了横屏，但 `android/app/src/main/res/values/styles.xml` 与 `AndroidManifest.xml` 中未声明任何打孔/刘海屏延伸规则，且主题继承自 `Theme.AppCompat.Light`，其默认窗口背景为 `#FAFAFA`；同时前端 `vite.config.ts` 指定了 `build.target: 'es2022'`，在部分未更新系统 WebView 的国行机型（如小米等）上存在语法解析失败导致白屏变黑屏的风险，且 `index.html` 缺乏全局未捕获异常感知。

## Goals / Non-Goals

**Goals:**
- 原生层面彻底清除 Android 横屏运行下打孔/刘海缺口处的 90px 白色系统留白，使应用窗口短边全屏延伸。
- 原生窗口底色强制设置为纯黑，无论在启动冷启动还是任何系统级过渡中均保持纯黑监视器视觉基线。
- 前端打包降级至兼容性更好的 `es2020`，兼容绝大多数存量移动设备内置 WebView 内核。
- 在 `index.html` 首屏直接挂载轻量级原生错误捕获面板，遇到脚本错误或资源丢失时屏幕立刻高亮显示堆栈，彻底终结黑屏无反馈假死。

**Non-Goals:**
- 不重构现有 React 应用的状态机与音视频解码逻辑。
- 不引入重型商业 APM SDK（如 Sentry、Bugly）。

## Decisions

### 决策 1：原生窗口背景纯黑化与 `shortEdges` 短边延伸模式
在 `android/app/src/main/res/values/styles.xml` 的 `AppTheme.NoActionBar` 与 `AppTheme.NoActionBarLaunch` 中：
- 添加 `<item name="android:windowBackground">@android:color/black</item>`，将 Activity 窗口默认背景强制改为纯黑，杜绝 `#FAFAFA` 泄露。
- 添加 `<item name="android:windowLayoutInDisplayCutoutMode">shortEdges</item>`，通知系统在横屏模式下允许窗口直接伸展至打孔/刘海屏两侧短边，由前端 CSS `env(safe-area-inset-*)` 承接内部交互组件的避让。
- 详见架构决策记录：[AgDR-0023-刘海打孔屏短边延展与WebView兼容兜底.md](../../../docs/decisions/AgDR-0023-刘海打孔屏短边延展与WebView兼容兜底.md)。

### 决策 2：打包编译目标从 `es2022` 调整为 `es2020`
将 `vite.config.ts` 中的 `build.target` 从激进的 `'es2022'` 调整为 `'es2020'`。
- 支持大部分移动端 Android 10+ / Chrome 87+ WebView。
- 消除前沿模块语法（如顶层特性或静态初始化块等）在稍旧内核上的 `SyntaxError` 阻断。

### 决策 3：入口 HTML 轻量全局未捕获异常与 Promise 拒绝可视化面板
在 `index.html` 的 `<head>` 顶部注入原生 JS 诊断层：
- 监听 `window.addEventListener('error', handler)`。
- 监听 `window.addEventListener('unhandledrejection', handler)`。
- 当检测到错误时，在 `#root` 或 `document.body` 中挂载一个全屏半透明高对比诊断悬浮框（黑底红字、等宽字体、可滚动），展示错误类型、信息及堆栈，并提供「复制错误详情」按钮（或自动输出完整错误文本），保证用户截屏即可排查。

## Risks / Trade-offs

- **[Risk] 旧版 Android 系统的 targetApi 差异** → 在低于 Android P (API 28) 的设备上，`windowLayoutInDisplayCutoutMode` 属性会被系统安全忽略，不产生负面崩溃；对于 API 28+ 则直接生效消除白边。
- **[Trade-off] 语法编译降级增加打包体积** → `es2020` 生成的代码体积相比 `es2022` 仅微增数 KB，换取极高的跨手机兼容性。
