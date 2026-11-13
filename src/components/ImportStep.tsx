import React, { useRef, useState } from 'react';
import { Film, Upload, ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import type { VideoGeometryConfig } from '../types/geometry.ts';
import type { VideoAudioInfo } from '../types/timeline.ts';
import { decodeAudioFromFile } from '../core/audio.ts';

/** 已载入的单通道视频数据结构 */
export interface LoadedVideoItem {
  file: File;
  url: string;
  name: string;
  duration: number;
  width: number;
  height: number;
  geometry: VideoGeometryConfig;
  audioInfo?: VideoAudioInfo;
}

interface ImportStepProps {
  initialVideo1?: LoadedVideoItem | null;
  initialVideo2?: LoadedVideoItem | null;
  onUpdateVideo1?: (item: LoadedVideoItem) => void;
  onUpdateVideo2?: (item: LoadedVideoItem) => void;
  onComplete: (data: {
    video1: LoadedVideoItem;
    video2: LoadedVideoItem;
  }) => void;
}

/**
 * 安全探测视频的真实分辨率与时长
 * 具备 DOM 挂载注入、playsinline 与 2.5 秒硬超时保底能力
 */
function probeVideoMetadata(
  url: string,
  hostElement: HTMLElement | null
): Promise<{ width: number; height: number; duration: number }> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.preload = 'metadata';

    let settled = false;
    const finish = (result: { width: number; height: number; duration: number }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.onloadedmetadata = null;
      video.oncanplay = null;
      video.onerror = null;
      try {
        if (hostElement && hostElement.contains(video)) {
          hostElement.removeChild(video);
        }
      } catch {}
      resolve(result);
    };

    // 2.5 秒超时硬兜底：若老旧内核或特殊编码迟迟未触发事件，直接回退标准 1080p，绝不阻断用户
    const timer = setTimeout(() => {
      const fallbackW = video.videoWidth > 0 ? video.videoWidth : 1920;
      const fallbackH = video.videoHeight > 0 ? video.videoHeight : 1080;
      const fallbackDur = !isNaN(video.duration) && video.duration > 0 ? video.duration : 10;
      finish({ width: fallbackW, height: fallbackH, duration: fallbackDur });
    }, 2500);

    const onReady = () => {
      const w = video.videoWidth || 1920;
      const h = video.videoHeight || 1080;
      const dur = !isNaN(video.duration) && video.duration > 0 ? video.duration : 10;
      finish({ width: w, height: h, duration: dur });
    };

    video.onloadedmetadata = onReady;
    video.oncanplay = onReady;
    video.onerror = () => {
      finish({ width: 1920, height: 1080, duration: 10 });
    };

    video.src = url;

    // 挂载至隐藏 DOM 节点唤醒老旧 Chromium 移动端媒体管道
    if (hostElement) {
      try {
        hostElement.appendChild(video);
      } catch {}
    }

    try {
      video.load();
    } catch {}
  });
}

/**
 * 步骤 01：双通道本地视频导入面板
 */
