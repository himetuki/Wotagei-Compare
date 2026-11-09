/**
 * 统一时间轴映射、速率比换算与并集区间计算核心算法
 */

import type {
  BpmAlignStrategy,
  SlowMotionRate,
  TimeInterval,
} from '../types/timeline.ts';

export interface VideoTimelineParams {
  duration: number; // 视频时长 (秒)
  bpm: number; // 视频当前 BPM
  anchorTime: number; // 对拍锚点 (秒)
}

export interface UnifiedTimelineResult {
  rate1: number; // 视频 1 相对速率比
  rate2: number; // 视频 2 相对速率比
  effectiveBpm: number; // 对齐后的有效基准 BPM
  unionInterval: TimeInterval; // 统一时间轴并集区间 (秒)
  span1: TimeInterval; // 视频 1 在统一时间轴上的区间
  span2: TimeInterval; // 视频 2 在统一时间轴上的区间
}

/**
 * 根据双方 BPM 与对齐策略计算各自的速率比及统一时间轴区间
 */
export function calculateUnifiedTimeline(
  params1: VideoTimelineParams,
  params2: VideoTimelineParams,
  strategy: BpmAlignStrategy,
  customTargetBpm?: number
): UnifiedTimelineResult {
  const bpm1 = Math.max(1, params1.bpm || 160);
  const bpm2 = Math.max(1, params2.bpm || 160);

  let rate1 = 1;
  let rate2 = 1;
  let effectiveBpm = bpm1;

  if (strategy === 'left') {
    rate1 = 1;
    rate2 = bpm1 / bpm2;
    effectiveBpm = bpm1;
  } else if (strategy === 'right') {
    rate1 = bpm2 / bpm1;
    rate2 = 1;
    effectiveBpm = bpm2;
  } else if (strategy === 'custom') {
    const target = customTargetBpm && customTargetBpm > 0 ? customTargetBpm : bpm1;
    rate1 = target / bpm1;
    rate2 = target / bpm2;
    effectiveBpm = target;
  } else {
    // 'none' 不对齐 BPM，各自速率比为 1
    rate1 = 1;
    rate2 = 1;
    effectiveBpm = bpm1;
  }

  // 映射到以锚点为 0 的统一时间轴区间 [start, end]
  const start1 = -params1.anchorTime / rate1;
  const end1 = (params1.duration - params1.anchorTime) / rate1;

  const start2 = -params2.anchorTime / rate2;
  const end2 = (params2.duration - params2.anchorTime) / rate2;

  const unionStart = Math.min(start1, start2);
  const unionEnd = Math.max(end1, end2);

  return {
    rate1,
    rate2,
    effectiveBpm,
    unionInterval: { start: unionStart, end: unionEnd },
    span1: { start: start1, end: end1 },
    span2: { start: start2, end: end2 },
  };
}

/**
 * 根据统一时间轴偏移 tau (秒) 获取源视频实际时间戳 (秒)
 * @param tau 统一时间轴偏移时间 (以锚点为 0)
 * @param anchorTime 源视频锚点时间戳
 * @param rate 相对速率比
 */
export function mapTauToSourceTime(
  tau: number,
  anchorTime: number,
  rate: number
): number {
  return anchorTime + tau * rate;
}

/**
 * 根据源视频时间戳获取统一时间轴偏移 tau (秒)
 */
export function mapSourceTimeToTau(
  sourceTime: number,
  anchorTime: number,
  rate: number
): number {
  return rate !== 0 ? (sourceTime - anchorTime) / rate : 0;
}

/**
 * 判断当前统一时间 tau 是否处于视频的有效区间内
 */
export function isTauInVideoRange(
  tau: number,
  span: TimeInterval
): boolean {
  return tau >= span.start && tau <= span.end;
}

/**
 * 计算实际播放时的各视频倍速
 * @param slowMotionRate 用户选择的慢放倍速 (如 0.1, 0.5)
 * @param videoRate 视频的相对速率比 (rate1 或 rate2)
 */
export function getPlaybackRate(
  slowMotionRate: SlowMotionRate,
  videoRate: number
): number {
  return slowMotionRate * videoRate;
}
