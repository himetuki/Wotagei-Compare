# Proposal

## Why

当前前端界面充斥着大量廉价 Emoji 标识、自嗨式 AI 口号小字（如“开启横屏毫秒级精细对照”、“辽阔光弧视野”、“专属独立设置”）、杂乱刺眼的五彩内联样式按钮，以及毫无实际意义的冗余按钮（如首页“一键载入内置演示样本”、三线统一后已无意义的首页“初始模式切换”、工作台顶栏重复堆叠的“退出/重新向导/下拉框微调”、导出页重复堆砌的二次参数面板），不仅严重挤压横屏有效监看视野，还破坏了练技工具应有的专业感与操作效率。亟需以专业影视监视器极简暗黑风格彻底重构前端 UI 与交互流转。

## What Changes

- **确立专业影视监视器极简暗黑设计系统**：在 `src/index.css` 建立统一的 CSS 变量与组件样式体系（纯黑画布 `#000000`、深炭面板 `#09090b` / `#121214`、精细边框 `#27272a`、克制的单一主强调色与语义状态色、全量 `tabular-nums` 等宽数字时间码、统一自定义滑块与分段控制器），彻底清零所有内联杂乱色块。
- **彻底铲除所有 Emoji 与 AI 吹嘘文案**：移除全部组件中的 Emoji 图标（`📹`、`👤`、`✨`、`⚡`、`🎯`、`🔊`、`🥁`、`🚀`、`🎬`、`⏱️`、`💾`、`⚙️`、`🎵`、`🔇` 等）与自嗨式副标题/口号/提示语，全面替换为干净利落的矢量 SVG 几何图标与精炼专业术语。
- **BREAKING 砍掉无意义按钮与清理废弃代码**：
  - 删除导入页的「一键载入内置演示样本」按钮并移除 `src/core/demoGenerator.ts`。
  - 删除导入页顶部的「初始模式切换」（因三线正交模型已统一，导入页无需预选对比模式，统一在对比工作台无缝切换）。
  - 删除废弃未使用的 `src/components/ExportModal.tsx`。
  - 清理 `src/types/geometry.ts`、`src/types/wizard.ts` 与 `src/App.tsx` 中残留的 `cropRect`、`PatchCalibrationContext`、`patchingStep` 等历史死代码。
- **重构全局顶部统一步骤条直达导航**：以统一的顶部步骤分段条（`01 导入` / `02 视频1空间` / `03 视频2空间` / `04 视频1对拍` / `05 视频2对拍` / `06 对比工作台`）贯通全流程；双视频导入后可随时点击任意步骤直达微调，彻底取代工作台原有的「退出」「重新向导」「快速微调单项下拉框」三个割裂控件。
- **重构三线正交标定覆盖层与音频波形台**：修复原 `GeometryStep` 中 `preserveAspectRatio="none"` 导致 SVG 文字拉伸变形与标定线超出视频实际画幅的问题，改为精确贴合视频渲染矩形的细标尺线与不变形简洁角标；精简 `AudioStep` 底部操作栏布局与字重层级。
- **重构为精简独立导出页**：`ExportPage` 直接沿用对比工作台当前已调好的对比模式、水平镜像、慢放倍率、声音源与视口变换，移除导出页右侧重复堆砌的二次参数修改表单，仅保留单帧实时预览、A-B 起止区间截取控制、成片规格只读摘要与导出进度/取消/保存按钮。

## Capabilities

### New Capabilities

### Modified Capabilities
- `video-workspace`: 移除导入页初始模式选择与演示样本生成按钮；将向导与工作台导航统一为顶部步骤分段直达条；新增专业影视监视器极简暗黑 UI 与零 Emoji/零冗余文案规范。
- `geometric-alignment`: 清理残留的 `cropRect` 与补标定死代码；规范三线标定覆盖层精确贴合视频画幅且标签无拉伸变形。
- `comparison-export`: 将独立导出工作台精简为直接继承播放工作台当前渲染与音频参数，专注 A-B 区间截取与导出控制，并移除废弃的 `ExportModal`。

## Impact

- **删除文件**：`src/core/demoGenerator.ts`、`src/components/ExportModal.tsx`
- **重构文件**：`src/index.css`、`src/App.tsx`、`src/components/ImportStep.tsx`、`src/components/GeometryStep.tsx`、`src/components/AudioStep.tsx`、`src/components/Workbench.tsx`、`src/components/ExportPage.tsx`、`src/types/geometry.ts`、`src/types/wizard.ts`
- **架构决策记录**：新增 `docs/decisions/AgDR-0006-专业监视器极简UI重构与全局步骤直达导航.md`
