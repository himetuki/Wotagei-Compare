/**
 * 应用默认工作流偏好设置校验与 localStorage 持久化工具
 */

import type { ComparisonMode, TriLineModelType } from '../types/geometry.ts';
import type {
  AppPreferences,
  StepPreset,
} from '../types/preferences.ts';
import { DEFAULT_APP_PREFERENCES } from '../types/preferences.ts';
import type { BpmAlignStrategy, SlowMotionRate, SoundSource } from '../types/timeline.ts';

export const APP_PREFERENCES_STORAGE_KEY = 'wotagei_compare_preferences_v1';
export const MIN_CUSTOM_STEP_SEC = 0.005;

const VALID_TRI_LINE_MODELS: TriLineModelType[] = [
  'two-horizontal-one-vertical',
  'two-vertical-one-horizontal',
];

const VALID_COMPARISON_MODES: ComparisonMode[] = ['split-screen', 'overlay'];

const VALID_SOUND_SOURCES: SoundSource[] = ['metronome', 'video1', 'video2', 'mute'];

const VALID_BPM_STRATEGIES: BpmAlignStrategy[] = ['none', 'left', 'right', 'custom'];

const VALID_SLOW_RATES: SlowMotionRate[] = [0.1, 0.15, 0.2, 0.3, 0.5, 0.75, 1.0];

const VALID_STEP_PRESETS: StepPreset[] = [
  'frame',
  '50ms',
  '100ms',
  'beat-quarter',
  'beat-half',
  'custom',
];

function resolveStorage(
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null
): Pick<Storage, 'getItem' | 'setItem'> | null {
  if (storage !== undefined) return storage;
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return null;
}

/**
 * 钳位并校验自定义步进秒数（下限 0.005s）
 */
export function sanitizeCustomStepSec(
  value: unknown,
  fallback: number = DEFAULT_APP_PREFERENCES.customStepSec
): number {
  if (typeof value === 'string' && value.trim() === '') return fallback;
  const num = typeof value === 'number' ? value : Number(value);
  if (!isFinite(num) || isNaN(num)) return fallback;
  return Math.max(MIN_CUSTOM_STEP_SEC, num);
}

/**
 * 校验自定义目标 BPM（整数，>= 1）
 */
export function sanitizeCustomBpm(
  value: unknown,
  fallback: number = DEFAULT_APP_PREFERENCES.customBpm
): number {
  if (typeof value === 'string' && value.trim() === '') return fallback;
  const num = typeof value === 'number' ? value : Number(value);
  if (!isFinite(num) || isNaN(num) || num < 1) return fallback;
  return Math.min(999, Math.max(1, Math.round(num)));
}

/**
 * 对任意来源的偏好对象进行字段白名单校验与兜底归一化
 */
export function normalizeAppPreferences(raw: unknown): AppPreferences {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_APP_PREFERENCES };
  }
  const obj = raw as Record<string, unknown>;

  const triLineModel = VALID_TRI_LINE_MODELS.indexOf(obj.triLineModel as TriLineModelType) >= 0
    ? (obj.triLineModel as TriLineModelType)
    : DEFAULT_APP_PREFERENCES.triLineModel;

  const comparisonMode =
    VALID_COMPARISON_MODES.indexOf(obj.comparisonMode as ComparisonMode) >= 0
      ? (obj.comparisonMode as ComparisonMode)
      : DEFAULT_APP_PREFERENCES.comparisonMode;

  const soundSource = VALID_SOUND_SOURCES.indexOf(obj.soundSource as SoundSource) >= 0
    ? (obj.soundSource as SoundSource)
    : DEFAULT_APP_PREFERENCES.soundSource;

  const bpmStrategy = VALID_BPM_STRATEGIES.indexOf(obj.bpmStrategy as BpmAlignStrategy) >= 0
    ? (obj.bpmStrategy as BpmAlignStrategy)
    : DEFAULT_APP_PREFERENCES.bpmStrategy;

  const slowMotionRate = VALID_SLOW_RATES.indexOf(obj.slowMotionRate as SlowMotionRate) >= 0
    ? (obj.slowMotionRate as SlowMotionRate)
    : DEFAULT_APP_PREFERENCES.slowMotionRate;

  const stepPreset = VALID_STEP_PRESETS.indexOf(obj.stepPreset as StepPreset) >= 0
    ? (obj.stepPreset as StepPreset)
    : DEFAULT_APP_PREFERENCES.stepPreset;

  return {
    triLineModel,
    comparisonMode,
    soundSource,
    bpmStrategy,
    customBpm: sanitizeCustomBpm(obj.customBpm, DEFAULT_APP_PREFERENCES.customBpm),
    slowMotionRate,
    stepPreset,
    customStepSec: sanitizeCustomStepSec(
      obj.customStepSec,
      DEFAULT_APP_PREFERENCES.customStepSec
    ),
  };
}

/**
 * 从持久化存储加载应用默认工作流偏好
 */
export function loadAppPreferences(
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null
): AppPreferences {
  const store = resolveStorage(storage);
  if (!store) {
    return { ...DEFAULT_APP_PREFERENCES };
  }
  try {
    const rawText = store.getItem(APP_PREFERENCES_STORAGE_KEY);
    if (!rawText) {
      return { ...DEFAULT_APP_PREFERENCES };
    }
    return normalizeAppPreferences(JSON.parse(rawText));
  } catch {
    return { ...DEFAULT_APP_PREFERENCES };
  }
}

/**
 * 归一化并持久化保存应用默认工作流偏好
 */
export function saveAppPreferences(
  prefs: AppPreferences,
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null
): AppPreferences {
  const normalized = normalizeAppPreferences(prefs);
  const store = resolveStorage(storage);
  if (store) {
    try {
      store.setItem(APP_PREFERENCES_STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // 隐私模式或存储受限环境静默降级为内存态
    }
  }
  return normalized;
}
