import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowLeft, Download, X, Check, Play, Pause } from 'lucide-react';
import type { ComparisonMode, ViewportTransform } from '../types/geometry.ts';
import type { SlowMotionRate, SoundSource } from '../types/timeline.ts';
import type { AlignmentTransform } from '../core/geometry.ts';
import type { UnifiedTimelineResult } from '../core/timeline.ts';
import { mapTauToSourceTime, isTauInVideoRange, getPlaybackRate } from '../core/timeline.ts';
import { renderComparisonFrame, ComparisonRenderState } from '../core/renderer.ts';
import { SynthesizedMetronome } from '../core/metronome.ts';
import type { LoadedVideoItem } from './ImportStep.tsx';
import { VideoExporter, ExportProgressInfo } from '../core/exporter.ts';

interface ExportPageProps {
  video1: LoadedVideoItem;
  video2: LoadedVideoItem;
  timeline: UnifiedTimelineResult;
  initialMode: ComparisonMode;
  initialMirror1: boolean;
  initialMirror2: boolean;
  triLineTransform?: AlignmentTransform;
  initialViewport: ViewportTransform;
  initialOpacity: number;
  initialRate: SlowMotionRate;
  initialSoundSource: SoundSource;
  currentPlayTau: number;
  onBack: () => void;
}

/**
 * 独立 A-B 区间截取与所见即所得离线导出视图
 */
