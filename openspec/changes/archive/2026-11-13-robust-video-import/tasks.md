# Tasks

## 1. 音频解码与老旧内核/大文件防 OOM 内存保护

- [x] 1.1 在 `src/core/audio.ts` 中实现 `readFileAsArrayBuffer` 兼容读取（FileReader 回退）与 `decodeAudioData` 双模兼容（回调与 Promise），验证基础解码。
- [x] 1.2 在 `src/core/audio.ts` 中引入超大文件（> 80MB）防 OOM 熔断机制，跳过全量 PCM 解码并返回标准保底音轨与 160 BPM，杜绝老旧沙箱内存溢出崩溃。

## 2. 视频导入即时反馈与高兼容元数据探测

- [x] 2.1 重构 `src/components/ImportStep.tsx` 中的文件载入状态机，实现用户选定文件后的乐观即时挂载，立刻显示文件名与文件大小，状态转为「解析中」，严禁停留在「未载入」。
- [x] 2.2 实现 DOM 宿主注入、`muted`、`playsinline`、显式 `.load()` 与 2.5s 硬超时兜底的视频元数据探测器，超时或失败自动回退到 1920×1080 标准参数。
- [x] 2.3 修复 `<input type="file">` 在选定后清空 `value` 的防死锁机制，扩展 `accept="video/mp4,video/*"`。

## 3. 画面渲染与样式回退加固

- [x] 3.1 重构 `src/components/Workbench.tsx` 与 `src/components/ExportPage.tsx` 中的底层 `<video>` 样式，由 `display: none` 改为 1×1 活跃节点，杜绝 GPU 合成器纹理断流黑屏。
- [x] 3.2 在 `src/index.css` 中为所有 `max(..., var(--safe-*))` 规则前增加基础固定像素回退，修复 Chrome < 79 语法错误导致的内边距丢失。
- [x] 3.3 在 `src/components/ExportPage.tsx` 中增加 WebCodecs 前置环境检查提示，向内核低于 Chrome 94 的设备提供友好的更新指引。

## 4. 原生工程配置与编译构建验证

- [x] 4.1 在 `android/app/src/main/AndroidManifest.xml` 中配置 `android:largeHeap="true"` 与 `android:requestLegacyExternalStorage="true"`，并执行 `npx cap sync android` 同步原生工程。
- [x] 4.2 运行 `npm run build`（TypeScript 检查与 Vite es2018 打包），验证编译产物零错误。
