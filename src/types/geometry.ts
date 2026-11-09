/**
 * 几何标定与空间对齐类型契约
 */

/** 三线正交：两横一竖模型 (0~1 归一化坐标) */
export interface TwoHorizontalOneVertical {
  yA: number; // 上横线 (头顶)
  yB: number; // 下横线 (脚底/裆部)
  x0: number; // 竖线 (身体中轴线)
}

/** 三线正交：两竖一横模型 (0~1 归一化坐标) */
export interface TwoVerticalOneHorizontal {
  xA: number; // 左竖线 (左脚外侧)
  xB: number; // 右竖线 (右脚外侧)
  y0: number; // 横线 (地面水平线)
}

/** 三线正交模型类型 */
export type TriLineModelType = 'two-horizontal-one-vertical' | 'two-vertical-one-horizontal';

/** 单视频三线正交标定参数 */
export interface TriLineCalibration {
  model: TriLineModelType;
  twoHOneV: TwoHorizontalOneVertical;
  twoVOneH: TwoVerticalOneHorizontal;
}

/** 单个视频的空间几何配置 */
export interface VideoGeometryConfig {
  mirror: boolean; // 是否水平镜像翻转
  triLine: TriLineCalibration; // 三线正交锚定标定参数
}

/** 对比播放模式 */
export type ComparisonMode = 'split-screen' | 'overlay';

/** 播放视口手势平移与缩放 */
export interface ViewportTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}
