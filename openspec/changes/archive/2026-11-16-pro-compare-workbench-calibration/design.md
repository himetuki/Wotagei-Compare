# Design

## Context

详见动机与问题拆解：[proposal.md](proposal.md)。

当前系统基于 React 19 + TypeScript + Vite + Capacitor 构建（编译目标严格锁定 ES2018，CSS 避免 Flexbox `gap` 并通过 `@supports (padding: max(0px))` 隔离以兼容 Android 10 Chrome 74 WebView 与 `640×360` + `48px` 金刚键窄横屏）。既有底层双视频同步引擎 [DualVideoSyncEngine](../../../src/core/sync-engine.ts) 已支持 `loopInterval` 局部循环，[calculateTriLineAlignment](../../../src/core/geometry.ts) 已统一三线正交几何对齐。

本次设计汇总以下关联决策记录：
- [AgDR-0034](../../../docs/decisions/AgDR-0034-单视频空间时间二合一标定流与无文字状态点指示.md)：5 步全局导航与 `视频1 / 视频2` 直观命名（其中“子模式切页”与“轮廓引导”条款已被 AgDR-0037 与 AgDR-0036 状态废弃）
- [AgDR-0035](../../../docs/decisions/AgDR-0035-对比台AB点循环联动与折叠倍速腾空步进底栏架构.md)：对比台 AB 点循环联动与折叠倍速腾空步进底栏架构
- [AgDR-0036](../../../docs/decisions/AgDR-0036-三线随动半透明警报参考轮廓引导层.md)：已废弃（Superseded — 实测表明参考轮廓多余，直接移除）
- [AgDR-0037](../../../docs/decisions/AgDR-0037-同屏合一标定与多拍梳状BPM及步进防黑屏优化.md)：单视频空间时间同屏一体标定、对比台「更多」按钮、AB 蓝绿语义、多拍梳状 BPM 测定与对比台解码预热防黑屏优化

## Goals / Non-Goals

**Goals:**
- **单视频同屏「空间 + 时间」一体标定**：顶部导航收敛为 5 步（`导入 | 视频1 | 视频2 | 对比台 | 导出片段`），全软件称谓统一改为「视频1 / 视频2」。在「视频1 / 视频2」页内**同屏同时呈现**视频三线标定舞台与底部可拖拽定位的音频波形/截取/锚点/BPM 面板，取消子模式点击切换与参考轮廓，保留顶部 `空间●` / `时间●` 只读完成状态小点及显式 `下一步 →` 按钮。
- **对比台升级与全站 AB 蓝绿一致语义**：接入 A-B 循环与多粒度步进，全站（对比台 + 导出页）统一 **`A` 为蓝色（`var(--ch1)` / `#38bdf8`）、`B` 为绿色（`var(--ch2)` / `#10b981`）**；将对比台顶部中央收起态拉手按钮改为明确的 **「更多」** 文字按钮。
- **高稳定多拍梳状 BPM 检测**：通过 ~250 Hz（~4ms）重叠 RMS 起音包络 + 去均值多拍谐波梳状自相关（`1T, 2T, 4T, 8T, 16T`）与分级连续搜索，根除 `44.1kHz`/`48kHz`/`16kHz` 下 `[A]ddiction`（164→163）与 `嘘の火花`（188→190）漂移问题。
- **对比台冷启首帧步进无黑屏优化**：修复 `SafeVideoController.seek` 对未就绪节点跳过 `0s` 寻道的缺陷以保障挂载即解首帧；在 [Workbench](../../../src/components/Workbench.tsx) 的非全速播放态更新并锁存最近已就绪帧离屏缓存（在 `seek` 发起前瞬时抓拍，播放态零拷贝直通），消除寻道与步进时的黑屏卡顿感。

**Non-Goals:**
- 不修改 [src/core/geometry.ts](../../../src/core/geometry.ts) 的三线几何对齐数学公式，不再引入人体轮廓叠层或骨骼关键点参数。
- 不增加弹窗拦截或步骤锁死禁用提示（维持克制极简原则）。
- 不改动 Android 原生 GPU 零拷贝导出管线与流式音频解码原生接口。

## Decisions

