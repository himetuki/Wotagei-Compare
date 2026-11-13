---
id: AgDR-0028
date: 2026-11-13
status: executed
---

# CSS 安全区特性查询隔离回退与老旧 WebView 视频首帧预寻道

> 在 Android 10 模拟器（WebView `74.0.3729.185`）实测出现全界面 `max(..., var(--safe-*))` 内边距全部塌陷为 `0px`、空间标定页显示系统灰色大播放占位图以及时间标定页初始全黑的处境下，面对直接删除 `max()` 会破坏现代全面屏安全区避让、引入 PostCSS 插件增加构建复杂度的顾虑，我决定用原生 CSS `@supports (padding: max(0px))` 隔离所有含 `var()` 的 `max()` 安全区声明（并把 `Workbench.tsx` 行内 `max()` 迁移至 CSS 类），同时在 `GeometryStep` 与 `AudioStep` 的 `loadedmetadata` / `readyState >= 1` 阶段显式预加载并寻道首帧与锚点帧，以达成 Chrome 74 下边距零塌陷与进入标定页即见真实画面的目标，并接受在不支持 `max()` 的极旧设备上使用固定最小像素安全边距的代价。

## 考虑过的方案

| 方案 | 好处 | 代价 |
| --- | --- | --- |
| 方案 A：彻底删除所有 `max(..., var(--safe-*))`，全部改回静态像素 `padding` | 所有老旧内核都不会塌陷 | 现代全面屏（刘海/金刚键手机）在安全区大于默认边距时会被系统栏遮挡，倒退回 `AgDR-0007` 已解决的布局问题 |
| 方案 B：引入 PostCSS 插件或手写 JS 检测计算安全区像素 | 可动态拼接像素值 | 引入额外编译依赖或运行时 DOM 样式轮询，违背最简工程原则 |
| 方案 C：保留基础固定像素声明，并将含 `var()` 的 `max()` 声明统一包裹在 `@supports (padding: max(0px))` 内（同步将 `Workbench` 行内 `max()` 移入 CSS 类）；`GeometryStep` 与 `AudioStep` 开启 `preload="auto"` 并在元数据就绪后自动寻道至首帧/锚点帧（本方案） | 零第三方依赖增量、从 CSS 规范根源绕开 Chrome 74 IACVT 归零陷阱，同时保留现代设备安全区避让；标定视频不再依赖用户先点播放才解码首帧 | 极少数 Chrome < 79 老设备仅享受预设静态边距；空间标定首帧需多一次极微小的 `0.001s` 寻道触发 |

## 决定

选 **方案 C**。

1. **为什么之前在 `src/index.css` 写的双行回退会失效**：
   CSS Custom Properties 规范规定，任何包含 `var(...)` 的属性值在语法解析阶段均被视为合法，从而覆盖前一行静态回退（如 `padding-right: 20px;`）。到计算值求值阶段，Chrome 74 发现自身不支持 `max()` 数学函数，触发 IACVT（Invalid At Computed-Value Time）并将属性直接重置为初始值 `0px`，而非回退至前一条层叠规则。将其放入 `@supports (padding: max(0px))` 后，Chrome 74 会在规则块级直接跳过该覆盖，严格保留外部静态边距；而 Chrome 79+ 会命中 `@supports` 并生效安全区叠加。
2. **为什么必须同时抽离 `Workbench.tsx` 的行内 `max()`**：
   React 行内 `style` 对象不能编写同名双键，也无法响应 `@supports`，因此将 `paddingLeft` / `paddingRight` 移入 `src/index.css` 的 `.workbench-stage` 类统一受 `@supports` 管理是最简解。
3. **为什么需要元数据就绪后显式寻道**：
   在 Chrome 74 Android WebView 中，`<video>` 在 `currentTime === 0` 且未播放时默认展示系统媒体控件的灰色播放占位图标；而在 `AudioStep` 中 `useEffect` 挂载当下 `readyState === 0`，直接赋值 `video.currentTime = nextAnchor` 会被内核静默忽略导致黑屏。补充 `preload="auto"` 并在 `loadedmetadata`（或 `readyState >= 1`）时分别寻道至 `0.001s` 与 `anchorTime` 可稳定唤醒首帧绘制。

## 代价

- 我们接受：Chrome < 79 设备不叠加 `env(safe-area-inset-*)`，统一以静态 `12px`/`16px`/`20px` 作为保底边距。
- 我们放弃：在 JSX 行内样式对象中直接编写 `max(..., var(...))` 表达式。
- 后面要还的债：无。

## 什么情况下需要重新讨论

- 当最低支持的 Android System WebView 整体提升至 Chrome 79+ 且不再需要兼容 Android 10 出厂原生 WebView 时，可移除 `@supports` 包装块。
