/**
 * 所见即所得离线逐帧视频导出与音频混流引擎
 * 基于 WebCodecs (VideoEncoder/AudioEncoder) 与 mp4-muxer 构建确定性时间戳离线编码管线
 */

import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import type {
  ComparisonMode,
  ViewportTransform,
} from '../types/geometry.ts';
import type {
  SlowMotionRate,
  SoundSource,
} from '../types/timeline.ts';
import type { AlignmentTransform } from './geometry.ts';
import type { UnifiedTimelineResult } from './timeline.ts';
import { mapTauToSourceTime, isTauInVideoRange } from './timeline.ts';
import { renderComparisonFrame, ComparisonRenderState } from './renderer.ts';
import { isDownbeatIndex } from './metronome.ts';
import type { LoadedVideoItem } from '../components/ImportStep.tsx';

export interface ExportProgressInfo {
  currentFrame: number;
  totalFrames: number;
  percent: number;
  statusText: string;
}

export interface ExporterConfig {
  video1: LoadedVideoItem;
  video2: LoadedVideoItem;
  timeline: UnifiedTimelineResult;
  mode: ComparisonMode;
  mirror1: boolean;
  mirror2: boolean;
  triLineTransform?: AlignmentTransform;
  viewport: ViewportTransform;
  relativeOpacity: number;
  slowMotionRate: SlowMotionRate;
  soundSource: SoundSource;
  fps?: number;
  width?: number;
  height?: number;
  onProgress: (info: ExportProgressInfo) => void;
}

/**
 * 探测当前运行宿主是否支持原生 WebCodecs 硬件加速编码
 */
export function isWebCodecsSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as unknown as { VideoEncoder?: unknown }).VideoEncoder !== 'undefined' &&
    typeof (window as unknown as { VideoFrame?: unknown }).VideoFrame !== 'undefined'
  );
}

/**
 * 寻找宿主环境支持的最佳 H.264 视频编码配置
 */
async function selectSupportedVideoCodec(width: number, height: number, fps: number): Promise<string> {
  const candidates = [
    'avc1.42001f', // Baseline Profile Level 3.1
    'avc1.4d002a', // Main Profile Level 4.2
    'avc1.64002a', // High Profile Level 4.2
  ];

  for (const codec of candidates) {
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec,
        width,
        height,
        bitrate: 4_000_000,
        framerate: fps,
      });
      if (support.supported) {
        return codec;
      }
    } catch {
      // 尝试下一个候选配置
    }
  }

  // 默认返回兼容性最高的 Baseline
  return 'avc1.42001f';
}

/**
 * 探测宿主环境是否支持 AAC 音频编码
 */
async function isAacAudioSupported(sampleRate: number): Promise<boolean> {
  if (typeof (window as unknown as { AudioEncoder?: unknown }).AudioEncoder === 'undefined') {
    return false;
  }
  try {
    const support = await AudioEncoder.isConfigSupported({
      codec: 'mp4a.40.2',
      sampleRate,
      numberOfChannels: 1,
      bitrate: 128_000,
    });
    return !!support.supported;
  } catch {
    return false;
  }
}

/**
 * 离线合成节拍器音轨数据 (OfflineAudioContext)
 * 严格以 tau = 0 锁相为小节第 1 拍重拍，采用绝对整数拍号步进消除累加误差，
 * 并应用复合谐波打击音色与动态范围压缩限幅
 */
