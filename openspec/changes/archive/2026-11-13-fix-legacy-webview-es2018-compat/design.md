# Design

## Context

详见 [proposal.md](./proposal.md) 的背景说明。

对当前代码库与 `dist/assets/index-BeLUswoa.js` 构建产物的排查确认了三项具体事实：
1. `src/components/ImportStep.tsx` 的 `handleFileChange` 末尾使用 `await Promise.allSettled([metaPromise, audioPromise])`，在坚果 R2（WebView < Chrome 76）上直接触发 `TypeError: Promise.allSettled is not a function`。
2. `tsconfig.json` 配置了 `ES2022` 且未限制 `"types"`；实测仅把 `lib` 改成 `ES2018` 时，`devDependencies` 中的 `@types/node`（含 `/// <reference lib="es2020" />`）仍会把 `lib.es2020.promise.d.ts` 拉入全局作用域，必须配合 `"types": []` 才能使 `tsc` 真正拦截 `Promise.allSettled` 等 ES2019+ API。
3. 打包产物中另有两点关联现象：
   - `react-dom` 内部存在一处带条件的 `Promise.allSettled` 调用；
   - `mp4-muxer` 内部函数使用了 `Object.fromEntries`（Chrome 73+）和 `Array.prototype.flat`（Chrome 69+），但仅在调用 `Muxer` 执行 WebCodecs（Chrome 94+）离线导出时才会执行，不影响导入与播放对比主路径；
   - `src/index.css` 的 `.calib-stage` 缺少 `padding` 静态回退（其余安全区样式在 AgDR-0024 中已补充）。

## Goals / Non-Goals

**Goals:**
- 通过 `tsconfig.json` 编译期门禁静态阻断源码引入任何 ES2019+ 标准库方法。
- 修复 `ImportStep.tsx` 在低于 Chrome 76 的 Android WebView 选片回跳崩溃问题。
- 为 `Promise.allSettled` 提供极简入口级容灾，避免第三方运行库条件分支触发相同 `TypeError`。
- 补齐 `src/index.css` 中 `.calib-stage` 的 `max()` 静态像素回退。

**Non-Goals:**
- 不引入 `core-js`、`@vitejs/plugin-legacy` 等重量级全量 polyfill 依赖。
- 不为仅用于 Chrome 94+ WebCodecs 导出管线的 `mp4-muxer` 做降级改写。

## Decisions

- **架构决策 AgDR-0027**：详见 [docs/decisions/AgDR-0027-收紧TS标准库至ES2018并移除PromiseAllSettled依赖.md](../../../docs/decisions/AgDR-0027-收紧TS标准库至ES2018并移除PromiseAllSettled依赖.md)。
  - **决策 1：`tsconfig.json` 收紧为 ES2018 并显式设置 `"types": []`**
    将 `target` 与 `lib` 设为 `ES2018` / `["ES2018", "DOM", "DOM.Iterable"]`，同时设置 `"types": []` 阻断 `@types/node` 隐式挂载 `lib.es2020`。WebCodecs 相关类型继续由 TypeScript 5.8 内置 `lib.dom.d.ts` 提供，`react`、`lucide-react`、`mp4-muxer` 等模块依赖通过 `import` 正常解析，无需修改第三方库或业务类型签名。
  - **决策 2：`ImportStep.tsx` 使用 `Promise.all` 替代 `Promise.allSettled`**
    `probeVideoMetadata` 内部已保证永不 reject，`audioPromise` 内部已通过 `try/catch` 完成 160 BPM 降级兜底，两者均只会 resolve。将 `await Promise.allSettled([metaPromise, audioPromise])` 替换为 `await Promise.all([metaPromise, audioPromise])` 即可保持等价语义并向下兼容至 Chrome 32+。
  - **决策 3：`src/main.tsx` 挂载极简 `Promise.allSettled` 兜底**
    在应用挂载前检查 `typeof Promise.allSettled !== 'function'`，若缺失则以 `Promise.all` 映射出符合 `{ status: 'fulfilled', value } | { status: 'rejected', reason }` 契约的实现，覆盖 `react-dom` 内部可能走到的条件路径。
  - **决策 4：`src/index.css` `.calib-stage` 补全静态 `padding` 回退**
    在 `padding: 0 max(12px, var(--safe-right)) 0 max(12px, var(--safe-left));` 之前增加 `padding: 0 12px;`，与 `.top-nav`、`.bottom-bar` 保持同一兼容模式。

## Risks / Trade-offs

- [收紧 `"types": []` 后若未来有人在 `src/` 内引用 Node 全局对象（如 `Buffer` 或 `process`）会编译失败] → 这正是浏览器/WebView 跨端应用期望的约束，前端代码本就不应依赖 Node 运行时全局变量；`scripts/` 下的 Node 脚本保持独立 `.cjs` 形态不受影响。
- [低版本 WebView 下 `mp4-muxer` 仍包含 `Object.fromEntries` / `.flat()`] → 该模块仅在 WebCodecs 可用的导出执行阶段运行，而低于 Chrome 94 的设备在导出页已禁用/提示不支持 WebCodecs 编码，不会触发对应分支。
