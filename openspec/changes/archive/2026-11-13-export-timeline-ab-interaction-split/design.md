# Design

## Context

在导出工作台（`ExportPage.tsx`）中，左侧面板包含用于监看的预览时间进度条（Timeline Progress Slider），右侧面板包含用于标定截取范围的单轨双端点滑块（A 端点起点与 B 端点终点）。先前实现将所有寻道调用统一收敛并硬编码为停止寻道（`keepPlaying: false`），导致在播放预览视频期间，用户点击或拖动时间滑块跳转进度时，视频被非预期地强制打断停止。具体背景与动因见 [proposal.md](./proposal.md)。

## Goals / Non-Goals

**Goals:**
- **时间进度条播放连续性保障**：在播放状态下，用户点击或拖动左侧面板的预览时间进度条时，视频**不停止播放**，而是原子重定位到目标时刻并从该处继续平滑播放，左下角控制按钮保持为「暂停」；在暂停状态下则定位并呈现单帧画面，按钮保持为「预览」。
- **起止点 A/B 调整严格前置停止**：在右侧面板拖动 A 手柄、B 手柄、点击区间轨道调整 A/B 或点击快捷设点时，视频立即停止播放，左下角控制按钮即刻置为「预览」，画面实时切换到当前手柄位置展示单帧。
- **寻道防抖与单帧渲染协同**：无论是时间进度条还是 A/B 手柄，拖动过程中均保持既有的 RAF 渲染与 Zero-Black 防黑屏机制。

**Non-Goals:**
- 不改变工作台底层引擎 `DualVideoSyncEngine` 的会合与阻尼算法。
- 不影响离线导出（VideoExporter）逻辑。

## Decisions

### 1. 寻道意图双通道分流架构（Differential Seeking Intent）

架构决策详见：[AgDR-0026 导出预览时间轴与AB区间交互差异化状态机](../../docs/decisions/AgDR-0026-导出预览时间轴与AB区间交互差异化状态机.md)。

- **`seekPreview` 签名增强**：
  ```ts
  const seekPreview = useCallback(
    (targetTau: number, onComplete?: () => void, keepPlaying?: boolean) => {
      const clampedTau = Math.max(intersectStart, Math.min(intersectEnd, targetTau));
      setPreviewTau(clampedTau);
      previewTauRef.current = clampedTau;
      if (initialSoundSource === 'metronome') {
        metronomeRef.current.reset(clampedTau, timeline.effectiveBpm);
      }
      // 若未显式传入 keepPlaying，则继承当前引擎或组件的播放意图
      const effectiveKeepPlaying = typeof keepPlaying === 'boolean'
        ? keepPlaying
        : (isPreviewPlaying || engineRef.current?.getIsPlaying());

      engineRef.current?.seekToTau(
        clampedTau,
        () => {
          drawPreviewFrame();
          onComplete?.();
        },
        effectiveKeepPlaying
      );
    },
    [intersectStart, intersectEnd, initialSoundSource, timeline.effectiveBpm, drawPreviewFrame, isPreviewPlaying]
  );
  ```

### 2. 交互入口差异化绑定

- **通道一：左侧预览时间滑块（Timeline Slider）**：
  ```tsx
  <input
    type="range"
    className="slider"
    min={clipStart}
    max={clipEnd}
    step="0.01"
    value={previewTau}
    onChange={(e) => {
      // 保持当前播放意图：若正在播放则跳转后继续播放，若暂停则静态定位
      seekPreview(parseFloat(e.target.value));
    }}
  />
  ```
- **通道二：右侧区间起止点（A/B 手柄、轨道点击、快捷设点）**：
  - 手柄按下 `handlePointerDown('A' | 'B')`：调用 `ensureStopped()`，并调用 `seekPreview(targetTau, undefined, false)`；
  - 轨道点击 `handleTrackClick`：调用 `ensureStopped()`，并调用 `seekPreview(val, undefined, false)`；
  - 手柄移动 `handlePointerMove`：`throttledSeek(val, false)`，显式传入 `false`；
  - 手柄抬起 `handlePointerUp`：`seekPreview(finalTau, undefined, false)`，显式传入 `false`；
  - 快捷设点（「设当前为 A」/「设当前为 B」）：调用 `ensureStopped()`，并调用 `seekPreview(val, undefined, false)`。

## Risks / Trade-offs

- **[Risk]** 在播放状态下连续拖动左侧进度条，连续触发 `playFrom` 是否会导致音频爆音或卡顿？
  - **Mitigation**：`DualVideoSyncEngine` 内部已有会合起播屏障（Rendezvous Barrier）与 epoch 管理，前一个寻道任务会被新 epoch 正确取消；节拍器在跳转时重置锚点锁相，保证节拍器发声连续不突变。
