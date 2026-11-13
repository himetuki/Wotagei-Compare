# Tasks

## 1. 修复 Android 原生导出统一时间轴映射公式并补充原生验证

- [x] 1.1 修改 `android/app/src/main/java/com/wotagei/compare/NativeOfflineExporter.java` 中的 `mapTauToSourceTime(double tau, double anchorTime, double rate)`，将 `anchorTime + tau / rate` 更正为 `anchorTime + tau * rate`（并提升方法可见性为包级 `static` 供同包 JUnit 直接校验），使初始寻道、逐帧视频解码推进与单侧原声采样均与 `src/core/timeline.ts` 保持同构。验证：检查 `NativeOfflineExporter.java` 中所有 `mapTauToSourceTime` 调用链路均复用该乘法公式，并无其他 `/ rate` 反向映射残留。
- [x] 1.2 在 `android/app/src/test/java/com/wotagei/compare/NativeOfflineExporterTest.java` 新增 JUnit 单元测试，覆盖 `rate = 1.0`、`rate = 160.0 / 140.0`（加速追赶）、`rate = 140.0 / 160.0`（减速对齐）及正负 `tau` 边界，逐点校验 `NativeOfflineExporter.mapTauToSourceTime` 输出结果与理论源时间戳一致；在 `android/` 目录运行 `./gradlew testDebugUnitTest` 验证全部单元测试通过。

## 2. 补充前端校验场景并完成构建与可观测集成验收

- [x] 2.1 在 `src/core/exporter.verify.ts` 补充非 `1.0` BPM 速率比（`rate1 != 1`、`rate2 != 1`）的 `computeNativeExportLayout` 与源时间推进映射检查，运行 `node --experimental-strip-types src/core/exporter.verify.ts`（或项目当前 TS 验证方式）与 `npm run build` 验证前端无编译或校验报错。
- [x] 2.2 在 `android/` 目录执行 `npx cap sync android`（从项目根目录）及 `./gradlew assembleDebug` 验证更新后的原生代码能正常编译产出 Debug APK，确认构建命令退出码为 `0` 且无编译错误。
- [x] 2.3 将 `docs/decisions/AgDR-0032-Android原生导出统一时间轴正向乘法映射约束.md` 的 `status`（frontmatter 与正文）由 `proposed` 更新为 `executed`；若当前具备 Android 真机或模拟器环境，使用两段不同 BPM 视频开启「随 CH1」/「随 CH2」对齐导出 MP4，实测导出成片双侧画面动作与所选音轨全程同频对齐。

## Workflow follow-up

- 实现并验收完成后，提醒用户运行 `/opsx:archive` 合并规格增量并归档变更。
