/**
 * 验证脚本：DualVideoSyncEngine 与连续阻尼调速控制算法、代数守卫及会合屏障
 */

import {
  calculateDampedPlaybackRate,
  SafeVideoController,
  DualVideoSyncEngine,
} from './sync-engine.ts';
import { calculateUnifiedTimeline } from './timeline.ts';

console.log('=== 1. 验证连续阻尼比例调速计算纯函数 ===');

const baseRate = 1.0;

// 1.1 死区测试（小于 10ms 保持 baseRate，不触发无意义重采样）
const rateZero = calculateDampedPlaybackRate(0.005, baseRate);
console.log('死区内 (5ms diff):', rateZero, '期望:', 1.0);
if (Math.abs(rateZero - 1.0) > 1e-6) {
  throw new Error('死区保护失效');
}

// 1.2 阻尼正向追赶测试 (落后 50ms)
const rateCatchUp = calculateDampedPlaybackRate(0.05, baseRate);
console.log('落后 50ms 追赶倍率:', rateCatchUp, '期望: 1.10');
if (Math.abs(rateCatchUp - 1.10) > 1e-5) {
  throw new Error(`阻尼追赶计算错误: 实际 ${rateCatchUp}`);
}

// 1.3 阻尼负向减速测试 (超前 50ms)
const rateSlowDown = calculateDampedPlaybackRate(-0.05, baseRate);
console.log('超前 50ms 减速倍率:', rateSlowDown, '期望: 0.90');
if (Math.abs(rateSlowDown - 0.90) > 1e-5) {
  throw new Error(`阻尼减速计算错误: 实际 ${rateSlowDown}`);
}

// 1.4 最大微调幅度 Clamp 测试 (默认最大 ±15%)
const rateMaxClamped = calculateDampedPlaybackRate(0.20, baseRate);
console.log('落后 200ms 微调上限:', rateMaxClamped, '期望: 1.15');
if (Math.abs(rateMaxClamped - 1.15) > 1e-5) {
  throw new Error(`微调上限 Clamp 错误: 实际 ${rateMaxClamped}`);
}

const rateMinClamped = calculateDampedPlaybackRate(-0.20, baseRate);
console.log('超前 200ms 微调下限:', rateMinClamped, '期望: 0.85');
if (Math.abs(rateMinClamped - 0.85) > 1e-5) {
  throw new Error(`微调下限 Clamp 错误: 实际 ${rateMinClamped}`);
}

console.log('=== 2. 验证 SafeVideoController 寻道排队防抖状态机 ===');

// 创建 Mock HTMLVideoElement
class MockVideoElement {
  public currentTime: number = 0;
  public duration: number = 100;
  public seeking: boolean = false;
  public readyState: number = 4;
  public paused: boolean = true;
  public playbackRate: number = 1.0;
  public muted: boolean = false;
  public preservesPitch: boolean = true;

  private listeners: Map<string, Array<() => void>> = new Map();

  public addEventListener(event: string, handler: () => void, options?: { once?: boolean }) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    const wrapped = () => {
      handler();
      if (options?.once) {
        this.removeEventListener(event, wrapped);
      }
    };
    this.listeners.get(event)!.push(wrapped);
  }

  public removeEventListener(event: string, handler: () => void) {
    const list = this.listeners.get(event);
    if (list) {
      this.listeners.set(event, list.filter(h => h !== handler));
    }
  }

  public triggerSeeked() {
    this.seeking = false;
    const list = [...(this.listeners.get('seeked') || [])];
    list.forEach(h => h());
  }

  public triggerLoadedMetadata(duration: number = 100) {
    this.readyState = 2;
    this.duration = duration;
    const list = [...(this.listeners.get('loadedmetadata') || [])];
    list.forEach(h => h());
  }

  public play(): Promise<void> {
    this.paused = false;
    return Promise.resolve();
  }

  public pause(): void {
    this.paused = true;
  }
}

const mockVideo = new MockVideoElement() as unknown as HTMLVideoElement;
const controller = new SafeVideoController(mockVideo);

// 2.1 首次 seek
controller.seek(10.0);
console.log('首次 seek 后 isSeeking:', controller.isSeeking, '期望: true');
if (!controller.isSeeking) {
  throw new Error('首次 seek 应将 isSeeking 设为 true');
}

