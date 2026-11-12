# Proposal: Android 打孔屏横屏视口延伸与 WebView 启动兼容兜底

## Why

用户在真实 Android 打孔屏设备（如小米/红米等 MIUI/HyperOS 设备）上启动应用时出现严重界面异常：屏幕左侧出现 90 像素宽的原生浅色（`#FAFAFA`）避让白边，主体区域全屏纯黑且无任何 UI 元素响应。

经第一性原理溯源，该故障由两层叠加问题引发：
1. **原生层未声明打孔屏延展模式**：Android 系统横屏运行时默认启用摄像头挖孔 Letterbox 安全避让，硬性向右缩进窗口并露出了底层原生 `Theme.AppCompat.Light` 默认的浅灰色窗口底色；
2. **构建目标语法过高且无错误反馈**：`vite.config.ts` 设定 `build.target: 'es2022'`，若用户设备的 Android System WebView 内核版本稍旧，加载 ES 模块时会直接抛出语法或环境解析致命错误导致 React 树完全无法挂载，且缺少全局未捕获异常兜底，直接表现为 `index.html` 的纯黑 `body` 背景卡死。

必须立即实施打孔屏短边全屏延展、纯黑原生底色修正、构建编译目标降级以及首屏全局异常捕获面板，确保各类移动端设备即开即用与异常自见。

## What Changes

1. **Android 原生主题与打孔屏延伸**：
   - 在 `android/app/src/main/res/values/styles.xml` 中将启动与运行主题的 `android:windowBackground` 强制指定为纯黑（`@android:color/black`），防止任何系统避让导致白边裸露。
   - 在原生主题与 `AndroidManifest.xml` 中配置 `android:windowLayoutInDisplayCutoutMode="shortEdges"`，使横屏视口真正穿透并延展至摄像头打孔边缘，与 CSS 的安全区 `env(safe-area-inset-*)` 形成完整闭环。
2. **构建编译目标降级与运行时兼容**：
   - 将 `vite.config.ts` 中的 `build.target` 从激进的 `es2022` 调整为支持更广泛 Android WebView 内核的 `es2020` / `chrome87`，消除模块级解析语法不兼容隐患。
3. **首屏全局错误兜底机制（Error Boundary & Crash Overlay）**：
   - 在 `index.html` 的 `<head>` 中注入极轻量的原生全局异常监听（捕获 `window.addEventListener('error')` 与 `window.addEventListener('unhandledrejection')`）。
   - 若 JavaScript 资源加载失败或初始化脚本抛出致命未捕获异常，自动在 DOM 中直接挂载高对比度的错误诊断信息面板，展示错误信息、发生文件与堆栈，彻底杜绝静默黑屏。

## Capabilities

### New Capabilities
（无新建能力，复用既有工作区底座能力）

### Modified Capabilities
- `video-workspace`: 扩充「系统状态栏与虚拟金刚键安全区避让」及「全程强制横屏锁定与界面适配」规格，正式确立 Android 原生打孔屏短边全屏延伸（`shortEdges`）、原生纯黑底色防护以及 WebView 启动致命异常自诊断展示要求。

## Impact

- **原生工程**：`android/app/src/main/res/values/styles.xml`、`android/app/src/main/AndroidManifest.xml`。
- **构建配置**：`vite.config.ts`。
- **入口页面**：`index.html`。
- **构建输出与同步**：执行 `npm run build && npx cap sync android` 更新原生静态资产。
