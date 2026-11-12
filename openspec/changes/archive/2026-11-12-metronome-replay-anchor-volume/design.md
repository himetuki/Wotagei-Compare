# Design

## Context

在对比工作台（`Workbench`）与导出片段工作台（`ExportPage`）中，双视频播放均由 `DualVideoSyncEngine` 统一驱动，并支持播放到达交集区间终点或 A-B 截取区间终点时无缝跳回起点循环重放（Replay/Loop）。节拍器（`SynthesizedMetronome`）作为可选发声源，实时接收统一时间轴的秒数 $\tau$ 并驱动 WebAudio 合成发声；离线视频导出（`VideoExporter`）则通过 `synthesizeMetronomeBuffer` 合成离线 MP4 节拍器音频轨。

现状存在三大核心痛点（详见 `proposal.md` - Why）：
1. 循环重放后节拍器由于拍点索引历史残留且无时间回绕自愈，第二轮循环彻底失音；
2. 节拍器起播时吞音以及负时间戳模运算缺陷，导致锚点处（$\tau = 0$）重拍未能正确响铃，节拍相位与视觉锚点错位；
3. 节拍器发声为 35ms 单薄正弦波、0.7 增益且无谐波与动态增强，在对齐 -5.9 LUFS / -8.8 dB RMS 级别高响度 WOTA 艺伴奏视频时声音微弱。

## Goals / Non-Goals

**Goals:**
- 在 `DualVideoSyncEngine` 循环重放、组件主动寻道以及时间戳任意逆向回退时，节拍器无缝重放发声，绝不失音；
- 统一时间轴锚点 $\tau = 0$ 严格同相绑定为小节第 1 拍重拍（Downbeat / 强拍，1500Hz/800Hz 复合脉冲），消灭起播吞音，正负时间戳全域 4 拍对称；
- 显著提升节拍器响度与穿透力，引入复合谐波冲击音色与 WebAudio 动态范围压缩限幅器（`DynamicsCompressorNode`），达到在 -5.9 LUFS 伴奏背景下依然清晰饱满、外放不削顶破音；
- 离线导出 `VideoExporter` 的节拍器合成音轨在重拍锚点锁相、时间戳步进模型与响度包络上与实时节拍器达成 100% 对齐。

**Non-Goals:**
- 不引入外部音频文件（如 wav/mp3 采样资产），依然保持 WebAudio 纯代码即时合成；
- 不增加非 4/4 拍（如 3/4 拍、6/8 拍）复杂拍号配置，保持 WOTA 艺常规 4 拍一小节的最简规范；
- 不改动现有视频几何对齐、三线变换或双视频画面硬件渲染主流程。

## Decisions

### 1. 循环重放双层闭环重置与防哑音自愈状态机
- **架构决策**：详见 [AgDR-0022](../../docs/decisions/AgDR-0022-节拍器双向循环重置锚点锁相与动态增益合成.md)。
- **核心逻辑**：
  1. **底层自愈**：在 `SynthesizedMetronome.update(tau, bpm, isPlaying)` 内部，若计算得到的 $currentBeatIndex < this.lastBeatIndex - 1$（表示时间发生逆流或循环回绕），不依赖外部调用，立即以新时间戳为基准执行自愈重置；
  2. **显式重置**：`DualVideoSyncEngine` 在检测到到达循环终点触发 `this.playFrom(loopStart)` 时，或者调用 `reset` 时，规范化更新 `tau`；在 `Workbench` 和 `ExportPage` 中，起播与寻道时同步调用节拍器重置。
- **替代方案考虑**：
  - 仅依靠外部组件监听 `tau` 倒流：组件层与底层解耦不严密时容易遗漏场景（例如后台微任务或特定交互下），底层自愈能提供 100% 容灾保障。

### 2. 统一时间轴 $\tau = 0$ 绝对锁相与起播容差判定
- **时间轴与拍点关系**：
  - 基准原点：$\tau = 0$（双视频的对拍锚点位置）。
  - 单拍周期：$\Delta\tau = 60 / effectiveBpm$。
  - 任意拍号 $k \in \mathbb{Z}$ 的理论时刻为 $\tau_k = k \cdot \Delta\tau$。
- **小节重拍判定**：
  - 采用无符号同余公式：`((k % 4) + 4) % 4 === 0`。
  - 凡满足条件的 $k$（包括 $0, 4, 8, \dots$ 及 $-4, -8, \dots$）必为重拍（1500Hz/800Hz 复合脉冲），其余为弱拍（800Hz 单频脉冲）。
