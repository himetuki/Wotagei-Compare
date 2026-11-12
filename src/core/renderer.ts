/**
 * 纯函数单画布同台渲染器
 * 100% 共用于实时播放工作台与离线 MP4 视频导出，确保像素级绝对一致
 */

import type {
  ComparisonMode,
  TriLineCalibration,
  ViewportTransform,
} from '../types/geometry.ts';
import {
  calculateFitTransform,
  calculateTriLineSplitScreenPlacement,
} from './geometry.ts';
import type { AlignmentTransform } from './geometry.ts';

export interface ComparisonRenderState {
  mode: ComparisonMode;
  // 视频 1 源与状态
  video1: CanvasImageSource | null;
  video1Size: { width: number; height: number };
  video1Active: boolean; // 是否处于该视频有效时间范围内
  mirror1: boolean;
  triLine1?: TriLineCalibration;
  // 视频 2 源与状态
  video2: CanvasImageSource | null;
  video2Size: { width: number; height: number };
  video2Active: boolean;
  mirror2: boolean;
  triLine2?: TriLineCalibration;
  // 半透明叠加参数
  triLineTransform?: AlignmentTransform;
  relativeOpacity: number; // -1 ~ 1
  // 视口平移缩放 (仅叠加模式支持自由漫游)
  viewport: ViewportTransform;
  // 画布目标输出尺寸
  canvasWidth: number;
  canvasHeight: number;
}

/**
 * 纯函数渲染一帧画面至 Canvas 2D Context
 */
export function renderComparisonFrame(
  ctx: CanvasRenderingContext2D,
  state: ComparisonRenderState
): void {
  const { canvasWidth, canvasHeight } = state;

  // 1. 底层纯黑清屏
  ctx.save();
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  if (state.mode === 'split-screen') {
    // 2. 左右分区模式渲染
    renderSplitScreen(ctx, state);
  } else {
    // 3. 半透明叠加模式渲染
    renderOverlay(ctx, state);
  }

  ctx.restore();
}

/**
 * 左右分区模式渲染实现（基于三线正交锚定模型）
 */
function renderSplitScreen(
  ctx: CanvasRenderingContext2D,
  state: ComparisonRenderState
): void {
  const { canvasWidth, canvasHeight } = state;
  const halfWidth = canvasWidth / 2;

  // 默认三线兜底
  const defaultTriLine: TriLineCalibration = {
    model: 'two-horizontal-one-vertical',
    twoHOneV: { yA: 0.28, yB: 0.82, x0: 0.5 },
    twoVOneH: { xA: 0.4, xB: 0.6, y0: 0.85 },
  };

  // --- 左半屏：视频 1 ---
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, halfWidth, canvasHeight);
  ctx.clip();

  if (state.video1 && state.video1Active && state.video1Size.width > 0) {
    const calib1 = state.triLine1 || defaultTriLine;
    const fit1 = calculateTriLineSplitScreenPlacement(
      calib1,
      state.video1Size,
      { width: halfWidth, height: canvasHeight },
      'left'
    );

    ctx.save();
    if (state.mirror1) {
      ctx.translate(halfWidth, 0);
      ctx.scale(-1, 1);
    }

    // 若视频原宽度较窄未撑满半屏，底层先以 Cover 铺满柔和背景消除硬黑边
    if (fit1.targetWidth < halfWidth) {
      const coverScale = Math.max(halfWidth / state.video1Size.width, canvasHeight / state.video1Size.height);
      const bgW = state.video1Size.width * coverScale;
      const bgH = state.video1Size.height * coverScale;
      const bgX = (halfWidth - bgW) / 2;
      const bgY = (canvasHeight - bgH) / 2;
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.drawImage(state.video1, 0, 0, state.video1Size.width, state.video1Size.height, bgX, bgY, bgW, bgH);
      ctx.restore();
    }

    // 绘制整幅视频画面，以三线对齐中轴与地面，上方留出 45%+ 高空容纳挥棒大光弧
    ctx.drawImage(
      state.video1,
      0,
      0,
      state.video1Size.width,
      state.video1Size.height,
      fit1.dx,
      fit1.dy,
      fit1.targetWidth,
      fit1.targetHeight
    );
    ctx.restore();
  }
  ctx.restore();

  // --- 右半屏：视频 2 ---
  ctx.save();
  ctx.beginPath();
  ctx.rect(halfWidth, 0, halfWidth, canvasHeight);
  ctx.clip();
  ctx.translate(halfWidth, 0);

  if (state.video2 && state.video2Active && state.video2Size.width > 0) {
    const calib2 = state.triLine2 || defaultTriLine;
    const fit2 = calculateTriLineSplitScreenPlacement(
      calib2,
      state.video2Size,
      { width: halfWidth, height: canvasHeight },
      'right'
    );

    ctx.save();
    if (state.mirror2) {
      ctx.translate(halfWidth, 0);
      ctx.scale(-1, 1);
    }

    // 若视频原宽度较窄未撑满半屏，底层先以 Cover 铺满柔和背景消除硬黑边
    if (fit2.targetWidth < halfWidth) {
      const coverScale = Math.max(halfWidth / state.video2Size.width, canvasHeight / state.video2Size.height);
      const bgW = state.video2Size.width * coverScale;
      const bgH = state.video2Size.height * coverScale;
      const bgX = (halfWidth - bgW) / 2;
      const bgY = (canvasHeight - bgH) / 2;
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.drawImage(state.video2, 0, 0, state.video2Size.width, state.video2Size.height, bgX, bgY, bgW, bgH);
      ctx.restore();
    }

    // 绘制整幅视频画面，以三线对齐中轴与地面，上方留出 45%+ 高空容纳挥棒大光弧
    ctx.drawImage(
      state.video2,
      0,
      0,
      state.video2Size.width,
      state.video2Size.height,
      fit2.dx,
      fit2.dy,
      fit2.targetWidth,
      fit2.targetHeight
    );
    ctx.restore();
  }
  ctx.restore();

  // 绘制左右半屏中间分界线
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(halfWidth, 0);
  ctx.lineTo(halfWidth, canvasHeight);
  ctx.stroke();
  ctx.restore();
}

