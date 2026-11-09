import { renderComparisonFrame } from './renderer.ts';
import type { ComparisonRenderState } from './renderer.ts';

// 构造 Mock CanvasRenderingContext2D 用于非浏览器环境下的可复现验证
class MockContext2D {
  calls: string[] = [];
  globalAlpha = 1.0;
  fillStyle = '#000';
  strokeStyle = '#fff';
  lineWidth = 1;

  save() { this.calls.push('save'); }
  restore() { this.calls.push('restore'); }
  fillRect(x: number, y: number, w: number, h: number) { this.calls.push(`fillRect(${x},${y},${w},${h})`); }
  beginPath() { this.calls.push('beginPath'); }
  rect(x: number, y: number, w: number, h: number) { this.calls.push(`rect(${x},${y},${w},${h})`); }
  clip() { this.calls.push('clip'); }
  translate(x: number, y: number) { this.calls.push(`translate(${Math.round(x)},${Math.round(y)})`); }
  scale(sx: number, sy: number) { this.calls.push(`scale(${sx.toFixed(2)},${sy.toFixed(2)})`); }
  moveTo(x: number, y: number) { this.calls.push(`moveTo(${x},${y})`); }
  lineTo(x: number, y: number) { this.calls.push(`lineTo(${x},${y})`); }
  stroke() { this.calls.push('stroke'); }
  drawImage(...args: unknown[]) { this.calls.push(`drawImage(${args.length}args)`); }
}

const mockCtx = new MockContext2D() as unknown as CanvasRenderingContext2D;

// 1. 验证左右分区模式渲染 (基于三线正交模型)
const splitState: ComparisonRenderState = {
  mode: 'split-screen',
  video1: {} as CanvasImageSource,
  video1Size: { width: 1920, height: 1080 },
  video1Active: true,
  mirror1: true,
  triLine1: {
    model: 'two-horizontal-one-vertical',
    twoHOneV: { yA: 0.28, yB: 0.82, x0: 0.5 },
    twoVOneH: { xA: 0.4, xB: 0.6, y0: 0.85 },
  },
  video2: {} as CanvasImageSource,
  video2Size: { width: 1280, height: 720 },
  video2Active: true,
  mirror2: false,
  triLine2: {
    model: 'two-horizontal-one-vertical',
    twoHOneV: { yA: 0.3, yB: 0.8, x0: 0.5 },
    twoVOneH: { xA: 0.4, xB: 0.6, y0: 0.85 },
  },
  relativeOpacity: 0,
  viewport: { scale: 1, offsetX: 0, offsetY: 0 },
  canvasWidth: 1920,
  canvasHeight: 1080,
};

renderComparisonFrame(mockCtx, splitState);
console.log('--- 测试左右分区渲染调用 ---');
const splitCalls = (mockCtx as unknown as MockContext2D).calls;
console.log('调用总数:', splitCalls.length);
if (!splitCalls.includes('drawImage(9args)')) {
  throw new Error('左右分区未触发 drawImage 渲染');
}
if (!splitCalls.includes('scale(-1.00,1.00)')) {
  throw new Error('未正确触发视频 1 镜像翻转 scale(-1, 1)');
}

// 2. 验证半透明叠加渲染
const overlayCtx = new MockContext2D() as unknown as CanvasRenderingContext2D;
const overlayState: ComparisonRenderState = {
  mode: 'overlay',
  video1: {} as CanvasImageSource,
  video1Size: { width: 1920, height: 1080 },
  video1Active: true,
  mirror1: false,
  video2: {} as CanvasImageSource,
  video2Size: { width: 1280, height: 720 },
  video2Active: true,
  mirror2: false,
  triLineTransform: {
    scale: 1.5,
    translateX: 100,
    translateY: 50,
    anchor1: { x: 960, y: 540 },
    anchor2: { x: 640, y: 360 },
    unionBounds: { minX: 0, minY: 0, maxX: 1920, maxY: 1080, width: 1920, height: 1080 },
  },
  relativeOpacity: 0.2, // topAlpha = (1 + 0.2) / 2 = 0.6
  viewport: { scale: 1.2, offsetX: 10, offsetY: 20 },
  canvasWidth: 1920,
  canvasHeight: 1080,
};

renderComparisonFrame(overlayCtx, overlayState);
console.log('--- 测试半透明叠加渲染调用 ---');
const overlayCalls = (overlayCtx as unknown as MockContext2D).calls;
console.log('调用总数:', overlayCalls.length);
if (Math.abs((overlayCtx as unknown as MockContext2D).globalAlpha - 0.6) > 1e-4) {
  throw new Error(`等亮线性透明度未正确设置: ${(overlayCtx as unknown as MockContext2D).globalAlpha}`);
}
if (!overlayCalls.includes('scale(1.50,1.50)')) {
  throw new Error('叠加模式未正确应用三线缩放变换 scale(1.5, 1.5)');
}

console.log('单画布同台渲染器验证全部通过！');