export async function synthesizeMetronomeBuffer(
  exportStart: number,
  exportEnd: number,
  outputDurationSec: number,
  effectiveBpm: number,
  slowMotionRate: number,
  sampleRate: number
): Promise<AudioBuffer> {
  const totalSamples = Math.max(1, Math.round(outputDurationSec * sampleRate));
  const offlineCtx = new OfflineAudioContext(1, totalSamples, sampleRate);

  // 离线动态范围压缩限幅管线
  const compressor = offlineCtx.createDynamicsCompressor();
  compressor.threshold.setValueAtTime(-12, 0);
  compressor.knee.setValueAtTime(8, 0);
  compressor.ratio.setValueAtTime(8, 0);
  compressor.attack.setValueAtTime(0.003, 0);
  compressor.release.setValueAtTime(0.08, 0);
  compressor.connect(offlineCtx.destination);

  const beatIntervalTau = 60 / effectiveBpm;
  const kStart = Math.ceil(exportStart / beatIntervalTau - 1e-5);
  const kEnd = Math.floor(exportEnd / beatIntervalTau + 1e-5);

  for (let k = kStart; k <= kEnd; k++) {
    const tauBeat = k * beatIntervalTau;
    const outTime = (tauBeat - exportStart) / slowMotionRate;

    if (outTime >= 0 && outTime < outputDurationSec) {
      const isDownbeat = isDownbeatIndex(k);

      if (isDownbeat) {
        // 重拍：1500Hz 三角波 + 800Hz 正弦波复合冲击 (总长 55ms)
        const oscHigh = offlineCtx.createOscillator();
        const oscLow = offlineCtx.createOscillator();
        const gainNode = offlineCtx.createGain();

        oscHigh.type = 'triangle';
        oscHigh.frequency.setValueAtTime(1500, outTime);

        oscLow.type = 'sine';
        oscLow.frequency.setValueAtTime(800, outTime);

        gainNode.gain.setValueAtTime(1.2, outTime);
        gainNode.gain.setValueAtTime(1.2, outTime + 0.008);
        gainNode.gain.exponentialRampToValueAtTime(0.001, outTime + 0.055);

        oscHigh.connect(gainNode);
        oscLow.connect(gainNode);
        gainNode.connect(compressor);

        oscHigh.start(outTime);
        oscLow.start(outTime);
        oscHigh.stop(outTime + 0.06);
        oscLow.stop(outTime + 0.06);
      } else {
        // 弱拍：800Hz 三角波 (总长 45ms)
        const osc = offlineCtx.createOscillator();
        const gainNode = offlineCtx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(800, outTime);

        gainNode.gain.setValueAtTime(0.9, outTime);
        gainNode.gain.setValueAtTime(0.9, outTime + 0.005);
        gainNode.gain.exponentialRampToValueAtTime(0.001, outTime + 0.045);

        osc.connect(gainNode);
        gainNode.connect(compressor);

        osc.start(outTime);
        osc.stop(outTime + 0.05);
      }
    }
  }

  return await offlineCtx.startRendering();
}

/**
 * 从源视频 PCM 数据中截取对应时间段并按慢放倍率生成变速离线音轨
 */
function createSourceAudioBuffer(
  sourceRawPcm: Float32Array,
  sourceSampleRate: number,
  exportStart: number,
  outputDurationSec: number,
  slowMotionRate: number,
  anchorTime: number,
  rate: number,
  targetSampleRate: number
): AudioBuffer {
  const totalSamples = Math.max(1, Math.round(outputDurationSec * targetSampleRate));
  const audioCtx = new AudioContext({ sampleRate: targetSampleRate });
  const audioBuffer = audioCtx.createBuffer(1, totalSamples, targetSampleRate);
  const outChannel = audioBuffer.getChannelData(0);

  const sourceLength = sourceRawPcm.length;

  for (let i = 0; i < totalSamples; i++) {
    const outTime = i / targetSampleRate;
    const currentTau = exportStart + outTime * slowMotionRate;
    const sourceTime = mapTauToSourceTime(currentTau, anchorTime, rate);

    if (sourceTime >= 0) {
      const sourceIndex = sourceTime * sourceSampleRate;
      const indexFloor = Math.floor(sourceIndex);
      const frac = sourceIndex - indexFloor;

      if (indexFloor >= 0 && indexFloor < sourceLength - 1) {
        // 双点线性插值重采样
        outChannel[i] = sourceRawPcm[indexFloor] * (1 - frac) + sourceRawPcm[indexFloor + 1] * frac;
      } else if (indexFloor >= 0 && indexFloor < sourceLength) {
        outChannel[i] = sourceRawPcm[indexFloor];
      } else {
        outChannel[i] = 0;
      }
    } else {
      outChannel[i] = 0;
    }
  }

  audioCtx.close().catch(() => {});
  return audioBuffer;
}

