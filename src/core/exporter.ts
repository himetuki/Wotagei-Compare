/**
 * 所见即所得离线逐帧视频导出与音频混流引擎
 */

import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
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

export class VideoExporter {
  private config: ExporterConfig;
  private isCancelled: boolean = false;

  constructor(config: ExporterConfig) {
    this.config = config;
  }

  public cancel(): void {
    this.isCancelled = true;
  }

  /**
   * 执行离线逐帧步进渲染并编码为 MP4/WebM 视频
   */
  public async export(): Promise<{ blob: Blob; savedPath?: string }> {
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

    // 1. 计算总帧数与时间
    const unionStart = timeline.unionInterval.start;
    const unionEnd = timeline.unionInterval.end;
    const unionDuration = unionEnd - unionStart;
    const outputDurationSec = unionDuration / slowMotionRate;
    const totalFrames = Math.max(1, Math.round(outputDurationSec * fps));

    onProgress({
      currentFrame: 0,
      totalFrames,
      percent: 0,
      statusText: '正在准备导出画幅与离线音视频管道...',
    });

    // 2. 准备离屏 Canvas
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('无法创建 Canvas 2D 绘图上下文');

    // 3. 准备离屏两路视频元素
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

    // 4. 合成离线音轨 (OfflineAudioContext)
    const audioContextSampleRate = 44100;
    const offlineAudioCtx = new OfflineAudioContext(
      1,
      Math.max(1, Math.round(outputDurationSec * audioContextSampleRate)),
      audioContextSampleRate
    );

    if (soundSource === 'metronome') {
      // 合成节奏节拍器音轨
      const effectiveBpm = timeline.effectiveBpm;
      const beatIntervalTau = 60 / effectiveBpm;
      let tauBeat = Math.ceil(unionStart / beatIntervalTau) * beatIntervalTau;

      while (tauBeat <= unionEnd) {
        const outTime = (tauBeat - unionStart) / slowMotionRate;
        if (outTime >= 0 && outTime < outputDurationSec) {
          const osc = offlineAudioCtx.createOscillator();
          const gain = offlineAudioCtx.createGain();
          const beatIndex = Math.round(tauBeat / beatIntervalTau);
          osc.frequency.setValueAtTime(beatIndex % 4 === 0 ? 1200 : 800, outTime);

          gain.gain.setValueAtTime(0.7, outTime);
          gain.gain.exponentialRampToValueAtTime(0.001, outTime + 0.035);

          osc.connect(gain);
          gain.connect(offlineAudioCtx.destination);
          osc.start(outTime);
          osc.stop(outTime + 0.04);
        }
        tauBeat += beatIntervalTau;
      }
    }

    const renderedAudioBuffer = await offlineAudioCtx.startRendering();

    // 5. 搭建 MediaRecorder 录制管线
    const canvasStream = canvas.captureStream(fps);

    // 注入渲染好的音轨
    const audioDest = new AudioContext();
    const sourceNode = audioDest.createBufferSource();
    sourceNode.buffer = renderedAudioBuffer;
    const mediaStreamAudioDest = audioDest.createMediaStreamDestination();
    sourceNode.connect(mediaStreamAudioDest);
    sourceNode.start();

    const mixedStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...mediaStreamAudioDest.stream.getAudioTracks(),
    ]);

    // 探测支持的最佳视频格式
    let mimeType = 'video/mp4';
    if (!MediaRecorder.isTypeSupported('video/mp4')) {
      if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
        mimeType = 'video/webm;codecs=vp9';
      } else {
        mimeType = 'video/webm';
      }
    }

    const recorder = new MediaRecorder(mixedStream, {
      mimeType,
      videoBitsPerSecond: 6000000,
    });

    const recordedChunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        recordedChunks.push(e.data);
      }
    };

    recorder.start(100);

    // 6. 离线离散步进帧渲染循环
    const seekVideo = (v: HTMLVideoElement, targetTime: number): Promise<void> => {
      return new Promise((resolve) => {
        const clamped = Math.max(0, Math.min(v.duration, targetTime));
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

    for (let frame = 0; frame < totalFrames; frame++) {
      if (this.isCancelled) {
        recorder.stop();
        audioDest.close().catch(() => {});
        throw new Error('用户已取消导出');
      }

      const a1 = typeof video1.audioInfo?.anchorTime === 'number' ? video1.audioInfo.anchorTime : 1.0;
      const a2 = typeof video2.audioInfo?.anchorTime === 'number' ? video2.audioInfo.anchorTime : 1.0;
      const currentTau = unionStart + (frame / fps) * slowMotionRate;
      const t1 = mapTauToSourceTime(currentTau, a1, timeline.rate1);
      const t2 = mapTauToSourceTime(currentTau, a2, timeline.rate2);

      const v1Active = isTauInVideoRange(currentTau, timeline.span1);
      const v2Active = isTauInVideoRange(currentTau, timeline.span2);

      // 仅当在活跃范围内时才 seek
      const seeks: Promise<void>[] = [];
      if (v1Active) seeks.push(seekVideo(offVideo1, t1));
      if (v2Active) seeks.push(seekVideo(offVideo2, t2));
      if (seeks.length > 0) {
        await Promise.all(seeks);
      }

      // 执行纯函数 Canvas 单帧渲染
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
        canvasWidth: width,
        canvasHeight: height,
      };

      renderComparisonFrame(ctx, renderState);

      // 每 10 帧更新一次导出进度，防止频繁渲染阻塞 UI
      if (frame % 10 === 0 || frame === totalFrames - 1) {
        const percent = Math.round((frame / totalFrames) * 100);
        onProgress({
          currentFrame: frame + 1,
          totalFrames,
          percent,
          statusText: `正在合成逐帧画面 (${frame + 1}/${totalFrames} 帧)...`,
        });
        // 让出微任务事件循环
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    // 7. 结束录制并提取 Blob
    const finalBlob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(recordedChunks, { type: mimeType });
        resolve(blob);
      };
      recorder.stop();
    });

    audioDest.close().catch(() => {});

    // 8. 若在 Android 原生环境，保存至系统相册目录
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
