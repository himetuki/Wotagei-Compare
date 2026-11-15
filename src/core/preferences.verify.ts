/**
 * 应用默认工作流偏好配置持久化与边界校验离线脚本
 */

import { DEFAULT_APP_PREFERENCES, type AppPreferences } from '../types/preferences.ts';
import {
  APP_PREFERENCES_STORAGE_KEY,
  loadAppPreferences,
  saveAppPreferences,
  sanitizeCustomStepSec,
} from './preferences.ts';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    throw new Error(msg);
  }
}

function createMemoryStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

console.log('=== 1. 空存储读取应返回出厂默认偏好 ===');
const emptyStore = createMemoryStorage();
const initial = loadAppPreferences(emptyStore);
assert(initial.triLineModel === DEFAULT_APP_PREFERENCES.triLineModel, 'triLineModel 默认值错误');
assert(initial.comparisonMode === 'split-screen', 'comparisonMode 默认值应为 split-screen');
assert(initial.soundSource === 'metronome', 'soundSource 默认值应为 metronome');
assert(initial.bpmStrategy === 'left', 'bpmStrategy 默认值应为 left');
assert(initial.customBpm === 160, 'customBpm 默认值应为 160');
assert(initial.slowMotionRate === 1.0, 'slowMotionRate 默认值应为 1.0');
assert(initial.stepPreset === 'frame', 'stepPreset 默认值应为 frame');
assert(initial.customStepSec === 0.033, 'customStepSec 默认值应为 0.033');
console.log('✓ 空存储读取出厂默认偏好验证通过');

console.log('=== 2. 损坏/残缺 JSON 与越界字段应安全回退或钳位 ===');
const corruptStore = createMemoryStorage();
corruptStore.setItem(APP_PREFERENCES_STORAGE_KEY, '{not-valid-json');
const fromBadJson = loadAppPreferences(corruptStore);
assert(fromBadJson.comparisonMode === 'split-screen', '损坏 JSON 未回退默认值');

corruptStore.setItem(
  APP_PREFERENCES_STORAGE_KEY,
  JSON.stringify({
    triLineModel: 'invalid-model',
    comparisonMode: 'overlay',
    soundSource: 'video2',
    bpmStrategy: 'custom',
    customBpm: -50,
    slowMotionRate: 0.99,
    stepPreset: 'custom',
    customStepSec: 0.001,
  })
);
const partial = loadAppPreferences(corruptStore);
assert(partial.triLineModel === 'two-horizontal-one-vertical', '非法三线模式未回退');
assert(partial.comparisonMode === 'overlay', '合法 comparisonMode 未保留');
assert(partial.soundSource === 'video2', '合法 soundSource 未保留');
assert(partial.bpmStrategy === 'custom', '合法 bpmStrategy 未保留');
assert(partial.customBpm === 160, '负数 customBpm 未回退');
assert(partial.slowMotionRate === 1.0, '非法 slowMotionRate 未回退');
assert(partial.stepPreset === 'custom', '合法 stepPreset 未保留');
assert(partial.customStepSec === 0.005, '过小 customStepSec 未钳位至 0.005');
assert(sanitizeCustomStepSec('0.002') === 0.005, '字符串自定义步进未钳位至 0.005');
assert(sanitizeCustomStepSec('abc', 0.05) === 0.05, '非法字符串未回退 fallback');
console.log('✓ 残缺存储与越界钳位验证通过');

console.log('=== 3. 保存与重新读取往返持久化验证 ===');
const store = createMemoryStorage();
const customPrefs: AppPreferences = {
  triLineModel: 'two-vertical-one-horizontal',
  comparisonMode: 'overlay',
  soundSource: 'video1',
  bpmStrategy: 'right',
  customBpm: 175,
  slowMotionRate: 0.5,
  stepPreset: 'custom',
  customStepSec: 0.04,
};
saveAppPreferences(customPrefs, store);
const reloaded = loadAppPreferences(store);
assert(reloaded.triLineModel === 'two-vertical-one-horizontal', '往返三线模式不一致');
assert(reloaded.comparisonMode === 'overlay', '往返对比模式不一致');
assert(reloaded.soundSource === 'video1', '往返音源不一致');
assert(reloaded.bpmStrategy === 'right', '往返 BPM 策略不一致');
assert(reloaded.customBpm === 175, '往返 customBpm 不一致');
assert(reloaded.slowMotionRate === 0.5, '往返 slowMotionRate 不一致');
assert(reloaded.stepPreset === 'custom', '往返 stepPreset 不一致');
assert(reloaded.customStepSec === 0.04, '往返 customStepSec 不一致');
console.log('✓ 持久化保存与重新读取验证通过');