### 1. 5 步全局状态机与同屏「空间 + 时间」合一标定组件（[AgDR-0034](../../../docs/decisions/AgDR-0034-单视频空间时间二合一标定流与无文字状态点指示.md)、[AgDR-0037](../../../docs/decisions/AgDR-0037-同屏合一标定与多拍梳状BPM及步进防黑屏优化.md)）

- **步骤类型与导航收敛**：
  `src/types/wizard.ts` 将 `WizardStep` 锁定为 5 步：
  `'import' | 'calibrate-video1' | 'calibrate-video2' | 'workbench' | 'export'`
  `src/App.tsx` 的 `WIZARD_STEPS` 映射为 `导入`、`视频1`、`视频2`、`对比台`、`导出片段`。
- **同屏共享 `<video>` 一体标定架构（移除 `subMode` 切换与 `AlertSilhouette`）**：
  [CalibrationStep](../../../src/components/CalibrationStep.tsx) 彻底取消 `subMode` 与 `showSilhouette`，单屏垂直划分为三段：
  1. **顶栏右侧控件组**：
     - 只读状态徽章 `[空间 ● | 时间 ●]`（`<span>` 容器，`cursor: default` 且无任何 `onClick` 切换逻辑）：拖动过任一三线时点亮「空间」圆点，点击过「设为锚点」时点亮「时间」圆点；
     - 全局同步的三线模型下拉框（`两横一竖` / `两竖一横`）；
     - 该视频独立 `镜像` 开关；
     - 显式 CTA 按钮 `下一步 →`（`视频1` 推进到 `视频2`，`视频2` 推进到 `对比台`）。
  2. **中部视频舞台（`.calib-stage` / `.calib-frame`）**：
     - 视频 `<video>` 与可拖拽的三线正交标尺常驻显示（保留视频水平镜像隔离，三线标签不随视频翻转）；
     - 通过 `ResizeObserver`（及 `window.resize` 降级）自适应撑满顶栏与底部面板之间的全部剩余高度，在现代大屏手机（~384px~430px 逻辑高度）及桌面上同时提供充足的三线拖拽精度与清晰画幅。
  3. **底部精简一体对拍面板（`.bottom-bar`）**：
     - 上条：**可交互定位波形轨（高 `46px`）**：同时承担「找帧进度条 + 音频波形展示 + `[` `]` 截取手柄 + 锚点游标 + 播放头」全部功能；用户直接在波形上**按下或横向拖动指针**即可连续搓帧定位 `video.currentTime`，无需额外叠加一条独立的 range slider 浪费垂直高度；
     - 下条：`[播放/暂停] [0.000s]` | `[设为锚点] [锚点 1.000 s] [试听] [招式 X.Xs]` | `[TAP] [- BPM +]`。

### 2. 对比工作台 AB 蓝绿统一语义、步进与「更多」抽屉按钮（[AgDR-0035](../../../docs/decisions/AgDR-0035-对比台AB点循环联动与折叠倍速腾空步进底栏架构.md)、[AgDR-0037](../../../docs/decisions/AgDR-0037-同屏合一标定与多拍梳状BPM及步进防黑屏优化.md)）

- **顶部中央「更多」文字抽屉拉手**：
  - 保留 [Workbench.tsx](../../../src/components/Workbench.tsx) 顶部中央下凸梯形按钮（宽 `116px`、高 `20px`）与点击「对比台」导航标签的展开/收起交互；
  - 当顶部参数工具栏处于**收起态**（默认状态）时，拉手内部明确渲染 **`更多`** 文字（`11px` 粗体），替代原先难以察觉的小向下箭头；工具栏处于**展开态**时展示 **`收起`** 文字（`11px` 粗体），替代原先向上的收起箭头。
- **全站 A（蓝）/ B（绿）统一视觉规范**：
  - 对比工作台底栏时间轴行：`A` 按钮与左侧轨道起点标记统一采用蓝色 `var(--ch1)`（`#38bdf8`），`B` 按钮与右侧轨道终点标记统一采用绿色 `var(--ch2)`（`#10b981`）；激活 `[A, B]` 循环时按钮呈现对应蓝/绿高亮背景框，轨道选区高亮条采用 `linear-gradient(90deg, rgba(56, 189, 248, 0.55), rgba(16, 185, 129, 0.55))`；
  - 导出页面 [ExportPage.tsx](../../../src/components/ExportPage.tsx)：`IN (A): ...` 文案、`设当前为 A` 按钮边框文字与左滑块手柄 `A` 统一改为蓝色 `var(--ch1)`，与右侧原本即采用绿色 `var(--ch2)` 的 `OUT (B)`、`设当前为 B` 及手柄 `B` 形成全站一致视觉体系，双滑块中间色带同步采用蓝→绿线性渐变。
