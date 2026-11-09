/**
 * 基于 WebAudio 的高精度脉冲节拍器合成器
 * 严格以对拍锚点 tau = 0 锁相，超慢放下保持清脆
 */

export class SynthesizedMetronome {
  private ctx: AudioContext | null = null;
  private lastBeatIndex: number = -Infinity;

  constructor() {
    // 惰性初始化 AudioContext
  }

  private ensureContext(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  /**
   * 重置节拍索引 (例如拖动时间轴 seek 时调用)
   */
  public reset(currentTau: number, targetBpm: number): void {
    if (targetBpm <= 0) return;
    const beatInterval = 60 / targetBpm;
    this.lastBeatIndex = Math.floor(currentTau / beatInterval);
  }

  /**
   * 在统一时间轴前进至 tau 时检查是否需要发声
   */
  public update(tau: number, targetBpm: number, isPlaying: boolean): void {
    if (!isPlaying || targetBpm <= 0) return;

    const beatInterval = 60 / targetBpm;
    const currentBeatIndex = Math.floor(tau / beatInterval);

    if (currentBeatIndex > this.lastBeatIndex) {
      this.lastBeatIndex = currentBeatIndex;
      // 触发一次清脆节拍脉冲
      this.playClick(currentBeatIndex % 4 === 0);
    }
  }

  /**
   * 触发一次清脆鼓音脉冲
   * @param isDownbeat 是否强拍 (每 4 拍一个高音)
   */
  public playClick(isDownbeat: boolean): void {
    try {
      const ctx = this.ensureContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      const freq = isDownbeat ? 1200 : 800; // 强拍 1200Hz，弱拍 800Hz
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);

      // 指数快速衰减音量 (35ms 极其清脆利落)
      gain.gain.setValueAtTime(0.7, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.035);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.04);
    } catch {
      // 容错忽略
    }
  }

  public dispose(): void {
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}
