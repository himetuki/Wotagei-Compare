/**
 * 离线导出时间戳数学模型、总帧数与音频重采样参数离线校验
 */

import { isWebCodecsSupported, selectSupportedMediaRecorderMime } from './exporter.ts';
import { isDownbeatIndex } from './metronome.ts';

console.log('--- 1. 验证导出时长与确定性时间戳（PTS）计算模型 ---');

const clipStart = 2.0;
const clipEnd = 5.0;
const slowMotionRate = 0.25;
const fps = 30;

const exportDuration = Math.max(0.1, clipEnd - clipStart);
const outputDurationSec = exportDuration / slowMotionRate;
const totalFrames = Math.max(1, Math.round(outputDurationSec * fps));

console.log('截取源时长 (s):', exportDuration, '期望: 3.0');
console.log('成片输出时长 (s):', outputDurationSec, '期望: 12.0');
console.log('成片总帧数 (frames):', totalFrames, '期望: 360');

if (Math.abs(exportDuration - 3.0) > 1e-5) {
  throw new Error('截取时长计算异常');
}
if (Math.abs(outputDurationSec - 12.0) > 1e-5) {
  throw new Error('慢放成片时长计算异常: 期望 12.0s，实际 ' + outputDurationSec);
}
if (totalFrames !== 360) {
  throw new Error('总帧数计算异常: 期望 360 帧，实际 ' + totalFrames);
}

// 验证每一帧的微秒级时间戳 (PTS)
const firstFramePts = Math.round((0 / fps) * 1_000_000);
const lastFramePts = Math.round(((totalFrames - 1) / fps) * 1_000_000);
const frameDurationMicros = Math.round((1 / fps) * 1_000_000);

console.log('首帧 PTS (微秒):', firstFramePts, '期望: 0');
console.log('末帧 PTS (微秒):', lastFramePts, '期望: 11966667');
console.log('单帧时长 (微秒):', frameDurationMicros, '期望: 33333');

if (firstFramePts !== 0) {
  throw new Error('首帧 PTS 必须为 0');
}
if (Math.abs(lastFramePts + frameDurationMicros - outputDurationSec * 1_000_000) > 50000) {
  throw new Error('末帧时间戳与成片时长偏离超过单帧容差');
}

console.log('--- 2. 验证画幅宽高偶数规范化 ---');
function normalizeEvenDimension(dim: number): number {
  return dim % 2 === 0 ? dim : dim - 1;
}

if (normalizeEvenDimension(1280) !== 1280 || normalizeEvenDimension(1281) !== 1280) {
  throw new Error('宽度偶数规整算法错误');
}
if (normalizeEvenDimension(720) !== 720 || normalizeEvenDimension(721) !== 720) {
  throw new Error('高度偶数规整算法错误');
}

console.log('--- 3. 验证音频采样点长度与首尾时间轴对齐 ---');
const sampleRate = 44100;
const totalAudioSamples = Math.max(1, Math.round(outputDurationSec * sampleRate));
console.log('总音频采样点数:', totalAudioSamples, '期望: 529200');

if (totalAudioSamples !== 529200) {
  throw new Error('音频采样点总数不符合预期');
}

// 检查音频第一采样点与最后采样点对应的统一时间 tau
const tauFirstSample = clipStart + (0 / sampleRate) * slowMotionRate;
const tauLastSample = clipStart + ((totalAudioSamples - 1) / sampleRate) * slowMotionRate;

console.log('音频首采样点 tau:', tauFirstSample, '期望: 2.0');
console.log('音频末采样点 tau:', tauLastSample.toFixed(4), '期望约 5.0');

if (Math.abs(tauFirstSample - clipStart) > 1e-5) {
  throw new Error('音频首采样点时间偏移未对齐');
}
if (Math.abs(tauLastSample - clipEnd) > 0.01) {
  throw new Error('音频末采样点时间偏移未对齐');
}

console.log('--- 4. 验证环境 WebCodecs 与 MediaRecorder 降级 MIME 选择接口 ---');
console.log('Node 环境下 isWebCodecsSupported():', isWebCodecsSupported(), '(非浏览器环境期望 false)');
const pickedMime = selectSupportedMediaRecorderMime(
  true,
  (m) => m === 'video/webm;codecs=vp8,opus' || m === 'video/webm'
);
if (pickedMime !== 'video/webm;codecs=vp8,opus') {
  throw new Error('MediaRecorder 优先 MIME 选择错误: ' + pickedMime);
}

console.log('--- 5. 验证离线合成节拍器锚点 (tau = 0) 重拍锁相与时间戳模型 ---');
const bpmTest = 120;
const beatIntervalTest = 60 / bpmTest; // 0.5s
const expStart = -1.0;
const expEnd = 2.0;
const rateTest = 0.5;

const kStart = Math.ceil(expStart / beatIntervalTest - 1e-5);
const kEnd = Math.floor(expEnd / beatIntervalTest + 1e-5);

const generatedBeats: { k: number; tau: number; outTime: number; isDownbeat: boolean }[] = [];
for (let k = kStart; k <= kEnd; k++) {
  const tauBeat = k * beatIntervalTest;
  const outTime = (tauBeat - expStart) / rateTest;
  generatedBeats.push({
    k,
    tau: tauBeat,
    outTime,
    isDownbeat: isDownbeatIndex(k),
  });
}

console.log(`生成离线节拍序列，共 ${generatedBeats.length} 拍:`);
const anchorBeat = generatedBeats.find((b) => Math.abs(b.tau) < 1e-5);
if (!anchorBeat) {
  throw new Error('离线节拍器序列中缺失 tau = 0 锚点拍！');
}
console.log('tau = 0 对应拍号:', anchorBeat.k, '成片时间戳 (s):', anchorBeat.outTime, '是否重拍:', anchorBeat.isDownbeat);

if (anchorBeat.k !== 0 || !anchorBeat.isDownbeat) {
  throw new Error(`tau = 0 处未被识别为 k=0 重拍！`);
}
if (Math.abs(anchorBeat.outTime - 2.0) > 1e-5) {
  throw new Error(`tau = 0 处成片输出时间偏离预期: 期望 2.0s，实际 ${anchorBeat.outTime}`);
}
console.log('✓ 离线节拍器时间戳与锚点重拍锁相验证通过！');

console.log('所有导出核心参数与时间戳模型验证全部通过！');
