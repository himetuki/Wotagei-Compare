# Proposal

## Why

在坚果 R2（Android 10，系统 WebView 内核低于 Chrome 76）真机运行 Wotagei-Compare 时，用户在「导入」页选取本地视频返回应用会立即触发 `[Unhandled Promise Rejection] TypeError: Promise.allSettled is not a function` 并弹出崩溃诊断面板。根本原因是 `Vite` 的 `build.target: 'es2018'` 仅降级语法糖而不会为 ES2020 标准库方法（`Promise.allSettled`）生成运行期补丁，同时 `tsconfig.json` 允许 `ES2022` 标准库且未禁用 `@types/node` 的隐式 `es2020` 类型注入，导致编译器未能拦截此类高版本 API 调用。

## What Changes

- 将 `tsconfig.json` 的编译目标与标准库收紧至 `ES2018`（`"target": "ES2018"`、`"lib": ["ES2018", "DOM", "DOM.Iterable"]`），并显式配置 `"types": []` 阻止 `devDependencies` 中的 `@types/node` 隐式注入 `lib.es2020` 类型定义，从编译期静态拦截所有 ES2019+ 标准库方法调用。
- 修改 `src/components/ImportStep.tsx` 的 `handleFileChange`，移除对 `Promise.allSettled` 的依赖（由于元数据探测与音频解码两条异步分支内部均已自消化异常且不向外抛出错误，改为 `Promise.all` 即可兼容 Chrome 32+ 全系内核）。
- 在应用入口 `src/main.tsx` 为 `Promise.allSettled` 提供极简安全兜底定义，避免第三方依赖（如 `react-dom` 内部条件分支）在低版本 WebView 意外触及该方法时崩溃。
- 为 `src/index.css` 中 `.calib-stage` 补全与 `.top-nav` 一致的固定像素 `padding` 静态回退声明，确保 Chrome 79 以下内核不因忽略 `max()` 而丢失标定区域左右内边距。

## Capabilities

### New Capabilities

### Modified Capabilities
- `video-workspace`: 补全老旧 WebView（Chrome 70+）对 ES2018 标准库运行时 API 边界、TypeScript 编译期静态门禁及选片回跳不触发高版本 `Promise` 方法异常的要求与验证场景。

## Impact

- 构建与类型检查配置：`tsconfig.json`
- 前端组件与样式：`src/components/ImportStep.tsx`、`src/main.tsx`、`src/index.css`
- 构建与原生同步：`npm run build`、`npx cap sync android`
- 架构决策记录：`docs/decisions/AgDR-0027-收紧TS标准库至ES2018并移除PromiseAllSettled依赖.md`
