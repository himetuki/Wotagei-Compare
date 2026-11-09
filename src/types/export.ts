/**
 * 视频导出与合成配置契约
 */

import { ComparisonMode, ViewportTransform } from './geometry';
import { SlowMotionRate, SoundSource } from './timeline';

/** 导出任务状态 */
export interface ExportState {
  isExporting: boolean;
  progress: number; // 0 ~ 100
  statusText: string;
  error?: string;
  outputPath?: string;
}

/** 所见即所得视频导出参数 */
export interface ExportOptions {
  mode: ComparisonMode;
  slowMotionRate: SlowMotionRate;
  soundSource: SoundSource;
  relativeOpacity: number; // -1 ~ 1
  viewport: ViewportTransform;
  width: number;
  height: number;
  fps: number;
}
