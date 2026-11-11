import React, { useState, useEffect } from 'react';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import type { ComparisonMode, VideoGeometryConfig, TriLineModelType } from './types/geometry.ts';
import type { BpmAlignStrategy, VideoAudioInfo } from './types/timeline.ts';
import type { WizardStep } from './types/wizard.ts';
import { ImportStep, LoadedVideoItem } from './components/ImportStep.tsx';
import { GeometryStep } from './components/GeometryStep.tsx';
import { AudioStep } from './components/AudioStep.tsx';
import { Workbench, HorizontalFlipIcon } from './components/Workbench.tsx';

/** 全局顶部步骤分段导航配置 */
const WIZARD_STEPS: { id: WizardStep; label: string }[] = [
  { id: 'import', label: '导入' },
  { id: 'geometry-video1', label: 'CH1空间' },
  { id: 'geometry-video2', label: 'CH2空间' },
  { id: 'audio-video1', label: 'CH1对拍' },
  { id: 'audio-video2', label: 'CH2对拍' },
  { id: 'workbench', label: '对比台' },
  { id: 'export', label: '导出片段' },
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
  const [isWorkbenchToolbarExpanded, setIsWorkbenchToolbarExpanded] = useState<boolean>(false);

  // 持久保存双通道视频数据与标定状态
  const [video1, setVideo1] = useState<LoadedVideoItem | null>(null);
  const [video2, setVideo2] = useState<LoadedVideoItem | null>(null);

  // BPM 对齐策略与自定义目标 BPM
  const [bpmStrategy, setBpmStrategy] = useState<BpmAlignStrategy>('left');
  const [customBpm, setCustomBpm] = useState<number>(160);

  // 全局共享的三线正交标定模型（CH1 与 CH2 保持严格同步）
  const [triLineModel, setTriLineModel] = useState<TriLineModelType>('two-horizontal-one-vertical');

  const isBothLoaded = Boolean(video1 && video2);

  /**
   * 同步更新双通道的三线正交标定模型
   */
  const handleTriLineModelChange = (model: TriLineModelType) => {
    setTriLineModel(model);
    setVideo1((prev) =>
      prev
        ? {
            ...prev,
            geometry: {
              ...prev.geometry,
              triLine: { ...prev.geometry.triLine, model },
            },
          }
        : null
    );
    setVideo2((prev) =>
      prev
        ? {
            ...prev,
            geometry: {
              ...prev.geometry,
              triLine: { ...prev.geometry.triLine, model },
            },
          }
        : null
    );
  };

  /**
   * 实时更新视频 1 空间几何标定参数
   */
  const handleGeometry1Change = (geo: VideoGeometryConfig) => {
    setVideo1((prev) => (prev ? { ...prev, geometry: { ...geo, triLine: { ...geo.triLine, model: triLineModel } } } : null));
  };

  /**
   * 实时更新视频 2 空间几何标定参数
   */
  const handleGeometry2Change = (geo: VideoGeometryConfig) => {
    setVideo2((prev) => (prev ? { ...prev, geometry: { ...geo, triLine: { ...geo.triLine, model: triLineModel } } } : null));
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
      {/* 顶部全局步骤直达导航栏 */}
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
                  onClick={() => {
                    if (item.id === 'workbench' && step === 'workbench') {
                      setIsWorkbenchToolbarExpanded((prev) => !prev);
                    } else {
                      setStep(item.id);
                    }
                  }}
                  className={`step-tab ${active ? 'active' : ''}`}
                >
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="control-group" style={{ flexShrink: 0, gap: '6px' }}>
          {step === 'workbench' && (
            <>
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
            </>
          )}

          {(step === 'geometry-video1' || step === 'geometry-video2') && (video1 || video2) && (
            <div className="control-group" style={{ gap: '6px' }}>
              <select
                value={triLineModel}
                onChange={(e) => handleTriLineModelChange(e.target.value as TriLineModelType)}
                className="select-input"
                style={{
                  height: '26px',
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  fontSize: '11.5px',
                  padding: '0 6px',
                  cursor: 'pointer',
                }}
              >
                <option value="two-horizontal-one-vertical">两横一竖</option>
                <option value="two-vertical-one-horizontal">两竖一横</option>
              </select>

              <button
                type="button"
                onClick={() => {
                  if (step === 'geometry-video1' && video1) {
                    handleGeometry1Change({
                      ...video1.geometry,
                      mirror: !video1.geometry.mirror,
                    });
                  } else if (step === 'geometry-video2' && video2) {
                    handleGeometry2Change({
                      ...video2.geometry,
                      mirror: !video2.geometry.mirror,
                    });
                  }
                }}
                className={`btn ${(step === 'geometry-video1' ? video1?.geometry.mirror : video2?.geometry.mirror) ? 'btn-active' : ''}`}
                style={{ height: '26px', padding: '0 8px', fontSize: '11.5px' }}
                title={`${step === 'geometry-video1' ? 'CH1' : 'CH2'} 镜像切换`}
              >
                <HorizontalFlipIcon size={12} />
                <span>镜像 {(step === 'geometry-video1' ? video1?.geometry.mirror : video2?.geometry.mirror) ? 'ON' : 'OFF'}</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* 主视图容器 */}
      <main className="view-body">
        {step === 'import' && (
          <ImportStep
            initialVideo1={video1}
            initialVideo2={video2}
            onUpdateVideo1={(item) =>
              setVideo1({
                ...item,
                geometry: {
                  ...item.geometry,
                  triLine: { ...item.geometry.triLine, model: triLineModel },
                },
              })
            }
            onUpdateVideo2={(item) =>
              setVideo2({
                ...item,
                geometry: {
                  ...item.geometry,
                  triLine: { ...item.geometry.triLine, model: triLineModel },
                },
              })
            }
            onComplete={(data) => {
              const v1 = {
                ...data.video1,
                geometry: {
                  ...data.video1.geometry,
                  triLine: { ...data.video1.geometry.triLine, model: triLineModel },
                },
              };
              const v2 = {
                ...data.video2,
                geometry: {
                  ...data.video2.geometry,
                  triLine: { ...data.video2.geometry.triLine, model: triLineModel },
                },
              };
              setVideo1(v1);
              setVideo2(v2);
              setStep('geometry-video1');
            }}
          />
        )}

        {step === 'geometry-video1' && video1 && (
          <GeometryStep
            key="geo-1"
            videoItem={video1}
            videoIndex={1}
            model={triLineModel}
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
            key="geo-2"
            videoItem={video2}
            videoIndex={2}
            model={triLineModel}
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
            onBack={() => setStep('audio-video1')}
            onChange={handleAudio2Change}
            onSave={(audio) => {
              handleAudio2Change(audio);
              setStep('workbench');
            }}
          />
        )}

        {(step === 'workbench' || step === 'export') && video1 && video2 && (
          <Workbench
            video1={video1}
            video2={video2}
            initialMode={mode}
            bpmStrategy={bpmStrategy}
            customBpm={customBpm}
            isExport={step === 'export'}
            isToolbarExpanded={isWorkbenchToolbarExpanded}
            onToggleToolbar={() => setIsWorkbenchToolbarExpanded((prev) => !prev)}
            onNavigate={(nextStep) => setStep(nextStep)}
            onBpmStrategyChange={(strat, custom) => {
              setBpmStrategy(strat);
              if (typeof custom === 'number') setCustomBpm(custom);
            }}
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
