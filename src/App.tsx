import React, { useState, useEffect } from 'react';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import type { ComparisonMode, VideoGeometryConfig } from './types/geometry.ts';
import type { BpmAlignStrategy, VideoAudioInfo } from './types/timeline.ts';
import type { WizardStep } from './types/wizard.ts';
import { ImportStep, LoadedVideoItem } from './components/ImportStep.tsx';
import { GeometryStep } from './components/GeometryStep.tsx';
import { AudioStep } from './components/AudioStep.tsx';
import { Workbench } from './components/Workbench.tsx';

/** 全局顶部 6 步分段导航配置 */
const WIZARD_STEPS: { id: WizardStep; num: string; label: string }[] = [
  { id: 'import', num: '01', label: '导入' },
  { id: 'geometry-video1', num: '02', label: '视频1空间' },
  { id: 'geometry-video2', num: '03', label: '视频2空间' },
  { id: 'audio-video1', num: '04', label: '视频1对拍' },
  { id: 'audio-video2', num: '05', label: '视频2对拍' },
  { id: 'workbench', num: '06', label: '对比台' },
];

/** 可在任意位置点击手动修改 BPM 的顶栏徽章组件 */
interface BpmBadgeProps {
  channel: 1 | 2;
  bpm: number;
  onChange: (newBpm: number) => void;
}

const BpmBadge: React.FC<BpmBadgeProps> = ({ channel, bpm, onChange }) => {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(bpm.toString());

  useEffect(() => {
    setVal(bpm.toString());
  }, [bpm]);

  const commit = () => {
    setEditing(false);
    const num = parseInt(val, 10);
    if (!isNaN(num) && num > 0) {
      onChange(num);
    } else {
      setVal(bpm.toString());
    }
  };

  if (editing) {
    return (
      <div className={`tag-badge ch${channel}`} style={{ padding: '0 4px', display: 'flex', alignItems: 'center' }}>
        <span style={{ fontSize: '11px' }}>CH{channel}</span>
        <input
          type="number"
          value={val}
          autoFocus
          onChange={(e) => setVal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
          }}
          style={{
            width: '44px',
            height: '18px',
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
            backgroundColor: '#000',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
            borderRadius: '2px',
            textAlign: 'center',
            marginLeft: '4px',
            padding: 0,
          }}
        />
      </div>
    );
  }

  return (
    <span
      className={`tag-badge ch${channel}`}
      style={{ cursor: 'pointer', userSelect: 'none' }}
      title="点击直接修改 BPM"
      onClick={() => setEditing(true)}
    >
      CH{channel} {bpm} BPM
    </span>
  );
};

/**
 * 应用主状态机与顶部全局步骤直达导航外壳
 */
