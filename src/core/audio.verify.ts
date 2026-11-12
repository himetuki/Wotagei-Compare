import { detectBpmFromPcm, detectBpmFromSlice, extractAudioWaveform } from './audio.ts';

// 模拟生成一段 150 BPM 的打击乐鼓点 PCM 音频 (44100Hz, 持续 10 秒)
const sampleRate = 44100;
const duration = 10;
const totalSamples = sampleRate * duration;
const pcm = new Float32Array(totalSamples);

const targetBpm = 150;
const beatIntervalSec = 60 / targetBpm; // 0.4s
const beatIntervalSamples = Math.round(beatIntervalSec * sampleRate);

// 在每个拍点处合成一个衰减的正弦脉冲 (模拟底鼓 Kick)
for (let beat = 0; beat * beatIntervalSamples < totalSamples; beat++) {
  const startSample = beat * beatIntervalSamples;
  const pulseDuration = Math.round(0.08 * sampleRate); // 80ms 脉冲
  for (let i = 0; i < pulseDuration && startSample + i < totalSamples; i++) {
    const t = i / sampleRate;
    const decay = Math.exp(-t * 30); // 指数衰减
    const sine = Math.sin(2 * Math.PI * 120 * t); // 120Hz 鼓声
    pcm[startSample + i] += sine * decay * 0.9;
  }
}

// 提取波形验证
const waveform = extractAudioWaveform(pcm, 100);
console.log('Waveform length:', waveform.length);
if (waveform.length !== 100) {
  throw new Error('波形长度提取错误');
}

// 检测 BPM
const detected = detectBpmFromPcm(pcm, sampleRate);
console.log('--- 测试音频 BPM 自动测算 ---');
console.log('目标 BPM:', targetBpm);
console.log('测算 BPM:', detected);

if (Math.abs(detected - targetBpm) > 2) {
  throw new Error(`BPM 测算偏差过大: 目标 ${targetBpm}, 实际 ${detected}`);
}

// 检测局部切片 BPM (截取 2s 至 8s)
const sliceBpm = detectBpmFromSlice(pcm, sampleRate, 2.0, 8.0);
console.log('切片 2.0s~8.0s 测算 BPM:', sliceBpm);
if (Math.abs(sliceBpm - targetBpm) > 2) {
  throw new Error(`切片 BPM 测算偏差过大: 期望 ${targetBpm}, 实际 ${sliceBpm}`);
}

// 验证极短切片 (< 2.0s) 的守卫
const shortBpm = detectBpmFromSlice(pcm, sampleRate, 2.0, 3.2, 175);
if (shortBpm !== 175) {
  throw new Error(`极短切片守卫失败: 期望保持 175, 实际 ${shortBpm}`);
}

// 模拟测试：165 BPM 下包含日系 3+3+2 附点切分音（易在 1.5 拍产生 110 BPM 虚假亚谐波峰值）
console.log('--- 测试 165 BPM 强切分音抗干扰与先验加权 ---');
const syncDuration = 12;
const syncSamples = sampleRate * syncDuration;
const syncPcm = new Float32Array(syncSamples);
const syncBpm = 165;
const beatSec = 60 / syncBpm;

// 构造 3+3+2 节奏型：每小节 4 拍，重音在 0, 1.5, 3.0 拍
for (let bar = 0; bar < 8; bar++) {
  const barStartSec = bar * 4 * beatSec;
  for (const beatOffset of [0, 1.5, 3.0]) {
    const hitSec = barStartSec + beatOffset * beatSec;
    const startSample = Math.round(hitSec * sampleRate);
    const pulseDuration = Math.round(0.06 * sampleRate);
    for (let i = 0; i < pulseDuration && startSample + i < syncSamples; i++) {
      const t = i / sampleRate;
      const decay = Math.exp(-t * 35);
      const sine = Math.sin(2 * Math.PI * 130 * t);
      // 1.5 拍处的切分音稍强，模拟伴奏突出
      const amp = beatOffset === 1.5 ? 1.0 : 0.8;
      syncPcm[startSample + i] += sine * decay * amp;
    }
  }
}

const detectedSyncBpm = detectBpmFromSlice(syncPcm, sampleRate, 0, 10);
console.log('切分音音频测算 BPM:', detectedSyncBpm);
if (Math.abs(detectedSyncBpm - 165) > 3) {
  throw new Error(`切分音抗干扰失败: 期望 165 附近，实际被误判为 ${detectedSyncBpm}`);
}

console.log('音频 BPM 检测算法验证通过！');
