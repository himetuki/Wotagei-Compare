# Design

## Context

详见 `proposal.md - Why`。当前系统在手机等移动端小屏横屏浏览时，左右分区人物特征占比（60%）偏小且下边缘黑边过多；空间标定垂直指示框偏在线身侧边不够规整；同时长连技视频包含多个曲目，全局音频自相关测算导致局部招式 BPM 失真。

## Goals / Non-Goals

**Goals:**
- **小屏极清视口算法调优**：调整左右分区三线正交投影算法，将脚底基准线从 85% 下沉至约 94%~95%，人体特征高度在半区中占比从 60% 提升至 68%~70%，大幅消除多余黑边并保证上方 26%~27% 的大光弧空间。
- **三线指示框位置统一规范**：所有三线标定标签统一骑在线上，垂直线（身体中轴、左脚、右脚）指示框水平居中正对垂直线。
- **时间标定局部区间截取与实时重算**：在音频波形轴两端引入类似 `[` 和 `]` 的起止截取手柄；拖动起止点时取切片 PCM 数据即时重新运行自相关算法更新 BPM；锚点绝对时间数值与物理标记严格保持不变。
- **对比台交集区间计算升级**：统一时间轴的有效范围从全片时长升级为两通道各自截取区间的对齐重叠交集（Intersection Interval）。
- **全局文案与导航规范**：全局步骤统一由「CH1/CH2 对拍」更名为「CH1/CH2 时间」。

**Non-Goals:**
- 不支持单视频内多个离散招式区间的列表式管理（保持单一连续区间的极简交互）。
- 不在拖动截取手柄导致锚点落入外部时强行 Clamp 篡改用户设定的锚点时间戳。
- 不引入外部大型音视频处理库，沿用原生 Web Audio API 与已验证的自相关算法。

## Decisions

架构决策记录详见：
- [AgDR-0013: 双通道时间片段截取与左右分区视口人物放大](../../../docs/decisions/AgDR-0013-双通道时间片段截取与左右分区视口人物放大.md)

### 决策一：左右分区几何投影参数调优
基于用户实测参考标注图（绿线在约 26%，红线在约 95%）推导视口参数：
- 目标脚底沉底位置 `targetBottomY = halfViewport.height * 0.95`；
- 目标特征高度 `targetFeatureH = halfViewport.height * 0.69`；
- 头顶参考位置位于 `targetBottomY - targetFeatureH = 0.26`（约 26% 视口高），上方留有 26% 高空，完全包容大光弧。

### 决策二：标定指示框骑在线上
- 横线：保持水平线上内嵌标签（头顶左下、脚底/地面右上）；
- 竖线（中轴、左脚、右脚）：移除原有的 `left: '26px'` / `right: '26px'` 偏移，改为 `left: '50%', transform: 'translateX(-50%)'`，使其在水平方向正对中心垂直线，垂直方向靠上对齐（`top: '12px'`）。

### 决策三：音频数据契约扩展与局部切片 BPM 测算
- 在 `VideoAudioInfo` 中新增 `trimRange?: TimeInterval`（未设定时默认 `[0, duration]`），并新增内存级 `rawChannelData?: Float32Array`；
- 在 `ImportStep.tsx` 中解码音频后，将 `rawChannelData` 连同 `sampleRate` 保存在通道对象中；
- 拖拽起止手柄 `[start, end]` 时，按采样率截取 `monoData.subarray(Math.floor(start * sampleRate), Math.ceil(end * sampleRate))`；
- 当截取时长 $\ge 1.5$ 秒时，调用 `detectBpmFromPcm` 重新测算该区间的整数 BPM，并即时更新 `userBpm` 与波形节拍网格；若截取时长不足 1.5 秒则保留当前 BPM；
- 锚点时间戳（`anchorTime`）保持绝对数值不变。

### 决策四：对比台与导出台时间轴交集算法重构
- `calculateUnifiedTimeline` 入参从单纯的 `duration` 升级为 `trimStart` 与 `trimEnd`（或可选传入 `trimRange`）：
  - 视频 1 在统一时间轴上的有效区间：$span_1 = [\frac{trimStart_1 - anchor_1}{rate_1}, \frac{trimEnd_1 - anchor_1}{rate_1}]$；
  - 视频 2 在统一时间轴上的有效区间：$span_2 = [\frac{trimStart_2 - anchor_2}{rate_2}, \frac{trimEnd_2 - anchor_2}{rate_2}]$；
  - 统一时间轴有效重叠交集：$start = \max(span_1.start, span_2.start)$，$end = \min(span_1.end, span_2.end)$；
- 对比台播放滑块、锚点前 1s 保护、以及导出台的 A-B 区间均基于此新的交集区间计算。

## Risks / Trade-offs

- **[Risk 1] 移动端横屏波形轴起止手柄不易触摸抓取**
  → **Mitigation**: 手柄外框设计为宽度 28px~32px 的透明触控扩充区（Hitbox），视觉上渲染为紧凑精致的 `[` 和 `]` 双轨把手，并支持指针捕获（`setPointerCapture`），防止快速滑动时滑脱。
- **[Risk 2] 截取区间频繁拖拽触发大量重复自相关计算造成掉帧**
  → **Mitigation**: 自相关搜索限制在前 45 秒内，耗时极短（< 5ms）；拖动过程中实时更新视觉选区，BPM 重算在拖动过程中节流或在 PointerMove/PointerUp 时高效执行。
- **[Risk 3] 解码单声道 PCM 的内存占用**
  → **Mitigation**: 仅在单视频载入时保留一个单声道 `Float32Array`（例如 3 分钟 44.1kHz 音频约 31MB 内存），浏览器与移动端垃圾回收完全无压力。

## Migration Plan

纯客户端无缝兼容：
1. 若旧数据或演示视频未显式指定 `trimRange`，纯函数算法统一将默认截取范围置为 `[0, duration]`，行为平滑兼容；
2. 现有导出工作台与渲染器完全复用 `timeline.intersectInterval`，无需修改底层导出管线核心逻辑。
