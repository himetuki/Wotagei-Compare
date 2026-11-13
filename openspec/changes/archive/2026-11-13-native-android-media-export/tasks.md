# Tasks

## 1. Android 原生媒体选择与本地流式访问底座

- [x] 1.1 配置 Android 本地回环流式访问权限与 Mixed Content 兼容（在 `android/app/src/main/res/xml/network_security_config.xml`、`AndroidManifest.xml` 与 `MainActivity.java` 允许 `127.0.0.1` HTTP 访问并注册 `NativeMediaPlugin`），执行 `gradlew.bat assembleDebug` 验证原生配置编译通过
- [x] 1.2 实现轻量本地 HTTP Range 代理与原生视频选择能力（`ACTION_OPEN_DOCUMENT` 持久化 URI 授权、`MediaMetadataRetriever` 真实分辨率/旋转/时长探测、基于 `ContentResolver` 的 `206 Partial Content` Range 服务），在 `legacy_android10` 模拟器或真实设备上验证通过原生选择视频后可在 WebView `<video>` 中加载且支持拖动寻道
- [x] 1.3 实现原生流式音频提取（`MediaExtractor + MediaCodec` 降采样提取单声道波形与 BPM 分析用 PCM，不将完整视频文件读入内存）并对接 `ImportStep.tsx` / `audio.ts`（保留纯 Web 端 `<input type="file">` 入口），验证导入 >80MB 视频或测试视频时可立即显示真实波形与检测 BPM 且无内存溢出

## 2. 前端导出布局参数化与原生接口桥接

- [x] 2.1 在 `src/core/renderer.ts` 抽取出与实时渲染共享几何计算的布局导出纯函数 `computeNativeExportLayout`，输出分区衬底/主图矩形、叠加缩放平移矩形、裁剪框及透明度参数，运行 `npx tsc --noEmit` 验证类型与 ES2018 标准库兼容检查通过
- [x] 2.2 在 `src/core/nativeMedia.ts` 定义 Capacitor 原生插件 TypeScript 接口并更新 `src/core/exporter.ts` 与 `src/components/ExportPage.tsx`：Android 原生端移除 `MediaRecorder` WebM 降级与 Base64 写入分支，统一调用原生导出接口监听 `exportProgress` 与取消控制，且移除 Android 端无效 `blob:` 下载按钮与兼容模式提示条；运行 `npm run build` 验证前端打包成功

## 3. Android 原生 GPU 零拷贝离线合成与相册入库

- [x] 3.1 实现基于 EGL + OpenGL ES 2.0 的双路 `SurfaceTexture` 合成渲染器，支持自动应用纹理变换矩阵校正旋转、左右分区（含窄视频铺底衬底、三线裁剪、独立镜像、中轴分割线）以及半透明叠加（视口变换与 `-1 ~ 1` 线性透明度混合），通过同步前端布局参数并比对导出成片抽帧图与预览画布确认画面一致
- [x] 3.2 实现双路顺序流式 `MediaExtractor + MediaCodec` 硬件解码、慢放 GPU 纹理复用、确定性微秒时间戳（`eglPresentationTimeANDROID`）驱动 H.264 编码器（含 `1280×720` 至 `960×544` 失败降档）及取消中断清理逻辑，验证慢放导出耗时显著快于实时挂钟时长且导出 MP4 时长严格等于 `(clipEnd - clipStart) / slowMotionRate`
- [x] 3.3 实现原生离线音频合成与 AAC 混流（节拍器模式以 `tau = 0` 锁相及重拍包络限幅；CH1/CH2 原声模式从对应 `content://` 提取重采样）并封装写入系统相册（API 29+ 通过 `MediaStore` 写入 `Movies/WotageiCompare`，API 23~28 申请存储权限写入公共 `Movies` 并扫描入库），在 `legacy_android10` 模拟器验证生成的 MP4 可在系统相册或外部播放器正常播放且声画同步

## 4. 全链路端到端验证与文档同步

- [x] 4.1 更新并运行自动化验证（构建 `npm run build && npx cap sync android && gradlew.bat assembleDebug`，并在 `legacy_android10` Android 10 Chrome 74 模拟器实测验证原生选片、波形/BPM、对比播放、0.2x 慢放原生高速 MP4 导出及相册入库全流程零 JS/原生异常）
- [x] 4.2 将 `docs/decisions/AgDR-0030-Android原生持久化URI视频选择与流式音频解码.md` 与 `docs/decisions/AgDR-0031-Android原生GPU零拷贝离线MP4导出管线.md` 状态更新为 `executed`

## Workflow follow-up

- 全部任务验收完成后，提示用户执行 `/opsx:archive` 将本次变更规格合并归档至 `openspec/specs/`。
