import {
  calculateUnifiedTimeline,
  mapTauToSourceTime,
  mapSourceTimeToTau,
  isTauInVideoRange,
} from './timeline.ts';

// 视频 1: 10 秒时长，160 BPM，在第 2 秒起拍锚点
const v1 = { duration: 10, bpm: 160, anchorTime: 2 };
// 视频 2: 12 秒时长，150 BPM，在第 3 秒起拍锚点
const v2 = { duration: 12, bpm: 150, anchorTime: 3 };

// 1. 验证自选对齐到左视频 (160 BPM)
const resLeft = calculateUnifiedTimeline(v1, v2, 'left');
console.log('--- 测试对齐到左视频 BPM (160) ---');
console.log('Rate1:', resLeft.rate1, '期望: 1');
console.log('Rate2:', resLeft.rate2, '期望:', 160 / 150);
console.log('Span1:', resLeft.span1); // [-2, 8]
console.log('Span2:', resLeft.span2); // [-3 / (16/15) = -2.8125, 9 / (16/15) = 8.4375]
console.log('Intersect:', resLeft.intersectInterval); // [-2, 8]

if (Math.abs(resLeft.rate1 - 1) > 1e-5 || Math.abs(resLeft.rate2 - (160 / 150)) > 1e-5) {
  throw new Error('速率比计算错误');
}
if (Math.abs(resLeft.intersectInterval.start - (-2)) > 1e-5 || Math.abs(resLeft.intersectInterval.end - 8) > 1e-5) {
  throw new Error('交集区间计算错误: 期望 [-2, 8], 实际 ' + JSON.stringify(resLeft.intersectInterval));
}

// 2. 验证时间戳往返映射
const tauTest = 1.5;
const t1 = mapTauToSourceTime(tauTest, v1.anchorTime, resLeft.rate1);
const tau1Back = mapSourceTimeToTau(t1, v1.anchorTime, resLeft.rate1);
console.log('--- 测试时间戳双向映射 ---');
console.log('tau -> t1:', t1, '-> tauBack:', tau1Back);
if (Math.abs(tau1Back - tauTest) > 1e-5) {
  throw new Error('时间戳映射往返不一致');
}

// 3. 验证范围判断
console.log('tau = -2.5 in v1 range:', isTauInVideoRange(-2.5, resLeft.span1), '期望: false');
console.log('tau = -2.5 in v2 range:', isTauInVideoRange(-2.5, resLeft.span2), '期望: true');
if (isTauInVideoRange(-2.5, resLeft.span1) !== false || isTauInVideoRange(-2.5, resLeft.span2) !== true) {
  throw new Error('有效区间判断错误');
}

console.log('全部时间轴映射与交集区间算法验证通过！');
