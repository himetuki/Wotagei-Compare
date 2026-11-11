# Tasks

## 1. 状态提升与顶栏下拉菜单统一

- [x] 1.1 在 `src/App.tsx` 中新增全局共享的 `triLineModel` 状态，并实现原子化双通道同步更新函数 `handleModelChange`，切换时同时更新 `video1` 与 `video2` 的几何模型字段（验证 `npm run build` 类型检查通过）
- [x] 1.2 在 `src/App.tsx` 顶栏右侧将 `CH1空间` 与 `CH2空间` 的模型下拉菜单均统一绑定至全局 `triLineModel` 和 `handleModelChange`（验证两页面共用同一个变量）

## 2. 空间标定组件联动与验证

- [x] 2.1 确认 `src/components/GeometryStep.tsx` 内部状态与外部 `triLineModel` 保持完全联动，模型切换时标尺正确切换为对应正交三线（验证在 CH1 切换模型后进入 CH2 自动呈现相同模型）

## 3. 构建与端到端回归验证

- [x] 3.1 执行 `npm run build` 确保 TypeScript 类型检查与 Vite 打包通过，零错误输出
- [x] 3.2 运行全套核心算法回归测试，并在浏览器端实测双通道模型同步效果

## Workflow follow-up

- 实施完成后将 AgDR-0012 状态更新为 executed
- 运行 openspec validate 与 openspec archive 完成变更归档
