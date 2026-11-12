# Tasks: 闭环截取区间局部 BPM 检测与速度先验谐波校准

## 1. 核心音频算法优化 (`src/core/audio.ts`)

- [x] 1.1 移除 `detectBpmFromPcm` 内部 45 秒硬截断，实现起止点切片完全闭环的自相关计算，并在 `detectBpmFromSlice` 增加 <2.0s 守卫
- [x] 1.2 引入中心为 168 BPM 的对数正态先验加权函数，并乘至自相关滞后得分，压制慢速假峰
- [x] 1.3 实现 1.5 倍频（3:2）与 2 倍频谐波共振校验机制，防止 3+3+2 切分音将 165 BPM 误判为 110 BPM
- [x] 1.4 更新 `src/core/audio.verify.ts` 增加切分音信号抗干扰测试与区间滑动测试，运行 `npx tsx src/core/audio.verify.ts` 验证通过

## 2. 时间标定交互优化 (`src/components/AudioStep.tsx`)

- [x] 2.1 重构起止手柄拖拽事件流：拖动中仅同步端点位置与视频监看游标，在 `handlePointerUp` 及防抖 200ms 后触发 `recalculateBpmForTrim`，避免中间态主线程阻塞与脏数据污染
- [x] 2.2 验证手动微调 BPM 或 Tap 测速后，起止手柄调整不发生非预期强制覆盖

## 3. 整体构建与系统集成验证

- [x] 3.1 执行 `npm run build` 确保 TypeScript 类型检查与前端打包零警告通过
- [x] 3.2 验证规划决策记录 `docs/decisions/AgDR-0020-闭环区间自相关与WOTA艺速度先验谐波校准.md` 并在实现后更新为 `executed`
