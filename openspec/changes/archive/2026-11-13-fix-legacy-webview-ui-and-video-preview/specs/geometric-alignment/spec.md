# Spec Delta

## ADDED Requirements

### Requirement: 空间标定视图首帧即时呈现
用户在导入双路视频后进入「CH1空间」或「CH2空间」进行三线正交空间标定时，系统 MUST 在视频元数据加载就绪后主动触发首帧解码与画面呈现，即使在 Android 10 等老旧 WebView 内核下且用户尚未点击「播放」按钮，视频区域 MUST 直接显示清晰的视频首帧画面，严禁残留系统默认的灰色圆圈播放占位图标遮挡标定画面。

#### Scenario: 老旧 WebView 初次进入空间标定页即见清晰首帧
- **WHEN** 用户在运行 Chrome 74 级别 WebView 的 Android 10 设备上完成视频导入并进入「CH1空间」或「CH2空间」
- **THEN** 视频元素在元数据就绪后自动完成首帧渲染，画幅内显示真实人物与场景首帧，不出现 Android WebView 默认的灰色播放按钮占位图，用户可直接拖拽三线标尺完成对齐
