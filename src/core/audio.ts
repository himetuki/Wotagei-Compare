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
 * 基于 WOTA 艺常用节拍速度 (150 ~ 190 BPM) 的对数正态先验加权函数
 * 中心设在 168 BPM，标准差 sigma = 0.35
 */
export function calculateTempoPriorWeight(bpm: number): number {
  if (bpm <= 0) return 0;
  const centerBpm = 168;
  const sigma = 0.35;
  const logRatio = Math.log2(bpm / centerBpm);
  return Math.exp(-(logRatio * logRatio) / (2 * sigma * sigma));
}

/**
 * 基于能量包络、先验衰减加权与谐波共振校验自动测算音轨 BPM
 * 适用于流行乐、电子乐与动漫歌曲 (WOTA 艺常用 120 ~ 220 BPM)
 * @param channelData 单声道 Float32 PCM 数据
 * @param sampleRate 采样率 (如 44100 或 48000)
 * @param maxScanSeconds 最大分析时长（秒，默认无限制；导入超长大音频时建议传 60）
 * @returns 测算出的整数 BPM
 */
export function detectBpmFromPcm(
  channelData: Float32Array,
  sampleRate: number,
  maxScanSeconds?: number
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

  // 3. 在 80 ~ 220 BPM 范围内进行自相关搜索与先验加权
  const envelopeSampleRate = sampleRate / hopSize;
  const minBpm = 80;
  const maxBpm = 220;

  const minLag = Math.floor((60 * envelopeSampleRate) / maxBpm);
  const maxLag = Math.ceil((60 * envelopeSampleRate) / minBpm);

  // 扫描窗口：未传入 maxScanSeconds 时，严格使用切片的全部可用起音数据，消除盲区截断
  const scanLimit =
    typeof maxScanSeconds === 'number' && maxScanSeconds > 0
      ? Math.floor(maxScanSeconds * envelopeSampleRate)
      : onsets.length;
  const maxScanLength = Math.min(onsets.length, scanLimit);

  // 记录每个 lag 的原始自相关系数，便于后续谐波共振复核
  const rawCorrelations = new Float32Array(maxLag + 1);
  let bestLag = minLag;
  let maxScore = -1;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    const count = maxScanLength - lag;
    if (count <= 0) break;

    for (let i = 0; i < count; i++) {
      sum += onsets[i] * onsets[i + lag];
    }

    const corr = sum / count;
    rawCorrelations[lag] = corr;

    const bpmAtLag = (60 * envelopeSampleRate) / lag;
    const weight = calculateTempoPriorWeight(bpmAtLag);
    const score = corr * weight;

    if (score > maxScore) {
      maxScore = score;
      bestLag = lag;
    }
  }

  if (bestLag <= 0) return 160;

  let chosenLag = bestLag;

  // 4. 谐波共振校验 (Harmonic Folding & Rescoring)
  // 4.1 若命中 95 ~ 125 BPM (常见为 110 等 1.5 拍亚谐波)，探测其 1.5 倍频 (如 165 BPM)
  const initialBpmAtBestLag = (60 * envelopeSampleRate) / bestLag;
  if (initialBpmAtBestLag >= 95 && initialBpmAtBestLag <= 125) {
    const target15xLag = Math.round(bestLag / 1.5);
    if (target15xLag >= minLag && target15xLag <= maxLag) {
      // 在 1.5 倍频邻域找局部极大值
      let localMaxCorr = 0;
      let localBestLag = target15xLag;
      for (let l = Math.max(minLag, target15xLag - 1); l <= Math.min(maxLag, target15xLag + 1); l++) {
        if (rawCorrelations[l] > localMaxCorr) {
          localMaxCorr = rawCorrelations[l];
          localBestLag = l;
        }
      }
      // 只要 1.5x 处的原始自相关达到慢速峰的 30% 以上，认定真实节拍为 1.5x 高速拍
      if (localMaxCorr > 0 && localMaxCorr >= rawCorrelations[bestLag] * 0.3) {
        chosenLag = localBestLag;
      }
    }
  }

  // 5. 局部未加权物理自相关峰值的二次抛物线插值 (Sub-sample Parabolic Peak Interpolation)
  // 利用最佳整数点与其前后两邻居相关系数，拟合光滑连续曲线极值，将时间分辨率提升至连续亚采样级
  // 消除 6~7 BPM 的离散量化粗糙阶跃，且在原始物理系数上拟合可规避先验单调递减坡度对极值的负向偏置拉偏
  let refinedLag = chosenLag;
  if (chosenLag > minLag && chosenLag < maxLag) {
    const y0 = rawCorrelations[chosenLag - 1];
    const y1 = rawCorrelations[chosenLag];
    const y2 = rawCorrelations[chosenLag + 1];
    const denom = 2 * (2 * y1 - y0 - y2);
    if (Math.abs(denom) > 1e-9) {
      const delta = (y2 - y0) / denom;
      if (Math.abs(delta) <= 1.0) {
        refinedLag = chosenLag + delta;
      }
    }
  }

  let calculatedBpm = (60 * envelopeSampleRate) / refinedLag;

  // 6. 若估算落入 < 100 偏慢区间，检查是否存在强双倍频
  if (calculatedBpm < 100) {
    calculatedBpm *= 2;
  } else if (calculatedBpm > 220) {
    calculatedBpm /= 2;
  }

  return Math.round(calculatedBpm);
}

/**
 * 基于指定时间窗口 [startSec, endSec] 的 PCM 切片测算局部 BPM
 * @param pcm 单声道 Float32 PCM 数据
 * @param sampleRate 采样率 (Hz)
 * @param startSec 起始时间戳 (秒)
 * @param endSec 结束时间戳 (秒)
 * @param fallbackBpm 切片过短（< 2.0s）时的保底/当前 BPM（默认 160）
 */
export function detectBpmFromSlice(
  pcm: Float32Array,
  sampleRate: number,
  startSec: number,
  endSec: number,
  fallbackBpm = 160
): number {
  if (!pcm || pcm.length === 0 || sampleRate <= 0) return fallbackBpm;

  const validStart = Math.max(0, Math.min(startSec, endSec));
  const validEnd = Math.max(startSec, endSec);

  // 严格按 hopSize (512) 整数倍将截取采样点对齐到全局 Hop 网格
  // 确保不管用户如何毫秒级微调起止点，局部切片内的鼓点瞬态（Transient）相对于 512 样本块边界的相位绝对固定
  // 彻底根除鼓点冲击被切块边界削顶切分导致的能量泄漏与跳变
  const hopSize = 512;
  const alignedStart = Math.max(0, Math.floor((validStart * sampleRate) / hopSize) * hopSize);
  const alignedEnd = Math.min(pcm.length, Math.ceil((validEnd * sampleRate) / hopSize) * hopSize);

  // 截取区间不足 2.0 秒时返回 fallbackBpm，避免虚假推断
  if (alignedEnd - alignedStart < sampleRate * 2.0) {
    return fallbackBpm;
  }

  const slice = pcm.subarray(alignedStart, alignedEnd);
  // 切片计算严格闭环在区间内部，不设向后截断限制
  return detectBpmFromPcm(slice, sampleRate);
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

  // 初次导入默认对前 60 秒音频进行先验自相关分析，兼顾整曲速度与加载流畅度
  const detectedBpm = detectBpmFromPcm(monoData, sampleRate, 60);
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
