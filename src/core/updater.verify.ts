import {
  buildUpdateCheckResult,
  compareSemver,
  findApkAsset,
  normalizeVersionTag,
} from './updater.ts';

function assert(cond: boolean, message: string): void {
  if (!cond) {
    throw new Error(`断言失败: ${message}`);
  }
}

console.log('=== 1. SemVer 版本号比对与 v 前缀剥离验证 ===');
assert(normalizeVersionTag(' v1.2.3 ') === '1.2.3', '应正确剥离前导 v 与空白');
assert(normalizeVersionTag('V2.0.0-beta.1') === '2.0.0-beta.1', '应支持大写 V 前缀');
assert(compareSemver('v1.0.0', '1.0.0') === 0, 'v1.0.0 应等于 1.0.0');
assert(compareSemver('v1.0.1', '1.0.0') === 1, 'v1.0.1 应大于 1.0.0');
assert(compareSemver('1.0.0', 'v1.0.1') === -1, '1.0.0 应小于 v1.0.1');
assert(compareSemver('v1.10.0', '1.2.9') === 1, '数字比较 10 应大于 2');
assert(compareSemver('v1.2.0', '1.2.0-rc.1') === 1, '正式版应高于预发布版');
assert(compareSemver('1.2.0-beta.2', '1.2.0-beta.10') === -1, '预发布数值段 2 应小于 10');
console.log('✓ SemVer 版本比较与前缀清理全部通过');

console.log('=== 2. Release 附件 .apk 资产提取验证 ===');
const multiAsset = findApkAsset([
  {
    name: 'Wotagei-Compare-v1.1.0-win-x64.zip',
    browserDownloadUrl: 'https://example.com/win.zip',
    size: 1000,
    contentType: 'application/zip',
  },
  {
    name: 'Wotagei-Compare-v1.1.0-android-debug.apk',
    browserDownloadUrl: 'https://example.com/app-debug.apk',
    size: 2000,
    contentType: 'application/vnd.android.package-archive',
  },
  {
    name: 'Wotagei-Compare-v1.1.0-android-release.apk',
    browserDownloadUrl: 'https://example.com/app-release.apk',
    size: 2100,
    contentType: 'application/vnd.android.package-archive',
  },
]);
assert(multiAsset !== null, '应找到 .apk 资产');
if (multiAsset) {
  assert(
    multiAsset.name === 'Wotagei-Compare-v1.1.0-android-release.apk',
    '多 APK 时应优先选择正式 release 包'
  );
}

const noApkAsset = findApkAsset([
  {
    name: 'source-code.tar.gz',
    browserDownloadUrl: 'https://example.com/src.tar.gz',
    size: 500,
    contentType: 'application/gzip',
  },
]);
assert(noApkAsset === null, '无 .apk 资产时应返回 null');
console.log('✓ Release 附件 .apk 提取与无 APK 回退验证通过');

console.log('=== 3. GitHub API Release 快照规整验证 ===');
const newerSnapshot = buildUpdateCheckResult(
  {
    tag_name: 'v1.2.0',
    name: 'Wotagei-Compare v1.2.0',
    body: '新增默认偏好设置与端内更新支持',
    html_url: 'https://github.com/jollyxenon/Wotagei-Compare/releases/tag/v1.2.0',
    published_at: '2026-11-16T00:00:00Z',
    assets: [
      {
        name: 'Wotagei-Compare-v1.2.0-android-debug.apk',
        browser_download_url:
          'https://github.com/jollyxenon/Wotagei-Compare/releases/download/v1.2.0/Wotagei-Compare-v1.2.0-android-debug.apk',
        size: 12345678,
        content_type: 'application/vnd.android.package-archive',
      },
    ],
  },
  '1.0.0'
);
assert(newerSnapshot.hasUpdate === true, 'v1.2.0 相对 1.0.0 应判定有更新');
assert(newerSnapshot.latestVersion === '1.2.0', 'latestVersion 应规整为 1.2.0');
assert(newerSnapshot.apkAsset !== null, '应包含可下载 APK 资产');

const upToDateSnapshot = buildUpdateCheckResult(
  {
    tag_name: 'v1.0.0',
    name: 'v1.0.0',
    body: '',
    html_url: 'https://github.com/jollyxenon/Wotagei-Compare/releases/tag/v1.0.0',
    assets: [],
  },
  '1.0.0'
);
assert(upToDateSnapshot.hasUpdate === false, '相同版本号应判定无更新');
assert(upToDateSnapshot.apkAsset === null, '空附件应返回 null');
console.log('✓ Release 更新快照生成与无新版本判定验证通过');