export default function App(): React.ReactNode {
  // 启动时锁定横屏方向
  useEffect(() => {
    try {
      ScreenOrientation.lock({ orientation: 'landscape' }).catch(() => {});
    } catch {
      // 浏览器端无原生插件时静默跳过
    }
  }, []);

  const [step, setStep] = useState<WizardStep>('import');
  const [mode, setMode] = useState<ComparisonMode>('split-screen');

  // 持久保存双通道视频数据与标定状态
  const [video1, setVideo1] = useState<LoadedVideoItem | null>(null);
  const [video2, setVideo2] = useState<LoadedVideoItem | null>(null);

  // BPM 对齐策略与自定义目标 BPM
  const [bpmStrategy, setBpmStrategy] = useState<BpmAlignStrategy>('left');
  const [customBpm, setCustomBpm] = useState<number>(160);

  const isBothLoaded = Boolean(video1 && video2);

  /**
   * 实时更新视频 1 空间几何标定参数
   */
  const handleGeometry1Change = (geo: VideoGeometryConfig) => {
    setVideo1((prev) => (prev ? { ...prev, geometry: geo } : null));
  };

  /**
   * 实时更新视频 2 空间几何标定参数
   */
  const handleGeometry2Change = (geo: VideoGeometryConfig) => {
    setVideo2((prev) => (prev ? { ...prev, geometry: geo } : null));
  };

  /**
   * 实时更新视频 1 音频对拍参数
   */
  const handleAudio1Change = (audio: VideoAudioInfo) => {
    setVideo1((prev) => (prev ? { ...prev, audioInfo: audio } : null));
  };

  /**
   * 实时更新视频 2 音频对拍与 BPM 对齐策略
   */
  const handleAudio2Change = (
    audio: VideoAudioInfo,
    strategy?: BpmAlignStrategy,
    targetCustomBpm?: number
  ) => {
    setVideo2((prev) => (prev ? { ...prev, audioInfo: audio } : null));
    if (strategy) setBpmStrategy(strategy);
    if (typeof targetCustomBpm === 'number') setCustomBpm(targetCustomBpm);
  };



  return (
    <div className="app-shell">
      {/* 顶部全局 6 步分段直达导航栏 */}
      <header className="top-nav">
        <div className="control-group" style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <nav className="step-track" aria-label="工作流步骤导航" style={{ overflow: 'hidden' }}>
            {WIZARD_STEPS.map((item) => {
              const disabled = item.id !== 'import' && !isBothLoaded;
              const active = step === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => setStep(item.id)}
                  className={`step-tab ${active ? 'active' : ''}`}
                >
                  <span className="step-num">{item.num}</span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="control-group" style={{ flexShrink: 0, gap: '6px' }}>
          {video1 && (
            <BpmBadge
              channel={1}
              bpm={video1.audioInfo?.userBpm ?? 160}
              onChange={(newBpm) => {
                const currentAudio: VideoAudioInfo = video1.audioInfo || {
                  duration: video1.duration || 1,
                  sampleRate: 44100,
                  detectedBpm: newBpm,
                  userBpm: newBpm,
                  anchorTime: 1.0,
                  waveform: new Float32Array(0),
                };
                handleAudio1Change({ ...currentAudio, userBpm: newBpm });
              }}
            />
          )}
          {video2 && (
            <BpmBadge
              channel={2}
              bpm={video2.audioInfo?.userBpm ?? 160}
              onChange={(newBpm) => {
                const currentAudio: VideoAudioInfo = video2.audioInfo || {
                  duration: video2.duration || 1,
                  sampleRate: 44100,
                  detectedBpm: newBpm,
                  userBpm: newBpm,
                  anchorTime: 1.0,
                  waveform: new Float32Array(0),
                };
                handleAudio2Change({ ...currentAudio, userBpm: newBpm }, bpmStrategy, customBpm);
              }}
            />
          )}
        </div>
      </header>

      {/* 主视图容器 */}
      <main className="view-body">
        {step === 'import' && (
          <ImportStep
            initialVideo1={video1}
            initialVideo2={video2}
            onUpdateVideo1={setVideo1}
            onUpdateVideo2={setVideo2}
            onComplete={(data) => {
              setVideo1(data.video1);
              setVideo2(data.video2);
              setStep('geometry-video1');
            }}
          />
        )}

        {step === 'geometry-video1' && video1 && (
          <GeometryStep
            videoItem={video1}
            videoIndex={1}
            mode={mode}
            onBack={() => setStep('import')}
            onChange={handleGeometry1Change}
            onSave={(geo) => {
              handleGeometry1Change(geo);
              setStep('geometry-video2');
            }}
          />
        )}

        {step === 'geometry-video2' && video2 && (
          <GeometryStep
            videoItem={video2}
            videoIndex={2}
            mode={mode}
            onBack={() => setStep('geometry-video1')}
            onChange={handleGeometry2Change}
            onSave={(geo) => {
              handleGeometry2Change(geo);
              setStep('audio-video1');
            }}
          />
        )}

        {step === 'audio-video1' && video1 && (
          <AudioStep
            videoItem={video1}
            videoIndex={1}
            otherVideoItem={video2 || undefined}
            onBack={() => setStep('geometry-video2')}
            onChange={handleAudio1Change}
            onSave={(audio) => {
              handleAudio1Change(audio);
              setStep('audio-video2');
            }}
          />
        )}

        {step === 'audio-video2' && video2 && (
          <AudioStep
            videoItem={video2}
            videoIndex={2}
            otherVideoItem={video1 || undefined}
            initialStrategy={bpmStrategy}
            initialCustomBpm={customBpm}
            onBack={() => setStep('audio-video1')}
            onChange={handleAudio2Change}
            onSave={(audio, strategy, targetCustomBpm) => {
              handleAudio2Change(audio, strategy, targetCustomBpm);
              setStep('workbench');
            }}
          />
        )}

        {step === 'workbench' && video1 && video2 && (
          <Workbench
            video1={video1}
            video2={video2}
            initialMode={mode}
            bpmStrategy={bpmStrategy}
            customBpm={customBpm}
            onModeChange={setMode}
            onMirrorChange={(idx, m) => {
              if (idx === 1) {
                setVideo1((prev) =>
                  prev ? { ...prev, geometry: { ...prev.geometry, mirror: m } } : null
                );
              } else {
                setVideo2((prev) =>
                  prev ? { ...prev, geometry: { ...prev.geometry, mirror: m } } : null
                );
              }
            }}
          />
        )}
      </main>
    </div>
  );
}
