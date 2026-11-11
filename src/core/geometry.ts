/**
 * 纯函数几何变换与坐标计算核心算法
 * 全面统一为三线正交锚定模型（两横一竖 / 两竖一横），废除矩形框
 */

import type {
  TriLineCalibration,
  TriLineModelType,
  TwoHorizontalOneVertical,
  TwoVerticalOneHorizontal,
} from '../types/geometry.ts';

/** 变换矩阵与对齐参数 */
export interface AlignmentTransform {
  scale: number; // 视频 2 相对视频 1 的等比缩放比率
  translateX: number; // 视频 2 在视频 1 坐标系下的 X 轴平移量
  translateY: number; // 视频 2 在视频 1 坐标系下的 Y 轴平移量
  anchor1: { x: number; y: number }; // 视频 1 像素锚点
  anchor2: { x: number; y: number }; // 视频 2 像素锚点
  unionBounds: { // 两视频对齐后的并集包围盒
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
  };
}

/** 视口自适应居中变换 */
export interface FitTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

/** 单个视频在半区视口中的三线投影布局参数 */
export interface TriLineHalfScreenPlacement {
  scale: number;
  dx: number;
  dy: number;
  targetWidth: number;
  targetHeight: number;
}

/**
 * 根据三线正交标定参数计算对齐几何变换矩阵（半透明叠加模式）
 * 视频 1 为参考坐标原点基准，将视频 2 变换并对齐到视频 1 坐标系中
 */
export function calculateTriLineAlignment(
  calib1: TriLineCalibration,
  size1: { width: number; height: number },
  calib2: TriLineCalibration,
  size2: { width: number; height: number }
): AlignmentTransform {
  const model: TriLineModelType = calib1.model;

  let scale = 1;
  let anchor1 = { x: 0, y: 0 };
  let anchor2 = { x: 0, y: 0 };

  if (model === 'two-horizontal-one-vertical') {
    // 模型一：两横一竖（以两横线垂直距离确定特征尺度，中轴竖线与两横线中点为锚点）
    const h1: TwoHorizontalOneVertical = calib1.twoHOneV;
    const h2: TwoHorizontalOneVertical = calib2.twoHOneV;

    const dist1 = Math.abs(h1.yB - h1.yA) * size1.height;
    const dist2 = Math.abs(h2.yB - h2.yA) * size2.height;

    scale = dist2 > 0 ? dist1 / dist2 : 1;

    anchor1 = {
      x: h1.x0 * size1.width,
      y: ((h1.yA + h1.yB) / 2) * size1.height,
    };
    anchor2 = {
      x: h2.x0 * size2.width,
      y: ((h2.yA + h2.yB) / 2) * size2.height,
    };
  } else {
    // 模型二：两竖一横（以两竖线水平距离确定特征尺度，水平横线与两竖线中点为锚点）
    const v1: TwoVerticalOneHorizontal = calib1.twoVOneH;
    const v2: TwoVerticalOneHorizontal = calib2.twoVOneH;

    const dist1 = Math.abs(v1.xB - v1.xA) * size1.width;
    const dist2 = Math.abs(v2.xB - v2.xA) * size2.width;

    scale = dist2 > 0 ? dist1 / dist2 : 1;

    anchor1 = {
      x: ((v1.xA + v1.xB) / 2) * size1.width,
      y: v1.y0 * size1.height,
    };
    anchor2 = {
      x: ((v2.xA + v2.xB) / 2) * size2.width,
      y: v2.y0 * size2.height,
    };
  }

  // 严禁旋转，纯平移量计算：使缩放后的视频 2 锚点重合于视频 1 锚点
  const translateX = anchor1.x - scale * anchor2.x;
  const translateY = anchor1.y - scale * anchor2.y;

  // 计算并集画幅包围盒
  const v2ScaledWidth = size2.width * scale;
  const v2ScaledHeight = size2.height * scale;

  const minX = Math.min(0, translateX);
  const minY = Math.min(0, translateY);
  const maxX = Math.max(size1.width, translateX + v2ScaledWidth);
  const maxY = Math.max(size1.height, translateY + v2ScaledHeight);

  return {
    scale,
    translateX,
    translateY,
    anchor1,
    anchor2,
    unionBounds: {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
    },
  };
}

/**
 * 计算将并集画幅居中适应到指定目标视口（如屏幕画布）的居中变换
 */
export function calculateFitTransform(
  sourceBounds: { minX: number; minY: number; width: number; height: number },
  viewport: { width: number; height: number }
): FitTransform {
  if (sourceBounds.width <= 0 || sourceBounds.height <= 0) {
    return { scale: 1, offsetX: 0, offsetY: 0 };
  }

  const scale = Math.min(
    viewport.width / sourceBounds.width,
    viewport.height / sourceBounds.height
  );

  const displayedWidth = sourceBounds.width * scale;
  const displayedHeight = sourceBounds.height * scale;

  const offsetX = (viewport.width - displayedWidth) / 2 - sourceBounds.minX * scale;
  const offsetY = (viewport.height - displayedHeight) / 2 - sourceBounds.minY * scale;

  return { scale, offsetX, offsetY };
}

/**
 * 左右分区模式下的单视频三线正交投影算法
 * 规则：
 * 1. 提取三线特征尺寸（两横线高度差或两竖线跨度）与基准中轴线、底部脚跟基准线
 * 2. 将特征高度缩放至半区理想尺度（约占半区高度 42%，留出 45%+ 的高空容纳挥棒大光弧）
 * 3. 身体中轴线严格水平对齐至半区中央轴线（x = halfWidth / 2）
 * 4. 脚跟地面线严格垂直沉底对齐（y = halfHeight * 0.85）
 * 5. 整幅原视频无裁切铺展在半区中，超出半区由视口剪裁
 */
export function calculateTriLineSplitScreenPlacement(
  calib: TriLineCalibration,
  videoSize: { width: number; height: number },
  halfViewport: { width: number; height: number }
): TriLineHalfScreenPlacement {
  let featureDist = 1;
  let axisX = 0.5 * videoSize.width;
  let bottomY = 0.85 * videoSize.height;

  if (calib.model === 'two-horizontal-one-vertical') {
    const h = calib.twoHOneV;
    featureDist = Math.max(10, Math.abs(h.yB - h.yA) * videoSize.height);
    axisX = h.x0 * videoSize.width;
    bottomY = Math.max(h.yA, h.yB) * videoSize.height;
  } else {
    const v = calib.twoVOneH;
    featureDist = Math.max(10, Math.abs(v.xB - v.xA) * videoSize.width);
    axisX = ((v.xA + v.xB) / 2) * videoSize.width;
    bottomY = v.y0 * videoSize.height;
  }

  // 目标特征尺寸：在半区高度中占 60%，显著放大人物主体以清晰对比细节，上方预留 25%+ 容纳挥棒光弧
  const targetFeatureH = halfViewport.height * 0.60;
  const scale = targetFeatureH / featureDist;

  // 目标半区对齐位置：中轴居中，脚底沉在 85%
  const targetCenterX = halfViewport.width * 0.5;
  const targetBottomY = halfViewport.height * 0.85;

  const dx = targetCenterX - axisX * scale;
  const dy = targetBottomY - bottomY * scale;

  return {
    scale,
    dx,
    dy,
    targetWidth: videoSize.width * scale,
    targetHeight: videoSize.height * scale,
  };
}
