# Tasks

## 1. 样式层安全区基础设施构建

- [x] 1.1 在 `src/index.css` 的 `:root` 中声明 `--safe-top`, `--safe-right`, `--safe-bottom`, `--safe-left` 环境变量，并通过 `npm run build` 验证 CSS 语法有效。
- [x] 1.2 改造顶部全局导航栏 `.top-nav` 与通用工具栏 `.toolbar-row`，使高度适配 `calc(40px + var(--safe-top))`，顶部与左右侧分别应用 `var(--safe-top)` 及 `max(12px, var(--safe-left/right))` 避让，验证构建无错。
- [x] 1.3 改造通用底部控制栏 `.bottom-bar`，使其底部应用 `max(6px, var(--safe-bottom))` 并在左右内缩 `max(12px, var(--safe-left/right))`，验证时间轴与控制按钮布局。

## 2. 核心向导与工作台视图安全区适配

- [x] 2.1 适配 `ImportStep`（`.import-stage`）与 `ExportPage`（`.export-grid`），为双槽位卡片与导出设置面板补充左右安全内边距，运行 `npm run build` 确保布局编译通过。
- [x] 2.2 检查并适配 `GeometryStep`（`.calib-stage`）与 `AudioStep`，确保三线标定手柄拖拽边界、BPM 拍打按钮及侧边微调栏处于安全区内，避免与物理边缘按键重合。
- [x] 2.3 检查并适配 `Workbench`（播放工作台），确保模式分段器、镜像开关、通道选择器与底部七档慢放控制栏完全落入安全矩形框内。

## 3. 全局构建与原生容器同步验证

- [x] 3.1 执行 `npm run build` 产出生产级 Web 资源，并执行 `npx cap sync android` 同步至 Android 工程，验证无构建与打包警告。
- [x] 3.2 在浏览器移动端设备模拟器中分别注入顶部状态栏高度（如 24px/32px）与右侧金刚键宽度（如 48px/72px），完整跑通「导入 → 几何标定 → 音频对拍 → 工作台播放」全链路，确认所有按钮与状态徽章零遮挡、零误触。

## Workflow follow-up

- 在实现阶段将 `docs/decisions/AgDR-0007-系统状态栏与虚拟金刚键安全区避让布局.md` 状态从 `proposed` 更新为 `executed`。
- 实现验证通过后，运行 `openspec archive` 归档本次变更并将 delta specs 合并至主 specs。
