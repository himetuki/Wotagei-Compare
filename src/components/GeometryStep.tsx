import React, { useRef, useState, useEffect } from 'react';
import { Play, Pause } from 'lucide-react';
import type {
  ComparisonMode,
  TriLineModelType,
  TwoHorizontalOneVertical,
  TwoVerticalOneHorizontal,
  VideoGeometryConfig,
} from '../types/geometry.ts';
import type { LoadedVideoItem } from './ImportStep.tsx';

interface GeometryStepProps {
  videoItem: LoadedVideoItem;
  videoIndex: 1 | 2;
  model: TriLineModelType;
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
  model,
  onChange,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  const [mirror, setMirror] = useState<boolean>(videoItem.geometry.mirror);
  const [twoHOneV, setTwoHOneV] = useState<TwoHorizontalOneVertical>(videoItem.geometry.triLine.twoHOneV);
  const [twoVOneH, setTwoVOneH] = useState<TwoVerticalOneHorizontal>(videoItem.geometry.triLine.twoVOneH);

  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [draggingTarget, setDraggingTarget] = useState<string | null>(null);
  const [stageSize, setStageSize] = useState<{ width: number; height: number }>({
    width: 960,
    height: 480,
  });

  // 当切换视频通道或外部几何配置变化时同步载入对应通道的几何配置
  useEffect(() => {
    setMirror(videoItem.geometry.mirror);
    setTwoHOneV(videoItem.geometry.triLine.twoHOneV);
    setTwoVOneH(videoItem.geometry.triLine.twoVOneH);
  }, [videoItem.geometry]);

  useEffect(() => {
    setCurrentTime(0);
    setIsPlaying(false);
  }, [videoItem.url, videoIndex]);

