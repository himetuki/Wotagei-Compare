# Tasks

## 1. 全局 5 步导航与术语直观化（视频1 / 视频2）

- [x] 1.1 更新 `src/types/wizard.ts`、`src/types/index.ts` 与 `src/App.tsx` 中的 `WizardStep` 与 `WIZARD_STEPS`，将 7 步导航收敛为 5 步（`导入` / `视频1` / `视频2` / `对比台` / `导出片段`），全软件所有用户可见通道称谓（`ImportStep.tsx`、`App.tsx`、`Workbench.tsx`、`ExportPage.tsx`）统一从 `CH1`/`CH2` 替换为 `视频1`/`视频2`（验证：运行 `npm run build` 零错误，全文检索用户可见文本无 `CH1` / `CH2` 残留）
- [x] 1.2 在 `src/App.tsx` 与 `src/components/ImportStep.tsx` 的通道数据结构中引入 `spatialTouched` 与 `audioAnchorTouched` 状态标识（每次新选片或重选视频重置为 `false`），并在顶栏动态配置对比台 `视频1` / `视频2` BPM 徽章（验证：重新选片后状态点复位为未点亮，切换步骤时已有标定状态持久保留）

## 2. 同屏一体「空间 + 时间」标定、只读状态点与移除轮廓

- [x] 2.1 移除参考轮廓功能：删除 `src/components/CalibrationStep.tsx` 中的 `AlertSilhouette` 组件与轮廓定位常量，移除 `src/App.tsx` 中的 `showSilhouette` 状态及顶栏「轮廓」开关按钮（验证：界面与构建产物中完全无轮廓相关交互或 SVG 叠层）
- [x] 2.2 合并「空间」与「时间」标定到同一屏幕并固定顶栏状态小点为只读指示：更新 `src/App.tsx` 与 `src/components/CalibrationStep.tsx` 移除 `calibrationSubMode`/`subMode` 切换与冗余空间底条，在共享 `<video>` 舞台同时展示可拖拽三线与底部音频波形/截取/锚点/BPM 面板；增强波形画布 `onPointerDown`/`onPointerMove`/`onPointerUp` 连续拖拽找帧体验；顶栏保留只读 `空间●` / `时间●` 状态指示徽章（无点击切换回调）、模型下拉、`镜像` 开关与显式 `下一步 →` 按钮（验证：空间三线与波形底栏同屏共存且 `853×384`、`640×360` 视口无溢出；点击顶栏 `空间`/`时间` 徽章不触发切页；拖线与点击「设为锚点」分别独立点亮对应圆点）

## 3. 高精度多拍梳状 BPM 测定重构

- [x] 3.1 重构 `src/core/audio.ts` 中 `getAudioHopSize`、`detectBpmFromPcm` 与 `detectBpmFromSlice`：采用约 250Hz（~4ms）帧移与 ~10ms 重叠 RMS 窗提取去均值正差分起音包络，并实现覆盖 $1T, 2T, 4T, 8T, 16T$ 多拍整数倍周期的谐波梳状自相关加权先验与分级细化搜索（`0.5 → 0.25 → 0.05 BPM`，含整数滞后缓存与 95~125 BPM 的 1.5x 亚谐波复核）（验证：实测 `/mnt/d/Download/[A]ddiction.mp4` 稳定输出 `164`、`金刚_真龙.mp4` 前半段《嘘の火花》切片稳定输出 `188`、后半段输出 `166`，且 44.1kHz / 48kHz / 16kHz 一致无回归）

## 4. 对比工作台首帧步进冷启防黑屏与异步音轨同步

- [x] 4.1 修复 `src/core/sync-engine.ts` 中 `SafeVideoController.seek` 在 `video.readyState < 2` 时错误按 `|currentTime - clamped| < 0.005` 提前返回的缺陷，确保冷节点总能触发实际帧解码（验证：`readyState < 2` 且目标 `0s` 时正常执行寻道）
- [x] 4.2 在 `src/components/Workbench.tsx` 为两路视频维护最近已就绪帧离屏缓存 Canvas（在首次就绪、非全速播放态及发起暂停/寻道/步进前瞬时抓拍，全速播放期间零拷贝直通；去除会触发长 GOP 倒退重解的 `play() -> seekBack` 动作）：当 `videoActive === true` 且视频正处于 `seeking` 或 `readyState < 2` 时传递缓存帧给 `renderComparisonFrame` 渲染占位（验证：进入长 GOP 视频对比台点击步进无黑屏等待，连点步进不丢步且响应顺畅）
- [x] 4.3 修复 `src/components/ImportStep.tsx`、`src/App.tsx` 与 `src/components/CalibrationStep.tsx` 跨组件卸载的异步元信息/音轨合入链路：引入不依赖 `ImportStep` 挂载状态的 `onPatchVideo` 按 `url` 安全合入字段，并让 `CalibrationStep` 在首次收到异步就绪的 `audioInfo` 时自动同步真实波形与 BPM（保留用户已编辑字段）（验证：大视频导入尚未解析完立即点「开始标定」，1~2 秒后真实波形与 `164` BPM 自动显现）

## 5. 对比工作台 AB 蓝绿统一配色、「更多」拉手与全流程交互收口

- [x] 5.1 在 `src/App.tsx` 与 `src/components/Workbench.tsx` 接入对比台局部 `loopRange` 状态、7 档折叠倍速向上弹出菜单、多粒度步进累加微调及向 `ExportPage.tsx` 继承传入 `initialLoopRange`
- [x] 5.2 更新 `src/components/Workbench.tsx` 顶部中央梯形抽屉按钮：收起态渲染清晰的 **「更多」** 文字（替代向下箭头），展开态渲染清晰的 **「收起」** 文字（替代向上箭头）（验证：进入对比台默认显示「更多」，点击展开后显示「收起」，再点收起）
- [x] 5.3 统一全站 A/B 颜色规范为 **A 蓝色（`var(--ch1)` / `#38bdf8`）、B 绿色（`var(--ch2)` / `#10b981`）**：更新 `src/components/Workbench.tsx`、`src/components/ExportPage.tsx` 与 `src/index.css` 中对比台 A/B 按钮、时间轴蓝绿标记线与渐变高亮区，以及导出页 `IN (A)` / `OUT (B)` 文案、「设当前为 A / B」按键、滑块手柄 A/B 与轨道高亮条（验证：对比台与导出页所有 A 均为蓝色、所有 B 均为绿色）

## 6. 全链路构建、OpenSpec 校验与 Playwright 验收

- [x] 6.1 检查 `src/index.css` 遵守不使用 Flexbox `gap`（统一 `fx-row-*`/`fx-col-*`）与 ES2018 标准库约束，运行 `npm run build` 与 `openspec validate pro-compare-workbench-calibration --strict` 确认零错误
- [x] 6.2 使用 Playwright 在 `640×360` + `48px` 右侧安全区与 `853×384` 横屏视口对完整 5 步流程、无轮廓同屏标定、只读状态小点、「更多」按钮、蓝/绿 AB 控件与步进预热防黑屏进行端到端截图与脚本核验，结合 `ffmpeg` 实测 `[A]ddiction.mp4` 与 `金刚_真龙.mp4` BPM 输出正确后更新相关 AgDR 状态

## Workflow follow-up

- 所有任务验收通过后，将 `docs/decisions/AgDR-0034`、`AgDR-0035`、`AgDR-0037` 状态更新为 `executed`（`AgDR-0036` 保持 `superseded`）
- 提示用户执行 `/openspec-archive-change`（或 `openspec archive pro-compare-workbench-calibration`）将规格增量同步至主 specs 并归档变更
