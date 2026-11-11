import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import {
  Play,
  Pause,
  Crosshair,
  RotateCcw,
  Layers,
  Columns2,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import type {
  ComparisonMode,
  ViewportTransform,
} from '../types/geometry.ts';
import type {
  BpmAlignStrategy,
  SlowMotionRate,
  SoundSource,
} from '../types/timeline.ts';
import { calculateTriLineAlignment, AlignmentTransform } from '../core/geometry.ts';
import {
  calculateUnifiedTimeline,
  mapTauToSourceTime,
  isTauInVideoRange,
  getPlaybackRate,
} from '../core/timeline.ts';
import { renderComparisonFrame, ComparisonRenderState } from '../core/renderer.ts';
import { SynthesizedMetronome } from '../core/metronome.ts';
import type { LoadedVideoItem } from './ImportStep.tsx';
import type { WizardStep } from '../types/wizard.ts';
import { ExportPage } from './ExportPage.tsx';

export interface WorkbenchProps {
  video1: LoadedVideoItem;
  video2: LoadedVideoItem;
  initialMode: ComparisonMode;
  bpmStrategy: BpmAlignStrategy;
  customBpm: number;
  isExport?: boolean;
  isToolbarExpanded?: boolean;
  onToggleToolbar?: () => void;
  onNavigate?: (step: WizardStep) => void;
  onBpmStrategyChange?: (strategy: BpmAlignStrategy, customBpm?: number) => void;
  onModeChange?: (mode: ComparisonMode) => void;
  onMirrorChange?: (videoIndex: 1 | 2, mirror: boolean) => void;
}

const SLOW_MOTION_RATES: SlowMotionRate[] = [0.1, 0.15, 0.2, 0.3, 0.5, 0.75, 1.0];

/** 专业标准水平左右镜像矢量图标 (沿垂直对称轴翻转) */
export const HorizontalFlipIcon: React.FC<{ size?: number }> = ({ size = 12 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m3 7 5 5-5 5V7z" />
    <path d="m21 7-5 5 5 5V7z" />
    <path d="M12 20v2" />
    <path d="M12 14v2" />
    <path d="M12 8v2" />
    <path d="M12 2v2" />
  </svg>
);

/**
 * 步骤 06：同台对比播放与慢放监看工作台
 */
export const Workbench: React.FC<WorkbenchProps> = ({
  video1,
  video2,
  initialMode,
  bpmStrategy,
  customBpm,
  isExport = false,
  isToolbarExpanded = false,
  onToggleToolbar,
  onNavigate,
  onBpmStrategyChange,
  onModeChange,
  onMirrorChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef1 = useRef<HTMLVideoElement>(null);
  const videoRef2 = useRef<HTMLVideoElement>(null);

  const [mode, setMode] = useState<ComparisonMode>(initialMode);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [slowMotionRate, setSlowMotionRate] = useState<SlowMotionRate>(1.0);
  const [soundSource, setSoundSource] = useState<SoundSource>('metronome');
  const [relativeOpacity, setRelativeOpacity] = useState<number>(0);
  const [isBpmMenuOpen, setIsBpmMenuOpen] = useState<boolean>(false);

  const [mirror1, setMirror1] = useState<boolean>(video1.geometry.mirror);
  const [mirror2, setMirror2] = useState<boolean>(video2.geometry.mirror);

  const [viewport, setViewport] = useState<ViewportTransform>({
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  });

  const [isExportPageOpen, setIsExportPageOpen] = useState<boolean>(false);

  const a1 = typeof video1.audioInfo?.anchorTime === 'number' ? video1.audioInfo.anchorTime : 1.0;
  const a2 = typeof video2.audioInfo?.anchorTime === 'number' ? video2.audioInfo.anchorTime : 1.0;

  // 计算双通道统一时间轴映射
  const timeline = useMemo(() => {
    return calculateUnifiedTimeline(
      {
        duration: video1.duration,
        bpm: video1.audioInfo?.userBpm || 160,
        anchorTime: a1,
      },
      {
        duration: video2.duration,
        bpm: video2.audioInfo?.userBpm || 160,
        anchorTime: a2,
      },
      bpmStrategy,
      customBpm
    );
  }, [video1, video2, bpmStrategy, customBpm, a1, a2]);

  const [tau, setTau] = useState<number>(timeline.intersectInterval.start);
  const tauRef = useRef<number>(timeline.intersectInterval.start);
  tauRef.current = tau;

  // 计算三线正交空间变换矩阵
  const triLineTransform: AlignmentTransform | undefined = useMemo(() => {
    if (!video1.geometry.triLine || !video2.geometry.triLine) return undefined;
    return calculateTriLineAlignment(
      video1.geometry.triLine,
      { width: video1.width, height: video1.height },
      video2.geometry.triLine,
      { width: video2.width, height: video2.height }
    );
  }, [video1, video2]);

  const metronomeRef = useRef<SynthesizedMetronome>(new SynthesizedMetronome());

  // 同步音频输出通道与变速不变调属性
  useEffect(() => {
    const v1 = videoRef1.current;
    const v2 = videoRef2.current;
    if (!v1 || !v2) return;

    v1.preservesPitch = true;
    v2.preservesPitch = true;

    if (soundSource === 'video1') {
      v1.muted = false;
      v2.muted = true;
    } else if (soundSource === 'video2') {
      v1.muted = true;
      v2.muted = false;
    } else {
      v1.muted = true;
      v2.muted = true;
    }
  }, [soundSource]);

  /**
   * 同步定位两路视频至统一时间轴位置
   */
  const seekToTau = useCallback(
    (targetTau: number) => {
      const clampedTau = Math.max(
        timeline.intersectInterval.start,
        Math.min(timeline.intersectInterval.end, targetTau)
      );
      setTau(clampedTau);
      tauRef.current = clampedTau;

      metronomeRef.current.reset(clampedTau, timeline.effectiveBpm);

      const v1 = videoRef1.current;
      const v2 = videoRef2.current;

      const t1 = mapTauToSourceTime(clampedTau, a1, timeline.rate1);
      const t2 = mapTauToSourceTime(clampedTau, a2, timeline.rate2);

      if (v1 && isFinite(t1)) {
        v1.currentTime = Math.max(0, Math.min(video1.duration, t1));
      }
      if (v2 && isFinite(t2)) {
        v2.currentTime = Math.max(0, Math.min(video2.duration, t2));
      }
    },
    [timeline, video1, video2, a1, a2]
  );

  /**
   * 切换播放与暂停状态
   */
  const togglePlay = () => {
    const v1 = videoRef1.current;
    const v2 = videoRef2.current;
    if (!v1 || !v2) return;

    if (isPlaying) {
      v1.pause();
      v2.pause();
      setIsPlaying(false);
    } else {
      if (tauRef.current >= timeline.intersectInterval.end - 0.05) {
        seekToTau(timeline.intersectInterval.start);
      }
      metronomeRef.current.reset(tauRef.current, timeline.effectiveBpm);

      v1.playbackRate = getPlaybackRate(slowMotionRate, timeline.rate1);
      v2.playbackRate = getPlaybackRate(slowMotionRate, timeline.rate2);

      const v1Active = isTauInVideoRange(tauRef.current, timeline.span1);
      const v2Active = isTauInVideoRange(tauRef.current, timeline.span2);

      if (v1Active) v1.play().catch(() => {});
      else v1.pause();

      if (v2Active) v2.play().catch(() => {});
      else v2.pause();

      setIsPlaying(true);
    }
  };

  /**
   * 切换七档慢放倍率
   */
  const handleRateChange = (rate: SlowMotionRate) => {
    setSlowMotionRate(rate);
    const v1 = videoRef1.current;
    const v2 = videoRef2.current;
    if (v1 && v2) {
      v1.playbackRate = getPlaybackRate(rate, timeline.rate1);
      v2.playbackRate = getPlaybackRate(rate, timeline.rate2);
    }
  };

  /**
   * 从锚点前 1s 快速起播
   */
  const playFromPreRoll = () => {
    const targetTau = Math.max(timeline.intersectInterval.start, -1.0);
    seekToTau(targetTau);
    const v1 = videoRef1.current;
    const v2 = videoRef2.current;
    if (v1 && v2) {
      metronomeRef.current.reset(targetTau, timeline.effectiveBpm);
      v1.playbackRate = getPlaybackRate(slowMotionRate, timeline.rate1);
      v2.playbackRate = getPlaybackRate(slowMotionRate, timeline.rate2);
      v1.play().catch(() => {});
      v2.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  /**
   * 切换对比显示模式
   */
  const handleModeChange = (targetMode: ComparisonMode) => {
    setMode(targetMode);
    onModeChange?.(targetMode);
  };

  /**
   * 切换单侧视频水平镜像
   */
  const toggleMirror = (index: 1 | 2) => {
    if (index === 1) {
      const next = !mirror1;
      setMirror1(next);
      onMirrorChange?.(1, next);
    } else {
      const next = !mirror2;
      setMirror2(next);
      onMirrorChange?.(2, next);
    }
  };

  // 主时钟与 PLL 锁相环同步渲染循环
  useEffect(() => {
    let animId: number;
    let lastTimestamp = performance.now();

    const loop = (now: number) => {
      const deltaSec = (now - lastTimestamp) / 1000;
      lastTimestamp = now;

      if (isPlaying) {
        const v1 = videoRef1.current;
        const v2 = videoRef2.current;

        const baseRate1 = getPlaybackRate(slowMotionRate, timeline.rate1);
        const baseRate2 = getPlaybackRate(slowMotionRate, timeline.rate2);

        let currentTau = tauRef.current;
        let masterVideo: HTMLVideoElement | null = null;
        let masterRate = timeline.rate1;
        let masterAnchor = a1;

        if (soundSource === 'video2' && v2 && !v2.paused && v2.readyState >= 2) {
          masterVideo = v2;
          masterRate = timeline.rate2;
          masterAnchor = a2;
        } else if (v1 && !v1.paused && v1.readyState >= 2) {
          masterVideo = v1;
          masterRate = timeline.rate1;
          masterAnchor = a1;
        }

        if (masterVideo) {
          currentTau = (masterVideo.currentTime - masterAnchor) / masterRate;
        } else {
          currentTau += deltaSec * slowMotionRate;
        }

        if (currentTau > timeline.intersectInterval.end) {
          seekToTau(timeline.intersectInterval.start);
        } else {
          tauRef.current = currentTau;
          setTau(currentTau);

          if (soundSource === 'metronome') {
            metronomeRef.current.update(currentTau, timeline.effectiveBpm, true);
          }

          const v1Active = isTauInVideoRange(currentTau, timeline.span1);
          const v2Active = isTauInVideoRange(currentTau, timeline.span2);

          const expectedT1 = a1 + currentTau * timeline.rate1;
          const expectedT2 = a2 + currentTau * timeline.rate2;

          if (v1) {
            if (v1Active) {
              if (v1.paused) {
                v1.currentTime = Math.max(0, Math.min(video1.duration, expectedT1));
                v1.playbackRate = baseRate1;
                v1.play().catch(() => {});
              } else if (masterVideo !== v1) {
                const diff = v1.currentTime - expectedT1;
                if (Math.abs(diff) > 0.25) {
                  v1.currentTime = Math.max(0, Math.min(video1.duration, expectedT1));
                } else if (Math.abs(diff) > 0.02) {
                  v1.playbackRate = baseRate1 * (diff < 0 ? 1.05 : 0.95);
                } else {
                  v1.playbackRate = baseRate1;
                }
              } else {
                v1.playbackRate = baseRate1;
              }
            } else if (!v1.paused) {
              v1.pause();
            }
          }

          if (v2) {
            if (v2Active) {
              if (v2.paused) {
                v2.currentTime = Math.max(0, Math.min(video2.duration, expectedT2));
                v2.playbackRate = baseRate2;
                v2.play().catch(() => {});
              } else if (masterVideo !== v2) {
                const diff = v2.currentTime - expectedT2;
                if (Math.abs(diff) > 0.25) {
                  v2.currentTime = Math.max(0, Math.min(video2.duration, expectedT2));
                } else if (Math.abs(diff) > 0.02) {
                  v2.playbackRate = baseRate2 * (diff < 0 ? 1.05 : 0.95);
                } else {
                  v2.playbackRate = baseRate2;
                }
              } else {
                v2.playbackRate = baseRate2;
              }
            } else if (!v2.paused) {
              v2.pause();
            }
          }
        }
      }

      const canvas = canvasRef.current;
      const v1 = videoRef1.current;
      const v2 = videoRef2.current;

      if (canvas && v1 && v2) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const v1Active = isTauInVideoRange(tauRef.current, timeline.span1);
          const v2Active = isTauInVideoRange(tauRef.current, timeline.span2);

          const renderState: ComparisonRenderState = {
            mode,
            video1: v1,
            video1Size: { width: video1.width, height: video1.height },
            video1Active: v1Active,
            mirror1,
            triLine1: video1.geometry.triLine,
            video2: v2,
            video2Size: { width: video2.width, height: video2.height },
            video2Active: v2Active,
            mirror2,
            triLine2: video2.geometry.triLine,
            triLineTransform,
            relativeOpacity,
            viewport,
            canvasWidth: canvas.width,
            canvasHeight: canvas.height,
          };

          renderComparisonFrame(ctx, renderState);
        }
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [
    isPlaying,
    slowMotionRate,
    timeline,
    soundSource,
    seekToTau,
    video1,
    video2,
    mode,
    mirror1,
    mirror2,
    triLineTransform,
    relativeOpacity,
    viewport,
    a1,
    a2,
  ]);

  // 叠加视口单指平移与双指捏合缩放
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const lastDistRef = useRef<number | null>(null);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 2) {
      const pts = Array.from(pointersRef.current.values());
      lastDistRef.current = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    const oldPos = pointersRef.current.get(e.pointerId)!;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (mode !== 'overlay') return;

    if (pointersRef.current.size === 1) {
      const dx = e.clientX - oldPos.x;
      const dy = e.clientY - oldPos.y;
      setViewport((prev) => ({
        ...prev,
        offsetX: prev.offsetX + dx,
        offsetY: prev.offsetY + dy,
      }));
    } else if (pointersRef.current.size === 2) {
      const pts = Array.from(pointersRef.current.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (lastDistRef.current && lastDistRef.current > 0) {
        const factor = dist / lastDistRef.current;
        setViewport((prev) => ({
          ...prev,
          scale: Math.max(0.5, Math.min(4.0, prev.scale * factor)),
        }));
      }
      lastDistRef.current = dist;
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) {
      lastDistRef.current = null;
    }
  };

  // 打开精简独立导出页
  if (isExportPageOpen || isExport) {
    return (
      <ExportPage
        video1={video1}
        video2={video2}
        timeline={timeline}
        initialMode={mode}
        initialMirror1={mirror1}
        initialMirror2={mirror2}
        triLineTransform={triLineTransform}
        initialViewport={viewport}
        initialOpacity={relativeOpacity}
        initialRate={slowMotionRate}
        initialSoundSource={soundSource}
        currentPlayTau={tau}
        onBack={() => {
          if (onNavigate) {
            onNavigate('workbench');
          } else {
            setIsExportPageOpen(false);
          }
        }}
      />
    );
  }

  const isViewportModified =
    mode === 'overlay' &&
    (viewport.scale !== 1 || viewport.offsetX !== 0 || viewport.offsetY !== 0);

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
      {/* 隐藏视频解码源 */}
      <video ref={videoRef1} src={video1.url} style={{ display: 'none' }} playsInline preload="auto" />
      <video ref={videoRef2} src={video2.url} style={{ display: 'none' }} playsInline preload="auto" />

      {/* 顶部工作台参数栏（可折叠，默认收起） */}
      {isToolbarExpanded && (
        <div className="toolbar-row">
          {/* 左：对比模式切换与视口复位（分区在前、叠加在后） */}
          <div className="control-group" style={{ gap: '4px' }}>
            <div className="seg-group">
              <button
                type="button"
                onClick={() => handleModeChange('split-screen')}
                className={`seg-btn ${mode === 'split-screen' ? 'active' : ''}`}
                style={{ padding: '0 6px' }}
              >
                <Columns2 size={12} />
                <span>分区</span>
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('overlay')}
                className={`seg-btn ${mode === 'overlay' ? 'active' : ''}`}
                style={{ padding: '0 6px' }}
              >
                <Layers size={12} />
                <span>叠加</span>
              </button>
            </div>

            {isViewportModified && (
              <button
                type="button"
                onClick={() => setViewport({ scale: 1, offsetX: 0, offsetY: 0 })}
                className="btn"
                style={{ padding: '0 6px' }}
              >
                <RotateCcw size={12} />
                <span className="mono-num">{viewport.scale.toFixed(1)}x</span>
              </button>
            )}
          </div>

          {/* 中：声音输出源与双通道独立镜像 */}
          <div className="control-group" style={{ gap: '4px' }}>
            <div className="seg-group">
              {(
                [
                  { id: 'metronome', label: '节拍器' },
                  { id: 'video1', label: 'CH1' },
                  { id: 'video2', label: 'CH2' },
                  { id: 'mute', label: '静音' },
                ] as { id: SoundSource; label: string }[]
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSoundSource(item.id)}
                  className={`seg-btn ${soundSource === item.id ? 'active' : ''}`}
                  style={{ padding: '0 6px' }}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="divider-v" />

            <button
              type="button"
              onClick={() => toggleMirror(1)}
              className={`btn ${mirror1 ? 'btn-active' : ''}`}
              style={{ padding: '0 6px' }}
              title="CH1 水平镜像"
            >
              <HorizontalFlipIcon size={12} />
              <span>CH1</span>
            </button>
            <button
              type="button"
              onClick={() => toggleMirror(2)}
              className={`btn ${mirror2 ? 'btn-active' : ''}`}
              style={{ padding: '0 6px' }}
              title="CH2 水平镜像"
            >
              <HorizontalFlipIcon size={12} />
              <span>CH2</span>
            </button>
          </div>
        </div>
      )}

      {/* 第一栏正中央外侧的长梯形展开/收起拉手按钮 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
          position: 'relative',
          height: 0,
          zIndex: 35,
        }}
      >
        <button
          type="button"
          onClick={onToggleToolbar}
          title={isToolbarExpanded ? '收起对比工具栏' : '展开对比工具栏'}
          style={{
            height: '14px',
            width: '80px',
            backgroundColor: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            borderTop: 'none',
            borderRadius: '0 0 6px 6px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            padding: 0,
            color: 'var(--text-secondary)',
            boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
            clipPath: isToolbarExpanded
              ? 'polygon(12% 100%, 88% 100%, 100% 0, 0 0)'
              : 'polygon(0 0, 100% 0, 88% 100%, 12% 100%)',
            transition: 'background-color 0.15s, color 0.15s',
          }}
        >
          {isToolbarExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </button>
      </div>

      {/* 中部单画布渲染视口 */}
      <div
        style={{
          flex: 1,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--bg-canvas)',
          minHeight: 0,
          paddingLeft: 'max(8px, var(--safe-left))',
          paddingRight: 'max(8px, var(--safe-right))',
        }}
      >
        <canvas
          ref={canvasRef}
          width={1920}
          height={1080}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
            touchAction: 'none',
            cursor: mode === 'overlay' ? 'grab' : 'default',
          }}
        />
      </div>

      {/* 底部时间轴与慢放控制台 */}
      <div className="bottom-bar">
        {/* 第一行：统一时间轴滑块 */}
        <div className="control-group" style={{ gap: '10px' }}>
          <span className="mono-num" style={{ minWidth: '64px' }}>
            {tau >= 0 ? `+${tau.toFixed(2)}s` : `${tau.toFixed(2)}s`}
          </span>
          <input
            type="range"
            className="slider"
            min={timeline.intersectInterval.start}
            max={timeline.intersectInterval.end}
            step="0.01"
            value={tau}
            onChange={(e) => seekToTau(parseFloat(e.target.value))}
            style={{ flex: 1 }}
          />
          <span className="mono-muted" style={{ minWidth: '110px', textAlign: 'right' }}>
            {timeline.intersectInterval.start.toFixed(1)}s ~ +{timeline.intersectInterval.end.toFixed(1)}s
          </span>
        </div>

        {/* 第二行：播放步进、七档慢放、叠加透明度 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <div className="control-group" style={{ gap: '4px' }}>
            <button type="button" onClick={playFromPreRoll} className="btn" style={{ padding: '0 8px' }}>
              <Crosshair size={12} />
              <span>锚点前 1s</span>
            </button>

            <button type="button" onClick={togglePlay} className="btn btn-accent" style={{ padding: '0 9px' }}>
              {isPlaying ? <Pause size={13} /> : <Play size={13} />}
              <span>{isPlaying ? '暂停' : '播放'}</span>
            </button>
          </div>

          <div className="control-group" style={{ gap: '4px' }}>
            <span className="mono-muted" style={{ fontSize: '11px' }}>倍速</span>
            <div className="seg-group">
              {SLOW_MOTION_RATES.map((rate) => (
                <button
                  key={rate}
                  type="button"
                  onClick={() => handleRateChange(rate)}
                  className={`seg-btn mono-num ${slowMotionRate === rate ? 'active' : ''}`}
                  style={{ padding: '0 5px', fontSize: '10.5px' }}
                >
                  {rate}x
                </button>
              ))}
            </div>
          </div>

          <div className="control-group" style={{ gap: '6px', flexShrink: 0 }}>
            {mode === 'overlay' && (
              <div className="control-group" style={{ gap: '4px' }}>
                <span className="mono-muted" style={{ color: 'var(--ch1)', fontSize: '11px' }}>
                  CH1
                </span>
                <input
                  type="range"
                  className="slider"
                  min="-1"
                  max="1"
                  step="0.05"
                  value={relativeOpacity}
                  onChange={(e) => setRelativeOpacity(parseFloat(e.target.value))}
                  style={{ width: '60px' }}
                />
                <span className="mono-muted" style={{ color: 'var(--ch2)', fontSize: '11px' }}>
                  CH2
                </span>
                <span className="mono-num" style={{ minWidth: '32px', textAlign: 'right', fontSize: '11px' }}>
                  {relativeOpacity > 0 ? `+${relativeOpacity.toFixed(2)}` : relativeOpacity.toFixed(2)}
                </span>
              </div>
            )}

            {/* 可向上展开的 BPM 对齐策略菜单 */}
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setIsBpmMenuOpen((prev) => !prev)}
                className={`tag-badge ${isBpmMenuOpen ? 'ch1' : ''}`}
                style={{ cursor: 'pointer', fontSize: '11px', height: '24px', gap: '3px' }}
                title="点击选择 BPM 对齐策略"
              >
                <ChevronUp
                  size={12}
                  style={{
                    transform: isBpmMenuOpen ? 'rotate(180deg)' : 'none',
                    transition: 'transform 0.15s ease',
                  }}
                />
                <span>SYNC {Math.round(timeline.effectiveBpm)} BPM</span>
              </button>

              {isBpmMenuOpen && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: 'calc(100% + 6px)',
                    right: 0,
                    backgroundColor: 'var(--bg-panel)',
                    border: '1px solid var(--border-strong)',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    boxShadow: '0 6px 20px rgba(0,0,0,0.8)',
                    zIndex: 50,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    BPM 对齐策略
                  </div>
                  <div className="seg-group">
                    <button
                      type="button"
                      onClick={() => {
                        onBpmStrategyChange?.('none', customBpm);
                      }}
                      className={`seg-btn ${bpmStrategy === 'none' ? 'active' : ''}`}
                      style={{ padding: '0 6px', fontSize: '11px' }}
                    >
                      原速
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onBpmStrategyChange?.('left', customBpm);
                      }}
                      className={`seg-btn ${bpmStrategy === 'left' ? 'active' : ''}`}
                      style={{ padding: '0 6px', fontSize: '11px' }}
                    >
                      随 CH1 ({video1.audioInfo?.userBpm || 160})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onBpmStrategyChange?.('right', customBpm);
                      }}
                      className={`seg-btn ${bpmStrategy === 'right' ? 'active' : ''}`}
                      style={{ padding: '0 6px', fontSize: '11px' }}
                    >
                      随 CH2 ({video2.audioInfo?.userBpm || 160})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onBpmStrategyChange?.('custom', customBpm);
                      }}
                      className={`seg-btn ${bpmStrategy === 'custom' ? 'active' : ''}`}
                      style={{ padding: '0 6px', fontSize: '11px' }}
                    >
                      手动
                    </button>
                  </div>

                  {bpmStrategy === 'custom' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                      <span className="mono-muted" style={{ fontSize: '11px' }}>目标 BPM:</span>
                      <input
                        type="number"
                        className="num-input"
                        value={customBpm}
                        onChange={(e) => {
                          const val = Math.max(1, parseInt(e.target.value, 10) || 160);
                          onBpmStrategyChange?.('custom', val);
                        }}
                        style={{ width: '56px', height: '22px', fontSize: '11px' }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