export class VideoExporter {
  private config: ExporterConfig;
  private isCancelled: boolean = false;

  constructor(config: ExporterConfig) {
    this.config = config;
  }

  /**
   * 取消正在执行的离线导出任务
   */
  public cancel(): void {
    this.isCancelled = true;
  }

  /**
   * 执行确定性时间戳离线逐帧渲染与 WebCodecs 硬件加速 MP4 编码
   */
  public async export(): Promise<{ blob: Blob; savedPath?: string }> {
    if (!isWebCodecsSupported()) {
      throw new Error(
        '当前运行环境不支持 WebCodecs 原生硬件视频编码器，请使用最新 Chrome/Edge 浏览器或在 Android 系统更新 WebView。'
      );
    }

    const {
      video1,
      video2,
      timeline,
      mode,
      mirror1,
      mirror2,
      triLineTransform,
      viewport,
      relativeOpacity,
      slowMotionRate,
      soundSource,
      fps = 30,
      width = 1280,
      height = 720,
      onProgress,
    } = this.config;

    // 1. 规整画幅尺寸为偶数 (H.264 编码器硬性约束)
    const exportWidth = width % 2 === 0 ? width : width - 1;
    const exportHeight = height % 2 === 0 ? height : height - 1;

    // 2. 纯数学确定性计算输出时长、总帧数与时间戳
    const exportStart = timeline.intersectInterval.start;
    const exportEnd = timeline.intersectInterval.end;
    const exportDuration = Math.max(0.1, exportEnd - exportStart);
    const outputDurationSec = exportDuration / slowMotionRate;
    const totalFrames = Math.max(1, Math.round(outputDurationSec * fps));

    onProgress({
      currentFrame: 0,
      totalFrames,
      percent: 0,
      statusText: '正在准备确定性时间戳与硬件编码管道...',
    });

    // 3. 准备离屏 Canvas
    const canvas = document.createElement('canvas');
    canvas.width = exportWidth;
    canvas.height = exportHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('无法创建 Canvas 2D 绘图上下文');

    // 4. 离线合成对应音轨
    const audioSampleRate = 44100;
    let audioBuffer: AudioBuffer | null = null;
    const isAacSupported = await isAacAudioSupported(audioSampleRate);

    if (soundSource !== 'mute' && isAacSupported) {
      onProgress({
        currentFrame: 0,
        totalFrames,
        percent: 0,
        statusText: '正在离线渲染伴奏音轨与声画同步数据...',
      });

      if (soundSource === 'metronome') {
        audioBuffer = await synthesizeMetronomeBuffer(
          exportStart,
          exportEnd,
          outputDurationSec,
          timeline.effectiveBpm,
          slowMotionRate,
          audioSampleRate
        );
      } else {
        const targetVideo = soundSource === 'video1' ? video1 : video2;
        const anchor =
          typeof targetVideo.audioInfo?.anchorTime === 'number'
            ? targetVideo.audioInfo.anchorTime
            : 1.0;
        const rate = soundSource === 'video1' ? timeline.rate1 : timeline.rate2;
        const rawPcm = targetVideo.audioInfo?.rawChannelData;

        if (rawPcm && rawPcm.length > 0) {
          audioBuffer = createSourceAudioBuffer(
            rawPcm,
            targetVideo.audioInfo?.sampleRate || 44100,
            exportStart,
            outputDurationSec,
            slowMotionRate,
            anchor,
            rate,
            audioSampleRate
          );
        }
      }
    }

    // 5. 初始化 mp4-muxer 容器封装器与编码器
    const selectedVideoCodec = await selectSupportedVideoCodec(exportWidth, exportHeight, fps);

    const muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: {
        codec: 'avc',
        width: exportWidth,
        height: exportHeight,
        frameRate: fps,
      },
      audio:
        audioBuffer && isAacSupported
          ? {
              codec: 'aac',
              numberOfChannels: 1,
              sampleRate: audioSampleRate,
            }
          : undefined,
      fastStart: 'in-memory',
      firstTimestampBehavior: 'strict',
    });

    let videoEncoderError: Error | null = null;
    const videoEncoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => {
        videoEncoderError = e as Error;
        console.error('VideoEncoder 异常', e);
      },
    });

    videoEncoder.configure({
      codec: selectedVideoCodec,
      width: exportWidth,
      height: exportHeight,
      bitrate: 5_000_000,
      framerate: fps,
    });

    let audioEncoder: AudioEncoder | null = null;
    if (audioBuffer && isAacSupported) {
      audioEncoder = new AudioEncoder({
        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
        error: (e) => console.error('AudioEncoder 异常', e),
      });

      audioEncoder.configure({
        codec: 'mp4a.40.2',
        sampleRate: audioSampleRate,
        numberOfChannels: 1,
        bitrate: 128_000,
      });

      // 将离线音频缓冲切片送入音频编码器
      const channelData = audioBuffer.getChannelData(0);
      const totalAudioFrames = channelData.length;
      const audioChunkSize = 1024;

      for (let offset = 0; offset < totalAudioFrames; offset += audioChunkSize) {
        if (this.isCancelled) {
          audioEncoder.close();
          videoEncoder.close();
          throw new Error('用户已取消导出');
        }

        const chunkLen = Math.min(audioChunkSize, totalAudioFrames - offset);
        const subPcm = channelData.subarray(offset, offset + chunkLen);
        const audioTimestampMicros = Math.round((offset / audioSampleRate) * 1_000_000);

        const audioData = new AudioData({
          format: 'f32',
          sampleRate: audioSampleRate,
          numberOfFrames: chunkLen,
          numberOfChannels: 1,
          timestamp: audioTimestampMicros,
          data: subPcm,
        });

        audioEncoder.encode(audioData);
        audioData.close();
      }

      await audioEncoder.flush();
      audioEncoder.close();
    }

    // 6. 准备两路离屏视频元素进行离散寻道
    const offVideo1 = document.createElement('video');
    offVideo1.src = video1.url;
    offVideo1.muted = true;
    offVideo1.preload = 'auto';

    const offVideo2 = document.createElement('video');
    offVideo2.src = video2.url;
    offVideo2.muted = true;
    offVideo2.preload = 'auto';

    await Promise.all([
      new Promise<void>((r) => {
        offVideo1.onloadeddata = () => r();
        offVideo1.load();
      }),
      new Promise<void>((r) => {
        offVideo2.onloadeddata = () => r();
        offVideo2.load();
      }),
    ]);

    const seekVideo = (v: HTMLVideoElement, targetTime: number): Promise<void> => {
      return new Promise((resolve) => {
        const clamped = Math.max(0, Math.min(v.duration || targetTime, targetTime));
        if (Math.abs(v.currentTime - clamped) < 0.01) {
          resolve();
          return;
        }
        const onSeeked = () => {
          v.removeEventListener('seeked', onSeeked);
          resolve();
        };
        v.addEventListener('seeked', onSeeked);
        v.currentTime = clamped;
      });
    };

    const a1 = typeof video1.audioInfo?.anchorTime === 'number' ? video1.audioInfo.anchorTime : 1.0;
    const a2 = typeof video2.audioInfo?.anchorTime === 'number' ? video2.audioInfo.anchorTime : 1.0;

    // 7. 离散步进帧循环：确定性时间戳驱动
    const frameDurationMicros = Math.round((1 / fps) * 1_000_000);

    for (let frame = 0; frame < totalFrames; frame++) {
      if (this.isCancelled) {
        videoEncoder.close();
        throw new Error('用户已取消导出');
      }
      if (videoEncoderError) {
        videoEncoder.close();
        throw videoEncoderError;
      }

      // 计算当前帧在统一时间轴上的真实瞬态 tau
      const currentTau = exportStart + (frame / fps) * slowMotionRate;
      const t1 = mapTauToSourceTime(currentTau, a1, timeline.rate1);
      const t2 = mapTauToSourceTime(currentTau, a2, timeline.rate2);

      const v1Active = isTauInVideoRange(currentTau, timeline.span1);
      const v2Active = isTauInVideoRange(currentTau, timeline.span2);

      // 仅当在各自有效范围内时执行异步寻道解码
      const seeks: Promise<void>[] = [];
      if (v1Active) seeks.push(seekVideo(offVideo1, t1));
      if (v2Active) seeks.push(seekVideo(offVideo2, t2));
      if (seeks.length > 0) {
        await Promise.all(seeks);
      }

      // 单帧几何与透明度合成绘制
      const renderState: ComparisonRenderState = {
        mode,
        video1: offVideo1,
        video1Size: { width: video1.width, height: video1.height },
        video1Active: v1Active,
        mirror1,
        triLine1: video1.geometry.triLine,
        video2: offVideo2,
        video2Size: { width: video2.width, height: video2.height },
        video2Active: v2Active,
        mirror2,
        triLine2: video2.geometry.triLine,
        triLineTransform,
        relativeOpacity,
        viewport,
        canvasWidth: exportWidth,
        canvasHeight: exportHeight,
      };

      renderComparisonFrame(ctx, renderState);

      // 包装带确定性微秒时间戳的 VideoFrame 并送入编码器
      const timestampMicros = Math.round((frame / fps) * 1_000_000);
      const videoFrame = new VideoFrame(canvas, {
        timestamp: timestampMicros,
        duration: frameDurationMicros,
      });

      const isKeyFrame = frame % (fps * 2) === 0;
      videoEncoder.encode(videoFrame, { keyFrame: isKeyFrame });

      // 必须立即显式释放 VideoFrame GPU 纹理显存，杜绝移动端内存溢出
      videoFrame.close();

      // 每 10 帧让出微任务循环并更新 UI 进度
      if (frame % 10 === 0 || frame === totalFrames - 1) {
        const percent = Math.round(((frame + 1) / totalFrames) * 100);
        onProgress({
          currentFrame: frame + 1,
          totalFrames,
          percent,
          statusText: `正在离线合成逐帧画面 (${frame + 1}/${totalFrames} 帧)...`,
        });
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    // 8. 冲刷并关闭视频编码器，完成 MP4 封装
    await videoEncoder.flush();
    videoEncoder.close();

    muxer.finalize();
    const finalBuffer = muxer.target.buffer;
    const finalBlob = new Blob([finalBuffer], { type: 'video/mp4' });

    // 9. Android 原生环境持久化写入相册
    let savedPath: string | undefined;
    if (Capacitor.isNativePlatform()) {
      try {
        const fileName = `wotagei_compare_${Date.now()}.mp4`;
        const reader = new FileReader();
        const base64Data = await new Promise<string>((resolve, reject) => {
          reader.onloadend = () => {
            const base64 = (reader.result as string).split(',')[1];
            resolve(base64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(finalBlob);
        });

        const res = await Filesystem.writeFile({
          path: fileName,
          data: base64Data,
          directory: Directory.Documents,
        });
        savedPath = res.uri;
      } catch (err) {
        console.warn('原生相册保存失败，降级返回 Blob', err);
      }
    }

    onProgress({
      currentFrame: totalFrames,
      totalFrames,
      percent: 100,
      statusText: '导出完成！',
    });

    return { blob: finalBlob, savedPath };
  }
}
