# Design

## Context

详见 [proposal.md](./proposal.md) 中的实测问题描述。
目前项目已完成对 ES2018 语法、ES2018 标准库（`AgDR-0027`）及 `shortEdges` 打孔屏原生背景（`AgDR-0023`）的兼容改造，但在搭载 **WebView `74.0.3729.185`** 的 Android 10 虚拟机全流程实测中，仍暴露出 CSS 变量延迟解析导致的 IACVT 边距归零以及未播放状态下 `<video>` 首帧/锚点帧未解码绘制的问题。

## Goals / Non-Goals

**Goals:**
- 修复全应用 6 个页面在 Chrome < 79 内核下左右与底部内边距被重置为 `0px` 的缺陷，同时不破坏 Chrome 79+ 现代手机的安全区避让。
- 让「空间标定」与「时间标定」页在进入后无需用户手动点播放即可立即呈现清晰的视频首帧或对拍锚点帧。
- 将可复现的 Android 10（API 29 / Chrome 74）自动化巡检流程沉淀为仓库内 `scripts/` 脚本，便于构建产物黑盒回归。

**Non-Goals:**
- 不在 Chrome 74 上强行兼容 WebCodecs 离线导出（`ExportPage` 已明确提示需 Chrome 94+）。
- 不修改现有几何标定数学模型、BPM 检测算法与双视频锁相环同步引擎。
- 不引入 PostCSS 插件或运行时 CSS polyfill 库。

## Decisions

### 决策 1：使用 `@supports (padding: max(0px))` 隔离全部含 `var()` 的 `max()` 安全区声明
- 在 `src/index.css` 中，所有容器类（`.top-nav`、`.toolbar-row`、`.bottom-bar`、`.import-stage`、`.calib-stage`、`.export-grid` 及新增 `.workbench-stage`）在主选择器内只写固定像素静态 `padding`。
- 在文件末尾统一通过 `@supports (padding: max(0px))` 块覆盖写入 `max(..., var(--safe-*))`。
- 移除 `src/components/Workbench.tsx` 画布外层容器上的行内 `paddingLeft: 'max(8px, var(--safe-left))'` 与 `paddingRight: 'max(8px, var(--safe-right))'`，改用 `className="workbench-stage"`。
- 详见架构决策记录：[AgDR-0028-CSS安全区特性查询回退与老旧WebView首帧预寻道.md](../../../docs/decisions/AgDR-0028-CSS安全区特性查询回退与老旧WebView首帧预寻道.md)。

### 决策 2：空间与时间标定 `<video>` 元数据就绪自动预寻道
- **`GeometryStep.tsx`**：为 `<video>` 增加 `preload="auto"`；在监听 `loadedmetadata`（若已就绪 `readyState >= 1` 则立即执行）时，若 `video.currentTime === 0`，安全写入轻微非零首帧时间点 `Math.min(0.01, (video.duration || 1) / 2)`，迫使老旧 Chromium 视频管线解码并绘制真实首帧，消除默认灰色播放占位图标。
- **`AudioStep.tsx`**：为 `<video>` 增加 `preload="auto"`；当 `loadedmetadata` 触发（或组件切换通道时 `video.readyState >= 1`），立即执行 `video.currentTime = targetAnchor`，确保进入时间标定页即显示当前 `anchorTime` 对应画面帧。

### 决策 3：固化 Android 10 AVD 一键黑盒巡检脚本
- 新增 `scripts/inspect-android10.mjs`，通过 `adb` 安装/拉起 `com.wotagei.compare/.MainActivity`，自动检测 `@webview_devtools_remote_*` 并连接 CDP：
  - 验证初始页各容器计算 `padding` 非 `0px`、无 `#wotagei-crash-overlay` 与未捕获异常；
  - 自动注入两段测试 MP4 完成导入、遍历全部向导步骤并校验视频/画布正常渲染与双视频播放推进；
  - 抓取每步截图至 `/tmp/` 供人工或 Agent 核查。

## Risks / Trade-offs

- **[Risk] 部分 Android WebView 对 `preload="auto"` 或极小首帧 seek (`0.01s`) 仍延迟触发首帧绘制** → 若仅靠 `0.01s` 在某些高 GOP 编码视频上仍短暂黑帧，后续可补充监听 `loadeddata` 并保持 `requestAnimationFrame` 重绘；本次对 30fps 测试视频先采用标准 `loadedmetadata` 轻量寻道并在 `legacy_android10` 实测验证。
- **[Trade-off] Chrome < 79 设备无法享受 `max()` 叠加刘海安全区** → 这类老机型（如 Android 10 出厂原生内核）若遇到极端侧边打孔，仅获得固定静态 `12px`/`20px` 边距，但不影响 `shortEdges` 纯黑背景防白边，且比当前全屏塌陷为 `0px` 更安全可控。
