# Tasks

## 1. 编译期 ES2018 标准库门禁与导入链路修复

- [x] 1.1 修改 `tsconfig.json`，将 `target` 改为 `ES2018`、`lib` 改为 `["ES2018", "DOM", "DOM.Iterable"]` 并显式添加 `"types": []`，随后执行 `npx tsc --noEmit`，确认仅精准报出 `src/components/ImportStep.tsx` 的 `Promise.allSettled` 错误且无其他文件或第三方库类型冲突。
- [x] 1.2 修改 `src/components/ImportStep.tsx` 中 `handleFileChange` 末尾，将 `await Promise.allSettled([metaPromise, audioPromise])` 替换为 `await Promise.all([metaPromise, audioPromise])`，随后执行 `npx tsc --noEmit` 验证零报错通过。

## 2. 运行时与样式兜底加固

- [x] 2.1 在 `src/main.tsx` 应用渲染前为缺失 `Promise.allSettled` 的老旧运行环境补充极简 `Promise.all` 兜底实现（注意严格符合 ES2018 类型检查，不依赖 `PromiseConstructor` 高版本类型声明），执行 `npx tsc --noEmit` 验证类型通过。
- [x] 2.2 在 `src/index.css` 的 `.calib-stage` 规则中为 `padding: 0 max(12px, var(--safe-right)) 0 max(12px, var(--safe-left));` 补全前置静态回退 `padding: 0 12px;`，通过检查样式源码确认回退声明顺序正确。

## 3. 构建产物、原生同步与决策留痕验证

- [x] 3.1 执行 `npm run build` 完成全量编译打包，并使用 `rg "Promise\.allSettled" dist/assets/` 确认应用业务代码中已不再调用原生 `Promise.allSettled`（仅剩带判断的兼容兜底与 React 内部条件分支），检查 `dist/` 输出完整无警告阻断。
- [x] 3.2 执行 `npx cap sync android` 将最新 Web 产物同步至 Android 原生工程，确认同步命令退出码为 0。
- [x] 3.3 复核 `docs/decisions/AgDR-0027-收紧TS标准库至ES2018并移除PromiseAllSettled依赖.md`，确认其内容与实际改动完全一致后将 `status` 从 `proposed` 更新为 `executed`。
- [x] 3.4 在坚果 R2 真机（或在桌面端通过删除 `window.Promise.allSettled` 模拟低于 Chrome 76 运行时的黑盒复现环境）执行选片导入双路本地 MP4 视频流程，验证 CH1 与 CH2 均顺利进入就绪状态且不弹出运行时诊断黑屏错误，随后顺利进入空间标定与对比台播放。

## Workflow follow-up

- 全部任务与真机/黑盒验证完成后，运行 `/opsx:archive` 将规格增量合并进 `openspec/specs/video-workspace/spec.md` 并归档本变更。
