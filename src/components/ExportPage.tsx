import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowLeft, Download, X, Check, Play, Pause } from 'lucide-react';
import type { ComparisonMode, ViewportTransform } from '../types/geometry.ts';
import type { SlowMotionRate, SoundSource } from '../types/timeline.ts';
import type { AlignmentTransform } from '../core/geometry.ts';
import type { UnifiedTimelineResult } from '../core/timeline.ts';
import { isTauInVideoRange } from '../core/timeline.ts';
import { renderComparisonFrame, ComparisonRenderState } from '../core/renderer.ts';
import { SynthesizedMetronome } from '../core/metronome.ts';
import { DualVideoSyncEngine } from '../core/sync-engine.ts';
import type { LoadedVideoItem } from './ImportStep.tsx';
import { VideoExporter, ExportProgressInfo, isWebCodecsSupported } from '../core/exporter.ts';

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
  const webCodecsSupported = isWebCodecsSupported();

  const exporterRef = useRef<VideoExporter | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const v1Ref = useRef<HTMLVideoElement>(null);
  const v2Ref = useRef<HTMLVideoElement>(null);
  const engineRef = useRef<DualVideoSyncEngine | null>(null);
  const metronomeRef = useRef<SynthesizedMetronome>(new SynthesizedMetronome());
  const timelineRef = useRef<UnifiedTimelineResult>(timeline);
  timelineRef.current = timeline;

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
  const hasRenderedRef = useRef<boolean>(false);
  const pendingSeekTauRef = useRef<number | null>(null);
  const seekRafIdRef = useRef<number | null>(null);

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

    const v1Ready = !v1Active || (v1.readyState >= 2 && !v1.seeking);
    const v2Ready = !v2Active || (v2.readyState >= 2 && !v2.seeking);
    if (!v1Ready || !v2Ready) {
      if (hasRenderedRef.current) return;
    }

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
    if ((v1Active && v1.readyState >= 2) || (v2Active && v2.readyState >= 2)) {
      hasRenderedRef.current = true;
    }
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

  // 初始化并连接 DualVideoSyncEngine 驱动预览
  useEffect(() => {
    const v1 = v1Ref.current;
    const v2 = v2Ref.current;

    const engine = new DualVideoSyncEngine(v1, v2, {
      timeline,
      anchor1: a1,
      anchor2: a2,
      soundSource: initialSoundSource,
      slowMotionRate: initialRate,
      loopInterval: { start: clipStart, end: clipEnd },
      onTauUpdate: (nextTau, isEnginePlaying) => {
        setPreviewTau(nextTau);
        previewTauRef.current = nextTau;
        const activePlaying = isEnginePlaying ?? engineRef.current?.getIsPlaying() ?? false;
        if (initialSoundSource === 'metronome' && activePlaying) {
          metronomeRef.current.update(nextTau, timelineRef.current.effectiveBpm, true);
        }
      },
      onPlayingChange: (playing) => {
        setIsPreviewPlaying(playing);
      },
    });

    engineRef.current = engine;

    // 初始定位并绘制第一帧
    engine.seekToTau(previewTau, () => {
      drawPreviewFrame();
    });

    // 建立由 requestAnimationFrame 驱动的预览渲染循环
    let animId: number;
    const renderLoop = () => {
      const v1 = v1Ref.current;
      const v2 = v2Ref.current;
      const canvas = previewCanvasRef.current;

      if (v1 && v2 && canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const currentTau = previewTauRef.current;
          const v1Active = isTauInVideoRange(currentTau, timeline.span1);
          const v2Active = isTauInVideoRange(currentTau, timeline.span2);

          const v1Ready = !v1Active || (v1.readyState >= 2 && !v1.seeking);
          const v2Ready = !v2Active || (v2.readyState >= 2 && !v2.seeking);

          if ((v1Ready && v2Ready) || !hasRenderedRef.current) {
            try {
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
              if ((v1Active && v1.readyState >= 2) || (v2Active && v2.readyState >= 2)) {
                hasRenderedRef.current = true;
              }
            } catch {
              // 容灾捕获：瞬时渲染异常不中断循环
            }
          }
        }
      }

      animId = requestAnimationFrame(renderLoop);
    };

    animId = requestAnimationFrame(renderLoop);

    return () => {
      cancelAnimationFrame(animId);
      if (seekRafIdRef.current !== null) {
        cancelAnimationFrame(seekRafIdRef.current);
        seekRafIdRef.current = null;
      }
      engine.destroy();
      engineRef.current = null;
    };
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

  // 当截取区间 A-B 变化时同步更新循环边界
  useEffect(() => {
    engineRef.current?.updateConfig({
      loopInterval: { start: clipStart, end: clipEnd },
    });
    if (initialSoundSource === 'metronome') {
      metronomeRef.current.reset(previewTauRef.current, timeline.effectiveBpm);
    }
  }, [clipStart, clipEnd, initialSoundSource, timeline.effectiveBpm]);

  const ensureStopped = useCallback(() => {
    engineRef.current?.pause();
    setIsPreviewPlaying(false);
  }, []);

  const seekPreview = useCallback(
    (targetTau: number, onComplete?: () => void, keepPlaying?: boolean) => {
      const clampedTau = Math.max(intersectStart, Math.min(intersectEnd, targetTau));
      setPreviewTau(clampedTau);
      previewTauRef.current = clampedTau;
      if (initialSoundSource === 'metronome') {
        metronomeRef.current.reset(clampedTau, timeline.effectiveBpm);
      }
      const effectiveKeepPlaying =
        typeof keepPlaying === 'boolean'
          ? keepPlaying
          : (isPreviewPlaying || engineRef.current?.getIsPlaying());

      engineRef.current?.seekToTau(
        clampedTau,
        () => {
          drawPreviewFrame();
          onComplete?.();
        },
        effectiveKeepPlaying
      );
    },
    [intersectStart, intersectEnd, initialSoundSource, timeline.effectiveBpm, drawPreviewFrame, isPreviewPlaying]
  );

  const throttledSeek = useCallback(
    (targetTau: number, keepPlaying?: boolean) => {
      pendingSeekTauRef.current = targetTau;
      if (seekRafIdRef.current === null) {
        seekRafIdRef.current = requestAnimationFrame(() => {
          seekRafIdRef.current = null;
          if (pendingSeekTauRef.current !== null) {
            seekPreview(pendingSeekTauRef.current, undefined, keepPlaying);
            pendingSeekTauRef.current = null;
          }
        });
      }
    },
    [seekPreview]
  );

  // 播放 / 暂停切换 (统一走会合屏障)
  const togglePreviewPlay = () => {
    if (isPreviewPlaying) {
      engineRef.current?.pause();
    } else {
      if (initialSoundSource === 'metronome') {
        metronomeRef.current.reset(previewTauRef.current, timeline.effectiveBpm);
      }
      let start = previewTauRef.current;
      if (start >= clipEnd - 0.05 || start < clipStart) {
        start = clipStart;
      }
      engineRef.current?.playFrom(start);
    }
  };

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
    ensureStopped();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDraggingHandle(handle);
    const targetTau = handle === 'A' ? clipStart : clipEnd;
    seekPreview(targetTau, undefined, false);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingHandle || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetTau = intersectStart + ratio * totalIntersectSpan;

    if (draggingHandle === 'A') {
      const val = Math.max(intersectStart, Math.min(clipEnd - 0.2, targetTau));
      setClipStart(val);
      throttledSeek(val, false);
    } else if (draggingHandle === 'B') {
      const val = Math.min(intersectEnd, Math.max(clipStart + 0.2, targetTau));
      setClipEnd(val);
      throttledSeek(val, false);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (draggingHandle) {
      if (seekRafIdRef.current !== null) {
        cancelAnimationFrame(seekRafIdRef.current);
        seekRafIdRef.current = null;
      }
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
      const finalTau = draggingHandle === 'A' ? clipStart : clipEnd;
      setDraggingHandle(null);
      seekPreview(finalTau, undefined, false);
    }
  };

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!trackRef.current) return;
    ensureStopped();
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetTau = intersectStart + ratio * totalIntersectSpan;

    const distA = Math.abs(targetTau - clipStart);
    const distB = Math.abs(targetTau - clipEnd);
    if (distA <= distB) {
      const val = Math.max(intersectStart, Math.min(clipEnd - 0.2, targetTau));
      setClipStart(val);
      seekPreview(val, undefined, false);
    } else {
      const val = Math.min(intersectEnd, Math.max(clipStart + 0.2, targetTau));
      setClipEnd(val);
      seekPreview(val, undefined, false);
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
      {/* 活跃挂载的底层解码视频源，避免老旧内核合成器停止帧刷新 */}
      <video
        ref={v1Ref}
        src={video1.url}
        preload="auto"
        playsInline
        muted
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '1px',
          height: '1px',
          opacity: 0.01,
          pointerEvents: 'none',
          zIndex: -9999,
        }}
      />
      <video
        ref={v2Ref}
        src={video2.url}
        preload="auto"
        playsInline
        muted
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '1px',
          height: '1px',
          opacity: 0.01,
          pointerEvents: 'none',
          zIndex: -9999,
        }}
      />

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
                      ensureStopped();
                      const val = Math.min(previewTau, clipEnd - 0.2);
                      setClipStart(val);
                      seekPreview(val, undefined, false);
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
                      ensureStopped();
                      const val = Math.max(previewTau, clipStart + 0.2);
                      setClipEnd(val);
                      seekPreview(val, undefined, false);
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
            {!webCodecsSupported && (
              <div
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--accent)',
                  borderRadius: '4px',
                  padding: '6px 8px',
                  fontSize: '11px',
                  lineHeight: '1.4',
                  color: 'var(--text-secondary)',
                }}
              >
                <span style={{ color: 'var(--accent)', fontWeight: 600 }}>提示：</span>
                当前系统 WebView 内核低于 Chrome 94，WebCodecs 硬件视频编码器暂不可用。若需导出离线 MP4，可在应用商店升级「Android System WebView」；您仍可在对比台上流畅使用慢放与同台对比。
              </div>
            )}

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
