import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Download, X, RotateCcw, Check, Play, Pause } from 'lucide-react';
import type { ComparisonMode, ViewportTransform } from '../types/geometry.ts';
import type { SlowMotionRate, SoundSource } from '../types/timeline.ts';
import type { AlignmentTransform } from '../core/geometry.ts';
import type { UnifiedTimelineResult } from '../core/timeline.ts';
import { mapTauToSourceTime, isTauInVideoRange } from '../core/timeline.ts';
import { renderComparisonFrame, ComparisonRenderState } from '../core/renderer.ts';
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
  const v1Ref = useRef<HTMLVideoElement>(null);
  const v2Ref = useRef<HTMLVideoElement>(null);

  // 计算截取时长、慢放后成片时长与总帧数
  const clipDuration = Math.max(0.1, clipEnd - clipStart);
  const estimatedOutputDuration = clipDuration / initialRate;
  const estimatedFrames = Math.max(1, Math.round(estimatedOutputDuration * 30));

  // 导出台连续预览播放循环
  useEffect(() => {
    if (!isPreviewPlaying) return;

    let animId: number;
    let lastTime = performance.now();

    const previewLoop = (now: number) => {
      const deltaSec = (now - lastTime) / 1000;
      lastTime = now;

      setPreviewTau((prev) => {
        let next = prev + deltaSec * initialRate;
        if (next > clipEnd) {
          next = clipStart;
        }
        return next;
      });

      animId = requestAnimationFrame(previewLoop);
    };

    animId = requestAnimationFrame(previewLoop);
    return () => cancelAnimationFrame(animId);
  }, [isPreviewPlaying, clipStart, clipEnd, initialRate]);

  // 当预览游标变化时更新单帧实时预览画布
  useEffect(() => {
    const v1 = v1Ref.current;
    const v2 = v2Ref.current;
    const canvas = previewCanvasRef.current;
    if (!v1 || !v2 || !canvas) return;

    const a1 =
      typeof video1.audioInfo?.anchorTime === 'number'
        ? video1.audioInfo.anchorTime
        : 1.0;
    const a2 =
      typeof video2.audioInfo?.anchorTime === 'number'
        ? video2.audioInfo.anchorTime
        : 1.0;

    const t1 = mapTauToSourceTime(previewTau, a1, timeline.rate1);
    const t2 = mapTauToSourceTime(previewTau, a2, timeline.rate2);

    v1.currentTime = Math.max(0, Math.min(video1.duration, t1));
    v2.currentTime = Math.max(0, Math.min(video2.duration, t2));

    const drawPreview = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const v1Active = isTauInVideoRange(previewTau, timeline.span1);
      const v2Active = isTauInVideoRange(previewTau, timeline.span2);

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
    };

    v1.addEventListener('seeked', drawPreview, { once: true });
    v2.addEventListener('seeked', drawPreview, { once: true });
    const timer = setTimeout(drawPreview, 60);
    return () => clearTimeout(timer);
  }, [
    previewTau,
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
      <video ref={v1Ref} src={video1.url} style={{ display: 'none' }} preload="auto" muted />
      <video ref={v2Ref} src={video2.url} style={{ display: 'none' }} preload="auto" muted />

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
              onClick={() => setIsPreviewPlaying((prev) => !prev)}
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
                setIsPreviewPlaying(false);
                setPreviewTau(parseFloat(e.target.value));
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
              <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                起止区间截取 (交集范围)
              </span>
              <button
                type="button"
                className="btn"
                style={{ height: '22px', padding: '0 6px', fontSize: '10.5px' }}
                onClick={() => {
                  setIsPreviewPlaying(false);
                  setClipStart(intersectStart);
                  setClipEnd(intersectEnd);
                  setPreviewTau(intersectStart);
                }}
              >
                <RotateCcw size={10} />
                <span className="mono-num">
                  全片 {(intersectEnd - intersectStart).toFixed(1)}s
                </span>
              </button>
            </div>

            {/* 起点 A */}
            <div
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                padding: '4px 8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="mono-num" style={{ color: 'var(--accent)', fontSize: '11px', fontWeight: 600 }}>
                  IN (A): {clipStart >= 0 ? `+${clipStart.toFixed(2)}s` : `${clipStart.toFixed(2)}s`}
                </span>
                <button
                  type="button"
                  className="btn"
                  style={{ height: '20px', padding: '0 6px', fontSize: '10.5px' }}
                  onClick={() => {
                    setIsPreviewPlaying(false);
                    setClipStart(Math.min(previewTau, clipEnd - 0.2));
                  }}
                >
                  设当前为 A
                </button>
              </div>
              <input
                type="range"
                className="slider"
                min={intersectStart}
                max={Math.max(intersectStart, clipEnd - 0.2)}
                step="0.01"
                value={clipStart}
                onChange={(e) => {
                  setIsPreviewPlaying(false);
                  const val = parseFloat(e.target.value);
                  setClipStart(val);
                  setPreviewTau(val);
                }}
              />
            </div>

            {/* 终点 B */}
            <div
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                padding: '4px 8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="mono-num" style={{ color: 'var(--ch2)', fontSize: '11px', fontWeight: 600 }}>
                  OUT (B): {clipEnd >= 0 ? `+${clipEnd.toFixed(2)}s` : `${clipEnd.toFixed(2)}s`}
                </span>
                <button
                  type="button"
                  className="btn"
                  style={{ height: '20px', padding: '0 6px', fontSize: '10.5px' }}
                  onClick={() => {
                    setIsPreviewPlaying(false);
                    setClipEnd(Math.max(previewTau, clipStart + 0.2));
                  }}
                >
                  设当前为 B
                </button>
              </div>
              <input
                type="range"
                className="slider"
                min={Math.min(intersectEnd, clipStart + 0.2)}
                max={intersectEnd}
                step="0.01"
                value={clipEnd}
                onChange={(e) => {
                  setIsPreviewPlaying(false);
                  const val = parseFloat(e.target.value);
                  setClipEnd(val);
                  setPreviewTau(val);
                }}
              />
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
