import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  ExternalLink,
  RefreshCw,
  RotateCcw,
  Sliders,
} from 'lucide-react';
import {
  type AppPreferences,
  type BpmAlignStrategy,
  type ComparisonMode,
  type SlowMotionRate,
  type SoundSource,
  type StepPreset,
  type TriLineModelType,
} from '../types/index.ts';
import {
  MIN_CUSTOM_STEP_SEC,
  sanitizeCustomBpm,
  sanitizeCustomStepSec,
} from '../core/preferences.ts';
import { isNativeAndroid, type NativeUpdateDownloadProgressEvent } from '../core/nativeMedia.ts';
import {
  GITHUB_RELEASES_URL,
  GITHUB_REPO_URL,
  checkForAppUpdate,
  downloadAndInstallAndroidApk,
  getBuildAppVersion,
  getCurrentAppVersion,
  openGithubUrl,
  type UpdateCheckResult,
} from '../core/updater.ts';

interface SettingsAboutPageProps {
  preferences: AppPreferences;
  onPreferencesChange: (next: AppPreferences) => void;
  onResetPreferences: () => void;
  onClose: () => void;
}

const SLOW_MOTION_OPTIONS: SlowMotionRate[] = [0.1, 0.15, 0.2, 0.3, 0.5, 0.75, 1.0];

const TRI_LINE_OPTIONS: Array<{ id: TriLineModelType; label: string }> = [
  { id: 'two-horizontal-one-vertical', label: '两横一竖' },
  { id: 'two-vertical-one-horizontal', label: '两竖一横' },
];

const COMPARISON_MODE_OPTIONS: Array<{ id: ComparisonMode; label: string }> = [
  { id: 'split-screen', label: '分屏对比' },
  { id: 'overlay', label: '叠影对比' },
];

const SOUND_SOURCE_OPTIONS: Array<{ id: SoundSource; label: string }> = [
  { id: 'metronome', label: '节拍器' },
  { id: 'video1', label: '视频1原声' },
  { id: 'video2', label: '视频2原声' },
  { id: 'mute', label: '静音' },
];

const BPM_STRATEGY_OPTIONS: Array<{ id: BpmAlignStrategy; label: string }> = [
  { id: 'left', label: '以视频1为准' },
  { id: 'right', label: '以视频2为准' },
  { id: 'none', label: '各自原速' },
  { id: 'custom', label: '自定义' },
];

const STEP_PRESET_OPTIONS: Array<{ id: StepPreset; label: string }> = [
  { id: 'frame', label: '1帧(0.033s)' },
  { id: '50ms', label: '0.05s' },
  { id: '100ms', label: '0.10s' },
  { id: 'beat-quarter', label: '1/4拍' },
  { id: 'beat-half', label: '1/2拍' },
  { id: 'custom', label: '自定义' },
];

type UpdateUiStatus =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'permission-required'
  | 'cancelled'
  | 'error';

/**
 * 全局默认偏好设置与软件关于/检查更新视图
 */
