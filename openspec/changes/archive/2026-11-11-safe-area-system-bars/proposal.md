# Proposal

## Why

在 Android 及现代移动设备横屏运行时，部分用户开启了常驻系统状态栏，或者使用传统三键虚拟导航栏（金刚键），且设备可能存在屏幕挖孔或刘海。由于当前界面全屏贴边排布，未对安全区进行内缩避让，导致顶部状态栏和侧边金刚键直接覆盖遮挡了全局导航栏两端的「下一步」按钮、通道状态徽章、底部控制栏及工作台交互控件，极易引发严重的操作误触和信息遮挡。

## What Changes

- **建立全视口 CSS 安全区环境变量规范**：在全局 CSS 中声明 `--safe-top`, `--safe-right`, `--safe-bottom`, `--safe-left` 变量，动态对接 `env(safe-area-inset-*)`。
- **底色全屏与内容安全区分层**：保持应用纯黑背景全屏延伸到物理边缘，而所有文字、按钮、状态标签、时间轴及可交互控件严格约束在安全区内。
- **顶部全局导航栏避让**：调整 `.top-nav` 结构与内边距，顶部避让状态栏，左右两侧避让侧边金刚键与打孔区，确保「下一步」按钮、步骤选项卡与 BPM 状态徽章完全露出且远离误触区。
- **通用工具栏与底部操作栏避让**：调整 `.toolbar-row`、`.bottom-bar` 的安全区内边距，底部控制条、滑块、时间码和操作按钮向上与向内收缩，避让底部手势横条与金刚键。
- **标定舞台与对比视口安全适配**：在 `.calib-stage`、`.import-stage`、`.export-grid` 以及播放工作台中，将操作卡片、弹窗与画布有效交互区域限制在安全边界内，防止三线标定手柄落入屏幕边缘遮挡区域。

## Capabilities

### New Capabilities
<!-- 无新增独立 Capability -->

### Modified Capabilities
- `video-workspace`: 在工作区基础底座契约中追加系统状态栏、虚拟金刚键导航栏及屏幕物理缺口（Cutout）的安全区避让要求，确保所有向导步骤、播放工作台与面板控件在各种系统栏常驻状态下均无遮挡、无重叠且交互零误触。

## Impact

- **样式与布局**：修改 `src/index.css`，引入安全区 CSS 变量与安全边距类，重构 `.top-nav`、`.bottom-bar`、`.toolbar-row`、`.import-stage`、`.export-grid` 的 padding / margin 计算逻辑。
- **组件布局容器**：检查并微调 `src/App.tsx`、`src/components/GeometryStep.tsx`、`src/components/AudioStep.tsx`、`src/components/Workbench.tsx`、`src/components/ExportPage.tsx` 中的边缘停靠元素与浮层。
- **HTML 视口契约**：维持 `index.html` 中的 `viewport-fit=cover` 属性不变，确保 Web 视口正确接收到系统 Inset 变量。
- **对外 API 与向后兼容**：不涉及任何向后兼容或破坏性 API 改动，纯前端布局与视觉安全加固。
