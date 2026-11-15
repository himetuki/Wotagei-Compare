import {
  NativeMedia,
  isNativeAndroid,
  type NativeInstallApkResult,
  type NativeReleaseAsset,
  type NativeReleaseCheckResult,
  type NativeUpdateDownloadProgressEvent,
} from './nativeMedia.ts';

export const GITHUB_REPO_URL = 'https://github.com/jollyxenon/Wotagei-Compare';
export const GITHUB_RELEASES_URL = 'https://github.com/jollyxenon/Wotagei-Compare/releases';
export const GITHUB_LATEST_RELEASE_API =
  'https://api.github.com/repos/jollyxenon/Wotagei-Compare/releases/latest';

export interface ReleaseAssetInfo {
  name: string;
  browserDownloadUrl: string;
  size: number;
  contentType: string;
}

export interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string;
  tagName: string;
  hasUpdate: boolean;
  releaseName: string;
  releaseNotes: string;
  htmlUrl: string;
  publishedAt: string;
  apkAsset: ReleaseAssetInfo | null;
}

interface ParsedSemver {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
}

/**
 * 获取构建期注入的应用版本号（脱离 Vite 构建环境运行验证脚本时安全回退）
 */
export function getBuildAppVersion(): string {
  const raw = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0';
  return normalizeVersionTag(raw);
}

/**
 * 获取当前运行环境的真实应用版本（Android 原生优先读取 PackageInfo，其余平台读取构建注入）
 */
export async function getCurrentAppVersion(): Promise<string> {
  const buildVer = getBuildAppVersion();
  if (!isNativeAndroid()) {
    return buildVer;
  }
  try {
    const info = await NativeMedia.getAppVersion();
    const nativeVer = normalizeVersionTag(info?.versionName || '');
    return nativeVer || buildVer;
  } catch {
    return buildVer;
  }
}

/**
 * 规整版本号字符串（剥离前导 v/V 与首尾空白）
 */
export function normalizeVersionTag(raw: string): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().replace(/^[vV]+/, '');
}

function parseSemver(raw: string): ParsedSemver | null {
  const clean = normalizeVersionTag(raw).split('+')[0].trim();
  const match = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?$/.exec(clean);
  if (!match) return null;
  return {
    major: parseInt(match[1], 10) || 0,
    minor: match[2] ? parseInt(match[2], 10) || 0 : 0,
    patch: match[3] ? parseInt(match[3], 10) || 0 : 0,
    prerelease: match[4] ? match[4].split('.').filter(Boolean) : [],
  };
}

/**
 * 比较两个 SemVer 版本号（自动剥离 v 前缀与编译元数据）
 * @returns 1 表示 a > b；-1 表示 a < b；0 表示相等或无法解析相等
 */
export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) {
    const na = normalizeVersionTag(a);
    const nb = normalizeVersionTag(b);
    if (na === nb) return 0;
    return na > nb ? 1 : -1;
  }

  if (pa.major !== pb.major) return pa.major > pb.major ? 1 : -1;
  if (pa.minor !== pb.minor) return pa.minor > pb.minor ? 1 : -1;
  if (pa.patch !== pb.patch) return pa.patch > pb.patch ? 1 : -1;

  const preA = pa.prerelease;
  const preB = pb.prerelease;
  if (preA.length === 0 && preB.length === 0) return 0;
  // 正式版优先于预发布版
  if (preA.length === 0) return 1;
  if (preB.length === 0) return -1;

  const maxLen = Math.max(preA.length, preB.length);
  for (let i = 0; i < maxLen; i += 1) {
    if (i >= preA.length) return -1;
    if (i >= preB.length) return 1;
    const segA = preA[i];
    const segB = preB[i];
    if (segA === segB) continue;

    const numA = /^\d+$/.test(segA) ? parseInt(segA, 10) : NaN;
    const numB = /^\d+$/.test(segB) ? parseInt(segB, 10) : NaN;
    if (!isNaN(numA) && !isNaN(numB)) {
      return numA > numB ? 1 : -1;
    }
    if (!isNaN(numA)) return -1;
    if (!isNaN(numB)) return 1;
    return segA > segB ? 1 : -1;
  }

  return 0;
}

/**
 * 从 Release 附件列表提取可安装的 .apk 安装包资产（多 APK 时优先正式 release 包）
 */
export function findApkAsset(assets: ReleaseAssetInfo[]): ReleaseAssetInfo | null {
  if (!Array.isArray(assets) || assets.length === 0) return null;
  const apkCandidates = assets.filter((item) => {
    if (!item || typeof item.browserDownloadUrl !== 'string' || !item.browserDownloadUrl.trim()) {
      return false;
    }
    const lowerName = (item.name || '').toLowerCase();
    const lowerType = (item.contentType || '').toLowerCase();
    return lowerName.endsWith('.apk') || lowerType === 'application/vnd.android.package-archive';
  });

  if (apkCandidates.length === 0) return null;
  const preferredRelease = apkCandidates.find((item) =>
    item.name.toLowerCase().includes('release')
  );
  return preferredRelease || apkCandidates[0];
}

