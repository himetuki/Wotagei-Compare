/**
 * 音频 PCM 解码、波形提取与能量自相关 BPM 检测纯函数算法
 */

/**
 * 提取归一化音频波形峰值数据，供 UI Canvas 快速绘制
 * @param channelData 单声道 PCM 数据 (-1.0 ~ 1.0)
 * @param targetLength 提取的波形点数 (默认 1000)
 */
export function extractAudioWaveform(
  channelData: Float32Array,
  targetLength = 1000
): Float32Array {
  const result = new Float32Array(targetLength);
  if (channelData.length === 0) return result;

  const blockSize = Math.floor(channelData.length / targetLength);
  if (blockSize <= 0) {
    for (let i = 0; i < Math.min(channelData.length, targetLength); i++) {
      result[i] = Math.abs(channelData[i]);
    }
    return result;
  }

  for (let i = 0; i < targetLength; i++) {
    const start = i * blockSize;
    const end = Math.min(start + blockSize, channelData.length);
    let max = 0;
    for (let j = start; j < end; j++) {
      const val = Math.abs(channelData[j]);
      if (val > max) max = val;
    }
    result[i] = max;
  }

  return result;
}

/**
 * 基于能量包络与差分自相关算法自动测算音轨 BPM
 * 适用于流行乐、电子乐与动漫歌曲 (WOTA 艺常用 100 ~ 220 BPM)
 * @param channelData 单声道 Float32 PCM 数据
 * @param sampleRate 采样率 (如 44100 或 48000)
 * @returns 测算出的整数 BPM
 */
export function detectBpmFromPcm(
  channelData: Float32Array,
  sampleRate: number
): number {
  if (channelData.length < sampleRate) {
    // 音频过短不足 1 秒，返回默认典型 160 BPM
    return 160;
  }

  // 1. 降低时间分辨率计算局部能量包络 (每步长 512 采样点，约 11.6ms)
  const hopSize = 512;
  const envelopeLength = Math.floor(channelData.length / hopSize);
  const envelope = new Float32Array(envelopeLength);

  for (let i = 0; i < envelopeLength; i++) {
    const offset = i * hopSize;
    let sum = 0;
    for (let j = 0; j < hopSize; j++) {
      const val = channelData[offset + j];
      sum += val * val;
    }
    envelope[i] = Math.sqrt(sum / hopSize);
  }

  // 2. 一阶正差分提取起音 (Onset detection)
  const onsets = new Float32Array(envelopeLength);
  for (let i = 1; i < envelopeLength; i++) {
    const diff = envelope[i] - envelope[i - 1];
    onsets[i] = diff > 0 ? diff : 0;
  }

  // 3. 在 80 ~ 220 BPM 范围内进行自相关搜索
  const envelopeSampleRate = sampleRate / hopSize;
  const minBpm = 80;
  const maxBpm = 220;

  const minLag = Math.floor((60 * envelopeSampleRate) / maxBpm);
  const maxLag = Math.ceil((60 * envelopeSampleRate) / minBpm);

  let bestLag = minLag;
  let maxCorrelation = -1;

  // 仅截取前 45 秒内的数据进行快速自相关分析，兼顾速度与准确度
  const maxScanLength = Math.min(onsets.length, Math.floor(45 * envelopeSampleRate));

  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    const count = maxScanLength - lag;
    if (count <= 0) break;

    for (let i = 0; i < count; i++) {
      sum += onsets[i] * onsets[i + lag];
    }

    const correlation = sum / count;
    if (correlation > maxCorrelation) {
      maxCorrelation = correlation;
      bestLag = lag;
    }
  }

  if (bestLag <= 0) return 160;

  let calculatedBpm = (60 * envelopeSampleRate) / bestLag;

  // 4. 谐波折叠校准：若估算落入 < 100 偏慢区间，检查是否存在强双倍频
  if (calculatedBpm < 100) {
    calculatedBpm *= 2;
  } else if (calculatedBpm > 220) {
    calculatedBpm /= 2;
  }

  return Math.round(calculatedBpm);
}

/**
 * 从本地视频/音频 File 对象中解码出单声道 PCM 数据并执行分析
 */
export async function decodeAudioFromFile(file: File): Promise<{
  duration: number;
  sampleRate: number;
  detectedBpm: number;
  waveform: Float32Array;
  rawChannelData: Float32Array;
}> {
  const arrayBuffer = await file.arrayBuffer();
  // 借助浏览器 AudioContext 解码容器中的音频流
  const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

  const duration = audioBuffer.duration;
  const sampleRate = audioBuffer.sampleRate;

  // 合并为单声道 Float32Array
  const numChannels = audioBuffer.numberOfChannels;
  const length = audioBuffer.length;
  const monoData = new Float32Array(length);

  if (numChannels === 1) {
    monoData.set(audioBuffer.getChannelData(0));
  } else {
    const ch0 = audioBuffer.getChannelData(0);
    const ch1 = audioBuffer.getChannelData(1);
    for (let i = 0; i < length; i++) {
      monoData[i] = (ch0[i] + ch1[i]) / 2;
    }
  }

  const detectedBpm = detectBpmFromPcm(monoData, sampleRate);
  const waveform = extractAudioWaveform(monoData, 1000);

  await audioCtx.close();

  return {
    duration,
    sampleRate,
    detectedBpm,
    waveform,
    rawChannelData: monoData,
  };
}

/**
 * Tap Tempo 连续点击屏幕测速器
 */
export class TapTempoTracker {
  private taps: number[] = [];
  private readonly maxTaps: number = 8;
  private readonly resetTimeoutMs: number = 2500;

  /**
   * 记录一次点击并返回当前估算的整数 BPM (点击次数不足时返回 null)
   */
  public tap(): number | null {
    const now = performance.now();

    if (this.taps.length > 0 && now - this.taps[this.taps.length - 1] > this.resetTimeoutMs) {
      // 距离上次点击超过 2.5 秒，开启新一轮测速
      this.taps = [now];
      return null;
    }

    this.taps.push(now);
    if (this.taps.length > this.maxTaps) {
      this.taps.shift();
    }

    if (this.taps.length < 2) {
      return null;
    }

    // 计算相邻点击间隔
    const intervals: number[] = [];
    for (let i = 1; i < this.taps.length; i++) {
      intervals.push(this.taps[i] - this.taps[i - 1]);
    }

    // 排序后剔除边缘极值
    if (intervals.length >= 4) {
      intervals.sort((a, b) => a - b);
      intervals.pop();
      intervals.shift();
    }

    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    if (avgInterval <= 0) return null;

    const bpm = Math.round(60000 / avgInterval);
    return Math.max(40, Math.min(300, bpm));
  }

  public reset(): void {
    this.taps = [];
  }
}
