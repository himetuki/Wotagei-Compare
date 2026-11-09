/**
 * 时间轴映射、BPM 与音频控制契约
 */

/** 七档超慢放倍速 */
export type SlowMotionRate = 0.1 | 0.15 | 0.2 | 0.3 | 0.5 | 0.75 | 1.0;

/** 可选声音源 */
export type SoundSource = 'metronome' | 'video1' | 'video2' | 'mute';

/** BPM 对齐策略 */
export type BpmAlignStrategy = 'none' | 'left' | 'right' | 'custom';

/** 单路视频的音频元数据与对拍锚点 */
export interface VideoAudioInfo {
  duration: number; // 视频总时长 (秒)
  sampleRate: number; // 音频采样率
  detectedBpm: number; // 算法自动测算的 BPM
  userBpm: number; // 用户确认或修改的 BPM
  anchorTime: number; // 对拍锚点时间戳 (秒)
  waveform: Float32Array; // 用于可视化展示的归一化波形峰值数据
}

/** 统一时间轴映射配置 */
export interface TimelineConfig {
  strategy: BpmAlignStrategy;
  targetBpm: number;
  slowMotionRate: SlowMotionRate;
  soundSource: SoundSource;
}

/** 时间轴区间定义 */
export interface TimeInterval {
  start: number;
  end: number;
}
