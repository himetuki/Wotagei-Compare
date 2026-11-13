import { Capacitor, registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import type { ComparisonMode } from '../types/geometry.ts';
import type { SlowMotionRate, SoundSource } from '../types/timeline.ts';

export interface NativePickVideoResult {
  canceled: boolean;
  uri?: string;
  streamUrl?: string;
  name?: string;
  size?: number;
  width?: number;
  height?: number;
  duration?: number;
}

export interface NativeExtractAudioResult {
  hasAudio: boolean;
  sampleRate: number;
  duration: number;
  pcmUrl?: string;
}

export interface NormalizedRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface NativeVideoLayerLayout {
  uri: string;
  anchorTime: number;
  rate: number;
  spanStart: number;
  spanEnd: number;
  mirror: boolean;
  alpha: number;
  clipRect: NormalizedRect;
  mainRect: NormalizedRect;
  bgRect?: NormalizedRect;
  bgAlpha?: number;
}

export interface NativeExportRequest {
  mode: ComparisonMode;
  width: number;
  height: number;
  fps: number;
  exportStartTau: number;
  exportEndTau: number;
  slowMotionRate: SlowMotionRate;
  effectiveBpm: number;
  soundSource: SoundSource;
  video1: NativeVideoLayerLayout;
  video2: NativeVideoLayerLayout;
}

export interface NativeExportProgressEvent {
  currentFrame: number;
  totalFrames: number;
  percent: number;
  statusText: string;
}

export interface NativeExportResult {
  savedPath: string;
  width: number;
  height: number;
  durationSec: number;
}

export interface NativeMediaPlugin {
  pickVideo(options: { channel: 1 | 2 }): Promise<NativePickVideoResult>;
  extractAudioAnalysis(options: { uri: string }): Promise<NativeExtractAudioResult>;
  exportVideo(options: NativeExportRequest): Promise<NativeExportResult>;
  cancelExport(): Promise<void>;
  addListener(
    eventName: 'exportProgress',
    listenerFunc: (event: NativeExportProgressEvent) => void
  ): Promise<PluginListenerHandle>;
}

export const NativeMedia = registerPlugin<NativeMediaPlugin>('NativeMedia');

/**
 * 判断当前是否运行于 Android 原生应用容器内
 */
export function isNativeAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}
