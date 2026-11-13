# Spec Delta

## ADDED Requirements

### Requirement: 标定舞台尺寸监听降级与指针捕获防断触
空间标定视图监听容器尺寸变化时 MUST 在缺少 `ResizeObserver` 的老旧内核下自动降级为 `window.resize` 事件监听而不抛出异常；三线标尺拖拽与对比台叠加视口手势 MUST 在指针按下时调用 `setPointerCapture` 并在抬起或取消时清理指针状态，防止移动端快速滑动断触或双指滑出边界后残留幽灵触点。

#### Scenario: 缺少 ResizeObserver 的老旧环境正常挂载空间标定
- **WHEN** 运行环境全局不存在 `ResizeObserver` 时进入「CH1空间」或「CH2空间」
- **THEN** 视图正常计算内接视频尺寸并响应窗口大小变化，不抛出 `ReferenceError`

#### Scenario: 移动端快速拖拽三线或叠加缩放不断触不残留
- **WHEN** 用户在触摸屏或模拟触控环境下拖拽三线标尺滑出线体区域，或双指缩放叠加画面后松手
- **THEN** 拖拽持续跟随直至抬手释放，叠加指针记录在 `pointerup` 或 `pointercancel` 后彻底清零