interface RawGitHubReleasePayload {
  tag_name?: string;
  tagName?: string;
  name?: string;
  body?: string;
  html_url?: string;
  htmlUrl?: string;
  published_at?: string;
  publishedAt?: string;
  assets?: Array<{
    name?: string;
    browser_download_url?: string;
    browserDownloadUrl?: string;
    size?: number;
    content_type?: string;
    contentType?: string;
  }>;
}

/**
 * 将 GitHub Releases JSON 或 Android 原生检查返回规整为统一快照
 */
export function buildUpdateCheckResult(
  payload: RawGitHubReleasePayload | NativeReleaseCheckResult,
  currentVersion: string
): UpdateCheckResult {
  const raw = payload as RawGitHubReleasePayload;
  const tagName = (raw.tagName || raw.tag_name || '').trim();
  const latestVersion = normalizeVersionTag(tagName);
  const currentNormalized = normalizeVersionTag(currentVersion);
  const assetsRaw = Array.isArray(raw.assets) ? raw.assets : [];

  const assets: ReleaseAssetInfo[] = assetsRaw.map((item) => ({
    name: typeof item.name === 'string' ? item.name : '',
    browserDownloadUrl:
      typeof item.browserDownloadUrl === 'string'
        ? item.browserDownloadUrl
        : typeof item.browser_download_url === 'string'
        ? item.browser_download_url
        : '',
    size: typeof item.size === 'number' && Number.isFinite(item.size) ? item.size : 0,
    contentType:
      typeof item.contentType === 'string'
        ? item.contentType
        : typeof item.content_type === 'string'
        ? item.content_type
        : '',
  }));

  const hasUpdate = Boolean(latestVersion) && compareSemver(latestVersion, currentNormalized) > 0;
  return {
    currentVersion: currentNormalized || '1.0.0',
    latestVersion: latestVersion || currentNormalized || '1.0.0',
    tagName: tagName || `v${currentNormalized || '1.0.0'}`,
    hasUpdate,
    releaseName: (raw.name || tagName || '').trim(),
    releaseNotes: typeof raw.body === 'string' ? raw.body.trim() : '',
    htmlUrl: (raw.htmlUrl || raw.html_url || GITHUB_RELEASES_URL).trim(),
    publishedAt: (raw.publishedAt || raw.published_at || '').trim(),
    apkAsset: findApkAsset(assets),
  };
}

/**
 * 跨平台检查 GitHub 最新版本（Android 走原生 HTTP 客户端，Web/桌面走 fetch）
 */
export async function checkForAppUpdate(
  currentVersionOverride?: string
): Promise<UpdateCheckResult> {
  const currentVersion = currentVersionOverride || (await getCurrentAppVersion());

  if (isNativeAndroid()) {
    const nativeResult = await NativeMedia.checkLatestRelease();
    return buildUpdateCheckResult(nativeResult, currentVersion);
  }

  const response = await fetch(GITHUB_LATEST_RELEASE_API, {
    method: 'GET',
    headers: {
      Accept: 'application/vnd.github+json',
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('暂未在 GitHub Releases 找到已发布的正式版本。');
    }
    if (response.status === 403 || response.status === 429) {
      throw new Error('GitHub 接口请求受限，请稍后重试或前往 Releases 页面查看。');
    }
    throw new Error(`检查更新失败（HTTP ${response.status}）`);
  }

  const json = (await response.json()) as RawGitHubReleasePayload;
  return buildUpdateCheckResult(json, currentVersion);
}

/**
 * 触发 Android 端内 APK 下载与安装，并实时派发下载进度回调
 */
export async function downloadAndInstallAndroidApk(
  asset: NativeReleaseAsset,
  version: string,
  onProgress?: (event: NativeUpdateDownloadProgressEvent) => void
): Promise<NativeInstallApkResult> {
  const handle = onProgress
    ? await NativeMedia.addListener('updateDownloadProgress', onProgress)
    : null;
  try {
    return await NativeMedia.downloadAndInstallApk({
      url: asset.browserDownloadUrl,
      version,
    });
  } finally {
    if (handle) {
      await handle.remove().catch(() => {});
    }
  }
}

/**
 * 跨平台打开 GitHub 项目或发布页链接
 */
export async function openGithubUrl(url: string = GITHUB_REPO_URL): Promise<void> {
  const safeUrl = url && /^https?:\/\//i.test(url) ? url : GITHUB_REPO_URL;
  if (isNativeAndroid()) {
    await NativeMedia.openExternalUrl({ url: safeUrl });
    return;
  }
  window.open(safeUrl, '_blank', 'noopener,noreferrer');
}
