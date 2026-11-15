/**
 * 应用默认工作流偏好配置契约
 */

import type { ComparisonMode, TriLineModelType } from './geometry';
import type { BpmAlignStrategy, SlowMotionRate, SoundSource } from './timeline';

/** 对比工作台步进粒度预设 */
export type StepPreset =
  | 'frame'
  | '50ms'
  | '100ms'
  | 'beat-quarter'
  | 'beat-half'
  | 'custom';

/** 用户默认工作流偏好配置 */
export interface AppPreferences {
  triLineModel: TriLineModelType;
  comparisonMode: ComparisonMode;
  soundSource: SoundSource;
  bpmStrategy: BpmAlignStrategy;
  customBpm: number;
  slowMotionRate: SlowMotionRate;
  stepPreset: StepPreset;
  customStepSec: number;
}

/** 出厂默认工作流偏好常量 */
export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  triLineModel: 'two-horizontal-one-vertical',
  comparisonMode: 'split-screen',
  soundSource: 'metronome',
  bpmStrategy: 'left',
  customBpm: 160,
  slowMotionRate: 1.0,
  stepPreset: 'frame',
  customStepSec: 0.033,
};
