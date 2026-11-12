# Tasks

## 1. 同步引擎代数守卫与严格会合起播状态机实现

- [x] 1.1 在 `src/core/sync-engine.ts` 中引入全局代数守卫 `currentEpoch` 与 `intendedPlaying`，彻底移除循环中带有 `play()` 唤醒副作用的 seek 回调
- [x] 1.2 在 `src/core/sync-engine.ts` 中实现调用 `seekToTau` 时原子挂起时钟循环，以及封装 `playFrom(targetTau)` 双端严格会合起播屏障
- [x] 1.3 更新 `src/core/sync-engine.verify.ts`，增加暂停状态丢弃滞后 seek 回调、寻道挂起互斥与双端会合起播用例，运行 `npx tsx src/core/sync-engine.verify.ts` 确认通过

## 2. 视图层交互管道重构

- [x] 2.1 重构 `src/components/Workbench.tsx` 中的「锚点前 1s」与进度条交互，统一调用引擎的 `playFrom` 与静默寻道
- [x] 2.2 重构 `src/components/ExportPage.tsx` 中的预览播放与跳转逻辑，保证双端先对齐就绪再联合起步

## 3. 全局构建与 APK 打包交付

- [x] 3.1 运行 `npm run build`，确保 TypeScript 检查与打包 100% 成功，并将 `docs/decisions/AgDR-0018-双视频代数守卫与严格会合起播状态机.md` 状态更新为 executed
- [x] 3.2 执行 `npx cap sync android` 并通过 Gradle 构建最新的 Android Debug APK 供用户实机验证

## Workflow follow-up

- 归档变更：`openspec archive sync-engine-rendezvous-fix`
