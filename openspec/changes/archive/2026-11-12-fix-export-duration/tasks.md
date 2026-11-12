# Tasks

## 1. 依赖引入与环境准备

- [x] 1.1 安装轻量级纯 JS 封装库 `mp4-muxer`，更新 `package.json` 并执行构建安装验证

## 2. 导出核心引擎确定性时间戳重构

- [x] 2.1 重构 `src/core/exporter.ts` 中的离散时间轴计算模型，确保导出总帧数与各帧微秒级时间戳（PTS）严格由 `(clipEnd - clipStart) / slowMotionRate` 和预设帧率纯数学计算生成，与物理挂钟耗时完全解耦
- [x] 2.2 实现基于 WebCodecs `VideoEncoder` 与 `mp4-muxer` 的逐帧离屏视频编码流水线，单帧异步寻道与 Canvas 绘制后显式封装 `VideoFrame` 送编并即刻释放显存，彻底废除 `MediaRecorder(canvas.captureStream())`
- [x] 2.3 实现完整的离线音频混流管线，支持合成节拍器（`OfflineAudioContext`）及 CH1 / CH2 原声音频的离线 PCM 截取与变速重采样，通过 WebCodecs `AudioEncoder` 混入同一 MP4 容器
- [x] 2.4 实现导出取消（`cancel`）的即时中断与编码器资源安全清理，并添加运行环境 WebCodecs 支持度的特征检测与清晰提示

## 3. 导出工作台界面联调与状态闭环

- [x] 3.1 联调 `src/components/ExportPage.tsx` 的成片统计与进度回调，确保界面预估的成片时长、总帧数与导出的 MP4 物理文件时长分毫不差
- [x] 3.2 验证导出失败、用户主动取消及导出成功后的状态复位与 Android 相册保存流程

## 4. 验证与构建检查

- [x] 4.1 编写或更新导出算法离线验证脚本（`src/core/exporter.verify.ts`），验证时间戳换算与音视频参数模型
- [x] 4.2 执行 `npm run build`，验证 TypeScript 编译与 Vite 生产构建零报错通过
