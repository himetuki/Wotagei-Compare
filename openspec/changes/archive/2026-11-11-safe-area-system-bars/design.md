# Design: safe-area-system-bars

## Context

见 [proposal.md](./proposal.md) 的背景说明。
当前应用强制在移动端横屏运行，且在 `index.html` 中设置了 `viewport-fit=cover`。但全局样式 `src/index.css` 及组件结构直接使用绝对像素或 `100vw/100vh` 贴边排布，导致在开启常驻状态栏或使用 Android 经典三键导航（金刚键）的设备上，边缘的全局步骤切换按钮、下一步按钮、BPM 徽章、底部时间轴与操作栏直接被系统界面遮挡并导致严重误触。

## Goals / Non-Goals

**Goals:**
- 在全局 CSS 根节点抽象一套语义明确、自适应的安全区变量（`--safe-top`, `--safe-right`, `--safe-bottom`, `--safe-left`），无缝兼容 `env(safe-area-inset-*)` 与桌面降级。
- 采用「底色铺满物理屏 + 交互内容限制在安全区」的双层设计。
- 确保顶部全局导航栏（`.top-nav`）、通用工具栏（`.toolbar-row`）、底部控制栏（`.bottom-bar`）、导入面板（`.import-stage`）、标定舞台（`.calib-stage`）、对比播放台（`Workbench`）以及导出面板（`.export-grid`）中的所有按钮与状态信息避开系统状态栏与侧边金刚键。
- 标定线条拖拽热区与交互锚点严禁贴入金刚键所在边沿，确保触控可靠。

**Non-Goals:**
- 不强制通过原生全屏沉浸代码隐藏用户的状态栏或金刚键（尊重用户系统设定）。
- 不引入重型第三方响应式框架或布局库，保持零外部依赖。
- 不修改视频播放底层 Canvas 渲染算法与音频对齐逻辑。

## Decisions

### 决策 1：基于 CSS `env(safe-area-inset-*)` 变量构建全局避让体系
- **决策详情**：在 `src/index.css` 的 `:root` 声明：
  ```css
  :root {
    --safe-top: env(safe-area-inset-top, 0px);
    --safe-right: env(safe-area-inset-right, 0px);
    --safe-bottom: env(safe-area-inset-bottom, 0px);
    --safe-left: env(safe-area-inset-left, 0px);
  }
  ```
- **架构决策记录**：详细权衡与方案对比见 [AgDR-0007: 系统状态栏与虚拟金刚键安全区避让布局](../../docs/decisions/AgDR-0007-系统状态栏与虚拟金刚键安全区避让布局.md)。
- **被否决的方案**：
  - *方案 A（强制沉浸式全屏隐藏）*：剥夺用户操作习惯，且边缘误触呼出栏依然会产生遮挡。
  - *方案 B（硬编码固定像素内缩）*：无法适配不同机型金刚键尺寸，且在桌面与全面屏手势模式下浪费可用面积。

### 决策 2：顶部导航栏与通用工具栏的弹性高度与安全边距
- **结构调整**：
  - `.top-nav` 高度采用 `calc(40px + var(--safe-top))`，顶部内边距 `padding-top: var(--safe-top)`。
  - 左右内边距采用 `padding-left: max(12px, var(--safe-left))` 与 `padding-right: max(12px, var(--safe-right))`。
  - 这保证了右侧的「下一步」按钮和 BPM 状态徽章完全从金刚键下方挪出，进入安全区，有效高度保持标准的 40px。
- **通用工具栏 `.toolbar-row`**：左右内边距同样挂载 `max(12px, var(--safe-left))` 与 `max(12px, var(--safe-right))`。

### 决策 3：底部控制栏与时间轴的安全抬升
- **结构调整**：
  - `.bottom-bar` 底部内边距采用 `padding-bottom: max(6px, var(--safe-bottom))`，左右内边距采用 `max(12px, var(--safe-left))` 与 `max(12px, var(--safe-right))`。
  - 避免底部时间轴滑块、播放按钮及微调按钮被横屏底部的虚拟键或手势条阻挡。

### 决策 4：标定舞台与弹窗面板的安全视口包络
- **标定舞台 `.calib-stage`**：
  - 在计算可拖拽的三线（地平线、中心对称轴、身高线）范围时，结合安全边距，确保拖动热区不超出安全视口。
- **导出面板 `.export-grid`**：
  - 内边距扩展为 `padding: 10px max(14px, var(--safe-right)) max(10px, var(--safe-bottom)) max(14px, var(--safe-left))`，确保导出参数面板与进度条完整置于视线与点击安全区内。

## Risks / Trade-offs

- **[Risk] 部分老旧或冷门 Android WebView 对 `env(safe-area-inset-*)` 返回 0**
  → **Mitigation**：所有安全边距统一采用 `max(DEFAULT_PX, var(--safe-*))` 进行防御，保证即使在环境变量无效的极特殊环境下，依然保底拥有 12px~14px 的物理呼吸空间。
- **[Risk] 横屏旋转 180 度导致金刚键从右侧变到左侧**
  → **Mitigation**：左右两侧均采用 `max(12px, var(--safe-left))` 与 `max(12px, var(--safe-right))` 对称或动态自适应处理，无论金刚键在左侧还是右侧均能精准避让。

## Migration Plan

1. 在 `src/index.css` 顶部增加全局安全区 CSS 变量与安全内边距工具类。
2. 重构 `.top-nav`、`.toolbar-row`、`.bottom-bar`、`.import-stage`、`.export-grid` 的尺寸与内边距。
3. 检查各步骤组件（`GeometryStep`, `AudioStep`, `Workbench`, `ExportPage`）是否有写死靠边的浮层或绝对定位元素，补充安全区偏移。
4. 使用 Chrome DevTools 移动端传感器模拟及 Android 真机验证横屏常驻状态栏与三键导航模式下的避让表现。
