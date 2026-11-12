# Tasks

## 1. 核心算法层优化与抛物线插值实现

- [x] 1.1 在 `src/core/audio.ts` 的 `detectBpmFromSlice` 中实现基于 `hopSize` 整数倍的采样点网格对齐，消除切片起始点微调引入的瞬态冲击相位错位
- [x] 1.2 在 `src/core/audio.ts` 的 `detectBpmFromPcm` 中实现局部未加权物理自相关峰值的抛物线二次插值（Sub-sample Parabolic Peak Interpolation），消除离散量化台阶
- [x] 1.3 在 `src/core/audio.verify.ts` 中补充切片起始点微调（包含 6.06s、6.30s、6.37s 等敏感点）的稳定性测试用例，通过 `npx tsx src/core/audio.verify.ts` 验证

## 2. 真实音频与整体验收

- [x] 2.1 针对真实视频音频（如 `金刚_真龙.mp4`），执行端点连续扫描脚本，验证其在 6.00s~6.45s 范围内所有微调点均稳定输出 188 BPM
- [x] 2.2 运行项目 TypeScript 编译与打包构建 `npm run build`，确保无类型报错与构建回归
- [x] 2.3 将 `docs/decisions/AgDR-0021-全局网格对齐与自相关抛物线插值BPM检测.md` 的状态从 `proposed` 更新为 `executed`
