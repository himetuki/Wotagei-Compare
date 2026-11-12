# Design: 全局网格对齐与自相关抛物线插值稳定 BPM 检测

## Context

见 `proposal.md`。当前 `src/core/audio.ts` 在局部切片计算 BPM 时，直接截取浮点时间戳转换的 PCM 样本 `pcm.subarray(startSample, endSample)`，且以 `hopSize = 512` 为单位做无重叠 RMS 能量包络与差分自相关。因为没有对齐到 Hop 网格，且自相关仅取整数最佳 lag 并施加倾斜的中心先验分布，导致在 188 BPM 附近跳变为 181 或 194。

## Goals / Non-Goals

**Goals:**
- 在 `detectBpmFromSlice` 中将切片起点对齐到 `hopSize` 的全局网格整数倍，彻底消除起音瞬态的相位撕裂与能量泄漏。
- 在 `detectBpmFromPcm` 中引入局部自相关未加权峰值的抛物线二次插值，使输出具有连续高精度，消除 6~7 BPM 的离散量化粗糙阶跃。
- 确保视频音频在 6.06s、6.30s、6.37s 等各种微调端点下均稳定输出 188 BPM。
- 保持纯 TypeScript 纯函数算法实现，无第三方繁重依赖，不拖慢移动端运行速度。

**Non-Goals:**
- 不引入重度 WASM 外部音频库（如 Essentia/Aubio）。
- 不重构全局 AudioContext 或改变现有的 PCM 数据流存储结构。

## Decisions

### 1. 全局 Hop 整数倍网格采样吸附
见决策记录：[AgDR-0021](../../docs/decisions/AgDR-0021-全局网格对齐与自相关抛物线插值BPM检测.md)

在 `detectBpmFromSlice` 中，将转换后的 `startSample` 严格按 `hopSize` 整数倍下取整，`endSample` 按 `hopSize` 整数倍上取整：
```typescript
const hopSize = 512;
const alignedStartSample = Math.max(0, Math.floor((validStart * sampleRate) / hopSize) * hopSize);
const alignedEndSample = Math.min(pcm.length, Math.ceil((validEnd * sampleRate) / hopSize) * hopSize);
```
此举保证了任何切片在以 512 样本切块时，其块边界与整曲的物理鼓点相位始终保持恒定一致，彻底根除切点移动带来的鼓点瞬态分流。

### 2. 物理自相关局部峰值抛物线二次插值（Parabolic Interpolation）
见决策记录：[AgDR-0021](../../docs/decisions/AgDR-0021-全局网格对齐与自相关抛物线插值BPM检测.md)

在 `detectBpmFromPcm` 中：
1. 仍然使用先验权重在全局搜索最佳离散峰值点 `bestLag`，保证大尺度下的速度区间与谐波选择正确；
2. 在选定 `bestLag` 后，提取其在**原始未加权自相关数组 `rawCorrelations`** 上的三点极值序列：$y_0 = rawCorrelations[bestLag - 1]$，$y_1 = rawCorrelations[bestLag]$，$y_2 = rawCorrelations[bestLag + 1]$；
3. 计算抛物线顶点连续偏移量 $\Delta$：
$$\text{denom} = 2 \times (2 y_1 - y_0 - y_2)$$
$$\Delta = \frac{y_2 - y_0}{\text{denom}} \quad (\text{当 } |\text{denom}| > 10^{-9} \text{ 且 } |\Delta| \le 1.0)$$
$$\text{refinedLag} = bestLag + \Delta$$
4. 换算高精度连续 BPM：
$$\text{calculatedBpm} = \frac{60 \times envelopeSampleRate}{\text{refinedLag}}$$
最终返回 `Math.round(calculatedBpm)`。

## Risks / Trade-offs

- **[Risk]** 切片边缘因向外或向内吸附至 512 点倍数，可能导致微秒级长度变动。
  - **Mitigation**：512 采样点在 48kHz 下仅为 10.6ms，远低于人耳对节拍感知的阈值（>50ms），且有效切片时长规定最低 2.0 秒，该微动对整体节拍统计特征完全无负面影响。
- **[Risk]** 极端平坦自相关峰值处抛物线插值分母趋近于 0。
  - **Mitigation**：设置保护阈值 `denom > 1e-9`，若分母过小则回退为整数 `bestLag`。
