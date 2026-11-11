# Design

## Context

在空间标定步骤（`CH1空间` 与 `CH2空间`）中，用户可通过顶栏右上角下拉菜单选择「两横一竖」或「两竖一横」三线正交模型。此前该选择作为独立字段保存在各自视频的 `geometry.triLine.model` 中，导致用户在一处切换后，切换到另一通道时并未保持最新选择。

相关架构决策记录见：[AgDR-0012](../../docs/decisions/AgDR-0012-三线正交空间标定模型双通道全局同步.md)。

## Goals / Non-Goals

**Goals:**
- **全局共享与同步**：在应用层提升 `triLineModel` 为全局状态，CH1 与 CH2 空间标定页面共用同一控件与变量。
- **即时原子更新**：在任意通道切换模型时，同时将 `video1` 与 `video2` 的几何配置中的 `triLine.model` 更新为选定模型。
- **无缝视图响应**：确保 `GeometryStep` 组件能够响应共享模型的实时变更，无需手动刷新页面。

**Non-Goals:**
- 不改变两横一竖与两竖一横底层的三线几何标定算法与坐标存储结构。
- 两通道的水平镜像翻转开关依然保持彼此独立。

## Decisions

### 1. 状态提升至应用顶层（App Shell State Lifting）

- 在 `src/App.tsx` 中定义顶层状态：
  `const [triLineModel, setTriLineModel] = useState<TriLineModelType>('two-horizontal-one-vertical');`
- 初始化或导入视频时：
  当用户导入两个视频时，视频初始 `triLine.model` 均统一采用当前的 `triLineModel`。
- 顶栏下拉菜单统一绑定：
  无论当前处于 `geometry-video1` 还是 `geometry-video2`，顶栏的 `<select>` 下拉菜单均读取 `triLineModel`，并在 `onChange` 时调用统一的同步函数：
  ```tsx
  const handleModelChange = (model: TriLineModelType) => {
    setTriLineModel(model);
    setVideo1((prev) =>
      prev ? { ...prev, geometry: { ...prev.geometry, triLine: { ...prev.geometry.triLine, model } } } : null
    );
    setVideo2((prev) =>
      prev ? { ...prev, geometry: { ...prev.geometry, triLine: { ...prev.geometry.triLine, model } } } : null
    );
  };
  ```

### 2. 组件响应与解耦

- `GeometryStep.tsx` 原已通过 `useEffect(() => { setTriLine(videoItem.geometry.triLine); }, [videoItem.geometry])` 监听外部几何配置；
- 当 `handleModelChange` 触发时，`video1.geometry` 或 `video2.geometry` 引用更新，当前渲染的 `GeometryStep` 会即时重绘并切换至新模型的标定线；当用户切换到另一通道时，另一通道也已预先同步为该模型。

## Risks / Trade-offs

- **[Risk]** 当用户切换模型时，未校准过的另一模型坐标可能位于初始预设位置。
  - **Mitigation**: 现有数据结构中 `twoHOneV` 与 `twoVOneH` 坐标本就同时并存且互相隔离，切换模型仅改变激活的模型类型，不会覆盖或破坏另一模型已保存的具体坐标数据。