// 2.2 在 seeking 期间高频连续触发多次 seek (排队测试)
controller.seek(15.0);
controller.seek(20.0);
console.log('排队最新目标 pendingTarget:', controller.pendingTarget, '期望: 20');
if (controller.pendingTarget !== 20.0) {
  throw new Error('未正确保留最新排队寻道目标');
}

// 2.3 触发第一次底层 seeked，验证自动消费最新目标
(mockVideo as unknown as MockVideoElement).triggerSeeked();
console.log('消费后 pendingTarget 应清空:', controller.pendingTarget, '期望: null');
console.log('正在执行消费寻道 isSeeking:', controller.isSeeking, '期望: true');
if (controller.pendingTarget !== null || !controller.isSeeking) {
  throw new Error('寻道队列消费状态异常');
}

// 2.4 第二次底层 seeked，队列彻底归于稳定
(mockVideo as unknown as MockVideoElement).triggerSeeked();
console.log('最终稳定 isSeeking:', controller.isSeeking, '期望: false');
if (controller.isSeeking) {
  throw new Error('最终寻道状态未重置为 false');
}

// 2.5 验证元数据加载前寻道拦截排队 (readyState < 1 且 duration 为 NaN 时不误裁为 0)
console.log('--- 测试元数据未加载寻道拦截与就绪唤醒 ---');
const unreadyMock = new MockVideoElement();
unreadyMock.readyState = 0;
unreadyMock.duration = NaN;
const unreadyController = new SafeVideoController(unreadyMock as unknown as HTMLVideoElement);

unreadyController.seek(25.0);
console.log('元数据未就绪时 pendingTarget:', unreadyController.pendingTarget, '期望: 25');
if (unreadyController.pendingTarget !== 25.0) {
  throw new Error('元数据未就绪时未正确暂存排队目标');
}
if (unreadyMock.currentTime !== 0) {
  throw new Error('元数据未就绪时不应直接设置 currentTime');
}

// 模拟异步元数据加载完成
unreadyMock.triggerLoadedMetadata(100);
console.log('元数据就绪后自动启动寻道 isSeeking:', unreadyController.isSeeking, '期望: true');
if (!unreadyController.isSeeking) {
  throw new Error('元数据就绪后未自动恢复寻道');
}
if ((unreadyMock.currentTime as number) !== 25.0) {
  throw new Error(`元数据就绪后 currentTime 应被设为 25.0，实际: ${unreadyMock.currentTime}`);
}
unreadyMock.triggerSeeked();
console.log('寻道完成稳定 isSeeking:', unreadyController.isSeeking, '期望: false');
if (unreadyController.isSeeking) {
  throw new Error('元数据就绪寻道完成后状态未重置');
}

console.log('=== 3. 验证 DualVideoSyncEngine 步进时钟与阻尼跟踪 ===');

const mockV1 = new MockVideoElement() as unknown as HTMLVideoElement;
const mockV2 = new MockVideoElement() as unknown as HTMLVideoElement;

const timeline = calculateUnifiedTimeline(
  { duration: 30, bpm: 160, anchorTime: 10, trimRange: { start: 5, end: 25 } },
  { duration: 40, bpm: 150, anchorTime: 15, trimRange: { start: 10, end: 35 } },
  'left'
);

let reportedTau = 0;
const engine = new DualVideoSyncEngine(mockV1, mockV2, {
  timeline,
  anchor1: 10,
  anchor2: 15,
  soundSource: 'video1',
  slowMotionRate: 1.0,
  onTauUpdate: (tau) => {
    reportedTau = tau;
  },
});

// 手动设置播放态测试阻尼算法
(engine as any).intendedPlaying = true;
(engine as any).isPlaying = true;
(mockV1 as unknown as MockVideoElement).currentTime = 12.0;
(mockV1 as unknown as MockVideoElement).paused = false;

(mockV2 as unknown as MockVideoElement).currentTime = 17.05;
(mockV2 as unknown as MockVideoElement).paused = false;