export const SettingsAboutPage: React.FC<SettingsAboutPageProps> = ({
  preferences,
  onPreferencesChange,
  onResetPreferences,
  onClose,
}) => {
  const [customStepText, setCustomStepText] = useState<string>(
    preferences.customStepSec.toFixed(3)
  );
  const [customBpmText, setCustomBpmText] = useState<string>(
    String(preferences.customBpm)
  );
  const [currentVersion, setCurrentVersion] = useState<string>(getBuildAppVersion());
  const [updateStatus, setUpdateStatus] = useState<UpdateUiStatus>('idle');
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(null);
  const [updateMessage, setUpdateMessage] = useState<string>('');
  const [downloadProgress, setDownloadProgress] = useState<NativeUpdateDownloadProgressEvent | null>(
    null
  );

  // 同步外部偏好重置（例如点击“恢复默认设置”）
  useEffect(() => {
    setCustomStepText(preferences.customStepSec.toFixed(3));
    setCustomBpmText(String(preferences.customBpm));
  }, [preferences.customStepSec, preferences.customBpm]);

  // 挂载时获取当前平台真实版本号
  useEffect(() => {
    let active = true;
    getCurrentAppVersion()
      .then((ver) => {
        if (active && ver) {
          setCurrentVersion(ver);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const updatePref = <K extends keyof AppPreferences>(key: K, value: AppPreferences[K]) => {
    onPreferencesChange({
      ...preferences,
      [key]: value,
    });
  };

  const commitCustomStepInput = () => {
    const parsed = parseFloat(customStepText);
    if (!isNaN(parsed)) {
      const sanitized = sanitizeCustomStepSec(parsed);
      setCustomStepText(sanitized.toFixed(3));
      updatePref('customStepSec', sanitized);
    } else {
      setCustomStepText(preferences.customStepSec.toFixed(3));
    }
  };

  const commitCustomBpmInput = () => {
    const parsed = parseFloat(customBpmText);
    if (!isNaN(parsed)) {
      const sanitized = sanitizeCustomBpm(parsed);
      setCustomBpmText(String(sanitized));
      updatePref('customBpm', sanitized);
    } else {
      setCustomBpmText(String(preferences.customBpm));
    }
  };

  const handleCheckUpdate = async () => {
    setUpdateStatus('checking');
    setUpdateMessage('正在查询 GitHub Releases 最新版本...');
    setDownloadProgress(null);
    try {
      const result = await checkForAppUpdate(currentVersion);
      setUpdateResult(result);
      setCurrentVersion(result.currentVersion);
      if (result.hasUpdate) {
        setUpdateStatus('available');
        setUpdateMessage(`发现新版本 v${result.latestVersion}（当前 v${result.currentVersion}）`);
      } else {
        setUpdateStatus('up-to-date');
        setUpdateMessage(`当前已是最新版本 v${result.currentVersion}`);
      }
    } catch (err) {
      setUpdateStatus('error');
      setUpdateMessage(err instanceof Error ? err.message : '检查更新失败，请检查网络连接');
    }
  };

  const handleInstallUpdate = async () => {
    if (!updateResult) return;
    if (!isNativeAndroid() || !updateResult.apkAsset) {
      await openGithubUrl(updateResult.htmlUrl || GITHUB_RELEASES_URL);
      return;
    }

    setUpdateStatus('downloading');
    setUpdateMessage('正在下载更新安装包...');
    setDownloadProgress({
      percent: 0,
      downloadedBytes: 0,
      totalBytes: updateResult.apkAsset.size || 0,
      statusText: '正在准备下载...',
    });

    try {
      const res = await downloadAndInstallApkSafe(updateResult);
      if (res.status === 'permission_required') {
        setUpdateStatus('permission-required');
        setUpdateMessage(
          res.message || '请在系统设置授予“安装未知应用”权限后重试安装'
        );
      } else if (res.status === 'cancelled') {
        setUpdateStatus('cancelled');
        setUpdateMessage(res.message || '已取消安装，临时安装包已自动清理');
      } else {
        setUpdateStatus('available');
        setUpdateMessage('已唤起系统安装器，请按系统提示完成升级');
      }
    } catch (err) {
      setUpdateStatus('error');
      setUpdateMessage(err instanceof Error ? err.message : '下载安装更新包失败');
    } finally {
      setDownloadProgress(null);
    }
  };

  const downloadAndInstallApkSafe = async (result: UpdateCheckResult) => {
    if (!result.apkAsset) {
      throw new Error('当前发布未附带可安装的 Android APK 资产');
    }
    return downloadAndInstallAndroidApk(result.apkAsset, result.latestVersion, (ev) => {
      setDownloadProgress(ev);
      if (ev.statusText) {
        setUpdateMessage(ev.statusText);
      }
    });
  };

  const formatMegabytes = (bytes: number) => {
    if (!bytes || bytes <= 0) return '';
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isBusyCheckingOrDownloading =
    updateStatus === 'checking' || updateStatus === 'downloading';

  return (
    <div className="settings-page" role="region" aria-label="默认偏好设置与关于软件">
      <div className="settings-page-header">
        <div className="control-group fx-row-8">
          <Sliders size={14} color="var(--accent)" />
          <span className="settings-page-title">设置与关于</span>
          <span className="mono-muted settings-page-subtitle">
            默认偏好将自动保存并同步未手动调整的当前会话状态
          </span>
        </div>

        <div className="control-group">
          <button
            type="button"
            className="btn"
            onClick={onResetPreferences}
            title="将所有默认偏好恢复为出厂值"
          >
            <RotateCcw size={12} />
            <span>恢复默认</span>
          </button>
          <button
            type="button"
            className="btn btn-accent"
            onClick={onClose}
            aria-label="返回工作区"
          >
            <ArrowLeft size={12} />
            <span>返回</span>
          </button>
        </div>
      </div>

      <div className="settings-grid">
        {/* 左侧：默认工作流偏好表单 */}
        <section className="panel-box settings-card" aria-label="默认工作流偏好">
          <div className="settings-section-head">
            <span className="settings-section-title">默认对比与播放偏好</span>
            <span className="tag-badge">本地持久化</span>
          </div>

          <div className="settings-form-scroll fx-col-8">
            {/* 1. 默认三线正交模型 */}
            <div className="settings-row">
              <div className="settings-row-label">
                <span>默认标定模型</span>
                <span className="mono-muted">三线正交标定参考线结构</span>
              </div>
              <div className="seg-group settings-seg-wrap">
                {TRI_LINE_OPTIONS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`seg-btn ${preferences.triLineModel === item.id ? 'active' : ''}`}
                    onClick={() => updatePref('triLineModel', item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 2. 默认对比模式 */}
            <div className="settings-row">
              <div className="settings-row-label">
                <span>默认对比模式</span>
                <span className="mono-muted">对比台初始画面排版</span>
              </div>
              <div className="seg-group settings-seg-wrap">
                {COMPARISON_MODE_OPTIONS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`seg-btn ${preferences.comparisonMode === item.id ? 'active' : ''}`}
                    onClick={() => updatePref('comparisonMode', item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. 默认音源 / 音乐播放 */}
            <div className="settings-row">
              <div className="settings-row-label">
                <span>默认音乐播放</span>
                <span className="mono-muted">对比台同步播放时的默认声源</span>
              </div>
              <div className="seg-group settings-seg-wrap">
                {SOUND_SOURCE_OPTIONS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`seg-btn ${preferences.soundSource === item.id ? 'active' : ''}`}
                    onClick={() => updatePref('soundSource', item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 4. 默认 BPM 对齐策略 (+ 自定义 BPM 基准) */}
            <div className="settings-row">
              <div className="settings-row-label">
                <span>默认 BPM 策略</span>
                <span className="mono-muted">双视角变速对齐基准</span>
              </div>
              <div className="settings-row-controls fx-row-6">
                <div className="seg-group settings-seg-wrap">
                  {BPM_STRATEGY_OPTIONS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`seg-btn ${preferences.bpmStrategy === item.id ? 'active' : ''}`}
                      onClick={() => updatePref('bpmStrategy', item.id)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                {preferences.bpmStrategy === 'custom' && (
                  <div className="fx-row-4" style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <input
                      type="number"
                      min={1}
                      max={400}
                      step={1}
                      aria-label="默认自定义目标 BPM"
                      className="num-input"
                      value={customBpmText}
                      onChange={(e) => {
                        setCustomBpmText(e.target.value);
                        const parsed = parseFloat(e.target.value);
                        if (!isNaN(parsed) && parsed > 0) {
                          updatePref('customBpm', sanitizeCustomBpm(parsed));
                        }
                      }}
                      onBlur={commitCustomBpmInput}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          commitCustomBpmInput();
                          e.currentTarget.blur();
                        }
                      }}
                      style={{ width: '56px', height: '24px' }}
                    />
                    <span className="mono-muted">BPM</span>
                  </div>
                )}
              </div>
            </div>

            {/* 5. 默认慢放倍速 */}
            <div className="settings-row">
              <div className="settings-row-label">
                <span>默认慢放倍速</span>
                <span className="mono-muted">工作台进入时的初始倍速</span>
              </div>
              <div className="seg-group settings-seg-wrap">
                {SLOW_MOTION_OPTIONS.map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    className={`seg-btn ${preferences.slowMotionRate === rate ? 'active' : ''}`}
                    onClick={() => updatePref('slowMotionRate', rate)}
                  >
                    {rate === 1 ? '1.0x' : `${rate}x`}
                  </button>
                ))}
              </div>
            </div>

            {/* 6. 默认单步步进档位 */}
            <div className="settings-row">
              <div className="settings-row-label">
                <span>默认单步档位</span>
                <span className="mono-muted">对比台单步前进/后退的步长模式</span>
              </div>
              <div className="seg-group settings-seg-wrap">
                {STEP_PRESET_OPTIONS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`seg-btn ${preferences.stepPreset === item.id ? 'active' : ''}`}
                    onClick={() => updatePref('stepPreset', item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 7. 默认自定义步进秒数 */}
            <div className="settings-row">
              <div className="settings-row-label">
                <span>默认自定义步进</span>
                <span className="mono-muted">最低 {MIN_CUSTOM_STEP_SEC.toFixed(3)}s，失焦自动格式化</span>
              </div>
              <div className="fx-row-4" style={{ display: 'inline-flex', alignItems: 'center' }}>
                <input
                  type="number"
                  step="0.001"
                  min={MIN_CUSTOM_STEP_SEC}
                  aria-label="默认自定义步进秒数"
                  className="num-input"
                  value={customStepText}
                  onChange={(e) => {
                    setCustomStepText(e.target.value);
                    const parsed = parseFloat(e.target.value);
                    if (!isNaN(parsed) && parsed >= MIN_CUSTOM_STEP_SEC) {
                      updatePref('customStepSec', parsed);
                    }
                  }}
                  onBlur={commitCustomStepInput}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      commitCustomStepInput();
                      e.currentTarget.blur();
                    }
                  }}
                  style={{ width: '74px', height: '26px', textAlign: 'center' }}
                />
                <span className="mono-muted">s</span>
              </div>
            </div>
          </div>
        </section>

        {/* 右侧：软件简介、GitHub 链接与检查更新 */}
        <section className="panel-box settings-card settings-about-card" aria-label="关于与版本更新">
          <div className="settings-about-hero">
            <svg
              viewBox="0 0 64 64"
              width="40"
              height="40"
              aria-hidden="true"
              style={{ flexShrink: 0 }}
            >
              <defs>
                <linearGradient id="aboutCh1Glow" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#38bdf8" />
                  <stop offset="100%" stopColor="#0284c7" />
                </linearGradient>
                <linearGradient id="aboutCh2Glow" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#fbbf24" />
                  <stop offset="100%" stopColor="#f59e0b" />
                </linearGradient>
              </defs>
              <rect width="64" height="64" rx="14" fill="#0a0b0f" stroke="#27272a" strokeWidth="2" />
              <g fill="none" strokeLinecap="round" strokeLinejoin="round">
                <path
                  d="M 14 20 L 23 44 L 30 24"
                  stroke="url(#aboutCh1Glow)"
                  strokeWidth="4.5"
                />
                <path
                  d="M 34 24 L 41 44 L 50 20"
                  stroke="url(#aboutCh2Glow)"
                  strokeWidth="4.5"
                />
              </g>
              <line x1="32" y1="14" x2="32" y2="50" stroke="#71717a" strokeWidth="1.5" strokeDasharray="3 3" />
            </svg>

            <div className="settings-about-meta">
              <div className="fx-row-6" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="settings-app-name">Wotagei-Compare</span>
                <span className="tag-badge ch1">v{currentVersion}</span>
                <span className="tag-badge">MIT</span>
              </div>
              <p className="settings-about-desc">
                御宅艺双视角正交标定、节拍锁相慢放对比与硬件同步视频合成工具。
              </p>
            </div>
          </div>

          <div className="settings-links-row fx-row-8">
            <button
              type="button"
              className="btn"
              style={{ flex: 1 }}
              onClick={() => {
                openGithubUrl(GITHUB_REPO_URL).catch(() => {});
              }}
            >
              <ExternalLink size={12} />
              <span>GitHub 仓库</span>
            </button>
            <button
              type="button"
              className="btn"
              style={{ flex: 1 }}
              onClick={() => {
                openGithubUrl(updateResult?.htmlUrl || GITHUB_RELEASES_URL).catch(() => {});
              }}
            >
              <ExternalLink size={12} />
              <span>Releases 页面</span>
            </button>
          </div>

          <div className="settings-update-box fx-col-8">
            <div className="settings-update-head">
              <span className="settings-section-title">版本更新</span>
              <span className="mono-muted">
                {updateResult ? `最新 ${updateResult.tagName}` : 'GitHub Releases'}
              </span>
            </div>

            <div className="settings-update-actions fx-row-6">
              <button
                type="button"
                className="btn"
                disabled={isBusyCheckingOrDownloading}
                onClick={handleCheckUpdate}
                style={{ flex: 1 }}
              >
                <RefreshCw
                  size={12}
                  className={updateStatus === 'checking' ? 'spin-icon' : ''}
                />
                <span>{updateStatus === 'checking' ? '正在检查...' : '检查更新'}</span>
              </button>

              {updateResult && updateResult.hasUpdate && (
                <button
                  type="button"
                  className="btn btn-accent"
                  disabled={updateStatus === 'downloading'}
                  onClick={handleInstallUpdate}
                  style={{ flex: 1 }}
                >
                  <Download size={12} />
                  <span>
                    {updateStatus === 'downloading'
                      ? `下载中 ${downloadProgress ? `${downloadProgress.percent}%` : ''}`
                      : isNativeAndroid() && updateResult.apkAsset
                      ? `下载并安装 (${formatMegabytes(updateResult.apkAsset.size) || 'APK'})`
                      : `前往下载 v${updateResult.latestVersion}`}
                  </span>
                </button>
              )}
            </div>

            {downloadProgress && updateStatus === 'downloading' && (
              <div className="settings-progress-wrap">
                <div className="settings-progress-track">
                  <div
                    className="settings-progress-fill"
                    style={{ width: `${Math.max(0, Math.min(100, downloadProgress.percent))}%` }}
                  />
                </div>
                <span className="mono-muted">
                  {downloadProgress.statusText}（{downloadProgress.percent}%）
                </span>
              </div>
            )}

            {updateMessage && (
              <div
                className={`settings-status-banner ${
                  updateStatus === 'error' || updateStatus === 'permission-required'
                    ? 'is-warn'
                    : updateStatus === 'up-to-date'
                    ? 'is-ok'
                    : ''
                }`}
              >
                {updateStatus === 'up-to-date' && <CheckCircle2 size={13} />}
                <span>{updateMessage}</span>
              </div>
            )}

            {updateResult && updateResult.hasUpdate && updateResult.releaseNotes && (
              <div className="settings-release-notes">
                <div className="mono-muted" style={{ marginBottom: '4px' }}>
                  更新说明（{updateResult.releaseName || updateResult.tagName}）
                </div>
                <pre className="settings-release-notes-pre">{updateResult.releaseNotes}</pre>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