/**
 * 半透明叠加模式渲染实现
 */
function renderOverlay(
  ctx: CanvasRenderingContext2D,
  state: ComparisonRenderState
): void {
  const { canvasWidth, canvasHeight, triLineTransform, viewport, relativeOpacity } = state;

  if (!triLineTransform) {
    return;
  }

  // 计算并集居中基础变换
  const fit = calculateFitTransform(triLineTransform.unionBounds, {
    width: canvasWidth,
    height: canvasHeight,
  });

  ctx.save();

  // 应用用户手势缩放与平移 (围绕视口屏幕中心缩放)
  ctx.translate(canvasWidth / 2, canvasHeight / 2);
  ctx.scale(viewport.scale, viewport.scale);
  ctx.translate(-canvasWidth / 2 + viewport.offsetX, -canvasHeight / 2 + viewport.offsetY);

  // 应用基础并集画幅居中变换
  ctx.translate(fit.offsetX, fit.offsetY);
  ctx.scale(fit.scale, fit.scale);

  // 1. 绘制底层视频 1
  if (state.video1 && state.video1Active && state.video1Size.width > 0) {
    ctx.save();
    if (state.mirror1) {
      ctx.translate(state.video1Size.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(state.video1, 0, 0, state.video1Size.width, state.video1Size.height);
    ctx.restore();
  }

  // 2. 绘制顶层视频 2 (三线对齐变换 + 等亮线性透明度插值)
  // 当 relativeOpacity p in [-1, 1] 时，顶层 alpha 为 (1 + p) / 2
  // p = -1 时 alpha = 0 (全为视频1)
  // p = 0 时 alpha = 0.5 (等亮 50%:50% 混合)
  // p = 1 时 alpha = 1.0 (全为视频2)
  const topAlpha = Math.max(0, Math.min(1, (1 + relativeOpacity) / 2));

  if (state.video2 && state.video2Active && state.video2Size.width > 0 && topAlpha > 0) {
    ctx.save();
    ctx.globalAlpha = topAlpha;

    // 对齐变换：平移至锚点重合，等比缩放
    ctx.translate(triLineTransform.translateX, triLineTransform.translateY);
    ctx.scale(triLineTransform.scale, triLineTransform.scale);

    if (state.mirror2) {
      ctx.translate(state.video2Size.width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(state.video2, 0, 0, state.video2Size.width, state.video2Size.height);
    ctx.restore();
  }

  ctx.restore();
}
