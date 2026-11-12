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

console.log('音频 BPM 检测算法验证通过！');
