import {
  calculateTriLineAlignment,
  calculateFitTransform,
  calculateTriLineSplitScreenPlacement,
} from './geometry.ts';

// 1. 验证两横一竖模型
const calib1 = {
  model: 'two-horizontal-one-vertical' as const,
  twoHOneV: { yA: 0.2, yB: 0.8, x0: 0.5 },
  twoVOneH: { xA: 0.3, xB: 0.7, y0: 0.8 },
};
const size1 = { width: 1920, height: 1080 };

const calib2 = {
  model: 'two-horizontal-one-vertical' as const,
  twoHOneV: { yA: 0.3, yB: 0.6, x0: 0.5 },
  twoVOneH: { xA: 0.3, xB: 0.7, y0: 0.8 },
};
const size2 = { width: 1280, height: 720 };

// dist1 = (0.8 - 0.2) * 1080 = 648
// dist2 = (0.6 - 0.3) * 720 = 216
// scale = 648 / 216 = 3.0
// anchor1 = (0.5 * 1920, 0.5 * 1080) = (960, 540)
// anchor2 = (0.5 * 1280, 0.45 * 720) = (640, 324)
// scale * anchor2 = (1920, 972)
// translateX = 960 - 1920 = -960
// translateY = 540 - 972 = -432

const res1 = calculateTriLineAlignment(calib1, size1, calib2, size2);
console.log('--- 测试两横一竖对齐 ---');
console.log('Scale:', res1.scale, '期望: 3');
console.log('Translate:', res1.translateX, res1.translateY, '期望: -960, -432');
console.log('Union bounds:', res1.unionBounds);

if (Math.abs(res1.scale - 3.0) > 1e-4 || Math.abs(res1.translateX - (-960)) > 1e-4) {
  throw new Error('两横一竖计算不符合预期');
}

// 2. 验证两竖一横模型
const calibV1 = {
  model: 'two-vertical-one-horizontal' as const,
  twoHOneV: { yA: 0.2, yB: 0.8, x0: 0.5 },
  twoVOneH: { xA: 0.2, xB: 0.6, y0: 0.9 },
};
const calibV2 = {
  model: 'two-vertical-one-horizontal' as const,
  twoHOneV: { yA: 0.2, yB: 0.8, x0: 0.5 },
  twoVOneH: { xA: 0.1, xB: 0.3, y0: 0.9 },
};
// dist1 = (0.6 - 0.2) * 1920 = 768
// dist2 = (0.3 - 0.1) * 1280 = 256
// scale = 768 / 256 = 3.0
const resV = calculateTriLineAlignment(calibV1, size1, calibV2, size2);
console.log('--- 测试两竖一横对齐 ---');
console.log('Scale:', resV.scale, '期望: 3');
if (Math.abs(resV.scale - 3.0) > 1e-4) {
  throw new Error('两竖一横计算不符合预期');
}

// 3. 验证左右分区半区三线投影适配
const splitFit = calculateTriLineSplitScreenPlacement(
  calib1,
  { width: 1920, height: 1080 },
  { width: 960, height: 1080 }
);
console.log('--- 测试左右分区半区三线投影适配 ---');
console.log('Split fit result:', splitFit);
if (splitFit.targetWidth <= 0 || splitFit.targetHeight <= 0) {
  throw new Error('左右分区三线适配计算不符合预期');
}
// calib1.twoHOneV: yA=0.2, yB=0.8, featureDist = (0.8-0.2)*1080 = 648
// targetFeatureH = 1080 * 0.69 = 745.2, scale = 745.2 / 648 = 1.15
// targetBottomY = 1080 * 0.95 = 1026, bottomY = 0.8 * 1080 = 864
// dy = 1026 - 864 * 1.15 = 1026 - 993.6 = 32.4
// 投射后脚底位置: dy + bottomY * scale = 1026 (即 1026 / 1080 = 95%)
// 投射后头顶位置: dy + 0.2 * 1080 * 1.15 = 32.4 + 248.4 = 280.8 (即 280.8 / 1080 = 26%)
const renderedBottomY = splitFit.dy + 0.8 * 1080 * splitFit.scale;
const renderedTopY = splitFit.dy + 0.2 * 1080 * splitFit.scale;
console.log('投射后头顶 Y:', renderedTopY, `占比: ${(renderedTopY / 1080 * 100).toFixed(1)}%`);
console.log('投射后脚底 Y:', renderedBottomY, `占比: ${(renderedBottomY / 1080 * 100).toFixed(1)}%`);
if (Math.abs(renderedBottomY / 1080 - 0.95) > 1e-4 || Math.abs(renderedTopY / 1080 - 0.26) > 1e-4) {
  throw new Error('左右分区头脚沉底与特征高度比例计算偏差');
}

// 4. 验证并集居中视口适配
const fitUnion = calculateFitTransform(res1.unionBounds, { width: 1920, height: 1080 });
console.log('--- 测试并集居中视口适配 ---');
console.log('Fit transform:', fitUnion);
if (fitUnion.scale <= 0) {
  throw new Error('视口居中变换计算不符合预期');
}

console.log('全部几何算法验证通过！');
