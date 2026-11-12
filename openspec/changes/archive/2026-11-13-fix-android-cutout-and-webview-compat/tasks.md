# Tasks

## 1. Android 原生打孔屏延伸与纯黑底色配置

- [x] 1.1 在 `android/app/src/main/res/values/styles.xml` 的主题样式（`AppTheme.NoActionBar`、`AppTheme.NoActionBarLaunch`）中添加纯黑窗口背景 `android:windowBackground="@android:color/black"` 及刘海屏短边延伸 `android:windowLayoutInDisplayCutoutMode="shortEdges"`，并检查 XML 格式正确
- [x] 1.2 在 `android/app/src/main/AndroidManifest.xml` 的 `MainActivity` 节点中确认或补齐对应属性，确保横屏冷启动与热切换时均不产生原生窗口避让留白

## 2. 前端构建目标降级与运行时兼容

- [x] 2.1 修改 `vite.config.ts` 中的 `build.target`，从激进的 `'es2022'` 调整为兼容更广 Android WebView 内核的 `'es2020'`，消除旧版内核上的 ES 模块语法解析错误
- [x] 2.2 运行 `npm run build`，验证产物编译无错误且生成的 JS 代码符合 ES2020 语法约束

## 3. 入口 HTML 全局异常自诊断面板

- [x] 3.1 在 `index.html` 的 `<head>` 顶部注入原生全局异常监听（`window.addEventListener('error')` 与 `window.addEventListener('unhandledrejection')`），实现一旦发生未捕获异常即时挂载高对比度深底红字错误诊断面板（包含错误信息、位置与堆栈）
- [x] 3.2 验证异常自诊断面板在发生模拟异常时能即时呈现且不破坏正常流程渲染

## 4. 全流程构建与 Capacitor 原生资源同步

- [x] 4.1 运行 `npm run build` 产出最新生产包，并执行 `npx cap sync android` 将构建产物与配置完整同步至 Android 原生资产目录（`android/app/src/main/assets/public/`）
- [x] 4.2 验证 `android/app/src/main/assets/public/index.html` 与 `dist/` 产物一致性，确保真机或打包 APK 能够直接承接所有修复

## Workflow follow-up

- 将架构决策记录 `docs/decisions/AgDR-0023-刘海打孔屏短边延展与WebView兼容兜底.md` 的状态从 proposed 推进至 executed
- 运行 `openspec validate` 验证规格完整性
- 交付用户进行测试并归档变更