export const ExportPage: React.FC<ExportPageProps> = ({
  video1,
  video2,
  timeline,
  initialMode,
  initialMirror1,
  initialMirror2,
  triLineTransform,
  initialViewport,
  initialOpacity,
  initialRate,
  initialSoundSource,
  currentPlayTau,
  onBack,
}) => {
  const intersectStart = timeline.intersectInterval.start;
  const intersectEnd = timeline.intersectInterval.end;

  const [clipStart, setClipStart] = useState<number>(intersectStart);
  const [clipEnd, setClipEnd] = useState<number>(intersectEnd);
  const [previewTau, setPreviewTau] = useState<number>(
    Math.max(intersectStart, Math.min(intersectEnd, currentPlayTau))
  );
  const [isPreviewPlaying, setIsPreviewPlaying] = useState<boolean>(false);
  const [draggingHandle, setDraggingHandle] = useState<'A' | 'B' | null>(null);

  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [progress, setProgress] = useState<ExportProgressInfo>({
    currentFrame: 0,
    totalFrames: 100,
    percent: 0,
    statusText: '就绪',
  });
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [savedNativePath, setSavedNativePath] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const exporterRef = useRef<VideoExporter | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const v1Ref = useRef<HTMLVideoElement>(null);
  const v2Ref = useRef<HTMLVideoElement>(null);
  const metronomeRef = useRef<SynthesizedMetronome>(new SynthesizedMetronome());

  // 双视频独立寻道互斥与起播就绪防抖控制
  const isSeeking1Ref = useRef<boolean>(false);
  const isSeeking2Ref = useRef<boolean>(false);
  const pendingTarget1Ref = useRef<number | null>(null);
  const pendingTarget2Ref = useRef<number | null>(null);
  const lastHardSeekTimeRef = useRef<number>(0);
  const isStartingPlayRef = useRef<boolean>(false);

  // 配置双视频音轨与静音状态
  useEffect(() => {
    const v1 = v1Ref.current;
    const v2 = v2Ref.current;
    if (!v1 || !v2) return;

    v1.preservesPitch = true;
    v2.preservesPitch = true;

    if (initialSoundSource === 'video1') {
      v1.muted = false;
      v1.volume = 1.0;
      v2.muted = true;
    } else if (initialSoundSource === 'video2') {
      v1.muted = true;
      v2.muted = false;
      v2.volume = 1.0;
    } else {
      v1.muted = true;
      v2.muted = true;
    }
  }, [initialSoundSource]);

  // 计算截取时长、慢放后成片时长与总帧数
  const clipDuration = Math.max(0.1, clipEnd - clipStart);
  const estimatedOutputDuration = clipDuration / initialRate;
  const estimatedFrames = Math.max(1, Math.round(estimatedOutputDuration * 30));

  const a1 =
    typeof video1.audioInfo?.anchorTime === 'number'
      ? video1.audioInfo.anchorTime
      : 1.0;
  const a2 =
    typeof video2.audioInfo?.anchorTime === 'number'
      ? video2.audioInfo.anchorTime
      : 1.0;

  const previewTauRef = useRef<number>(previewTau);
  previewTauRef.current = previewTau;

  const drawPreviewFrame = useCallback(() => {
    const v1 = v1Ref.current;
    const v2 = v2Ref.current;
    const canvas = previewCanvasRef.current;
    if (!v1 || !v2 || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const currentTau = previewTauRef.current;
    const v1Active = isTauInVideoRange(currentTau, timeline.span1);
    const v2Active = isTauInVideoRange(currentTau, timeline.span2);

    const renderState: ComparisonRenderState = {
      mode: initialMode,
      video1: v1,
      video1Size: { width: video1.width, height: video1.height },
      video1Active: v1Active,
      mirror1: initialMirror1,
      triLine1: video1.geometry.triLine,
      video2: v2,
      video2Size: { width: video2.width, height: video2.height },
      video2Active: v2Active,
      mirror2: initialMirror2,
      triLine2: video2.geometry.triLine,
      triLineTransform,
      relativeOpacity: initialOpacity,
      viewport: initialViewport,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
    };

    renderComparisonFrame(ctx, renderState);
  }, [
    initialMode,
    initialMirror1,
    initialMirror2,
    initialOpacity,
    initialViewport,
    triLineTransform,
    timeline,
    video1,
    video2,
  ]);

  /**
   * 单路视频安全寻道：正在寻道期间排队最新目标，绝不高频重复重置 currentTime
   */
  const safeSeek = useCallback(
    (
      video: HTMLVideoElement,
      targetTime: number,
      isSeekingRef: React.MutableRefObject<boolean>,
      pendingTargetRef: React.MutableRefObject<number | null>,
      onDone?: () => void
    ) => {
      const clamped = Math.max(0, Math.min(video.duration || 0, targetTime));
      if (Math.abs(video.currentTime - clamped) < 0.005) {
        onDone?.();
        return;
      }

      if (isSeekingRef.current || video.seeking) {
        pendingTargetRef.current = clamped;
        return;
      }

      isSeekingRef.current = true;
      pendingTargetRef.current = null;

      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked);
        isSeekingRef.current = false;
        if (pendingTargetRef.current !== null) {
          const next = pendingTargetRef.current;
          pendingTargetRef.current = null;
          safeSeek(video, next, isSeekingRef, pendingTargetRef, onDone);
        } else {
          onDone?.();
        }
      };

      video.addEventListener('seeked', onSeeked, { once: true });
      video.currentTime = clamped;
    },
    []
  );

  const seekPreview = useCallback(
    (targetTau: number, onComplete?: () => void) => {
      const v1 = v1Ref.current;
      const v2 = v2Ref.current;
      const clampedTau = Math.max(intersectStart, Math.min(intersectEnd, targetTau));

      previewTauRef.current = clampedTau;
      setPreviewTau(clampedTau);

      const t1 = mapTauToSourceTime(clampedTau, a1, timeline.rate1);
      const t2 = mapTauToSourceTime(clampedTau, a2, timeline.rate2);

      let v1Finished = !v1;
      let v2Finished = !v2;

      const checkBoth = () => {
        if (v1Finished && v2Finished) {
          if (initialSoundSource === 'metronome') {
            metronomeRef.current.reset(clampedTau, timeline.effectiveBpm);
          }
          drawPreviewFrame();
          onComplete?.();
        }
      };

      if (v1) {
        safeSeek(v1, t1, isSeeking1Ref, pendingTarget1Ref, () => {
          v1Finished = true;
          checkBoth();
        });
      }
      if (v2) {
        safeSeek(v2, t2, isSeeking2Ref, pendingTarget2Ref, () => {
          v2Finished = true;
          checkBoth();
        });
      }

      if (!v1 && !v2) {
        checkBoth();
      }
    },
    [
      a1,
      a2,
      drawPreviewFrame,
      initialSoundSource,
      intersectEnd,
      intersectStart,
      safeSeek,
      timeline.effectiveBpm,
      timeline.rate1,
      timeline.rate2,
    ]
  );

  // 初始加载绘制第一帧
  useEffect(() => {
    seekPreview(previewTau);
  }, []);

  // 播放 / 暂停切换（带起播就绪栅栏）
  const togglePreviewPlay = () => {
    const v1 = v1Ref.current;
    const v2 = v2Ref.current;
    if (!v1 || !v2) return;

    if (isPreviewPlaying || isStartingPlayRef.current) {
      isStartingPlayRef.current = false;
      v1.pause();
      v2.pause();
      setIsPreviewPlaying(false);
      return;
    }

    let startTau = previewTauRef.current;
    if (startTau >= clipEnd - 0.05 || startTau < clipStart) {
      startTau = clipStart;
    }

    isStartingPlayRef.current = true;

    const executeStart = () => {
      if (!isStartingPlayRef.current) return;
      isStartingPlayRef.current = false;

      v1.playbackRate = getPlaybackRate(initialRate, timeline.rate1);
      v2.playbackRate = getPlaybackRate(initialRate, timeline.rate2);

      v1.preservesPitch = true;
      v2.preservesPitch = true;
      metronomeRef.current.reset(startTau, timeline.effectiveBpm);

      if (initialSoundSource === 'video1') {
        v1.muted = false;
        v1.volume = 1.0;
        v2.muted = true;
      } else if (initialSoundSource === 'video2') {
        v1.muted = true;
        v2.muted = false;
        v2.volume = 1.0;
      } else {
        v1.muted = true;
        v2.muted = true;
      }

      Promise.all([
        v1.play().catch(() => {}),
        v2.play().catch(() => {}),
      ]).then(() => {
        setIsPreviewPlaying(true);
      });
    };

    // 起播就绪等待栅栏：确认双端视频已完成寻道并具备可渲染数据
    const isReady1 = !isSeeking1Ref.current && !v1.seeking && v1.readyState >= 2;
    const isReady2 = !isSeeking2Ref.current && !v2.seeking && v2.readyState >= 2;

    if (isReady1 && isReady2) {
      executeStart();
    } else {
      let timeoutId: number;
      const onReady = () => {
        window.clearTimeout(timeoutId);
        executeStart();
      };
      timeoutId = window.setTimeout(onReady, 250);
      seekPreview(startTau, onReady);
    }
  };

  // 连续播放 RAF 同步主循环
  useEffect(() => {
    if (!isPreviewPlaying) return;

    let animId: number;
    let lastTime = performance.now();

    const loop = (now: number) => {
      const deltaSec = (now - lastTime) / 1000;
      lastTime = now;

      const v1 = v1Ref.current;
      const v2 = v2Ref.current;

      if (v1 && v2) {
        const baseRate1 = getPlaybackRate(initialRate, timeline.rate1);
        const baseRate2 = getPlaybackRate(initialRate, timeline.rate2);

        // 1. 自适应确定主时钟 (Master)
        let currentTau = previewTauRef.current;
        let masterVideo: HTMLVideoElement | null = null;
        let masterRate = timeline.rate1;
        let masterAnchor = a1;

        if (initialSoundSource === 'video2' && !v2.paused && !v2.seeking && v2.readyState >= 2) {
          masterVideo = v2;
          masterRate = timeline.rate2;
          masterAnchor = a2;
        } else if (!v1.paused && !v1.seeking && v1.readyState >= 2) {
          masterVideo = v1;
          masterRate = timeline.rate1;
          masterAnchor = a1;
        }

        if (masterVideo) {
          currentTau = (masterVideo.currentTime - masterAnchor) / masterRate;
        } else {
          currentTau += deltaSec * initialRate;
        }

        // 2. 检查 A-B 截取区间终点循环回跳
        if (currentTau >= clipEnd) {
          previewTauRef.current = clipStart;
          setPreviewTau(clipStart);
          if (initialSoundSource === 'metronome') {
            metronomeRef.current.reset(clipStart, timeline.effectiveBpm);
          }
          const startT1 = mapTauToSourceTime(clipStart, a1, timeline.rate1);
          const startT2 = mapTauToSourceTime(clipStart, a2, timeline.rate2);
          safeSeek(v1, startT1, isSeeking1Ref, pendingTarget1Ref);
          safeSeek(v2, startT2, isSeeking2Ref, pendingTarget2Ref);
        } else {
          previewTauRef.current = currentTau;
          setPreviewTau(currentTau);

          if (initialSoundSource === 'metronome') {
            metronomeRef.current.update(
              currentTau,
              timeline.effectiveBpm,
              true
            );
          }

          // 3. 从属视频防雪崩锁相环追赶 (PLL)
          const expectedT1 = mapTauToSourceTime(currentTau, a1, timeline.rate1);
          const expectedT2 = mapTauToSourceTime(currentTau, a2, timeline.rate2);

          // 调谐视频 1
          if (masterVideo !== v1) {
            const diff1 = v1.currentTime - expectedT1;
            if (Math.abs(diff1) > 0.3) {
              const canHardSeek =
                !isSeeking1Ref.current &&
                !v1.seeking &&
                now - lastHardSeekTimeRef.current > 600;
              if (canHardSeek) {
                lastHardSeekTimeRef.current = now;
                safeSeek(v1, expectedT1, isSeeking1Ref, pendingTarget1Ref);
              }
            } else if (Math.abs(diff1) > 0.03) {
              v1.playbackRate = baseRate1 * (diff1 < 0 ? 1.08 : 0.92);
            } else {
              v1.playbackRate = baseRate1;
            }
          } else {
            v1.playbackRate = baseRate1;
          }

          // 调谐视频 2
          if (masterVideo !== v2) {
            const diff2 = v2.currentTime - expectedT2;
            if (Math.abs(diff2) > 0.3) {
              const canHardSeek =
                !isSeeking2Ref.current &&
                !v2.seeking &&
                now - lastHardSeekTimeRef.current > 600;
              if (canHardSeek) {
                lastHardSeekTimeRef.current = now;
                safeSeek(v2, expectedT2, isSeeking2Ref, pendingTarget2Ref);
              }
            } else if (Math.abs(diff2) > 0.03) {
              v2.playbackRate = baseRate2 * (diff2 < 0 ? 1.08 : 0.92);
            } else {
              v2.playbackRate = baseRate2;
            }
          } else {
            v2.playbackRate = baseRate2;
          }
        }
      }

      drawPreviewFrame();
      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(animId);
      v1Ref.current?.pause();
      v2Ref.current?.pause();
    };
  }, [
    isPreviewPlaying,
    clipStart,
    clipEnd,
    initialRate,
    initialSoundSource,
    a1,
    a2,
    timeline,
    drawPreviewFrame,
    safeSeek,
  ]);

  const totalIntersectSpan = Math.max(0.01, intersectEnd - intersectStart);
  const leftPct = Math.max(
    0,
    Math.min(100, ((clipStart - intersectStart) / totalIntersectSpan) * 100)
  );
  const rightPct = Math.max(
    0,
    Math.min(100, ((clipEnd - intersectStart) / totalIntersectSpan) * 100)
  );

  const handlePointerDown = (handle: 'A' | 'B', e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDraggingHandle(handle);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingHandle || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetTau = intersectStart + ratio * totalIntersectSpan;

    if (draggingHandle === 'A') {
      const val = Math.max(intersectStart, Math.min(clipEnd - 0.2, targetTau));
      setClipStart(val);
      seekPreview(val);
    } else if (draggingHandle === 'B') {
      const val = Math.min(intersectEnd, Math.max(clipStart + 0.2, targetTau));
      setClipEnd(val);
      seekPreview(val);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (draggingHandle) {
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
      setDraggingHandle(null);
    }
  };

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetTau = intersectStart + ratio * totalIntersectSpan;

    const distA = Math.abs(targetTau - clipStart);
    const distB = Math.abs(targetTau - clipEnd);
    if (distA <= distB) {
      const val = Math.max(intersectStart, Math.min(clipEnd - 0.2, targetTau));
      setClipStart(val);
      seekPreview(val);
    } else {
      const val = Math.min(intersectEnd, Math.max(clipStart + 0.2, targetTau));
      setClipEnd(val);
      seekPreview(val);
    }
  };

  /**
   * 启动 A-B 区间离线合成导出
   */
  const handleStartExport = async () => {
    setIsExporting(true);
    setErrorMsg(null);
    setDownloadUrl(null);
    setSavedNativePath(null);

    const customTimeline: UnifiedTimelineResult = {
      ...timeline,
      intersectInterval: {
        start: clipStart,
        end: clipEnd,
      },
    };

    const exporter = new VideoExporter({
      video1,
      video2,
      timeline: customTimeline,
      mode: initialMode,
      mirror1: initialMirror1,
      mirror2: initialMirror2,
      triLineTransform,
      viewport: initialViewport,
      relativeOpacity: initialOpacity,
      slowMotionRate: initialRate,
      soundSource: initialSoundSource,
      fps: 30,
      width: 1280,
      height: 720,
      onProgress: (info) => setProgress(info),
    });
    exporterRef.current = exporter;

    try {
      const result = await exporter.export();
      const url = URL.createObjectURL(result.blob);
      setDownloadUrl(url);
      if (result.savedPath) {
        setSavedNativePath(result.savedPath);
      }
    } catch (err: unknown) {
      if ((err as Error)?.message !== '用户已取消导出') {
        setErrorMsg((err as Error)?.message || '导出中断');
      }
    } finally {
      setIsExporting(false);
    }
  };

  /**
   * 取消正在执行的离线导出
   */
  const handleCancelExport = () => {
    exporterRef.current?.cancel();
  };

  const soundLabel =
    initialSoundSource === 'metronome'
      ? '节拍器'
      : initialSoundSource === 'video1'
      ? 'CH1 原声'
      : initialSoundSource === 'video2'
      ? 'CH2 原声'
      : '静音';

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
      {/* 隐藏解码视频源 */}
      <video ref={v1Ref} src={video1.url} style={{ display: 'none' }} preload="auto" playsInline />
      <video ref={v2Ref} src={video2.url} style={{ display: 'none' }} preload="auto" playsInline />

      {/* 顶部栏：返回对比台与继承参数只读徽章 */}
      <div className="toolbar-row">
        <div className="control-group">
          <button
            type="button"
            onClick={onBack}
            disabled={isExporting}
            className="btn"
          >
            <ArrowLeft size={13} />
            <span>返回对比台</span>
          </button>
          <span style={{ fontSize: '12px', fontWeight: 600 }}>A-B 区间导出</span>
        </div>

        <div className="control-group">
          <span className="tag-badge">
            {initialMode === 'overlay' ? '半透明叠加' : '左右分区'}
          </span>
          <span className="tag-badge">{initialRate}x</span>
          <span className="tag-badge">{soundLabel}</span>
          <span className="tag-badge">1280×720 · 30FPS</span>
        </div>
      </div>

      {/* 主体两栏 */}
      <div className="export-grid">
        {/* 左栏：实时画面预览、预览播放控制与时间滑块 */}
        <div className="panel-box" style={{ gap: '6px' }}>
          <div
            style={{
              flex: 1,
              backgroundColor: '#000',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 0,
            }}
          >
            <canvas
              ref={previewCanvasRef}
              width={960}
              height={540}
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
            />
          </div>

          <div className="control-group" style={{ gap: '6px' }}>
            <button
              type="button"
              className="btn btn-accent"
              style={{ padding: '0 8px', height: '26px' }}
              onClick={togglePreviewPlay}
            >
              {isPreviewPlaying ? <Pause size={12} /> : <Play size={12} />}
              <span style={{ fontSize: '11px' }}>{isPreviewPlaying ? '暂停' : '预览'}</span>
            </button>

            <input
              type="range"
              className="slider"
              min={clipStart}
              max={clipEnd}
              step="0.01"
              value={previewTau}
              onChange={(e) => {
                seekPreview(parseFloat(e.target.value));
              }}
              style={{ flex: 1 }}
            />

            <span className="mono-num" style={{ minWidth: '58px', textAlign: 'right', fontSize: '11.5px' }}>
              {previewTau >= 0 ? `+${previewTau.toFixed(2)}s` : `${previewTau.toFixed(2)}s`}
            </span>
          </div>
        </div>

        {/* 右栏：A-B 截取滑块、成片统计与导出执行 (自适应紧凑防下溢) */}
        <div
          className="panel-box"
          style={{
            gap: '6px',
            overflowY: 'auto',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                导出区间
              </span>
              <span className="mono-muted" style={{ fontSize: '11px' }}>
                已选 {clipDuration.toFixed(2)}s · 交集全长 {(intersectEnd - intersectStart).toFixed(1)}s
              </span>
            </div>

            {/* 统一交集轴标定卡片 */}
            <div
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                padding: '6px 8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              {/* 快捷标记与数值反馈 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span className="mono-num" style={{ color: 'var(--accent)', fontSize: '11px', fontWeight: 600 }}>
                    IN (A): {clipStart >= 0 ? `+${clipStart.toFixed(2)}s` : `${clipStart.toFixed(2)}s`}
                  </span>
                  <button
                    type="button"
                    className="btn"
                    style={{ height: '20px', padding: '0 6px', fontSize: '10.5px' }}
                    onClick={() => {
                      if (isPreviewPlaying) togglePreviewPlay();
                      const val = Math.min(previewTau, clipEnd - 0.2);
                      setClipStart(val);
                      seekPreview(val);
                    }}
                  >
                    设当前为 A
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <button
                    type="button"
                    className="btn"
                    style={{ height: '20px', padding: '0 6px', fontSize: '10.5px' }}
                    onClick={() => {
                      if (isPreviewPlaying) togglePreviewPlay();
                      const val = Math.max(previewTau, clipStart + 0.2);
                      setClipEnd(val);
                      seekPreview(val);
                    }}
                  >
                    设当前为 B
                  </button>
                  <span className="mono-num" style={{ color: 'var(--ch2)', fontSize: '11px', fontWeight: 600 }}>
                    OUT (B): {clipEnd >= 0 ? `+${clipEnd.toFixed(2)}s` : `${clipEnd.toFixed(2)}s`}
                  </span>
                </div>
              </div>

              {/* 单轨双端点标定轴线 */}
              <div
                style={{
                  padding: '0 12px',
                  margin: '4px 0',
                }}
              >
                <div
                  ref={trackRef}
                  onClick={handleTrackClick}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  style={{
                    position: 'relative',
                    height: '28px',
                    display: 'flex',
                    alignItems: 'center',
                    cursor: 'pointer',
                    userSelect: 'none',
                    touchAction: 'none',
                  }}
                >
                  {/* 贯穿全长的底轨导线 */}
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      height: '6px',
                      backgroundColor: 'var(--bg-canvas)',
                      borderRadius: '3px',
                      border: '1px solid var(--border)',
                    }}
                  />

                  {/* A-B 中间高亮覆盖条 */}
                  <div
                    style={{
                      position: 'absolute',
                      left: `${leftPct}%`,
                      width: `${Math.max(0, rightPct - leftPct)}%`,
                      height: '6px',
                      backgroundColor: 'var(--accent)',
                      opacity: 0.75,
                      borderRadius: '2px',
                    }}
                  />

                  {/* 左端点手柄 A (IN) */}
                  <div
                    onPointerDown={(e) => handlePointerDown('A', e)}
                    style={{
                      position: 'absolute',
                      left: `${leftPct}%`,
                      transform: 'translateX(-50%)',
                      width: '24px',
                      height: '24px',
                      backgroundColor: 'var(--bg-surface)',
                      border: '2px solid var(--accent)',
                      borderRadius: '4px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'ew-resize',
                      zIndex: draggingHandle === 'A' ? 20 : 10,
                      boxShadow: '0 2px 6px rgba(0,0,0,0.6)',
                    }}
                    title="拖拽移动起点 A"
                  >
                    <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--accent)', lineHeight: 1 }}>
                      A
                    </span>
                  </div>

                  {/* 右端点手柄 B (OUT) */}
                  <div
                    onPointerDown={(e) => handlePointerDown('B', e)}
                    style={{
                      position: 'absolute',
                      left: `${rightPct}%`,
                      transform: 'translateX(-50%)',
                      width: '24px',
                      height: '24px',
                      backgroundColor: 'var(--bg-surface)',
                      border: '2px solid var(--ch2)',
                      borderRadius: '4px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'ew-resize',
                      zIndex: draggingHandle === 'B' ? 20 : 10,
                      boxShadow: '0 2px 6px rgba(0,0,0,0.6)',
                    }}
                    title="拖拽移动终点 B"
                  >
                    <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--ch2)', lineHeight: 1 }}>
                      B
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 成片规格统计网格 */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '4px',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                padding: '4px 8px',
              }}
            >
              <div>
                <div className="mono-muted" style={{ fontSize: '10px' }}>截取源时长</div>
                <div className="mono-num" style={{ fontSize: '11px', fontWeight: 600 }}>
                  {clipDuration.toFixed(2)}s
                </div>
              </div>
              <div>
                <div className="mono-muted" style={{ fontSize: '10px' }}>慢放成片时长</div>
                <div className="mono-num" style={{ fontSize: '11px', fontWeight: 600 }}>
                  {estimatedOutputDuration.toFixed(2)}s ({initialRate}x)
                </div>
              </div>
              <div>
                <div className="mono-muted" style={{ fontSize: '10px' }}>总渲染帧数</div>
                <div className="mono-num" style={{ fontSize: '11px', fontWeight: 600 }}>
                  {estimatedFrames} FRAMES
                </div>
              </div>
              <div>
                <div className="mono-muted" style={{ fontSize: '10px' }}>镜像状态</div>
                <div className="mono-num" style={{ fontSize: '11px', fontWeight: 600 }}>
                  CH1:{initialMirror1 ? 'ON' : 'OFF'} / CH2:{initialMirror2 ? 'ON' : 'OFF'}
                </div>
              </div>
            </div>
          </div>

          {/* 底部进度与导出按钮 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '2px' }}>
            {isExporting && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="mono-muted" style={{ fontSize: '11px' }}>{progress.statusText}</span>
                  <span className="mono-num" style={{ color: 'var(--accent)', fontSize: '11px' }}>
                    {progress.percent}%
                  </span>
                </div>
                <div
                  style={{
                    width: '100%',
                    height: '5px',
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                    borderRadius: '2px',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${progress.percent}%`,
                      height: '100%',
                      backgroundColor: 'var(--accent)',
                      transition: 'width 0.12s linear',
                    }}
                  />
                </div>
              </div>
            )}

            {errorMsg && (
              <div className="mono-num" style={{ color: 'var(--danger)', fontSize: '11px' }}>
                {errorMsg}
              </div>
            )}

            {savedNativePath && (
              <div className="control-group" style={{ color: 'var(--ch2)', fontSize: '11px' }}>
                <Check size={12} />
                <span className="mono-num">已保存: {savedNativePath}</span>
              </div>
            )}

            {downloadUrl && !isExporting && (
              <a
                href={downloadUrl}
                download={`wotagei-compare-${Date.now()}.mp4`}
                className="btn"
                style={{
                  height: '30px',
                  textDecoration: 'none',
                  borderColor: 'var(--ch2)',
                  color: 'var(--ch2)',
                  fontSize: '11.5px',
                }}
              >
                <Download size={13} />
                <span>下载导出文件</span>
              </a>
            )}

            {isExporting ? (
              <button
                type="button"
                onClick={handleCancelExport}
                className="btn btn-danger"
                style={{ height: '32px', width: '100%', fontSize: '12px' }}
              >
                <X size={13} />
                <span>取消导出</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStartExport}
                className="btn btn-accent"
                style={{ height: '32px', width: '100%', fontSize: '12px' }}
              >
                <Download size={13} />
                <span>开始渲染导出</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
