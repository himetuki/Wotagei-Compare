# Spec Delta

## MODIFIED Requirements

### Requirement: 移动端运行时语法兼容与首屏致命异常自诊断展示
构建打包产物 MUST 兼容现代主流及稍旧内核（Chrome 70+）的 Android System WebView，不仅在构建层支持 ES2018 语法标准，应用源码在标准库调用上 MUST 严格遵守 ES2018 运行时边界（严禁未经容灾兜底直接调用 Chrome 76+ 才提供的 ES2019–ES2022 标准库方法如 `Promise.allSettled`，且类型检查器 SHALL 在编译期拦截此类高版本 API 调用）；系统在 HTML 入口层 MUST 挂载全局异常与 Promise 拒绝监听器，当脚本加载解析失败或初始化过程抛出致命未捕获异常时，系统 SHALL 立即在屏幕上呈现高对比度的可视化错误诊断面板，显示异常详情与调用堆栈，严禁呈现没有任何反馈的纯黑卡死。

#### Scenario: 较旧内核 WebView 启动正常挂载应用
- **WHEN** 用户在运行 Chrome 70+ / Android 10 级别内核的移动设备上启动应用
- **THEN** 静态资源正常解析执行，React 根节点顺利挂载并进入双路视频导入首屏

#### Scenario: 低于 Chrome 76 内核选完本地视频回跳应用不崩溃
- **WHEN** 用户在坚果 R2（Android 10，系统 WebView 低于 Chrome 76、缺少 `Promise.allSettled` 与 `file.arrayBuffer`）上点击「CH1」或「CH2」选取本地 MP4 视频并返回应用
- **THEN** 应用顺利完成乐观挂载、视频元数据探测与音频解析兜底，不抛出 `TypeError: Promise.allSettled is not a function` 或弹出崩溃诊断面板，正常进入就绪状态

#### Scenario: 编译期拦截高版本标准库 API 调用
- **WHEN** 开发者在前端源码中误引入 ES2019 及以上标准库方法（如 `Promise.allSettled`、`Object.fromEntries`、`String.prototype.replaceAll`）并执行类型检查与构建命令
- **THEN** `tsc` 编译检查立即报错阻断构建，不依赖运行时真机才暴露缺陷

#### Scenario: 启动阶段发生未捕获致命错误触发兜底展示
- **WHEN** 应用启动时静态资源加载超时或第三方环境缺少必要 API 导致致命脚本异常
- **THEN** 页面自动呈现包含错误标题、具体信息和堆栈的深底红字诊断面板，方便用户截图排查定位
