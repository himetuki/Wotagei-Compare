# Tasks

## 1. Android 原生存储与资源清理加固

- [x] 1.1 在 `NativeMediaPlugin.load()` 中增加应用 `cacheDir` 历史 `wotagei_export_*.mp4` 残留临时文件扫描删除逻辑，验证：向应用缓存目录放入模拟残留文件 `wotagei_export_test.mp4` 后启动插件初始化（或通过 Gradle 单测/真机冷启动验证），确认该残留文件被自动删除且其他缓存不受影响
- [x] 1.2 在 `NativeOfflineExporter.saveToPublicMovies()` 的 Android 10+ `MediaStore` 写入流逻辑中增加异常捕获与 `resolver.delete(itemUri, null, null)` 回滚清理，验证：检查异常路径可观测回滚逻辑且不留存 `IS_PENDING = 1` 占位记录
- [x] 1.3 在 `NativeMediaPlugin` 中按通道（CH1/CH2）维护活跃 `Uri` 映射，在同通道更换视频及 `handleOnDestroy()` 时释放不再被任一通道引用的旧持久化 URI 读权限，验证：构造单通道替换与双通道同 URI 共享场景，确认单侧替换旧 URI 触发释放、双通道共享 URI 时保留有效权限
- [x] 1.4 在 `LocalRangeProxyServer` 中为音频 PCM 注册增加按通道/URI 覆盖清理机制（在同通道切换或重复提取时移除未被 `GET` 消费的旧载荷），验证：连续调用两次同通道注册仅保留最新 token 且旧 token 返回 404

## 2. Web 调试端 Object URL 回收与冗余依赖精简

- [x] 2.1 在 `src/components/ImportStep.tsx` 中为 Web 端文件选择增加旧预览 `blob:` URL 释放逻辑（仅在同通道选入新文件替换旧文件时调用 `URL.revokeObjectURL`），验证：反复更换 CH1/CH2 本地文件时旧 `blob:` URL 被释放，且向导切换至空间标定与对比台时当前视频仍正常播放
- [x] 2.2 在 `src/components/ExportPage.tsx` 中为 `downloadUrl` 增加重新导出前及组件卸载时的 `URL.revokeObjectURL` 清理，验证：连续导出两次或返回对比台后，旧 `blob:` 下载链接被撤销
- [x] 2.3 从 `package.json` 卸载 `@capacitor/filesystem` 并执行 `npx cap sync android` 同步原生配置，验证：`package.json`、`android/capacitor.settings.gradle` 与 `android/app/capacitor.build.gradle` 中均不再出现 `capacitor-filesystem`

## 3. 集成构建与文档状态核验

- [x] 3.1 执行 Web 构建检查（`npm run build`）与 Android 原生单元测试/编译检查（`./gradlew testDebugUnitTest` 或 `assembleDebug`），验证：全量 TypeScript 编译、Vite 打包及 Android 原生代码编译均零报错通过
- [x] 3.2 更新 `docs/decisions/AgDR-0033-原生临时文件兜底清扫与URI权限生命周期回收.md` 状态为 `executed` 并核查 `openspec validate fix-storage-and-resource-cleanup`，验证：OpenSpec 校验通过且所有新增规格条目均有对应实现

## Workflow follow-up

- 实现并验证完成后，提醒用户执行 `/opsx:archive` 将本次规格增量合并进 `openspec/specs/` 并归档变更。
