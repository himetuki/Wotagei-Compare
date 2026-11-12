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

  const fileInputRef1 = useRef<HTMLInputElement>(null);
  const fileInputRef2 = useRef<HTMLInputElement>(null);

  /**
   * 读取用户选择的本地视频文件，提取宽高时长并异步解码音轨测算初始 BPM
   */
  const handleFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
    index: 1 | 2
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    const tempVideo = document.createElement('video');
    tempVideo.preload = 'metadata';
    tempVideo.src = url;

    tempVideo.onloadedmetadata = async () => {
      const baseItem: LoadedVideoItem = {
        file,
        url,
        name: file.name,
        duration: tempVideo.duration || 1,
        width: tempVideo.videoWidth || 1920,
        height: tempVideo.videoHeight || 1080,
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
        setLoadingAudio1(true);
      } else {
        setVideo2(baseItem);
        onUpdateVideo2?.(baseItem);
        setLoadingAudio2(true);
      }

      // 解码音轨 PCM 并测算初始 BPM
      try {
        const audioData = await decodeAudioFromFile(file);
        const updatedAudio: VideoAudioInfo = {
          duration: audioData.duration,
          sampleRate: audioData.sampleRate,
          detectedBpm: audioData.detectedBpm,
          userBpm: audioData.detectedBpm,
          anchorTime: Math.min(1.0, audioData.duration / 4),
          waveform: audioData.waveform,
          trimRange: { start: 0, end: audioData.duration },
          rawChannelData: audioData.rawChannelData,
        };
        const fullItem: LoadedVideoItem = { ...baseItem, audioInfo: updatedAudio };
        if (index === 1) {
          setVideo1(fullItem);
          onUpdateVideo1?.(fullItem);
          setLoadingAudio1(false);
        } else {
          setVideo2(fullItem);
          onUpdateVideo2?.(fullItem);
          setLoadingAudio2(false);
        }
      } catch {
        const fallbackAudio: VideoAudioInfo = {
          duration: baseItem.duration,
          sampleRate: 44100,
          detectedBpm: 160,
          userBpm: 160,
          anchorTime: Math.min(1.0, baseItem.duration / 4),
          waveform: new Float32Array(1000).fill(0.2),
          trimRange: { start: 0, end: baseItem.duration },
          rawChannelData: new Float32Array(44100 * 2).fill(0),
        };
        const fullItem: LoadedVideoItem = { ...baseItem, audioInfo: fallbackAudio };
        if (index === 1) {
          setVideo1(fullItem);
          onUpdateVideo1?.(fullItem);
          setLoadingAudio1(false);
        } else {
          setVideo2(fullItem);
          onUpdateVideo2?.(fullItem);
          setLoadingAudio2(false);
        }
      }
    };
  };

  /**
   * 渲染单个视频输入通道卡片
   */
  const renderChannelSlot = (
    index: 1 | 2,
    item: LoadedVideoItem | null,
    isLoadingAudio: boolean,
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
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          style={{ display: 'none' }}
          onChange={(e) => handleFileChange(e, index)}
        />

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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', margin: 'auto 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                  {item.width}×{item.height}
                </div>
              </div>
              <div>
                <div className="mono-muted">时长</div>
                <div className="mono-num" style={{ marginTop: '2px', fontWeight: 600 }}>
                  {item.duration.toFixed(2)}s
                </div>
              </div>
              <div>
                <div className="mono-muted">测算 BPM</div>
                <div className="mono-num" style={{ marginTop: '2px', fontWeight: 600 }}>
                  {isLoadingAudio ? (
                    <span className="control-group" style={{ gap: '4px', color: 'var(--accent)' }}>
                      <Loader2 size={12} />
                      解析中
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
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
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
      <div className="slot-grid">
        {renderChannelSlot(1, video1, loadingAudio1, fileInputRef1)}
        {renderChannelSlot(2, video2, loadingAudio2, fileInputRef2)}
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
