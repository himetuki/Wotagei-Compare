import React, { useRef, useState, useEffect } from 'react';
import { Play, Pause, FlipHorizontal2, ChevronLeft, ChevronRight } from 'lucide-react';
import type {
  ComparisonMode,
  TriLineCalibration,
  TriLineModelType,
  VideoGeometryConfig,
} from '../types/geometry.ts';
import type { LoadedVideoItem } from './ImportStep.tsx';

interface GeometryStepProps {
  videoItem: LoadedVideoItem;
  videoIndex: 1 | 2;
  mode: ComparisonMode;
  onBack: () => void;
  onChange?: (updatedGeometry: VideoGeometryConfig) => void;
  onSave: (updatedGeometry: VideoGeometryConfig) => void;
}

/**
 * 步骤 02/03：单视频三线正交空间标定视图
 */
export const GeometryStep: React.FC<GeometryStepProps> = ({
  videoItem,
  videoIndex,
  onChange,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  const [mirror, setMirror] = useState<boolean>(videoItem.geometry.mirror);
  const [triLine, setTriLine] = useState<TriLineCalibration>(videoItem.geometry.triLine);

  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [draggingTarget, setDraggingTarget] = useState<string | null>(null);
  const [stageSize, setStageSize] = useState<{ width: number; height: number }>({
    width: 960,
    height: 480,
  });

  // 当切换视频通道时同步载入对应通道的几何配置
  useEffect(() => {
    setMirror(videoItem.geometry.mirror);
    setTriLine(videoItem.geometry.triLine);
    setCurrentTime(0);
    setIsPlaying(false);
  }, [videoItem.url, videoIndex]);

  // 监听舞台容器尺寸以计算视频精确内接矩形
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setStageSize({ width: rect.width, height: rect.height });
      }
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // 监听视频播放时间更新
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    const onPause = () => setIsPlaying(false);
    const onPlay = () => setIsPlaying(true);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('pause', onPause);
    video.addEventListener('play', onPlay);
    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('play', onPlay);
    };
  }, [videoItem.url]);

  /**
   * 同步更新几何状态并立即通知父级持久保存
   */
  const commitGeometry = (nextMirror: boolean, nextTriLine: TriLineCalibration) => {
    setMirror(nextMirror);
    setTriLine(nextTriLine);
    onChange?.({
      mirror: nextMirror,
      triLine: nextTriLine,
    });
  };

  /**
   * 切换三线正交模型（两横一竖 / 两竖一横）
   */
  const handleModelSwitch = (model: TriLineModelType) => {
    const nextTriLine: TriLineCalibration = { ...triLine, model };
    commitGeometry(mirror, nextTriLine);
  };

  /**
   * 切换当前通道水平镜像
   */
  const handleToggleMirror = () => {
    commitGeometry(!mirror, triLine);
  };

  /**
   * 播放/暂停当前视频找帧
   */
  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  };

  /**
   * 按帧步进微调画面
   */
  const stepFrame = (frames: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    const nextTime = Math.max(
      0,
      Math.min(videoItem.duration, video.currentTime + frames * (1 / 30))
    );
    video.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  /**
   * 进度条拖拽跳转
   */
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    const video = videoRef.current;
    if (video) {
      video.currentTime = val;
      setCurrentTime(val);
    }
  };

  /**
   * 指针移动时在视频内接画幅坐标系内计算归一化标尺位置
   */
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingTarget || !frameRef.current) return;
    const rect = frameRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const normX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const normY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    let nextTriLine = triLine;
    if (triLine.model === 'two-horizontal-one-vertical') {
      if (draggingTarget === 'yA') {
        nextTriLine = {
          ...triLine,
          twoHOneV: {
            ...triLine.twoHOneV,
            yA: Math.min(normY, triLine.twoHOneV.yB - 0.03),
          },
        };
      } else if (draggingTarget === 'yB') {
        nextTriLine = {
          ...triLine,
          twoHOneV: {
            ...triLine.twoHOneV,
            yB: Math.max(normY, triLine.twoHOneV.yA + 0.03),
          },
        };
      } else if (draggingTarget === 'x0') {
        nextTriLine = {
          ...triLine,
          twoHOneV: {
            ...triLine.twoHOneV,
            x0: normX,
          },
        };
      }
    } else {
      if (draggingTarget === 'xA') {
        nextTriLine = {
          ...triLine,
          twoVOneH: {
            ...triLine.twoVOneH,
            xA: Math.min(normX, triLine.twoVOneH.xB - 0.03),
          },
        };
      } else if (draggingTarget === 'xB') {
        nextTriLine = {
          ...triLine,
          twoVOneH: {
            ...triLine.twoVOneH,
            xB: Math.max(normX, triLine.twoVOneH.xA + 0.03),
          },
        };
      } else if (draggingTarget === 'y0') {
        nextTriLine = {
          ...triLine,
          twoVOneH: {
            ...triLine.twoVOneH,
            y0: normY,
          },
        };
      }
    }

    commitGeometry(mirror, nextTriLine);
  };

  const handlePointerUp = () => {
    setDraggingTarget(null);
  };

  // 计算视频在舞台内的精确内接矩形尺寸
  const vW = Math.max(1, videoItem.width);
  const vH = Math.max(1, videoItem.height);
  const fitScale = Math.min(stageSize.width / vW, stageSize.height / vH);
  const frameWidth = Math.max(1, Math.floor(vW * fitScale));
  const frameHeight = Math.max(1, Math.floor(vH * fitScale));

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        backgroundColor: 'var(--bg-canvas)',
      }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* 顶部标定参数控制栏 */}
      <div className="toolbar-row">
        <div className="control-group">
          <span className={`tag-badge ${videoIndex === 1 ? 'ch1' : 'ch2'}`}>
            CH 0{videoIndex}
          </span>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
            {videoItem.name}
          </span>
        </div>

        <div className="control-group">
          <div className="seg-group">
            <button
              type="button"
              onClick={() => handleModelSwitch('two-horizontal-one-vertical')}
              className={`seg-btn ${
                triLine.model === 'two-horizontal-one-vertical' ? 'active' : ''
              }`}
            >
              两横一竖 (头/脚/中轴)
            </button>
            <button
              type="button"
              onClick={() => handleModelSwitch('two-vertical-one-horizontal')}
              className={`seg-btn ${
                triLine.model === 'two-vertical-one-horizontal' ? 'active' : ''
              }`}
            >
              两竖一横 (左脚/右脚/地面)
            </button>
          </div>

          <button
            type="button"
            onClick={handleToggleMirror}
            className={`btn ${mirror ? 'btn-active' : ''}`}
          >
            <FlipHorizontal2 size={13} />
            <span>镜像 {mirror ? 'ON' : 'OFF'}</span>
          </button>
        </div>
      </div>

      {/* 中间内接画幅与三线标尺层 */}
      <div ref={stageRef} className="calib-stage">
        <div
          ref={frameRef}
          className="calib-frame"
          style={{ width: `${frameWidth}px`, height: `${frameHeight}px` }}
        >
          <video
            ref={videoRef}
            src={videoItem.url}
            style={{
              width: '100%',
              height: '100%',
              display: 'block',
              transform: mirror ? 'scaleX(-1)' : 'none',
              pointerEvents: 'none',
            }}
            playsInline
          />

          {triLine.model === 'two-horizontal-one-vertical' ? (
            <>
              {/* 上横线：头顶 */}
              <div
                className="calib-line-h"
                style={
                  {
                    top: `${triLine.twoHOneV.yA * 100}%`,
                    '--line-color': '#f59e0b',
                  } as React.CSSProperties
                }
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setDraggingTarget('yA');
                }}
              >
                <span
                  className="calib-tag"
                  style={
                    {
                      left: '10px',
                      bottom: '24px',
                      '--line-color': '#f59e0b',
                    } as React.CSSProperties
                  }
                >
                  头顶 {(triLine.twoHOneV.yA * 100).toFixed(1)}%
                </span>
              </div>

              {/* 下横线：脚底 */}
              <div
                className="calib-line-h"
                style={
                  {
                    top: `${triLine.twoHOneV.yB * 100}%`,
                    '--line-color': '#10b981',
                  } as React.CSSProperties
                }
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setDraggingTarget('yB');
                }}
              >
                <span
                  className="calib-tag"
                  style={
                    {
                      left: '10px',
                      top: '24px',
                      '--line-color': '#10b981',
                    } as React.CSSProperties
                  }
                >
                  脚底 {(triLine.twoHOneV.yB * 100).toFixed(1)}%
                </span>
              </div>

              {/* 竖线：中轴 */}
              <div
                className="calib-line-v"
                style={
                  {
                    left: `${triLine.twoHOneV.x0 * 100}%`,
                    '--line-color': '#38bdf8',
                  } as React.CSSProperties
                }
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setDraggingTarget('x0');
                }}
              >
                <span
                  className="calib-tag"
                  style={
                    {
                      top: '10px',
                      left: '26px',
                      '--line-color': '#38bdf8',
                    } as React.CSSProperties
                  }
                >
                  中轴 {(triLine.twoHOneV.x0 * 100).toFixed(1)}%
                </span>
              </div>
            </>
          ) : (
            <>
              {/* 左竖线：左脚 */}
              <div
                className="calib-line-v"
                style={
                  {
                    left: `${triLine.twoVOneH.xA * 100}%`,
                    '--line-color': '#38bdf8',
                  } as React.CSSProperties
                }
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setDraggingTarget('xA');
                }}
              >
                <span
                  className="calib-tag"
                  style={
                    {
                      top: '10px',
                      right: '26px',
                      '--line-color': '#38bdf8',
                    } as React.CSSProperties
                  }
                >
                  左脚 {(triLine.twoVOneH.xA * 100).toFixed(1)}%
                </span>
              </div>

              {/* 右竖线：右脚 */}
              <div
                className="calib-line-v"
                style={
                  {
                    left: `${triLine.twoVOneH.xB * 100}%`,
                    '--line-color': '#f59e0b',
                  } as React.CSSProperties
                }
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setDraggingTarget('xB');
                }}
              >
                <span
                  className="calib-tag"
                  style={
                    {
                      top: '10px',
                      left: '26px',
                      '--line-color': '#f59e0b',
                    } as React.CSSProperties
                  }
                >
                  右脚 {(triLine.twoVOneH.xB * 100).toFixed(1)}%
                </span>
              </div>

              {/* 横线：地面 */}
              <div
                className="calib-line-h"
                style={
                  {
                    top: `${triLine.twoVOneH.y0 * 100}%`,
                    '--line-color': '#10b981',
                  } as React.CSSProperties
                }
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setDraggingTarget('y0');
                }}
              >
                <span
                  className="calib-tag"
                  style={
                    {
                      left: '10px',
                      bottom: '24px',
                      '--line-color': '#10b981',
                    } as React.CSSProperties
                  }
                >
                  地面 {(triLine.twoVOneH.y0 * 100).toFixed(1)}%
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 底部找帧时间轴栏 */}
      <div
        className="bottom-bar"
        style={{ flexDirection: 'row', alignItems: 'center', minHeight: '42px', gap: '10px' }}
      >
        <button type="button" onClick={togglePlay} className="btn">
          {isPlaying ? <Pause size={13} /> : <Play size={13} />}
          <span>{isPlaying ? '暂停' : '播放'}</span>
        </button>

        <div className="control-group" style={{ gap: '4px' }}>
          <button type="button" onClick={() => stepFrame(-1)} className="btn">
            <ChevronLeft size={13} />
            <span>1F</span>
          </button>
          <button type="button" onClick={() => stepFrame(1)} className="btn">
            <span>1F</span>
            <ChevronRight size={13} />
          </button>
        </div>

        <span className="mono-num" style={{ minWidth: '105px' }}>
          {currentTime.toFixed(2)}s / {videoItem.duration.toFixed(2)}s
        </span>

        <input
          type="range"
          className="slider"
          min="0"
          max={videoItem.duration}
          step="0.01"
          value={currentTime}
          onChange={handleSeek}
          style={{ flex: 1 }}
        />
      </div>
    </div>
  );
};