- **起播容差判定（解决吞音）**：
  - 定义起播判定容差 $\epsilon = 0.035$ 秒（约半帧至两帧）。
  - 当在时刻 $\tau$ 执行起播或重置时：
    下一个拍点序号为 $k_{next} = \mathrm{ceil}((\tau - \epsilon) / \Delta\tau)$；
    将历史拍号初始化为 $lastBeatIndex = k_{next} - 1$。
  - 若用户在 $\tau = 0$（或任意拍点附近）起播，$k_{next} = 0, lastBeatIndex = -1$，第一帧 $\tau \ge 0$ 时即刻触发第 0 拍（重拍），彻底消灭首拍被吞问题；若在两拍中间起播，则平滑等待下一拍到来。
- **离线导出对齐**：
  - 在 `src/core/exporter.ts` 中重构 `synthesizeMetronomeBuffer`：
    基于整数拍号迭代 $k = \mathrm{ceil}((exportStart - \epsilon) / \Delta\tau)$ 至 $\mathrm{floor}(exportEnd / \Delta\tau)$，拍点输出时间 $outTime = (k \cdot \Delta\tau - exportStart) / slowMotionRate$，消除连续浮点累加漂移。

### 3. 复合谐波脉冲音色与 WebAudio 动态范围压缩限幅管线
- **高响度音视频穿透力分析**：
  - 参考《金刚_真龙.mp4》实测数据：Integrated Loudness 为 -5.9 LUFS，RMS 为 -8.8 dB，Peak 为 +2.5 dB（重度压缩与高饱和度）。
  - 纯正弦波（Sine）能量仅集中在单频且无谐波，在人耳听觉系统中极易被伴奏低频与人声掩蔽。
- **音频合成增强方案**：
  - **波形**：强拍采用双振荡器叠加（1500Hz 三角波作为高频清脆攻击 + 800Hz 正弦波作为中频打击 punch），弱拍采用 800Hz 三角波；
  - **包络**：起始瞬态快速起音（Attack 2ms）到达峰值 1.2，保持打击感 8ms（Sustain），随后平滑指数衰减（Decay 45ms），总发声持续 55ms；
  - **动态压缩限幅器（DynamicsCompressorNode）**：
    在 WebAudio 输出端挂载原生压缩器：
    `threshold = -12 dB, knee = 8 dB, ratio = 8, attack = 0.003s, release = 0.08s`。
    经压缩限幅后，大幅提升整体感知响度（提升约 6~10 dB），在移动端与笔记本扬声器外放时极为清晰，且在主音量最大时 100% 避免削顶杂音（No Clipping）。
  - 离线导出 `synthesizeMetronomeBuffer` 同步采用相同双振荡器与增益包络渲染。

## Risks / Trade-offs

- **[Risk]** 音量增大后，若用户耳机音量开到最大，可能感到节拍器过于清脆刺耳。  
  → **Mitigation**：通过三角波与滤波平滑处理高次谐波，高频最高限定在 1500Hz（而非 3000Hz 尖锐啸叫区），并经 DynamicsCompressor 平滑压制动态突刺，保持清脆而圆润的木质/打击感敲击音。
- **[Risk]** 慢放倍速极低（如 0.1x）时，节拍间隔极长（例如 160 BPM 下单拍间隔拉长至 3.75s），容差窗口是否会误触。  
  → **Mitigation**：容差窗口 $\epsilon = 35\text{ms}$ 设定在真实统一时间轴秒数维度，与慢放倍速解耦，在 0.1x 下对应物理时间仅 350ms，完全在人耳起播容差可接受范围内，不会发生抢拍。

## Migration Plan

1. 在 `src/core/metronome.ts` 中实现新的 `SynthesizedMetronome` 状态机与合成管线；
2. 在 `src/core/exporter.ts` 中更新 `synthesizeMetronomeBuffer` 算法；
3. 在 `src/components/Workbench.tsx` 与 `src/components/ExportPage.tsx` 中验证并对齐事件触发；
4. 编写 `src/core/metronome.verify.ts` 离线校验数学模型（循环回绕、负时间戳同余、锚点容差判定、无失音验证）；
5. 运行完整构建 `npm run build` 确保类型与工程全部通过。
