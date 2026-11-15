import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = process.cwd();
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const LAUNCHER_DIR = path.join(ROOT_DIR, 'scripts', 'desktop-launcher');
const RELEASE_DIR = path.join(ROOT_DIR, 'release');
const STAGE_ROOT = path.join(RELEASE_DIR, '_stage');
const BUNDLE_NAME = 'Wotagei-Compare-Desktop';
const STAGE_DIR = path.join(STAGE_ROOT, BUNDLE_NAME);
const ZIP_NAME = `${BUNDLE_NAME}-win.zip`;
const ZIP_PATH = path.join(RELEASE_DIR, ZIP_NAME);

/**
 * 递归复制目录内容
 */
function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * 将文本文件按指定换行符与可选 UTF-8 BOM 写入目标路径，确保 Windows cmd/PowerShell 5.1 正常解析
 */
function writeWindowsTextFile(srcPath, destPath, withUtf8Bom) {
  const raw = fs.readFileSync(srcPath, 'utf8').replace(/^\uFEFF/, '');
  const crlf = raw.replace(/\r?\n/g, '\r\n');
  const bom = withUtf8Bom ? '\uFEFF' : '';
  fs.writeFileSync(destPath, bom + crlf, 'utf8');
}

// 1. 构建最新前端静态产物
console.log('[1/4] 正在构建前端产物 (npm run build)...');
execSync('npm run build', { cwd: ROOT_DIR, stdio: 'inherit' });

if (!fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
  throw new Error('构建完成但未找到 dist/index.html');
}

// 2. 准备打包暂存目录
console.log('[2/4] 正在组装桌面工作台目录...');
fs.rmSync(STAGE_ROOT, { recursive: true, force: true });
fs.mkdirSync(STAGE_DIR, { recursive: true });
copyDirSync(DIST_DIR, path.join(STAGE_DIR, 'dist'));

writeWindowsTextFile(
  path.join(LAUNCHER_DIR, '启动工作台.bat'),
  path.join(STAGE_DIR, '启动工作台.bat'),
  false
);
writeWindowsTextFile(
  path.join(LAUNCHER_DIR, 'launcher.ps1'),
  path.join(STAGE_DIR, 'launcher.ps1'),
  true
);
writeWindowsTextFile(
  path.join(LAUNCHER_DIR, '使用说明.txt'),
  path.join(STAGE_DIR, '使用说明.txt'),
  true
);

// 3. 使用 Python zipfile 生成带 UTF-8 文件名标记 (flag_bits=0x800) 的跨平台兼容 ZIP，确保 Windows 资源管理器与解压软件不乱码
console.log(`[3/4] 正在生成压缩包 release/${ZIP_NAME}...`);
fs.rmSync(ZIP_PATH, { force: true });
const pyScript = [
  'import os, sys, zipfile',
  'stage_root, bundle_name, zip_path = sys.argv[1], sys.argv[2], sys.argv[3]',
  'base = os.path.join(stage_root, bundle_name)',
  'with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:',
  '    for root, dirs, files in os.walk(base):',
  '        for name in sorted(files):',
  '            full = os.path.join(root, name)',
  '            rel = os.path.relpath(full, stage_root).replace("\\\\", "/")',
  '            zf.write(full, rel)',
].join('\n');
execFileSync('python3', ['-c', pyScript, STAGE_ROOT, BUNDLE_NAME, ZIP_PATH], {
  cwd: ROOT_DIR,
  stdio: 'inherit',
});

// 4. 清理暂存目录并输出结果
fs.rmSync(STAGE_ROOT, { recursive: true, force: true });
const stats = fs.statSync(ZIP_PATH);
const sizeKb = (stats.size / 1024).toFixed(1);
console.log(`[4/4] 打包完成：${ZIP_PATH} (${sizeKb} KB)`);
