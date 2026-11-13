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
import type { VideoAudioInfo, TimeInterval } from '../types/timeline.ts';
import type { LoadedVideoItem } from './ImportStep.tsx';
import { TapTempoTracker, detectBpmFromSlice } from '../core/audio.ts';

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
  const waveformContainerRef = useRef<HTMLDivElement>(null);

  const initialAudio: VideoAudioInfo = videoItem.audioInfo || {
    duration: videoItem.duration,
    sampleRate: 44100,
    detectedBpm: 160,
    userBpm: 160,
    anchorTime: 1.0,
    waveform: new Float32Array(1000).fill(0.25),
    trimRange: { start: 0, end: videoItem.duration > 0 ? videoItem.duration : 1 },
  };

  const totalDuration =
    videoItem.duration > 0 ? videoItem.duration : initialAudio.duration || 1;

  const [trimStart, setTrimStart] = useState<number>(
    initialAudio.trimRange?.start ?? 0
  );
  const [trimEnd, setTrimEnd] = useState<number>(
    initialAudio.trimRange?.end ?? totalDuration
  );
  const [draggingHandle, setDraggingHandle] = useState<'start' | 'end' | null>(null);

  const trimStartRef = useRef<number>(trimStart);
  const trimEndRef = useRef<number>(trimEnd);
  const debounceBpmTimerRef = useRef<number | null>(null);

  trimStartRef.current = trimStart;
  trimEndRef.current = trimEnd;

  useEffect(() => {
    return () => {
      if (debounceBpmTimerRef.current) {
        window.clearTimeout(debounceBpmTimerRef.current);
      }
    };
  }, []);

  const [bpm, setBpm] = useState<number>(initialAudio.userBpm || 160);
  const [anchorTime, setAnchorTime] = useState<number>(
    typeof initialAudio.anchorTime === 'number' ? initialAudio.anchorTime : 1.0
  );
  const [currentTime, setCurrentTime] = useState<number>(anchorTime);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  const [anchorInputText, setAnchorInputText] = useState<string>(anchorTime.toFixed(3));

  const tapTrackerRef = useRef<TapTempoTracker>(new TapTempoTracker());
  const [tapActive, setTapActive] = useState<boolean>(false);
  const auditionAudioCtxRef = useRef<AudioContext | null>(null);
  const auditionTimerRef = useRef<number | null>(null);

  // 组件卸载时释放试听计时器与 AudioContext，防止上下文配额泄漏
  useEffect(() => {
    return () => {
      if (auditionTimerRef.current) {
        window.clearTimeout(auditionTimerRef.current);
      }
      if (auditionAudioCtxRef.current && auditionAudioCtxRef.current.state !== 'closed') {
        auditionAudioCtxRef.current.close().catch(() => {});
        auditionAudioCtxRef.current = null;
      }
    };
  }, []);

  // 切换视频通道时同步恢复对应通道的音频与时间截取配置
  useEffect(() => {
    const audio = videoItem.audioInfo;
    const dur = videoItem.duration > 0 ? videoItem.duration : audio?.duration || 1;
    const nextBpm = audio?.userBpm || 160;
    const nextTrimStart = audio?.trimRange?.start ?? 0;
    const nextTrimEnd = audio?.trimRange?.end ?? dur;
    const rawAnchor = typeof audio?.anchorTime === 'number' ? audio.anchorTime : 1.0;
    const nextAnchor = Math.max(nextTrimStart, Math.min(nextTrimEnd, rawAnchor));

    setBpm(nextBpm);
    setAnchorTime(nextAnchor);
    setAnchorInputText(nextAnchor.toFixed(3));
    setCurrentTime(nextAnchor);
    setTrimStart(nextTrimStart);
    setTrimEnd(nextTrimEnd);
    setIsPlaying(false);
    const video = videoRef.current;
    if (!video) return;

    // 元数据尚未就绪（readyState === 0）时直接赋值 currentTime 会被老旧 WebView 静默忽略，
    // 因此同步监听 loadedmetadata 并在就绪后立即寻道至当前对拍锚点帧
    const seekToAnchor = () => {
      if (video.readyState >= 1) {
        const safeDur = video.duration > 0 ? video.duration : nextTrimEnd;
        const clamped = Math.max(0, Math.min(safeDur, nextAnchor));
        const target = clamped > 0 ? clamped : Math.min(0.01, safeDur / 2);
        video.currentTime = target;
      }
    };

    video.addEventListener('loadedmetadata', seekToAnchor);
    if (video.readyState >= 1) {
      seekToAnchor();
    }

    return () => {
      video.removeEventListener('loadedmetadata', seekToAnchor);
    };
  }, [videoItem.url, videoIndex, videoItem.duration]);

  /**
   * 实时将当前音频与时间截取参数写回父级状态
   * 锚点强制 Clamp 在有效截取区间 [trimStart, trimEnd] 内部
   */
  const commitAudioState = (
    nextBpm: number,
    nextAnchor: number,
    nextTrim?: TimeInterval
  ) => {
    const activeTrim = nextTrim || { start: trimStart, end: trimEnd };
    const clampedAnchor = Math.max(activeTrim.start, Math.min(activeTrim.end, nextAnchor));

    setBpm(nextBpm);
    setAnchorTime(clampedAnchor);
    setAnchorInputText(clampedAnchor.toFixed(3));
    if (nextTrim) {
      setTrimStart(nextTrim.start);
      setTrimEnd(nextTrim.end);
    }
    onChange?.({
      ...initialAudio,
      duration: totalDuration,
      userBpm: nextBpm,
      anchorTime: clampedAnchor,
      trimRange: activeTrim,
      rawChannelData: videoItem.audioInfo?.rawChannelData,
    });
  };

  /**
   * 拖拽手柄稳定后根据当前有效截取区间重新计算 BPM
   * 锚点时间戳自动 Clamp 至有效截取区间 [tStart, tEnd] 内部
   */
  const recalculateBpmForTrim = (tStart: number, tEnd: number) => {
    const pcm = videoItem.audioInfo?.rawChannelData;
    const sampleRate = videoItem.audioInfo?.sampleRate || 44100;
    let computedBpm = bpm;
    if (pcm && pcm.length > 0 && sampleRate > 0) {
      const detected = detectBpmFromSlice(pcm, sampleRate, tStart, tEnd, bpm);
      if (detected > 0) {
        computedBpm = detected;
      }
    }
    const clampedAnchor = Math.max(tStart, Math.min(tEnd, anchorTime));
    commitAudioState(computedBpm, clampedAnchor, { start: tStart, end: tEnd });
  };

  // 60fps 平滑更新当前播放时间游标，并在到达截取终点时自动回绕至起点循环播放
  useEffect(() => {
    let animId: number;
    const updateLoop = () => {
      const video = videoRef.current;
      if (video && !video.paused) {
        if (video.currentTime >= trimEnd) {
          video.currentTime = trimStart;
          setCurrentTime(trimStart);
        } else {
          setCurrentTime(video.currentTime);
        }
      }
      animId = requestAnimationFrame(updateLoop);
    };
    animId = requestAnimationFrame(updateLoop);
    return () => cancelAnimationFrame(animId);
  }, [trimStart, trimEnd]);

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
   * 播放/暂停预览（严格在 [trimStart, trimEnd] 截取区间闭环循环播放）
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
      if (video.currentTime < trimStart || video.currentTime >= trimEnd - 0.05) {
        video.currentTime = trimStart;
        setCurrentTime(trimStart);
      }
      video.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  /**
   * 将当前播放位置设为对拍锚点（强制 Clamp 在 [trimStart, trimEnd] 内）
   */
  const setAsAnchor = () => {
    const video = videoRef.current;
    const t = video ? video.currentTime : currentTime;
    const clamped = Math.max(trimStart, Math.min(trimEnd, t));
    commitAudioState(bpm, clamped);
  };

  /**
   * 从锚点前 0.6s 预跑试听并在锚点时刻触发脉冲卡拍音
   * 复用单个 AudioContext 并在用户点击手势内同步唤醒，避免连续试听触发 Chromium 6 上下文上限
   */
  const jumpToAnchor = () => {
    const video = videoRef.current;
    if (!video) return;

    // 在点击手势同步栈内惰性创建或唤醒 AudioContext
    let ctx = auditionAudioCtxRef.current;
    try {
      if (!ctx || ctx.state === 'closed') {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        ctx = new AudioCtx();
        auditionAudioCtxRef.current = ctx;
      }
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
    } catch {
      ctx = null;
    }

    const preRoll = Math.max(0, anchorTime - 0.6);
    video.currentTime = preRoll;
    setCurrentTime(preRoll);
    video.preservesPitch = true;
    video.playbackRate = 1.0;
    video.play().catch(() => {});
    setIsPlaying(true);

    if (auditionTimerRef.current) {
      window.clearTimeout(auditionTimerRef.current);
    }

    const delayMs = Math.max(0, (anchorTime - preRoll) * 1000);
    auditionTimerRef.current = window.setTimeout(() => {
      try {
        const activeCtx = auditionAudioCtxRef.current;
        if (!activeCtx || activeCtx.state === 'closed') return;
        const osc = activeCtx.createOscillator();
        const gain = activeCtx.createGain();
        osc.frequency.setValueAtTime(1200, activeCtx.currentTime);
        gain.gain.setValueAtTime(0.8, activeCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, activeCtx.currentTime + 0.04);
        osc.connect(gain);
        gain.connect(activeCtx.destination);
        osc.start();
        osc.stop(activeCtx.currentTime + 0.04);
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

  /**
   * 拖拽起止手柄 [ 和 ]
   */
  const handlePointerDown = (handle: 'start' | 'end', e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDraggingHandle(handle);

    // 拖动开始时若正在播放，立即自动停止播放
    const video = videoRef.current;
    if (video && !video.paused) {
      video.pause();
      setIsPlaying(false);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingHandle || !waveformContainerRef.current) return;
    const rect = waveformContainerRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetTime = ratio * totalDuration;
    const video = videoRef.current;

    let nextStart = trimStartRef.current;
    let nextEnd = trimEndRef.current;

    if (draggingHandle === 'start') {
      nextStart = Math.max(0, Math.min(trimEndRef.current - 0.5, targetTime));
      setTrimStart(nextStart);
      trimStartRef.current = nextStart;
      if (video) {
        video.currentTime = nextStart;
      }
      setCurrentTime(nextStart);
    } else if (draggingHandle === 'end') {
      nextEnd = Math.min(totalDuration, Math.max(trimStartRef.current + 0.5, targetTime));
      setTrimEnd(nextEnd);
      trimEndRef.current = nextEnd;
      if (video) {
        video.currentTime = nextEnd;
      }
      setCurrentTime(nextEnd);
    }

    // 拖动过程中平滑同步时间截取范围至父级，但保持当前 BPM，不进行重度自相关计算
    const clampedAnchor = Math.max(nextStart, Math.min(nextEnd, anchorTime));
    commitAudioState(bpm, clampedAnchor, { start: nextStart, end: nextEnd });

    // 设置 200ms 防抖重算保底
    if (debounceBpmTimerRef.current) {
      window.clearTimeout(debounceBpmTimerRef.current);
    }
    debounceBpmTimerRef.current = window.setTimeout(() => {
      recalculateBpmForTrim(trimStartRef.current, trimEndRef.current);
    }, 200);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (draggingHandle) {
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
      setDraggingHandle(null);

      // 手柄释放时清除防抖计时器并立即触发一次确定的局部 BPM 重新推算
      if (debounceBpmTimerRef.current) {
        window.clearTimeout(debounceBpmTimerRef.current);
        debounceBpmTimerRef.current = null;
      }
      recalculateBpmForTrim(trimStartRef.current, trimEndRef.current);
    }
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
          crossOrigin="anonymous"
          preload="auto"
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
      <div className="bottom-bar fx-col-8">
        <div
          ref={waveformContainerRef}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{
            position: 'relative',
            height: '56px',
            width: '100%',
            overflow: 'hidden',
            borderRadius: '4px',
            userSelect: 'none',
          }}
        >
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

          {/* 左侧非有效截取区遮罩 */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              width: `${(trimStart / totalDuration) * 100}%`,
              backgroundColor: 'rgba(0, 0, 0, 0.65)',
              pointerEvents: 'none',
              borderRight: '1px dashed rgba(245, 158, 11, 0.6)',
            }}
          />

          {/* 右侧非有效截取区遮罩 */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${(trimEnd / totalDuration) * 100}%`,
              right: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.65)',
              pointerEvents: 'none',
              borderLeft: '1px dashed rgba(245, 158, 11, 0.6)',
            }}
          />

          {/* 左截取手柄 [ */}
          <div
            onPointerDown={(e) => handlePointerDown('start', e)}
            style={{
              position: 'absolute',
              left: `${(trimStart / totalDuration) * 100}%`,
              top: 0,
              bottom: 0,
              transform: 'translateX(-50%)',
              width: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'ew-resize',
              zIndex: 10,
              touchAction: 'none',
            }}
            title="拖拽微调目标招式起点 ["
          >
            <div
              style={{
                width: '14px',
                height: '42px',
                backgroundColor: 'rgba(24, 24, 27, 0.95)',
                border: '1.5px solid var(--accent)',
                borderRadius: '3px 0 0 3px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.8)',
              }}
            >
              <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--accent)', lineHeight: 1 }}>
                [
              </span>
            </div>
            {/* 时间浮签 */}
            <span
              className="mono-num"
              style={{
                position: 'absolute',
                top: '2px',
                right: '16px',
                fontSize: '10px',
                backgroundColor: 'rgba(9, 9, 11, 0.85)',
                color: 'var(--accent)',
                padding: '1px 3px',
                borderRadius: '2px',
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              {trimStart.toFixed(2)}s
            </span>
          </div>

          {/* 右截取手柄 ] */}
          <div
            onPointerDown={(e) => handlePointerDown('end', e)}
            style={{
              position: 'absolute',
              left: `${(trimEnd / totalDuration) * 100}%`,
              top: 0,
              bottom: 0,
              transform: 'translateX(-50%)',
              width: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'ew-resize',
              zIndex: 10,
              touchAction: 'none',
            }}
            title="拖拽微调目标招式终点 ]"
          >
            <div
              style={{
                width: '14px',
                height: '42px',
                backgroundColor: 'rgba(24, 24, 27, 0.95)',
                border: '1.5px solid var(--accent)',
                borderRadius: '0 3px 3px 0',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.8)',
              }}
            >
              <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--accent)', lineHeight: 1 }}>
                ]
              </span>
            </div>
            {/* 时间浮签 */}
            <span
              className="mono-num"
              style={{
                position: 'absolute',
                top: '2px',
                left: '16px',
                fontSize: '10px',
                backgroundColor: 'rgba(9, 9, 11, 0.85)',
                color: 'var(--accent)',
                padding: '1px 3px',
                borderRadius: '2px',
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              {trimEnd.toFixed(2)}s
            </span>
          </div>
        </div>

        <div
          className="audio-controls-row fx-row-8"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
        >
          {/* 左：播放、当前时间 */}
          <div className="control-group">
            <button type="button" onClick={togglePlay} className="btn" style={{ padding: '0 8px' }}>
              {isPlaying ? <Pause size={13} /> : <Play size={13} />}
              <span>{isPlaying ? '暂停' : '播放'}</span>
            </button>

            <span
              className="mono-num audio-time-readout"
              style={{ minWidth: '60px', fontSize: '11.5px', textAlign: 'center' }}
            >
              {currentTime.toFixed(3)}s
            </span>
          </div>

          {/* 中：设为锚点、直接输入锚点数值、试听锚点 */}
          <div className="control-group">
            <button type="button" onClick={setAsAnchor} className="btn btn-accent" style={{ padding: '0 9px' }}>
              <Crosshair size={13} />
              <span>设为锚点</span>
            </button>

            <div className="fx-row-4" style={{ display: 'flex', alignItems: 'center' }}>
              <span className="mono-muted" style={{ fontSize: '11px', whiteSpace: 'nowrap' }}>锚点</span>
              <input
                type="number"
                step="0.001"
                className="num-input audio-anchor-input"
                value={anchorInputText}
                onChange={(e) => {
                  setAnchorInputText(e.target.value);
                  const parsed = parseFloat(e.target.value);
                  if (!isNaN(parsed) && parsed >= trimStart && parsed <= trimEnd) {
                    commitAudioState(bpm, parsed);
                  }
                }}
                onBlur={() => {
                  const parsed = parseFloat(anchorInputText);
                  if (!isNaN(parsed)) {
                    const clamped = Math.max(trimStart, Math.min(trimEnd, parsed));
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

            <span className="mono-muted" style={{ fontSize: '11px', whiteSpace: 'nowrap' }}>
              <span className="audio-trim-prefix">招式 </span>{(trimEnd - trimStart).toFixed(1)}s
            </span>
          </div>

          {/* 右：单一真实源 TAP 测速与 BPM 调节区 */}
          <div className="control-group fx-row-4" style={{ flexShrink: 0 }}>
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
              className="num-input audio-bpm-input"
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
