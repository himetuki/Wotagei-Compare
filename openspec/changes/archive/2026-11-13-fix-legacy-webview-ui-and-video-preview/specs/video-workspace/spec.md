# Spec Delta

## ADDED Requirements

### Requirement: 老旧内核 CSS 安全区特性查询隔离回退
系统在全界面容器（包括顶部导航、工作区舞台、底部控制栏、导入舞台、空间标定舞台、对比台画布容器及导出网格）中应用包含 CSS 自定义变量的安全区边距函数（如 `max(..., var(--safe-*))`）时，MUST 将其包裹在 CSS `@supports (padding: max(0px))` 特性查询内，并在特性查询之外保留固定像素静态边距声明；严禁在无特性查询隔离的情况下让老旧 Chromium（`< 79`）内核执行含 `var()` 的 `max()` 表达式而触发 IACVT 归零。

#### Scenario: Chrome 74 级别 WebView 渲染全应用边距
- **WHEN** 应用在内置 Chrome 74 级别 System WebView 的 Android 10 设备上冷启动并依次切换至「导入」「CH1空间」「CH1时间」「对比台」「导出片段」页面
- **THEN** 所有主容器与操作栏的左右及底部计算内边距均保持预设固定像素回退值（非 `0px`），卡片、时间轴与操作按钮不紧贴屏幕边缘或系统导航栏

#### Scenario: 现代 Chrome 79+ 内核保留安全区避让叠加
- **WHEN** 应用在支持 `max()` 与 `env(safe-area-inset-*)` 的现代移动设备或模拟器上横屏运行
- **THEN** `@supports (padding: max(0px))` 规则块正常生效，各容器在静态最小边距与系统安全区宽度之间取较大值完成避让