  // 监听舞台容器尺寸以计算视频精确内接矩形（缺少 ResizeObserver 的老旧 WebView 降级至 window.resize）
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
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateSize);
      observer.observe(el);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // 监听视频播放时间更新与元数据就绪首帧渲染
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // 老旧 Android WebView 在 currentTime=0 且未播放时默认展示系统灰色播放占位图标，
    // 元数据就绪后轻寻道至极小非零首帧时间点以强制绘制真实视频首帧
    const seekFirstFrame = () => {
      if (video.currentTime === 0 && video.readyState >= 1) {
        const target = Math.min(0.01, (video.duration || 1) / 2);
        if (target > 0) {
          video.currentTime = target;
        }
      }
    };

    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    const onPause = () => setIsPlaying(false);
    const onPlay = () => setIsPlaying(true);
    video.addEventListener('loadedmetadata', seekFirstFrame);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('pause', onPause);
    video.addEventListener('play', onPlay);

    if (video.readyState >= 1) {
      seekFirstFrame();
    }

    return () => {
      video.removeEventListener('loadedmetadata', seekFirstFrame);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('play', onPlay);
    };
  }, [videoItem.url]);

  /**
   * 同步更新几何状态并立即通知父级持久保存
   */
  const commitGeometry = (
    nextMirror: boolean,
    nextTwoHOneV: TwoHorizontalOneVertical,
    nextTwoVOneH: TwoVerticalOneHorizontal
  ) => {
    setMirror(nextMirror);
    setTwoHOneV(nextTwoHOneV);
    setTwoVOneH(nextTwoVOneH);
    onChange?.({
      mirror: nextMirror,
      triLine: {
        model,
        twoHOneV: nextTwoHOneV,
        twoVOneH: nextTwoVOneH,
      },
    });
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

    let nextTwoHOneV = twoHOneV;
    let nextTwoVOneH = twoVOneH;

    if (model === 'two-horizontal-one-vertical') {
      if (draggingTarget === 'yA') {
        nextTwoHOneV = {
          ...twoHOneV,
          yA: Math.min(normY, twoHOneV.yB - 0.03),
        };
      } else if (draggingTarget === 'yB') {
        nextTwoHOneV = {
          ...twoHOneV,
          yB: Math.max(normY, twoHOneV.yA + 0.03),
        };
      } else if (draggingTarget === 'x0') {
        nextTwoHOneV = {
          ...twoHOneV,
          x0: normX,
        };
      }
    } else {
      if (draggingTarget === 'xA') {
        nextTwoVOneH = {
          ...twoVOneH,
          xA: Math.min(normX, twoVOneH.xB - 0.03),
        };
      } else if (draggingTarget === 'xB') {
        nextTwoVOneH = {
          ...twoVOneH,
          xB: Math.max(normX, twoVOneH.xA + 0.03),
        };
      } else if (draggingTarget === 'y0') {
        nextTwoVOneH = {
          ...twoVOneH,
          y0: normY,
        };
      }
    }

    commitGeometry(mirror, nextTwoHOneV, nextTwoVOneH);
  };

  /**
   * 释放三线指针捕获状态
   */
  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      const target = e.target as HTMLElement;
      if (target && typeof target.releasePointerCapture === 'function') {
        target.releasePointerCapture(e.pointerId);
      }
    } catch {}
    setDraggingTarget(null);
  };

  /**
   * 按下三线标尺时捕获指针，防止移动端快速划出线体区域导致断触
   */
  const startDragLine = (targetKey: string, e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
    setDraggingTarget(targetKey);
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
            crossOrigin="anonymous"
            preload="auto"
            style={{
              width: '100%',
              height: '100%',
              display: 'block',
              transform: mirror ? 'scaleX(-1)' : 'none',
              pointerEvents: 'none',
            }}
            playsInline
          />

          {model === 'two-horizontal-one-vertical' ? (
            <>
              {/* 上横线：头顶（标签位于黄线左下方） */}
              <div
                className="calib-line-h"
                style={
                  {
                    top: `${twoHOneV.yA * 100}%`,
                    '--line-color': '#f59e0b',
                  } as React.CSSProperties
                }
                onPointerDown={(e) => startDragLine('yA', e)}
              >
                <span
                  className="calib-tag"
                  style={
                    {
                      left: '10px',
                      top: '12px',
                      '--line-color': '#f59e0b',
                    } as React.CSSProperties
                  }
                >
                  头顶
                </span>
              </div>

              {/* 下横线：脚底（标签位于绿线右上方，避免贴底时被进度条遮挡） */}
              <div
                className="calib-line-h"
                style={
                  {
                    top: `${twoHOneV.yB * 100}%`,
                    '--line-color': '#10b981',
                  } as React.CSSProperties
                }
                onPointerDown={(e) => startDragLine('yB', e)}
              >
                <span
                  className="calib-tag"
                  style={
                    {
                      right: '10px',
                      bottom: '12px',
                      '--line-color': '#10b981',
                    } as React.CSSProperties
                  }
                >
                  脚底
                </span>
              </div>

              {/* 竖线：中轴（标签水平居中正对垂直中轴线） */}
              <div
                className="calib-line-v"
                style={
                  {
                    left: `${twoHOneV.x0 * 100}%`,
                    '--line-color': '#38bdf8',
                  } as React.CSSProperties
                }
                onPointerDown={(e) => startDragLine('x0', e)}
              >
                <span
                  className="calib-tag"
                  style={
                    {
                      top: '12px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      '--line-color': '#38bdf8',
                    } as React.CSSProperties
                  }
                >
                  中轴
                </span>
              </div>
            </>
          ) : (
            <>
              {/* 左竖线：左脚（标签水平居中骑在线上） */}
              <div
                className="calib-line-v"
                style={
                  {
                    left: `${twoVOneH.xA * 100}%`,
                    '--line-color': '#38bdf8',
                  } as React.CSSProperties
                }
                onPointerDown={(e) => startDragLine('xA', e)}
              >
                <span
                  className="calib-tag"
                  style={
                    {
                      top: '12px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      '--line-color': '#38bdf8',
                    } as React.CSSProperties
                  }
                >
                  左脚
                </span>
              </div>

              {/* 右竖线：右脚（标签水平居中骑在线上） */}
              <div
                className="calib-line-v"
                style={
                  {
                    left: `${twoVOneH.xB * 100}%`,
                    '--line-color': '#f59e0b',
                  } as React.CSSProperties
                }
                onPointerDown={(e) => startDragLine('xB', e)}
              >
                <span
                  className="calib-tag"
                  style={
                    {
                      top: '12px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      '--line-color': '#f59e0b',
                    } as React.CSSProperties
                  }
                >
                  右脚
                </span>
              </div>

              {/* 横线：地面（标签位于右上方，避免贴底时遮挡） */}
              <div
                className="calib-line-h"
                style={
                  {
                    top: `${twoVOneH.y0 * 100}%`,
                    '--line-color': '#10b981',
                  } as React.CSSProperties
                }
                onPointerDown={(e) => startDragLine('y0', e)}
              >
                <span
                  className="calib-tag"
                  style={
                    {
                      right: '10px',
                      bottom: '12px',
                      '--line-color': '#10b981',
                    } as React.CSSProperties
                  }
                >
                  地面
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 底部找帧时间轴栏 */}
      <div className="bottom-bar bottom-bar-row">
        <button type="button" onClick={togglePlay} className="btn">
          {isPlaying ? <Pause size={13} /> : <Play size={13} />}
          <span>{isPlaying ? '暂停' : '播放'}</span>
        </button>

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
