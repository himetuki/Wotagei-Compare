/**
 * 基于 WebAudio 的高穿透力锁相脉冲节拍器合成器
 * 严格以统一时间轴对拍锚点 tau = 0 锁相
 * 支持时间回流自愈重置、复合谐波音色与动态范围压缩限幅
 */

/** 起播与重置时的容差时间窗口 (秒) */
export const METRONOME_START_TOLERANCE_SEC = 0.035;

/**
 * 判断拍号是否为小节第 1 拍重拍 (Downbeat)
 * 采用全域同余运算，严格消除负时间戳下的负数取模符号缺陷
 */
export function isDownbeatIndex(beatIndex: number): boolean {
  return ((beatIndex % 4) + 4) % 4 === 0;
}

/**
 * 计算起播或重置时的初始已播放拍号基准
 * 消除锚点 (tau = 0) 及拍点临界起播时的吞音错位
 */
export function calculateInitialLastBeatIndex(
  currentTau: number,
  targetBpm: number,
  toleranceSec = METRONOME_START_TOLERANCE_SEC
): number {
  if (targetBpm <= 0) return -Infinity;
  const beatInterval = 60 / targetBpm;
  const nextBeat = Math.ceil((currentTau - toleranceSec) / beatInterval);
  return nextBeat - 1;
}

/**
 * 根据统一时间轴 tau 计算当前拍序号
 */
export function calculateBeatIndex(currentTau: number, targetBpm: number): number {
  if (targetBpm <= 0) return 0;
  const beatInterval = 60 / targetBpm;
  return Math.floor(currentTau / beatInterval);
}

export class SynthesizedMetronome {
  private ctx: AudioContext | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private lastBeatIndex: number = -Infinity;

  constructor() {
    // 惰性初始化 AudioContext
  }

  private ensureContext(): { ctx: AudioContext; compressor: DynamicsCompressorNode } {
    if (!this.ctx || this.ctx.state === 'closed') {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.compressor = null;
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    if (!this.compressor) {
      const comp = this.ctx.createDynamicsCompressor();
      // 动态范围压缩限幅器参数配置：充沛释放响度，母带级砖墙限幅杜绝破音与削顶失真
      comp.threshold.setValueAtTime(-1.5, this.ctx.currentTime);
      comp.knee.setValueAtTime(3, this.ctx.currentTime);
      comp.ratio.setValueAtTime(12, this.ctx.currentTime);
      comp.attack.setValueAtTime(0.001, this.ctx.currentTime);
      comp.release.setValueAtTime(0.04, this.ctx.currentTime);
      comp.connect(this.ctx.destination);
      this.compressor = comp;
    }

    return { ctx: this.ctx, compressor: this.compressor };
  }

  /**
   * 重置节拍索引 (例如拖动时间轴 seek 或从指定时刻起播时调用)
   */
  public reset(currentTau: number, targetBpm: number): void {
    if (targetBpm <= 0) return;
    this.lastBeatIndex = calculateInitialLastBeatIndex(currentTau, targetBpm);
  }

  /**
   * 获取当前内部记录的历史拍号 (主要用于断言测试与调试)
   */
  public getLastBeatIndex(): number {
    return this.lastBeatIndex;
  }

  /**
   * 在统一时间轴前进至 tau 时检查是否需要发声
   * 具备时间逆流与循环回绕自愈机制
   */
  public update(tau: number, targetBpm: number, isPlaying: boolean): boolean {
    if (!isPlaying || targetBpm <= 0) return false;

    const currentBeatIndex = calculateBeatIndex(tau, targetBpm);

    // 自愈重置：若检测到时间发生逆流或从区间终点循环回绕到起点
    if (currentBeatIndex < this.lastBeatIndex) {
      this.lastBeatIndex = calculateInitialLastBeatIndex(tau, targetBpm);
    }

    if (currentBeatIndex > this.lastBeatIndex) {
      this.lastBeatIndex = currentBeatIndex;
      // 触发一次清脆饱满的节拍脉冲
      this.playClick(isDownbeatIndex(currentBeatIndex));
      return true;
    }

    return false;
  }

  /**
   * 触发一次清脆饱满的复合谐波鼓音脉冲
   * @param isDownbeat 是否强拍 (小节第 1 拍，与 tau = 0 严格同相)
   */
  public playClick(isDownbeat: boolean): void {
    try {
      const { ctx, compressor } = this.ensureContext();
      const now = ctx.currentTime;

      if (isDownbeat) {
        // 重拍：1600Hz 三角波 (高频清脆穿透力) + 800Hz 正弦波 (中低频冲程 Punch)
        const oscHigh = ctx.createOscillator();
        const oscLow = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscHigh.type = 'triangle';
        oscHigh.frequency.setValueAtTime(1600, now);

        oscLow.type = 'sine';
        oscLow.frequency.setValueAtTime(800, now);

        // 强拍饱满打击包络 (总长 65ms)
        gainNode.gain.setValueAtTime(1.1, now);
        gainNode.gain.setValueAtTime(1.1, now + 0.010); // 保持 10ms 打击感
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.065);

        oscHigh.connect(gainNode);
        oscLow.connect(gainNode);
        gainNode.connect(compressor);

        oscHigh.start(now);
        oscLow.start(now);
        oscHigh.stop(now + 0.075);
        oscLow.stop(now + 0.075);
      } else {
        // 弱拍：1000Hz 三角波单音脉冲 (纯净利落，总长 50ms)
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1000, now);

        gainNode.gain.setValueAtTime(0.9, now);
        gainNode.gain.setValueAtTime(0.9, now + 0.006);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.050);

        osc.connect(gainNode);
        gainNode.connect(compressor);

        osc.start(now);
        osc.stop(now + 0.060);
      }
    } catch {
      // 容灾忽略静默降级
    }
  }

  public dispose(): void {
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
      this.compressor = null;
    }
  }
}