engine.stepSync(1000, 0.016);
console.log('主时钟更新 tau:', reportedTau, '期望: 2.0');
if (Math.abs(reportedTau - 2.0) > 1e-4) {
  throw new Error('主时钟换算 tau 错误');
}

console.log('从属视频 2 追赶倍率:', (mockV2 as unknown as MockVideoElement).playbackRate, '期望 > 1.0');
if ((mockV2 as unknown as MockVideoElement).playbackRate <= 1.0) {
  throw new Error('从属视频未应用正向阻尼加速');
}

console.log('=== 4. 验证暂停状态下代数守卫阻断幽灵唤醒 (No Ghost Play) ===');

// 模拟正在 seek 过程中用户点击暂停
(mockV1 as unknown as MockVideoElement).seeking = true;
(mockV2 as unknown as MockVideoElement).seeking = true;

engine.pause();
console.log('调用 pause() 后 intendedPlaying:', engine.getIntendedPlaying(), '期望: false');
console.log('调用 pause() 后 isPlaying:', engine.getIsPlaying(), '期望: false');
if (engine.getIntendedPlaying() || engine.getIsPlaying()) {
  throw new Error('pause() 未能正确重置播放标记');
}

// 模拟滞后的底层 seeked 事件触发
(mockV1 as unknown as MockVideoElement).triggerSeeked();
(mockV2 as unknown as MockVideoElement).triggerSeeked();

console.log('滞后 seeked 触发后 v1 状态 paused:', (mockV1 as unknown as MockVideoElement).paused, '期望: true');
console.log('滞后 seeked 触发后 v2 状态 paused:', (mockV2 as unknown as MockVideoElement).paused, '期望: true');
if (!(mockV1 as unknown as MockVideoElement).paused || !(mockV2 as unknown as MockVideoElement).paused) {
  throw new Error('致命缺陷：滞后 seeked 触发了幽灵播放，单侧视频脱缰运行！');
}

console.log('=== 5. 验证 seekToTau 状态感知与播放连续性 ===');

// 5.1 暂停状态下的 seekToTau 应保持暂停与静态定位
engine.pause();
engine.seekToTau(5.0);
console.log('暂停态 seekToTau 后 intendedPlaying:', engine.getIntendedPlaying(), '期望: false');
console.log('暂停态 seekToTau 后 isPlaying:', engine.getIsPlaying(), '期望: false');
if (engine.getIntendedPlaying() || engine.getIsPlaying()) {
  throw new Error('暂停态 seekToTau 异常激活了播放状态');
}

// 5.2 播放状态下的 seekToTau 应保持播放并自动会合起播
(engine as any).intendedPlaying = true;
(engine as any).isPlaying = true;
engine.seekToTau(6.0);
console.log('播放态 seekToTau 后 intendedPlaying 应保持:', engine.getIntendedPlaying(), '期望: true');
if (!engine.getIntendedPlaying()) {
  throw new Error('播放态 seekToTau 错误掐断了播放意图');
}

console.log('=== 6. 验证 playFrom 双端严格会合起播屏障 (Rendezvous Barrier) ===');

const playPromise = engine.playFrom(3.0);

// 此时双方正在寻道，尚未会合，不应立即开始播放
console.log('寻道尚未完成前 isPlaying:', engine.getIsPlaying(), '期望: false');
if (engine.getIsPlaying()) {
  throw new Error('会合屏障失效：在双端 seek 就绪前提前起跑');
}

// 模拟双端 seek 完成
(mockV1 as unknown as MockVideoElement).triggerSeeked();
(mockV2 as unknown as MockVideoElement).triggerSeeked();

await playPromise;

console.log('双端会合后 isPlaying:', engine.getIsPlaying(), '期望: true');
console.log('双端会合后 v1.paused:', (mockV1 as unknown as MockVideoElement).paused, '期望: false');
console.log('双端会合后 v2.paused:', (mockV2 as unknown as MockVideoElement).paused, '期望: false');
if (!engine.getIsPlaying() || (mockV1 as unknown as MockVideoElement).paused || (mockV2 as unknown as MockVideoElement).paused) {
  throw new Error('双端会合后未能联合起跑');
}

engine.destroy();
console.log('全部双视频同步引擎、代数守卫与会合屏障测试 100% 验证通过！');
