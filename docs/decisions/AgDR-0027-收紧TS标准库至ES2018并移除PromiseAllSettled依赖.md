---
id: AgDR-0027
date: 2026-11-13
status: executed
---

# 收紧 TypeScript 标准库至 ES2018 并移除 Promise.allSettled 依赖

> 在坚果 R2（Android 10，系统 WebView 内核低于 Chrome 76）真机选取视频返回应用后触发 `TypeError: Promise.allSettled is not a function` 崩溃的处境下，面对 Vite `build.target: 'es2018'` 仅降级语法糖不自动补丁标准库方法、且 `@types/node` 会隐式拉入 `es2020` 类型定义架空 `tsconfig.json` `lib` 限制的顾虑，我决定将 `tsconfig.json` 的 `target` 与 `lib` 收紧至 `ES2018` 并设置 `"types": []` 切断 `@types/node` 隐式注入，同时将 `ImportStep.tsx` 的 `Promise.allSettled` 替换为 `Promise.all`、并在应用入口为 `Promise.allSettled` 补充极简运行时兜底，以达成编译期彻底拦截 ES2019+ 标准库 API 且老旧 WebView 选片零崩溃的目标，并接受放弃在前端 `src/` 中直接调用 ES2019+ 原生标准库语法方法、以及后续如在 `src/` 使用环境扩展全局类型需显式声明的代价。

## 考虑过的方案

| 方案 | 好处 | 代价 |
| --- | --- | --- |
| 方案 A：仅修改 `ImportStep.tsx` 一处，将 `Promise.allSettled` 改为 `Promise.all` | 改动只有一行，立即可止血 | `tsconfig.json` 仍允许 `ES2022` 标准库，后续编码一旦使用 `replaceAll`、`.at()`、`Object.hasOwn` 等 ES2019+ API 仍会在真机运行时炸裂；且无法保护 `react-dom` 内部潜在的 `Promise.allSettled` 条件分支 |
| 方案 B：引入 `core-js` + `@vitejs/plugin-legacy` 全量 polyfill 方案 | 可自动补丁绝大多数现代 JS API | 显著增大移动端离线安装包体积，引入额外构建插件与双包机制，违背最简工程原则 |
| 方案 C：`tsconfig.json` 收紧至 `ES2018` + `"types": []` 建立编译期静态门禁，源码移除 `Promise.allSettled` 并改用 `Promise.all`，入口加极简 5 行 `Promise.allSettled` 运行时兜底，顺手补齐 `.calib-stage` CSS 静态回退（本方案） | 零第三方依赖增量、从编译器层根本封死未来再引入 ES2019+ API 的可能，同时兼顾运行期对 React 19 内部路径的容灾保护 | 需要放弃在 `src/` 直接使用 ES2019+ 标准库方法；若后续需要独立 Node 类型检查需单独脚本或 `tsconfig` |

## 决定

选 **方案 C**。

1. **为什么 `tsconfig.json` 必须同时设置 `"types": []`**：
   实测表明，仅把 `target` 与 `lib` 改为 `ES2018` 并不能拦截 `Promise.allSettled`，因为 `devDependencies` 中存在 `@types/node`（其 `index.d.ts` 第一行包含 `/// <reference lib="es2020" />`），TypeScript 默认自动加载 `node_modules/@types/*` 会将 `lib.es2020.promise.d.ts` 重新注入全局作用域，使 `lib: ["ES2018", ...]` 形同虚设。设置 `"types": []` 后，`src/` 内已由 `import` 显式引入的 `react`、`lucide-react`、`mp4-muxer` 仍正常解析类型，WebCodecs 类型已由 TypeScript 5.8 内置 `lib.dom.d.ts` 提供，所有 22 个源文件仅精准报错 `ImportStep.tsx` 中的 `Promise.allSettled` 这一处。
2. **为什么 `ImportStep.tsx` 改用 `Promise.all` 而非手写工具函数**：
   `metaPromise` 内部通过 2.5s 超时与事件处理永不 reject，`audioPromise` 内部已由 `try/catch` 兜底降级为默认 160 BPM 音轨，两者均不存在未捕获 reject；改用 ES2015 原生 `Promise.all([metaPromise, audioPromise])` 是零封装的最简方案。
3. **为什么仍保留入口极简 `Promise.allSettled` 兜底**：
   检查构建产物发现 `react-dom@19` 内部存在一处条件调用 `Promise.allSettled` 的代码路径。在 `src/main.tsx` 顶部做一次无入侵兜底（仅当 `typeof Promise.allSettled !== 'function'` 时定义）只需数行代码，可消除第三方库触发同款异常的隐患。
4. **第三方库 `mp4-muxer` 的边界评估**：
   `mp4-muxer` 内部使用了 `Object.fromEntries`（Chrome 73+）与 `Array.prototype.flat`（Chrome 69+），但仅在用户点击「开始渲染导出」时才会被调用，而离线导出本身依赖 Chrome 94+ 的 WebCodecs，在低于 Chrome 76 的设备不会执行到该编码分支，无需额外引入 polyfill。

## 代价

- 我们接受：前端 `src/` 源码只能使用 ES2018 及以下标准库 API（由 `tsc` 强制保证）。
- 我们放弃：在 `src/` 中直接享受 `@types/node` 的全局环境类型（Node 脚本如 `scripts/sim-device.cjs` 为 `.cjs` 文件，不受 `src/` `tsconfig.json` 影响）。
- 后面要还的债：无。

## 什么情况下需要重新讨论

- 如果未来最低支持的 Android System WebView 统一提升至 Chrome 94+（对应全量支持 ES2021+ 与 WebCodecs）。