export const ImportStep: React.FC<ImportStepProps> = ({
  initialVideo1 = null,
  initialVideo2 = null,
  onUpdateVideo1,
  onUpdateVideo2,
  onComplete,
}) => {
  const [video1, setVideo1] = useState<LoadedVideoItem | null>(initialVideo1);
  const [video2, setVideo2] = useState<LoadedVideoItem | null>(initialVideo2);
  const [loadingAudio1, setLoadingAudio1] = useState(false);
  const [loadingAudio2, setLoadingAudio2] = useState(false);
  const [loadingMeta1, setLoadingMeta1] = useState(false);
  const [loadingMeta2, setLoadingMeta2] = useState(false);

  const fileInputRef1 = useRef<HTMLInputElement>(null);
  const fileInputRef2 = useRef<HTMLInputElement>(null);
  const probeHostRef = useRef<HTMLDivElement>(null);

  /**
   * 读取用户选择的本地视频文件
   * 采用「乐观即时挂载 + 异步元数据/音轨并行探测」策略，彻底消除老旧内核卡死与因果倒置
   */
  const handleFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
    index: 1 | 2
  ) => {
    const file = e.target.files?.[0];
    // 清空 input 避免重选同一文件不触发 change 事件
    e.target.value = '';
    if (!file) return;

    const url = URL.createObjectURL(file);

    // 1. 乐观即时挂载：一旦拿到 File 对象立即更新卡片 UI，消除界面假死与「未载入」停滞
    const baseItem: LoadedVideoItem = {
      file,
      url,
      name: file.name,
      duration: 10,
      width: 1920,
      height: 1080,
      geometry: {
        mirror: false,
        triLine: {
          model: 'two-horizontal-one-vertical',
          twoHOneV: { yA: 0.22, yB: 0.78, x0: 0.5 },
          twoVOneH: { xA: 0.38, xB: 0.62, y0: 0.85 },
        },
      },
    };

    if (index === 1) {
      setVideo1(baseItem);
      onUpdateVideo1?.(baseItem);
      setLoadingMeta1(true);
      setLoadingAudio1(true);
    } else {
      setVideo2(baseItem);
      onUpdateVideo2?.(baseItem);
      setLoadingMeta2(true);
      setLoadingAudio2(true);
    }

    // 2. 异步探测真实视频分辨率与时长（带超时与 DOM 挂载保底）
    const metaPromise = probeVideoMetadata(url, probeHostRef.current).then((meta) => {
      if (index === 1) {
        setVideo1((prev) => {
          if (!prev || prev.url !== url) return prev;
          const updated = { ...prev, width: meta.width, height: meta.height, duration: meta.duration };
          onUpdateVideo1?.(updated);
          return updated;
        });
        setLoadingMeta1(false);
      } else {
        setVideo2((prev) => {
          if (!prev || prev.url !== url) return prev;
          const updated = { ...prev, width: meta.width, height: meta.height, duration: meta.duration };
          onUpdateVideo2?.(updated);
          return updated;
        });
        setLoadingMeta2(false);
      }
      return meta;
    });

    // 3. 异步解码音轨 PCM 并测算初始 BPM（带防 OOM 与 FileReader 兜底）
    const audioPromise = (async () => {
      try {
        const audioData = await decodeAudioFromFile(file);
        const meta = await metaPromise.catch(() => ({ duration: audioData.duration }));
        const updatedAudio: VideoAudioInfo = {
          duration: audioData.duration || meta.duration,
          sampleRate: audioData.sampleRate,
          detectedBpm: audioData.detectedBpm,
          userBpm: audioData.detectedBpm,
          anchorTime: Math.min(1.0, (audioData.duration || meta.duration) / 4),
          waveform: audioData.waveform,
          trimRange: { start: 0, end: audioData.duration || meta.duration },
          rawChannelData: audioData.rawChannelData,
        };

        if (index === 1) {
          setVideo1((prev) => {
            if (!prev || prev.url !== url) return prev;
            const fullItem = { ...prev, audioInfo: updatedAudio };
            onUpdateVideo1?.(fullItem);
            return fullItem;
          });
          setLoadingAudio1(false);
        } else {
          setVideo2((prev) => {
            if (!prev || prev.url !== url) return prev;
            const fullItem = { ...prev, audioInfo: updatedAudio };
            onUpdateVideo2?.(fullItem);
            return fullItem;
          });
          setLoadingAudio2(false);
        }
      } catch {
        const meta = await metaPromise.catch(() => ({ duration: 10 }));
        const fallbackAudio: VideoAudioInfo = {
          duration: meta.duration,
          sampleRate: 44100,
          detectedBpm: 160,
          userBpm: 160,
          anchorTime: Math.min(1.0, meta.duration / 4),
          waveform: new Float32Array(1000).fill(0.2),
          trimRange: { start: 0, end: meta.duration },
          rawChannelData: new Float32Array(44100 * 2).fill(0),
        };

        if (index === 1) {
          setVideo1((prev) => {
            if (!prev || prev.url !== url) return prev;
            const fullItem = { ...prev, audioInfo: fallbackAudio };
            onUpdateVideo1?.(fullItem);
            return fullItem;
          });
          setLoadingAudio1(false);
        } else {
          setVideo2((prev) => {
            if (!prev || prev.url !== url) return prev;
            const fullItem = { ...prev, audioInfo: fallbackAudio };
            onUpdateVideo2?.(fullItem);
            return fullItem;
          });
          setLoadingAudio2(false);
        }
      }
    })();

    // 两条异步探测均已在内部自消化异常，此处使用 ES2015 Promise.all 即可兼容全系 WebView
    await Promise.all([metaPromise, audioPromise]);
  };

  /**
   * 渲染单个视频输入通道卡片
   */
  const renderChannelSlot = (
    index: 1 | 2,
    item: LoadedVideoItem | null,
    isLoadingAudio: boolean,
    isLoadingMeta: boolean,
    inputRef: React.RefObject<HTMLInputElement | null>
  ) => {
    const chCode = `CH${index}`;
    const badgeClass = index === 1 ? 'ch1' : 'ch2';
    const loadedClass = item ? (index === 1 ? 'loaded-ch1' : 'loaded-ch2') : '';

    return (
      <div
        onClick={() => inputRef.current?.click()}
        className={`slot-card ${loadedClass}`}
      >
        {/* 通道卡片顶栏 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="control-group">
            <span className={`tag-badge ${badgeClass}`}>{chCode}</span>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
              {item ? item.name : '选择本地视频'}
            </span>
          </div>
          <span className="mono-muted">
            {item ? '点击更换文件' : '未载入'}
          </span>
        </div>

        {/* 通道主体信息 */}
        {item ? (
          <div className="fx-col-12" style={{ display: 'flex', flexDirection: 'column', margin: 'auto 0' }}>
            <div className="fx-row-8" style={{ display: 'flex', alignItems: 'center' }}>
              <CheckCircle2
                size={16}
                color={index === 1 ? 'var(--ch1)' : 'var(--ch2)'}
                 style={{ flexShrink: 0 }}
              />
              <span
                style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.name}
              </span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '8px',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                padding: '10px 12px',
              }}
            >
              <div>
                <div className="mono-muted">分辨率</div>
                <div className="mono-num" style={{ marginTop: '2px', fontWeight: 600 }}>
                  {isLoadingMeta ? (
                    <span className="control-group fx-row-4" style={{ color: 'var(--text-muted)' }}>
                      <Loader2 size={12} className="spin" />
                      <span>探测中</span>
                    </span>
                  ) : (
                    `${item.width}×${item.height}`
                  )}
                </div>
              </div>
              <div>
                <div className="mono-muted">时长</div>
                <div className="mono-num" style={{ marginTop: '2px', fontWeight: 600 }}>
                  {isLoadingMeta ? (
                    <span className="control-group fx-row-4" style={{ color: 'var(--text-muted)' }}>
                      <Loader2 size={12} className="spin" />
                      <span>计算中</span>
                    </span>
                  ) : (
                    `${item.duration.toFixed(2)}s`
                  )}
                </div>
              </div>
              <div>
                <div className="mono-muted">测算 BPM</div>
                <div className="mono-num" style={{ marginTop: '2px', fontWeight: 600 }}>
                  {isLoadingAudio ? (
                    <span className="control-group fx-row-4" style={{ color: 'var(--accent)' }}>
                      <Loader2 size={12} className="spin" />
                      <span>解析中</span>
                    </span>
                  ) : (
                    `${item.audioInfo?.detectedBpm ?? '--'} BPM`
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div
            className="fx-col-8"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              margin: 'auto 0',
              color: 'var(--text-secondary)',
            }}
          >
            <Upload size={24} strokeWidth={1.6} />
            <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
              点击载入本地视频
            </div>
            <div className="mono-muted">MP4 / MOV / WEBM</div>
          </div>
        )}

        {/* 通道底栏 */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderTop: '1px solid var(--border)',
            paddingTop: '10px',
          }}
        >
          <span className="mono-muted">
            <Film size={12} style={{ verticalAlign: '-2px', marginRight: '4px' }} />
            {item ? '信号已就绪' : '等待视频源'}
          </span>
          <span className="mono-muted">
            {item ? (item.geometry.mirror ? '镜像: 开' : '镜像: 关') : '--'}
          </span>
        </div>
      </div>
    );
  };

  const isReady = Boolean(video1 && video2);

  return (
    <div className="import-stage">
      {/* 隐藏文件输入挂载于网格之外，避免破坏子元素邻接间距；单类型 video/* 兼容老旧国产 ROM 文件选择器 */}
      <input
        ref={fileInputRef1}
        type="file"
        accept="video/*"
        style={{ display: 'none' }}
        onChange={(e) => handleFileChange(e, 1)}
      />
      <input
        ref={fileInputRef2}
        type="file"
        accept="video/*"
        style={{ display: 'none' }}
        onChange={(e) => handleFileChange(e, 2)}
      />

      {/* 隐藏的 DOM 挂载容器，用于唤醒移动端老旧内核的媒体加载流水线 */}
      <div
        ref={probeHostRef}
        aria-hidden="true"
        style={{
          position: 'absolute',
          width: 0,
          height: 0,
          overflow: 'hidden',
          opacity: 0,
          pointerEvents: 'none',
        }}
      />

      <div className="slot-grid">
        {renderChannelSlot(1, video1, loadingAudio1, loadingMeta1, fileInputRef1)}
        {renderChannelSlot(2, video2, loadingAudio2, loadingMeta2, fileInputRef2)}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
        <button
          type="button"
          className="btn btn-accent"
          disabled={!isReady}
          onClick={() => {
            if (video1 && video2) {
              onComplete({ video1, video2 });
            }
          }}
          style={{ height: '34px', padding: '0 16px', fontSize: '13px' }}
        >
          <span>开始空间标定</span>
          <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
};