- **7 档倍速折叠菜单与多粒度目标时间累加步进**：
  - 保持由 [AgDR-0035](../../../docs/decisions/AgDR-0035-对比台AB点循环联动与折叠倍速腾空步进底栏架构.md) 确立的三浮层互斥 `openPopup: 'step' | 'rate' | 'bpm' | null` 与 `tauRef` 线性累加 `stepTau` 架构。

### 3. 多拍周期梳状（Multi-Beat Harmonic Comb）高精度 BPM 测定（[AgDR-0037](../../../docs/decisions/AgDR-0037-同屏合一标定与多拍梳状BPM及步进防黑屏优化.md)）

- **根因诊断总结**：
  1. 原实现固定/自适应 ~11.6ms 粗步长（44.1kHz 为 `hop=512` / 86.13Hz，48kHz 为 `hop=557` / 86.18Hz）在 `164 BPM` 与 `188 BPM` 等整数步长夹缝间产生高达 ±3~7 BPM 的栅格量化跳变，`3` 点抛物线插值受脉冲非对称尾部拉偏而落到 `163` / `190`；
  2. 仅依赖单拍滞后 `lag = 1T` 的自相关极易被副歌/吉他切分音、军鼓反拍或室内拍手混响轻微拉偏 1~2 BPM。
- **新算法设计（[src/core/audio.ts](../../../src/core/audio.ts)）**：
  1. **高分辨率 ~250 Hz 起音包络**：以 `hopSize = Math.max(32, Math.round(sampleRate / 250))`（~4ms 帧移）与 `winSize = Math.max(hopSize, Math.round(sampleRate / 100))`（~10ms 重叠 RMS 窗）提取能量包络，计算一阶正差分起音并减去全局均值形成零均值起音序列 `onsets`；
  2. **多拍谐波梳状自相关评分**：针对候选节拍周期 $T(bpm) = 60 \cdot f_{env} / bpm$，使用线性插值自相关在多拍整数倍位置 $k \in \{1, 2, 4, 8, 16\}$（权重 `[1.0, 0.9, 0.9, 0.85, 0.7]`，自动跳过超出有效时长 $envLen - minOverlapHops$ 的长滞后）计算加权平均梳状相关度，乘以以 `168 BPM` 为中心的高斯对数先验权重 $\exp(-(\log_2(bpm/168))^2 / (2 \cdot 0.35^2))$，利用 4 拍 / 8 拍 / 16 拍小节对齐自然压制单拍微扰并将整首/半段锁死至真实曲速（`[A]ddiction` 稳定 `164`、`嘘の火花` 稳定 `188`、`真龙` 稳定 `166`）；
  3. **整数 lag 缓存与分级搜索**：粗扫 `80..220 BPM`（步长 `0.5 BPM` 并命中 `95..125 BPM` 时保留 `1.5x` 亚谐波共振复核），再用 `0.25 BPM`（±1.5）与 `0.05 BPM`（±0.5）两级微调收口并四舍五入输出整数；借助 `Map<number, number>` 缓存整数滞后自相关值，60s 音频实测仅约 15~25ms 完成。
  4. `detectBpmFromSlice` 同样采用 `getAudioHopSize(sampleRate)`（`Math.max(32, Math.round(sampleRate / 250))`）对齐全局采样网格并闭环求解切片 BPM。

### 4. 对比台首帧步进冷启卡顿诊断与零黑屏缓存机制（[AgDR-0037](../../../docs/decisions/AgDR-0037-同屏合一标定与多拍梳状BPM及步进防黑屏优化.md)）

