# Spec Delta

## ADDED Requirements

### Requirement: 跨代兼容 Flex 间距与 16:9 窄横屏布局零溢出
系统在全部 Flexbox 容器中 MUST 采用不依赖 Chrome 84+ Flexbox `gap` 属性的间距实现（统一通过子元素邻接外边距控制横纵向间距），确保 Chrome 70~83 内核中所有按钮、图标与徽章间距清晰不粘连；在逻辑宽高 `640×360` 叠加 `48px` 侧边三键导航安全区的经典 16:9 窄横屏下，全部步骤的控件 MUST 完整位于安全视口内，严禁横向或纵向溢出截断。

#### Scenario: Chrome 74 下全应用 Flex 按钮与标签间距有效
- **WHEN** 应用在 Chrome 74 级别 Android 10 WebView 上渲染导入页、标定页、对比台及导出页
- **THEN** 顶部步骤导航、通道卡片徽章、按钮内部图标与文本以及底栏控件组之间均具备非零像素间距，不发生 0px 贴连

#### Scenario: 640x360 窄横屏叠加三键导航全界面零溢出
- **WHEN** 应用在 `640×360` 逻辑视口且右侧存在 `48px` 安全区的设备横屏依次切换各页面（含叠加模式）
- **THEN** 页面不出现横向或纵向滚动截断，所有按钮与控件右边界均不越过可用安全区右边界

### Requirement: Android 原生系统栏纯黑锁定与存储文件兼容
原生 Android 主题配置 MUST 显式将 `statusBarColor` 与 `navigationBarColor` 锁定为纯黑，避免老版本 ROM 浅色主题在系统导航栏显示浅色白条；`AndroidManifest.xml` 中 `WRITE_EXTERNAL_STORAGE` 权限 `maxSdkVersion` MUST 覆盖至 API 29（Android 10），配合 `requestLegacyExternalStorage` 保障 Android 6~10 原生导出文件写入成功（无权限时安全回退应用私有数据目录）；视频导入文件输入框的 `accept` 属性 SHALL 使用通用单类型 `video/*`，兼容老旧手机系统文件选择器。

#### Scenario: 老版本 Android 原生主题导航栏与存储权限检查
- **WHEN** 查看 Android 主题样式及 Manifest 配置并在 Android 10 设备导出视频
- **THEN** 状态栏与导航栏背景配置为纯黑，`WRITE_EXTERNAL_STORAGE` 覆盖至 `maxSdkVersion="29"`，导入通道选择框使用 `accept="video/*"`，原生导出保存零权限异常
