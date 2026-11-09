# Tasks

## 1. 清理冗余代码、废弃组件与历史类型残留

- [x] 1.1 删除 `src/core/demoGenerator.ts` 与 `src/components/ExportModal.tsx`，通过 `fd "(demoGenerator|ExportModal)" src` 验证输出为空
- [x] 1.2 清理 `src/types/geometry.ts`、`src/types/wizard.ts`、`src/core/geometry.ts` 与 `src/core/renderer.ts` 中残留的 `cropRect`、`RectRegion`、`PatchCalibrationContext` 等矩形框与补标定死代码，运行 `npx tsc --noEmit` 验证类型检查或明确僅剩待更新的前端视图引用

## 2. 建立专业影视监视器极简暗黑设计系统与全局顶部步骤条

- [x] 2.1 重写 `src/index.css`，定义监视器色彩变量（`#000000` 画布、`#09090b` 栏底、`#141417` 表面、`#27272a` 1px 细边框、`#f59e0b` 琥珀主强调色）、`tabular-nums` 等宽时间码、统一按钮/分段切换器/滑块/输入框样式类，通过检查 `src/index.css` 确认无冗余装饰样式
- [x] 2.2 重构 `src/App.tsx`，移除 `standaloneEdit` 与 `patchingStep` 状态分支，实现统一的顶部 6 步分段直达导航条（`01 导入` / `02 视频1空间` / `03 视频2空间` / `04 视频1对拍` / `05 视频2对拍` / `06 对比台`），确保双视频载入后点击任意步骤均可直达且修改实时持久生效，通过 `npx tsc --noEmit` 验证无类型错误

## 3. 重构导入页、空间标定页与音频对拍页

- [x] 3.1 重构 `src/components/ImportStep.tsx`：移除「一键载入内置演示样本」按钮、「初始模式切换」控件、全部 Emoji 与吹嘘副标题，改为双通道监视器槽位卡片（采用矢量图标展示视频文件名、分辨率、时长与检测 BPM），通过 `rg "demoGenerator|一键载入|毫秒级" src/components/ImportStep.tsx` 验证输出为空
- [x] 3.2 重构 `src/components/GeometryStep.tsx`：移除 SVG `preserveAspectRatio="none"` 变形大字与底部冗余提示语，通过计算视频在容器内的实际内接显示矩形渲染 1.5px 精确三线标尺、44px 触控热区与不变形角标（`头顶` / `脚底` / `中轴` 或 `左脚` / `右脚` / `地面`），并将三线与镜像变更实时同步回父状态，通过构建检查确认无编译错误
- [x] 3.3 重构 `src/components/AudioStep.tsx`：移除标题中的「(专属独立设置)」等废话与全部 Emoji，采用紧凑监视器底栏排布波形图、播放/逐帧/预览倍速、锚点设定与 `±20ms` 微调、卡拍试听、Tap 测速与 BPM 步进控件，并将音频与 BPM 策略变更实时同步回父状态，通过构建检查确认无编译错误

## 4. 重构同台对比工作台与精简独立导出页

- [x] 4.1 重构 `src/components/Workbench.tsx`：移除「退出」「重新向导」「快速微调下拉框」以及右下角「辽阔光弧视野」等口号小字，将时间轴显示由 `τ` 改为直观等宽时间码与「锚点 0.00s」复位键，集成模式分段切换、音源切换、独立镜像与导出入口，通过 `rg "辽阔光弧|快速微调|重新向导" src/components/Workbench.tsx` 验证输出为空
- [x] 4.2 重构 `src/components/ExportPage.tsx`：移除右侧重复堆砌的画面模式、慢放倍速、声音输出、相对透明度与水平镜像二次配置表单，改为直接读取并展示工作台传入的只读渲染规格徽章，专注实时单帧预览、A-B 起止区间截取（含「设当前为 A」「设当前为 B」「全片」）、成片帧数/时长统计与导出进度/取消/保存控制，通过 `npm run build` 验证编译通过

## 5. 全量纯净度验收、构建同步与决策归档准备

- [x] 5.1 使用 `rg "[\p{Emoji_Presentation}\p{Extended_Pictographic}]" src/` 检查前端源码，确保所有 Emoji 字符已 100% 清零
- [x] 5.2 运行 `npm run build` 与核心验证脚本（`npx tsx src/core/geometry.verify.ts`、`npx tsx src/core/timeline.verify.ts`、`npx tsx src/core/renderer.verify.ts`），并将 `docs/decisions/AgDR-0006-专业监视器极简UI重构与全局步骤直达导航.md` 的状态更新为 `executed`