- **根因诊断总结**：
  1. **长 GOP 视频与冷节点首帧未解码**：真实 WOTA 艺 MP4（如 1080p `[A]ddiction.mp4` 关键帧间隔达 **10.375s / 250 帧**、`金刚_真龙.mp4` 达 **5.0s / 125 帧**）在从标定页切入对比台后重建两路 `<video>` 元素时，[SafeVideoController.seek](../../../src/core/sync-engine.ts#L108) 原先在 `readyState < 2` 时若 `targetTime === 0` 会误被 `|currentTime - clamped| < 0.005` 提前短路跳过首帧解码（而若强行先 `play()` 再向后倒退 `seek` 则会适得其反，在长 GOP 中段强制触发二次重解 300ms+）；
  2. **寻道瞬间清屏纯黑放大卡顿体感**：每次触发 `seekToTau`，浏览器会将 `video.readyState` 瞬时降为 `1`（`HAVE_METADATA`），而渲染循环按 `60fps` 执行 [renderComparisonFrame](../../../src/core/renderer.ts) 时先全屏清黑再因 `readyState < 2` 跳过绘制 `drawImage`，导致首次耗时较长的寻道期间（1~3 秒）画布完全处于纯黑盲区（「按一下等两三秒才出图像」）。
  3. **异步解码跨越「开始标定」卸载边界**：若大视频在导入页尚未完成音频解码时用户提前进入「视频1」标定页，原依赖 `ImportStep` 局部 `setState` updater 的通知会被 React 丢弃，且 `CalibrationStep` 未监听异步到达的 `audioInfo`，导致页面永久停留在默认 `160 BPM`。
- **协同优化方案**：
  1. **SafeVideoController 就绪判定加固（[src/core/sync-engine.ts](../../../src/core/sync-engine.ts)）**：仅在 `(typeof video.readyState !== 'number' || video.readyState >= 2) && !this.isSeeking && !video.seeking` 成立时才因 `|currentTime - clamped| < 0.005` 提前跳过，确保挂载即触发首帧解码而不引入任何倒退重寻道；
  2. **每通道最近已就绪帧离屏缓存与寻道前快照（Zero-Black Seeking，[Workbench.tsx](../../../src/components/Workbench.tsx)）**：在 `Workbench` 内维护轻量级 `fallbackCanvasRef1` / `fallbackCanvasRef2`：全速播放态（`getIsPlaying() === true`）直通 `<video>` 零额外拷贝；一旦在非播放态完成首帧/步进解码，或即将调用 `seekToTau` / `stepTau` / `togglePlay` 暂停前，立即抓拍当前就绪帧存入离屏画布；当该侧处于有效区间（`videoActive === true`）但临时 `seeking` 或 `readyState < 2` 时，向 `renderComparisonFrame` 传入该离屏画布占位渲染（超出有效范围 `videoActive === false` 仍保持纯黑），使包括首次步进在内的所有寻道过程画面连贯零闪黑；
  3. **跨步骤异步元数据/音轨补丁合入（[ImportStep.tsx](../../../src/components/ImportStep.tsx)、[App.tsx](../../../src/App.tsx)、[CalibrationStep.tsx](../../../src/components/CalibrationStep.tsx)）**：将元数据与音轨解析结果通过不依赖 `ImportStep` 挂载状态且按 `url` 校验的 `onPatchVideo` 合并入 `App` 主状态，并在 `CalibrationStep` 自动接管首次异步到达的真实 `audioInfo`（保留用户已手动修改的锚点/BPM/区间），根除大视频快切场景下卡死 `160 BPM` 问题。

## Risks / Trade-offs

- **[Risk] 同屏展示三线舞台与底部波形面板后，极矮屏幕下视频可用高度略微缩减**
  - **Mitigation**: 波形面板直接使用自身 Canvas 承担指针按住连续拖拽寻帧功能，省略多余的独立空间进度滑块行（省出 ~32px 垂直空间），使波形高度仅占 46px + 控制条 ~32px；实测 853×384 与 640×360 下三线人物操作区依然清晰可用。
- **[Risk] 离屏最近帧缓存在 1920×1080 分辨率下反复 `drawImage` 拷贝会增加内存带宽**
  - **Mitigation**: 仅在非播放态时间戳变化、首次捕获或发起暂停/寻道/步进前抓拍 1 次快照，全速 60fps 播放期间零额外离屏拷贝开销。

## Migration Plan

- 本次变更为向导流转、信号处理与 UI 交互演进，不涉及持久化数据库或本地存储格式迁移；
- `WizardStep` 与组件接口直接演进到位，同步更新 [openspec/changes/pro-compare-workbench-calibration](openspec/changes/pro-compare-workbench-calibration) 下全部规划文档与架构决策记录（AgDR）。
