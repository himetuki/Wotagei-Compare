# Design

## Context

详见 `proposal.md` 的动机说明与 `specs/` 下的行为契约。当前前端层（`src/App.tsx` 及 `src/components/*.tsx`）全部采用零散的内联样式编写，残留了 AgDR-0005 之前的 `cropRect`、`patchingStep`、`ExportModal.tsx` 与 `demoGenerator.ts`，且各视图在导航方式、色彩体系、标尺绘制和参数职责上缺乏统一架构。算法核心层（`src/core/geometry.ts`、`src/core/timeline.ts`、`src/core/audio.ts`、`src/core/metronome.ts`、`src/core/renderer.ts`、`src/core/exporter.ts`）已稳定并通过验证，本次重构聚焦于前端视图层、状态流转与交互架构。

## Goals / Non-Goals

**Goals:**
- 建立一套零内联杂乱色值、零 Emoji、零废话文案的专业影视监视器极简暗黑 UI 系统。
- 用单一的全局顶部步骤分段直达条统一向导推进与工作台微调跳转，移除 `standaloneEdit`、`patchingStep` 等冗余状态分支。
- 修复空间标定视图三线标尺超出视频画幅及 SVG 文字非等比拉伸变形的问题。
- 将独立导出页收敛为沿用工作台状态的纯 A-B 区间截取与离线编码面板。
- 彻底清理 `demoGenerator.ts`、`ExportModal.tsx` 与废弃几何/向导类型字段。

**Non-Goals:**
- 不修改底层三线正交几何矩阵计算、音频解码与 BPM 检测算法、PLL 锁相环同步逻辑及 WebCodecs/MediaRecorder 离线合成管线。
- 不引入第三方重型 UI 组件库（如 Material UI、Ant Design），保持纯正轻量的 CSS 变量 + 原生 SVG 图标实现。

## Decisions

### 1. 专业影视监视器极简暗黑设计系统与全局步骤直达导航
- **决策详情与权衡记录**：见 [AgDR-0006-专业监视器极简UI重构与全局步骤直达导航](../../../docs/decisions/AgDR-0006-专业监视器极简UI重构与全局步骤直达导航.md)。
- **视觉令牌（Design Tokens）**：
  - 画布背景：`--bg-canvas: #000000`
  - 控制栏/面板背景：`--bg-panel: #09090b`、次级表面 `--bg-surface: #141417`、悬浮态 `--bg-elevated: #1f1f23`
  - 边框与分割线：`--border-subtle: #27272a`（统一 1px 实线）
  - 文本层级：主文本 `--text-primary: #f4f4f5`、次级标签 `--text-secondary: #a1a1aa`、弱化刻度 `--text-muted: #52525b`
  - 强调色：主强调色采用专业监视器琥珀金 `--accent: #f59e0b`，辅以青色波形/视频 1 标识 `#38bdf8` 与翠绿视频 2/完成标识 `#10b981`
  - 字体排印：所有时间戳、BPM、帧步进、百分比与进度数值强制应用 `font-variant-numeric: tabular-nums` 与等宽字体栈，防止播放时数字跳动引起布局抖动。

### 2. 全局顶部步骤分段直达条（`TopStepBar`）与状态机精简
- **状态机化简**：`App.tsx` 仅维护 `step: WizardStep`、`mode: ComparisonMode`、`video1`、`video2`、`bpmStrategy`、`customBpm`。移除 `standaloneEdit` 与 `patchingStep`。
- **导航行为**：顶部栏固定高度 `40px`，左侧为紧凑的 6 步分段导航：
  1. `01 导入`
  2. `02 视频1空间`
  3. `03 视频2空间`
  4. `04 视频1对拍`
  5. `05 视频2对拍`
  6. `06 对比台`
- 未载入双视频前，步骤 `02~06` 置灰禁用；一旦双视频载入完成，全部 6 个步骤即时解锁，用户在任意环节点击顶部任一步骤即可直达对应视图，修改后实时同步至 `App` 状态（无需点击“保存并返回”才能生效，同时保留底部/右侧的顺次「下一步」快捷推进按钮）。

### 3. 视频画幅内嵌三线标尺层（消除 SVG 非等比拉伸）
- **问题根源**：旧实现将 `<svg viewBox="0 0 1000 1000" preserveAspectRatio="none">` 铺满整个外层 Flex 容器，导致当视频宽高比与容器不一致时，归一化坐标 $(0\sim 1)$ 映射到了黑边区域而非视频本身，且 SVG `<text>` 被严重压扁。
- **新方案**：在 `GeometryStep` 中通过 `ResizeObserver` 与视频原始宽高比 $(W_v / H_v)$ 计算视频在容器内的精确内接矩形（或使覆盖层容器与 `<video>` 共享精确计算出的 `width` 与 `height` 像素尺寸），在精确贴合视频画幅的绝对定位层内使用 CSS 百分比定位渲染 3 条 `1.5px` 标尺线、透明 `44px` 宽触控热区及紧凑无变形的胶囊角标（如 `头顶`、`脚底`、`中轴` 或 `左脚`、`右脚`、`地面`）。

### 4. 精简独立导出页接口契约
- `ExportPage` 接收的工作台参数（`mode`、`mirror1`、`mirror2`、`triLineTransform`、`viewport`、`relativeOpacity`、`slowMotionRate`、`soundSource`）全部作为只读渲染输入，顶部状态栏以紧凑徽章展示当前生效的导出规格（例如 `叠加 · 0.2x · 节拍器 · 1280×720 30fps`），主体区域左侧为大画幅单帧实时预览，右侧为 A-B 区间截取面板、成片帧数/时长统计与主导出按钮。

## Risks / Trade-offs

- **[Risk] 实时同步标定状态取代显式“保存”回调可能改变组件 Props 签名** → **Mitigation**：保持或升级 `GeometryStep` 与 `AudioStep` 的 `onChange` / `onSave` 回调，使拖拽三线、切换镜像、调整锚点或 BPM 时即刻同步更新 `App.tsx` 中的 `video1` / `video2` 状态，确保用户无论点击顶部步骤条任意跳转还是点击“下一步”，修改都 100% 持久生效。
- **[Risk] 移动端横屏高度较小（约 360px~430px CSS 像素），顶栏与底栏过高会挤压视频画幅** → **Mitigation**：严格限制顶栏高度为 `40px`、底栏高度为 `44px~84px`，所有按钮内边距与字号针对横屏紧凑排布优化，确保中间视频/画布区占满剩余全部垂直高度。
