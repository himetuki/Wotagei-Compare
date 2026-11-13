# Spec Delta

## ADDED Requirements

### Requirement: 时间标定视图锚点帧即时呈现
用户在进入「CH1时间」或「CH2时间」视图时，系统 MUST 在视频元数据就绪后自动将视频定位并渲染至当前对拍锚点时间戳（受有效截取区间 $[trimStart, trimEnd]$ 约束），严禁因组件挂载初期媒体元素尚处于未就绪状态（`readyState = 0`）导致初始寻道被内核静默丢弃、进而使用户看到纯黑等待画面。

#### Scenario: 老旧 WebView 初次进入时间标定页即见锚点画面帧
- **WHEN** 用户在运行 Chrome 74 级别 WebView 的 Android 10 设备上进入「CH1时间」或「CH2时间」视图，且此时尚未点击「播放」
- **THEN** 视频元素在元数据就绪后立即同步定位至当前 `anchorTime` 对应时刻并完成画面帧绘制，监看区直接呈现真实视频帧而非纯黑画面
