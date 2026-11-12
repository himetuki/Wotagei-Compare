# Design

## Context

参见 `proposal.md`。当前系统在时间标定中允许截取区间缩窄后锚点留在外部（AgDR-0013），导致用户困惑与时间轴映射隐患；同时，在时间标定中播放器未对截取区间做边界约束，拖动手柄时视频画面亦未实时反馈当前帧。在对比台与视频导出中，左右分屏采用绝对居中（50%）与 69% 特征高度，在高强度大挥棒时左右两侧与高空光弧存在切边遮挡现象。

## Goals / Non-Goals

**Goals:**
- 在时间标定视图中实现锚点（`anchorTime`）强制 Clamp 在有效截取区间 $[trimStart, trimEnd]$ 内部，消除出界状态；
- 在时间标定视图中实现拖拽手柄时自动暂停视频播放、视频画面与当前时间游标实时精确贴合正在拖动手柄的时间戳；
- 在时间标定视图中实现播放按钮在 $[trimStart, trimEnd]$ 区间内闭环循环播放；
- 在左右分屏几何变换中引入左右半区外偏区分机制（左半区 47.5%，右半区 52.5%），并将特征缩放比例微调至 65.5%，脚底维持 95% 沉底，头顶留白增至约 29.5%；
- 确保导出渲染器（`exporter.ts`）与实时渲染器（`renderer.ts`）及相关几何单元验证保持绝对一致。

**Non-Goals:**
- 不支持对比台中用户自由拖拽分屏中轴线或自由调节人物位置（保持算法自动精确对齐，不增加繁琐手动配置）；
- 不在空间标定（三线）中引入时间截取或锚点概念（空间标定只负责几何位姿，时间与截取由时间标定统管）；
- 不改变半透明叠加模式的几何变换与并集视口算法。

## Decisions

### 1. 锚点区间 Clamp 与手柄拖拽实时寻帧
详细决策记录见 [AgDR-0014](../../../docs/decisions/AgDR-0014-时间截取锚点约束与分区分屏视角微调.md)。
- **Clamp 策略**：
  在 `commitAudioState` 以及拖动手柄的 `handlePointerMove` 回调中，计算 `clampedAnchor = Math.max(newTrimStart, Math.min(newTrimEnd, currentAnchor))`。
  若 `clampedAnchor !== currentAnchor`，同步更新 `anchorTime` 状态及输入框。
  底栏数值输入与「设为锚点」按钮同样执行 Clamp。
- **实时寻帧与停播**：
  在手柄 `handlePointerDown` 时，若 `isPlaying` 为真，立即调用 `video.pause()` 并重置 `isPlaying = false`；
  在手柄 `handlePointerMove` 时，根据正在拖拽的手柄类型，设置 `video.currentTime = targetTime`，并设置 `setCurrentTime(targetTime)`，使得视频画面和红色游标完全跟随手柄移动。
- **区间循环播放**：
  在 `togglePlay` 时，若当前 `currentTime < trimStart` 或 `currentTime >= trimEnd`，将 `video.currentTime` 初始置为 `trimStart`；
  在 60fps 平滑更新循环（或 `timeupdate` 事件）中，检测若 `video.currentTime >= trimEnd`，立即将 `video.currentTime` 重置为 `trimStart`，形成无缝循环。

### 2. 左右分区分屏中轴微偏与人体特征比例微调
详细决策记录见 [AgDR-0014](../../../docs/decisions/AgDR-0014-时间截取锚点约束与分区分屏视角微调.md)。
- **算法接口重构**：
  修改 `calculateTriLineSplitScreenPlacement` 签名，新增 `channel: 'left' | 'right'`（或 `1 | 2`）参数：
  ```ts
  export function calculateTriLineSplitScreenPlacement(
    calib: TriLineCalibration,
    videoSize: { width: number; height: number },
    halfViewport: { width: number; height: number },
    channel: 'left' | 'right' = 'left'
  ): TriLineHalfScreenPlacement
  ```
- **核心对齐参数调整**：
  - 特征高度比例：由 `0.69` 微调为 `0.655`（占半区高度的 65.5%）；
  - 目标脚底沉底位置：维持 `0.95`；
  - 目标头顶空间：$1.0 - 0.655 - (1.0 - 0.95) = 0.295$（即顶部留白由原 26% 扩充至 29.5%）；
  - 目标水平中心 `targetCenterX`：
    - 若 `channel === 'left'`（左半区）：`targetCenterX = halfViewport.width * 0.475`（向左微移 2.5%）；
    - 若 `channel === 'right'`（右半区）：`targetCenterX = halfViewport.width * 0.525`（向右微移 2.5%）。

## Risks / Trade-offs

- **[Risk] 手柄连续高频拖拽导致视频 seek 频繁卡顿** → **Mitigation**: 现代移动端/PC 浏览器解码器在关键帧寻帧性能良好；若检测到部分设备 seek 有延迟，通过 `requestAnimationFrame` 节流 `video.currentTime` 的赋值，保证 60fps 拖拽丝滑。
- **[Risk] 锚点被自动 Clamp 后用户原锚点丢失** → **Mitigation**: 截取起止是确定招式边界的高层操作，当招式边界已经越过原锚点时，原锚点本已无意义。在界面上波形图和输入框均实时更新，并伴有试听按钮供用户即时验证。
- **[Risk] 分屏外偏导致导出视频两半区分界线处视觉不对称** → **Mitigation**: 偏移量严格控制在 2.5%（克制微调），在 16:9 横屏半区中仅相当于数十像素，肉眼难以察觉人体失中，却能为中间光弧交织提供关键安全距离。

## Migration Plan

1. 更新 `src/core/geometry.ts` 中的分屏定位算法并更新对应单测 `src/core/geometry.verify.ts`；
2. 更新 `src/core/renderer.ts` 和 `src/core/exporter.ts` 中对分屏放置算法的调用，分别传入 `'left'` 和 `'right'`；
3. 更新 `src/components/AudioStep.tsx`，加入 anchor clamp、手柄拖动实时 seek 与自动暂停、区间循环播放；
4. 运行 `pixi run test` 确保全量自动化几何与时间轴测试通过。
