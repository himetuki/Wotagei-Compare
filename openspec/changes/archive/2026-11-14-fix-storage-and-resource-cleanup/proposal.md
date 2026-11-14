# Proposal

## Why

经全量存储与资源泄漏审计，Wotagei-Compare 正常流程下已实现零大文件拷贝与 `no-store` 无缓存流式读取，但在异常中断、长期换片和依赖精简上仍存在清理死角：若导出过程中应用闪退或被系统强杀，系统缓存目录 `cacheDir` 会残留半截 `wotagei_export_*.mp4` 且下次启动不会清扫；Android 10+ 写入 `MediaStore` 中途失败时会残留 `IS_PENDING=1` 占位记录；`NativeMediaPlugin` 每次选片只申请持久化 URI 权限却从不释放；Web 端 `URL.createObjectURL` 换片/重新导出后未 `revokeObjectURL`；且 `package.json` 与 Android 工程仍挂着完全未使用的 `@capacitor/filesystem` 依赖。

## What Changes

- **异常残留临时文件与相册占位清扫**：
  - 在 `NativeMediaPlugin.load()` 启动时扫描并删除 `cacheDir` 下历史遗留的 `wotagei_export_*.mp4` 临时文件。
  - 在 `NativeOfflineExporter.saveToPublicMovies()` Android 10+ `MediaStore` 写入失败分支中，立即 `resolver.delete(itemUri, null, null)` 回滚删除未完成的 `IS_PENDING=1` 相册记录。
- **URI 权限与本地代理内存清理**：
  - 在 `NativeMediaPlugin` 中追踪 CH1/CH2 当前占用的 `Uri`，更换同一通道视频或插件销毁时释放不再被任一通道引用的旧持久化 URI 读权限（`releasePersistableUriPermission`）。
  - 在 `LocalRangeProxyServer` 中按通道/覆盖策略管理未消费的一次性音频 PCM 载荷，避免连续快速解析或未拉取时驻留内存。
- **Web 调试端 Object URL 回收**：
  - 在 `ImportStep.tsx` 与 `ExportPage.tsx` 中，更换视频、重新导出或卸载页面时调用 `URL.revokeObjectURL` 释放旧 Blob URL 内存引用。
- **移除未使用的冗余依赖**：
  - 从 `package.json` 卸载 `@capacitor/filesystem`，并通过 `npx cap sync android` 同步移除 Android 工程中冗余的 `capacitor-filesystem` 原生模块。

## Capabilities

### New Capabilities
<!-- 本次变更不引入全新独立能力域 -->

### Modified Capabilities
- `comparison-export`: 补充导出临时文件崩溃残留启动清扫、`MediaStore` `IS_PENDING` 写入失败回滚删除及 Web 导出 `ObjectURL` 释放要求。
- `video-workspace`: 补充持久化 URI 读权限随通道更换/销毁的精准释放、Web 导入 `ObjectURL` 释放及移除冗余 `@capacitor/filesystem` 原生模块要求。

## Impact

- Android 原生层：`android/app/src/main/java/com/wotagei/compare/NativeMediaPlugin.java`、`NativeOfflineExporter.java`、`LocalRangeProxyServer.java`
- 前端组件层：`src/components/ImportStep.tsx`、`src/components/ExportPage.tsx`
- 工程依赖与原生同步：`package.json`、`package-lock.json`、`android/capacitor.settings.gradle`、`android/app/capacitor.build.gradle`
