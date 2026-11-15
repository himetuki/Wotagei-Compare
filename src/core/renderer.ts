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
import type { NativeVideoLayerLayout, NormalizedRect } from './nativeMedia.ts';

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
 * 检查图像源是否就绪可安全绘制至 Canvas
 * 针对 HTMLVideoElement 严格要求 readyState >= 2 (HAVE_CURRENT_DATA)，防止抛出 InvalidStateError 或空黑帧
 */
export function isCanvasSourceReady(
  source: CanvasImageSource | null | undefined,
  size: { width: number; height: number }
): boolean {
  if (!source) return false;
  if (!size || size.width <= 0 || size.height <= 0) return false;
  // 若包含 readyState 属性（HTMLVideoElement），检查其数据缓冲就绪状态
  if (typeof (source as HTMLVideoElement).readyState === 'number') {
    if ((source as HTMLVideoElement).readyState < 2) {
      return false;
    }
  }
  return true;
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

  if (state.video1 && state.video1Active && isCanvasSourceReady(state.video1, state.video1Size)) {
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

    try {
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
    } catch {
      // 容灾捕获：单帧绘制异常时不阻断 Canvas 渲染状态机
    }
    ctx.restore();
  }
  ctx.restore();

  // --- 右半屏：视频 2 ---
  ctx.save();
  ctx.beginPath();
  ctx.rect(halfWidth, 0, halfWidth, canvasHeight);
  ctx.clip();
  ctx.translate(halfWidth, 0);

  if (state.video2 && state.video2Active && isCanvasSourceReady(state.video2, state.video2Size)) {
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

    try {
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
    } catch {
      // 容灾捕获：单帧绘制异常时不阻断 Canvas 渲染状态机
    }
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
  if (state.video1 && state.video1Active && isCanvasSourceReady(state.video1, state.video1Size)) {
    ctx.save();
    if (state.mirror1) {
      ctx.translate(state.video1Size.width, 0);
      ctx.scale(-1, 1);
    }
    try {
      ctx.drawImage(state.video1, 0, 0, state.video1Size.width, state.video1Size.height);
    } catch {
      // 容灾捕获
    }
    ctx.restore();
  }

  // 2. 绘制顶层视频 2 (三线对齐变换 + 等亮线性透明度插值)
  // 当 relativeOpacity p in [-1, 1] 时，顶层 alpha 为 (1 + p) / 2
  // p = -1 时 alpha = 0 (全为视频1)
  // p = 0 时 alpha = 0.5 (等亮 50%:50% 混合)
  // p = 1 时 alpha = 1.0 (全为视频2)
  const topAlpha = Math.max(0, Math.min(1, (1 + relativeOpacity) / 2));

  if (state.video2 && state.video2Active && isCanvasSourceReady(state.video2, state.video2Size) && topAlpha > 0) {
    ctx.save();
    ctx.globalAlpha = topAlpha;

    // 对齐变换：平移至锚点重合，等比缩放
    ctx.translate(triLineTransform.translateX, triLineTransform.translateY);
    ctx.scale(triLineTransform.scale, triLineTransform.scale);

    if (state.mirror2) {
      ctx.translate(state.video2Size.width, 0);
      ctx.scale(-1, 1);
    }

    try {
      ctx.drawImage(state.video2, 0, 0, state.video2Size.width, state.video2Size.height);
    } catch {
      // 容灾捕获
    }
    ctx.restore();
  }

  ctx.restore();
}

export interface NativeExportLayoutInput {
  mode: ComparisonMode;
  canvasWidth: number;
  canvasHeight: number;
  video1Uri: string;
  video1Size: { width: number; height: number };
  anchor1: number;
  rate1: number;
  span1Start: number;
  span1End: number;
  mirror1: boolean;
  triLine1?: TriLineCalibration;
  video2Uri: string;
  video2Size: { width: number; height: number };
  anchor2: number;
  rate2: number;
  span2Start: number;
  span2End: number;
  mirror2: boolean;
  triLine2?: TriLineCalibration;
  triLineTransform?: AlignmentTransform;
  relativeOpacity: number;
  viewport: ViewportTransform;
}

/**
 * 计算与 Canvas 渲染器像素级等价的归一化布局参数，供 Android 原生 OpenGL ES 合成直接消费
 */
export function computeNativeExportLayout(input: NativeExportLayoutInput): {
  video1: NativeVideoLayerLayout;
  video2: NativeVideoLayerLayout;
} {
  const W = Math.max(2, input.canvasWidth);
  const H = Math.max(2, input.canvasHeight);

  const defaultTriLine: TriLineCalibration = {
    model: 'two-horizontal-one-vertical',
    twoHOneV: { yA: 0.28, yB: 0.82, x0: 0.5 },
    twoVOneH: { xA: 0.4, xB: 0.6, y0: 0.85 },
  };

  if (input.mode === 'split-screen') {
    const halfW = W / 2;

    // 左半屏 视频1
    const calib1 = input.triLine1 || defaultTriLine;
    const fit1 = calculateTriLineSplitScreenPlacement(
      calib1,
      input.video1Size,
      { width: halfW, height: H },
      'left'
    );
    const localX1 = input.mirror1 ? halfW - fit1.dx - fit1.targetWidth : fit1.dx;
    const mainRect1: NormalizedRect = {
      x: localX1 / W,
      y: fit1.dy / H,
      w: fit1.targetWidth / W,
      h: fit1.targetHeight / H,
    };

    let bgRect1: NormalizedRect | undefined;
    if (fit1.targetWidth < halfW && input.video1Size.width > 0 && input.video1Size.height > 0) {
      const coverScale = Math.max(halfW / input.video1Size.width, H / input.video1Size.height);
      const bgW = input.video1Size.width * coverScale;
      const bgH = input.video1Size.height * coverScale;
      const bgX = (halfW - bgW) / 2;
      const bgY = (H - bgH) / 2;
      bgRect1 = { x: bgX / W, y: bgY / H, w: bgW / W, h: bgH / H };
    }

    // 右半屏 视频2
    const calib2 = input.triLine2 || defaultTriLine;
    const fit2 = calculateTriLineSplitScreenPlacement(
      calib2,
      input.video2Size,
      { width: halfW, height: H },
      'right'
    );
    const localX2 = input.mirror2 ? halfW - fit2.dx - fit2.targetWidth : fit2.dx;
    const mainRect2: NormalizedRect = {
      x: (halfW + localX2) / W,
      y: fit2.dy / H,
      w: fit2.targetWidth / W,
      h: fit2.targetHeight / H,
    };

    let bgRect2: NormalizedRect | undefined;
    if (fit2.targetWidth < halfW && input.video2Size.width > 0 && input.video2Size.height > 0) {
      const coverScale = Math.max(halfW / input.video2Size.width, H / input.video2Size.height);
      const bgW = input.video2Size.width * coverScale;
      const bgH = input.video2Size.height * coverScale;
      const bgX = (halfW - bgW) / 2;
      const bgY = (H - bgH) / 2;
      bgRect2 = { x: (halfW + bgX) / W, y: bgY / H, w: bgW / W, h: bgH / H };
    }

    return {
      video1: {
        uri: input.video1Uri,
        anchorTime: input.anchor1,
        rate: input.rate1,
        spanStart: input.span1Start,
        spanEnd: input.span1End,
        mirror: input.mirror1,
        alpha: 1,
        clipRect: { x: 0, y: 0, w: 0.5, h: 1 },
        mainRect: mainRect1,
        bgRect: bgRect1,
        bgAlpha: bgRect1 ? 0.35 : undefined,
      },
      video2: {
        uri: input.video2Uri,
        anchorTime: input.anchor2,
        rate: input.rate2,
        spanStart: input.span2Start,
        spanEnd: input.span2End,
        mirror: input.mirror2,
        alpha: 1,
        clipRect: { x: 0.5, y: 0, w: 0.5, h: 1 },
        mainRect: mainRect2,
        bgRect: bgRect2,
        bgAlpha: bgRect2 ? 0.35 : undefined,
      },
    };
  }

  // 半透明叠加模式
  const transform = input.triLineTransform;
  if (!transform) {
    return {
      video1: {
        uri: input.video1Uri,
        anchorTime: input.anchor1,
        rate: input.rate1,
        spanStart: input.span1Start,
        spanEnd: input.span1End,
        mirror: input.mirror1,
        alpha: 1,
        clipRect: { x: 0, y: 0, w: 1, h: 1 },
        mainRect: { x: 0, y: 0, w: 1, h: 1 },
      },
      video2: {
        uri: input.video2Uri,
        anchorTime: input.anchor2,
        rate: input.rate2,
        spanStart: input.span2Start,
        spanEnd: input.span2End,
        mirror: input.mirror2,
        alpha: Math.max(0, Math.min(1, (1 + input.relativeOpacity) / 2)),
        clipRect: { x: 0, y: 0, w: 1, h: 1 },
        mainRect: { x: 0, y: 0, w: 1, h: 1 },
      },
    };
  }

  const fit = calculateFitTransform(transform.unionBounds, { width: W, height: H });
  const totalScale = input.viewport.scale * fit.scale;
  const originX = W / 2 + input.viewport.scale * (fit.offsetX - W / 2 + input.viewport.offsetX);
  const originY = H / 2 + input.viewport.scale * (fit.offsetY - H / 2 + input.viewport.offsetY);

  const v1W = totalScale * input.video1Size.width;
  const v1H = totalScale * input.video1Size.height;

  const v2X = originX + totalScale * transform.translateX;
  const v2Y = originY + totalScale * transform.translateY;
  const v2W = totalScale * transform.scale * input.video2Size.width;
  const v2H = totalScale * transform.scale * input.video2Size.height;
  const topAlpha = Math.max(0, Math.min(1, (1 + input.relativeOpacity) / 2));

  return {
    video1: {
      uri: input.video1Uri,
      anchorTime: input.anchor1,
      rate: input.rate1,
      spanStart: input.span1Start,
      spanEnd: input.span1End,
      mirror: input.mirror1,
      alpha: 1,
      clipRect: { x: 0, y: 0, w: 1, h: 1 },
      mainRect: { x: originX / W, y: originY / H, w: v1W / W, h: v1H / H },
    },
    video2: {
      uri: input.video2Uri,
      anchorTime: input.anchor2,
      rate: input.rate2,
      spanStart: input.span2Start,
      spanEnd: input.span2End,
      mirror: input.mirror2,
      alpha: topAlpha,
      clipRect: { x: 0, y: 0, w: 1, h: 1 },
      mainRect: { x: v2X / W, y: v2Y / H, w: v2W / W, h: v2H / H },
    },
  };
}
