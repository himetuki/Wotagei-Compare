# Tasks

## 1. 节拍器核心状态机与动态增益合成器重构

- [x] 1.1 重构 `SynthesizedMetronome` 内部时序状态机，实现以统一时间轴 $\tau = 0$ 为原点的全域无符号同余重拍判决（`((k % 4) + 4) % 4 === 0`），并引入 35ms 起播容差窗口消除锚点起播首拍被吞问题
- [x] 1.2 在 `SynthesizedMetronome.update` 中引入时间逆流与循环回绕自愈机制，检测到时间戳回退时自适应重置历史拍号，杜绝循环后哑音
- [x] 1.3 升级节拍器合成音色为复合谐波脉冲（强拍 1500Hz/800Hz 双振荡器冲击，弱拍 800Hz 纯净脉冲），将有效冲击包络调整为 55ms 饱满打击感
- [x] 1.4 在 WebAudio 输出总线接入 `DynamicsCompressorNode`（动态范围压缩限幅器）并提升主增益 1.5 倍，确保在外放扬声器下声音穿透力强且无削顶爆音
- [x] 1.5 编写 `src/core/metronome.verify.ts` 验证脚本，执行 `npx tsx src/core/metronome.verify.ts` 验证循环回退自愈、负时间戳同余、锚点容差触发与发声状态机全部正确

## 2. 同步引擎循环重放与工作台时钟状态对齐

- [x] 2.1 在 `DualVideoSyncEngine` 中规范截取/交集边界循环回绕行为，确保在触发 `playFrom(loopStart)` 与 `seekToTau` 时统一时钟状态平稳传递
- [x] 2.2 更新 `src/components/Workbench.tsx`，在对比台主同步引擎驱动循环与时间轴交互中保持节拍器与 $\tau = 0$ 严格锁相，验证在视频到达交集终点重放后节拍器持续发声
- [x] 2.3 更新 `src/components/ExportPage.tsx`，在导出页预览时钟中对齐节拍器重置与 A-B 截取区间循环边界，验证在区间终点回绕后节拍器持续发声

## 3. 离线视频导出节拍器音轨混流重构

- [x] 3.1 重构 `src/core/exporter.ts` 中的 `synthesizeMetronomeBuffer` 算法，采用绝对整数拍号步进迭代消除浮点累加漂移，确保导出的离线音轨在 $\tau = 0$ 处精准锁定重拍
- [x] 3.2 在离线节拍器合成中同步对齐实时节拍器的复合谐波音色与充沛响度增益包络，确保导出的 MP4 节拍器响度与对比台实时监听完全一致
- [x] 3.3 运行 `npx tsx src/core/exporter.verify.ts` 确保导出时间戳、总采样数与音频重采样参数校验 100% 通过

## 4. 全局工程构建与全链路验收

- [x] 4.1 运行 `npm run build` 确保 TypeScript 静态类型检查与 Vite 生产打包零错误、零警告
- [x] 4.2 验证对比台与导出页的节拍器在 0.1x~1.0x 各档慢放下发声清脆利落、循环重放后无缝发声、重拍紧锁对齐锚点且音量充足清晰
