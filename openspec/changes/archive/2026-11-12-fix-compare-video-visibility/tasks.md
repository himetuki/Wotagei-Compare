# Tasks

## 1. 渲染器与底层同步引擎硬件就绪保护

- [x] 1.1 在 `src/core/renderer.ts` 中为视频源增加 `readyState >= 2` 与尺寸守卫，并在 `src/core/renderer.verify.ts` 中补充未就绪与已就绪视频状态的绘制保护测试，运行 `npx tsx src/core/renderer.verify.ts` 验证通过
- [x] 1.2 在 `src/core/sync-engine.ts` 的 `SafeVideoController` 中增加元数据加载就绪拦截机制（在 `readyState < 1` 阶段暂存目标时间并在 `loadedmetadata` 触发后执行真实寻道，严禁误 clamp 为 0），并在 `src/core/sync-engine.verify.ts` 中补充元数据异步加载寻道测试，运行 `npx tsx src/core/sync-engine.verify.ts` 验证通过

## 2. 对比台 DOM 持久化与动态挂载自愈

- [x] 2.1 重构 `src/components/Workbench.tsx` 视图容器：移除早期条件返回 `if (isExportPageOpen || isExport) return <ExportPage ... />`，采用并存容器结构，在导出模式下对对比台主视口设置 `display: none` 并调用 `engine.pause()`，保持 `<video>` 与 `<canvas>` DOM 节点不被销毁
- [x] 2.2 在 `src/components/Workbench.tsx` 中建立响应式视频挂载自愈与切回寻道对齐机制：在视频节点发生变动或从导出页切回对比台时，自动调用 `engine.attachVideos(v1, v2)` 并执行 `seekToTau(tau)` 恢复画面帧，同时在 Canvas 渲染循环中增加异常捕获防线防止 RAF 崩溃中断

## 3. 全局集成验证与决策记录流转

- [x] 3.1 运行全局静态类型检查与核心算法验证，执行 `npx tsc --noEmit` 与全部 `.verify.ts` 脚本，确认零类型错误与 100% 验证通过
- [x] 3.2 执行生产构建命令 `npm run build` 验证打包无异常，并在实现完成后将 `docs/decisions/AgDR-0019-对比台DOM持久化与视频挂载自愈状态机.md` 的状态由 `proposed` 转换为 `executed`

## Workflow follow-up

- 在用户确认实现与验收无误后，运行 OpenSpec 归档流程将本次规格变更归档合并。
