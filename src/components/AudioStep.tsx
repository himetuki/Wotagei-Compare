import React, { useRef, useState, useEffect } from 'react';
import {
  Play,
  Pause,
  Crosshair,
  Volume2,
  Activity,
  Minus,
  Plus,
} from 'lucide-react';
import type { VideoAudioInfo } from '../types/timeline.ts';
import type { LoadedVideoItem } from './ImportStep.tsx';
import { TapTempoTracker } from '../core/audio.ts';

interface AudioStepProps {
  videoItem: LoadedVideoItem;
  videoIndex: 1 | 2;
  onBack: () => void;
  onChange?: (audioInfo: VideoAudioInfo) => void;
  onSave: (audioInfo: VideoAudioInfo) => void;
}

/**
 * 步骤 04/05：音频波形对拍锚点标定与 BPM 同步策略视图
 */
export const AudioStep: React.FC<AudioStepProps> = ({
  videoItem,
  videoIndex,
  onChange,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const initialAudio: VideoAudioInfo = videoItem.audioInfo || {
    duration: videoItem.duration,
    sampleRate: 44100,
    detectedBpm: 160,
    userBpm: 160,
    anchorTime: 1.0,
    waveform: new Float32Array(1000).fill(0.25),
  };

  const totalDuration =
    videoItem.duration > 0 ? videoItem.duration : initialAudio.duration || 1;

  const [bpm, setBpm] = useState<number>(initialAudio.userBpm || 160);
  const [anchorTime, setAnchorTime] = useState<number>(
    typeof initialAudio.anchorTime === 'number' ? initialAudio.anchorTime : 1.0
  );
  const [currentTime, setCurrentTime] = useState<number>(anchorTime);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  const [anchorInputText, setAnchorInputText] = useState<string>(anchorTime.toFixed(3));

  const tapTrackerRef = useRef<TapTempoTracker>(new TapTempoTracker());
  const [tapActive, setTapActive] = useState<boolean>(false);

  // 切换视频通道时同步恢复对应通道的音频配置
  useEffect(() => {
    const audio = videoItem.audioInfo;
    const nextBpm = audio?.userBpm || 160;
    const nextAnchor = typeof audio?.anchorTime === 'number' ? audio.anchorTime : 1.0;
    setBpm(nextBpm);
    setAnchorTime(nextAnchor);
    setAnchorInputText(nextAnchor.toFixed(3));
    setCurrentTime(nextAnchor);
    setIsPlaying(false);
    if (videoRef.current) {
      videoRef.current.currentTime = nextAnchor;
    }
  }, [videoItem.url, videoIndex]);

  /**
   * 实时将当前音频参数写回父级状态
   */
  const commitAudioState = (
    nextBpm: number,
    nextAnchor: number
  ) => {
    setBpm(nextBpm);
    setAnchorTime(nextAnchor);
    setAnchorInputText(nextAnchor.toFixed(3));
    onChange?.(
      {
        ...initialAudio,
        duration: totalDuration,
        userBpm: nextBpm,
        anchorTime: nextAnchor,
      }
    );
  };

  // 60fps 平滑更新当前播放时间游标
  useEffect(() => {
    let animId: number;
    const updateLoop = () => {
      const video = videoRef.current;
      if (video && !video.paused) {
        setCurrentTime(video.currentTime);
      }
      animId = requestAnimationFrame(updateLoop);
    };
    animId = requestAnimationFrame(updateLoop);
    return () => cancelAnimationFrame(animId);
  }, []);

  // 绘制波形、节拍刻度、对拍锚点线与实时播放游标
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const midY = height / 2;
    const waveform = initialAudio.waveform;

    ctx.clearRect(0, 0, width, height);

    // 1. 中心零电平基准线
    ctx.strokeStyle = 'rgba(63, 63, 70, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(width, midY);
    ctx.stroke();

    // 2. 对称音频包络波形
    if (waveform && waveform.length > 0) {
      ctx.fillStyle = videoIndex === 1 ? '#38bdf8' : '#10b981';
      const barWidth = width / waveform.length;
      for (let i = 0; i < waveform.length; i++) {
        const amp = waveform[i] * (height / 2) * 0.86;
        const x = i * barWidth;
        ctx.fillRect(x, midY - amp, Math.max(1, barWidth - 0.5), amp * 2);
      }
    }

    // 3. 基于锚点与 BPM 生成的节拍刻度
    if (bpm > 0 && totalDuration > 0) {
      const beatInterval = 60 / bpm;
      const totalBeats = Math.floor(totalDuration / beatInterval);
      const step = totalBeats > 120 ? 4 : 1;

      for (let t = anchorTime % beatInterval; t <= totalDuration; t += beatInterval) {
        if (t < 0) continue;
        const beatNum = Math.round((t - anchorTime) / beatInterval);
        if (beatNum % step !== 0) continue;

        const isDownbeat = beatNum % 4 === 0;
        const x = (t / totalDuration) * width;

        ctx.strokeStyle = isDownbeat
          ? 'rgba(244, 244, 245, 0.16)'
          : 'rgba(244, 244, 245, 0.05)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();

        const tickH = isDownbeat ? 9 : 4;
        ctx.strokeStyle = isDownbeat ? '#f59e0b' : 'rgba(244, 244, 245, 0.35)';
        ctx.lineWidth = isDownbeat ? 1.5 : 1;

        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, tickH);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(x, height);
        ctx.lineTo(x, height - tickH);
        ctx.stroke();
      }
    }

    // 4. 对拍锚点标记线 (琥珀金)
    const anchorX = (anchorTime / totalDuration) * width;
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(anchorX, 0);
    ctx.lineTo(anchorX, height);
    ctx.stroke();

    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.moveTo(anchorX - 5, 0);
    ctx.lineTo(anchorX + 5, 0);
    ctx.lineTo(anchorX, 8);
    ctx.closePath();
    ctx.fill();

    // 5. 当前时间游标线 (红色)
    const currentX = (currentTime / totalDuration) * width;
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(currentX, 0);
    ctx.lineTo(currentX, height);
    ctx.stroke();
  }, [initialAudio, anchorTime, currentTime, bpm, totalDuration, videoIndex]);

  /**
   * 点击波形跳转到对应时间戳
   */
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const rect = canvas.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetTime = ratio * totalDuration;

    video.currentTime = targetTime;
    setCurrentTime(targetTime);
  };

  /**
   * 播放/暂停预览
   */
  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    video.preservesPitch = true;
    video.playbackRate = 1.0;
    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
    } else {
      video.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  /**
   * 将当前播放位置设为对拍锚点
   */
  const setAsAnchor = () => {
    const video = videoRef.current;
    const t = video ? video.currentTime : currentTime;
    commitAudioState(bpm, t);
  };

  /**
   * 从锚点前 0.6s 预跑试听并在锚点时刻触发脉冲卡拍音
   */
  const jumpToAnchor = () => {
    const video = videoRef.current;
    if (!video) return;
    const preRoll = Math.max(0, anchorTime - 0.6);
    video.currentTime = preRoll;
    setCurrentTime(preRoll);
    video.preservesPitch = true;
    video.playbackRate = 1.0;
    video.play().catch(() => {});
    setIsPlaying(true);

    const delayMs = (anchorTime - preRoll) * 1000;
    setTimeout(() => {
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.setValueAtTime(1200, ctx.currentTime);
        gain.gain.setValueAtTime(0.8, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.04);
      } catch {
        // 音频上下文受限时忽略
      }
    }, delayMs);
  };

  /**
   * 连续点击测算整数 BPM
   */
  const handleTap = () => {
    setTapActive(true);
    const detected = tapTrackerRef.current.tap();
    if (detected) {
      commitAudioState(detected, anchorTime);
    }
    setTimeout(() => setTapActive(false), 180);
  };

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        backgroundColor: 'var(--bg-canvas)',
      }}
    >
      {/* 中部视频监看区 */}
      <div
        style={{
          flex: 1,
          backgroundColor: 'var(--bg-canvas)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 0,
        }}
      >
        <video
          ref={videoRef}
          src={videoItem.url}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
            transform: videoItem.geometry.mirror ? 'scaleX(-1)' : 'none',
          }}
          playsInline
        />
      </div>

      {/* 底部波形与对拍控制面板 */}
      <div className="bottom-bar" style={{ gap: '8px' }}>
        <div style={{ height: '56px', width: '100%' }}>
          <canvas
            ref={canvasRef}
            width={1200}
            height={56}
            onClick={handleCanvasClick}
            style={{
              width: '100%',
              height: '100%',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              cursor: 'crosshair',
              display: 'block',
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          {/* 左：播放、当前时间 */}
          <div className="control-group" style={{ gap: '6px' }}>
            <button type="button" onClick={togglePlay} className="btn" style={{ padding: '0 8px' }}>
              {isPlaying ? <Pause size={13} /> : <Play size={13} />}
              <span>{isPlaying ? '暂停' : '播放'}</span>
            </button>

            <span className="mono-num" style={{ minWidth: '60px', fontSize: '11.5px', textAlign: 'center' }}>
              {currentTime.toFixed(3)}s
            </span>
          </div>

          {/* 中：设为锚点、直接输入锚点数值、试听锚点 */}
          <div className="control-group" style={{ gap: '6px' }}>
            <button type="button" onClick={setAsAnchor} className="btn btn-accent" style={{ padding: '0 9px' }}>
              <Crosshair size={13} />
              <span>设为锚点</span>
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span className="mono-muted" style={{ fontSize: '11px' }}>锚点</span>
              <input
                type="number"
                step="0.001"
                className="num-input"
                value={anchorInputText}
                onChange={(e) => {
                  setAnchorInputText(e.target.value);
                  const parsed = parseFloat(e.target.value);
                  if (!isNaN(parsed) && parsed >= 0 && parsed <= totalDuration) {
                    commitAudioState(bpm, parsed);
                  }
                }}
                onBlur={() => {
                  const parsed = parseFloat(anchorInputText);
                  if (!isNaN(parsed)) {
                    const clamped = Math.max(0, Math.min(totalDuration, parsed));
                    setAnchorInputText(clamped.toFixed(3));
                    commitAudioState(bpm, clamped);
                  } else {
                    setAnchorInputText(anchorTime.toFixed(3));
                  }
                }}
                style={{ width: '64px', height: '24px', fontSize: '11.5px', textAlign: 'center' }}
              />
              <span className="mono-muted" style={{ fontSize: '11px' }}>s</span>
            </div>

            <button type="button" onClick={jumpToAnchor} className="btn" style={{ padding: '0 8px' }}>
              <Volume2 size={13} />
              <span>试听</span>
            </button>
          </div>

          {/* 右：单一真实源 TAP 测速与 BPM 调节区 */}
          <div className="control-group" style={{ gap: '4px', flexShrink: 0 }}>
            <button
              type="button"
              onClick={handleTap}
              className={`btn ${tapActive ? 'btn-active' : ''}`}
              style={{ padding: '0 8px' }}
            >
              <Activity size={13} />
              <span>TAP</span>
            </button>

            <span className="mono-muted" style={{ fontSize: '11px' }}>BPM</span>
            <button
              type="button"
              onClick={() => commitAudioState(Math.max(1, bpm - 1), anchorTime)}
              className="btn"
              style={{ padding: '0 6px', width: '24px' }}
            >
              <Minus size={12} />
            </button>
            <input
              type="number"
              className="num-input"
              value={bpm}
              onChange={(e) => {
                const val = Math.max(1, parseInt(e.target.value, 10) || 160);
                commitAudioState(val, anchorTime);
              }}
              style={{ width: '48px', height: '24px', fontSize: '11.5px' }}
            />
            <button
              type="button"
              onClick={() => commitAudioState(bpm + 1, anchorTime)}
              className="btn"
              style={{ padding: '0 6px', width: '24px' }}
            >
              <Plus size={12} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
