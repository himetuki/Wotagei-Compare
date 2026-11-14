# Design

## Context

当前存储与资源使用审计表明，应用正常链路已实现零大文件复制和 `no-store` 无缓存流式读写（见 `proposal.md` - Why 与 `specs/` 中的新增约束）。本次设计聚焦于堵住异常中断残留、长期重复选片权限累积、Web 内存引用滞留与冗余原生插件依赖四个收口问题。

## Goals / Non-Goals

**Goals:**
- 即使导出中途发生崩溃或系统强杀，下次启动也自动清扫 `cacheDir` 内残留的 `wotagei_export_*.mp4` 临时文件。
- Android 10+ 向 `MediaStore` 写入失败时，立即回滚清理 `IS_PENDING=1` 占位记录。
- 原生插件按通道精确追踪并释放不再使用的持久化 URI 读权限，本地音频代理及时覆写/清除未被消费的 PCM 缓冲。
- 纯 Web 端换片、重新导出或卸载页面时释放旧 `blob:` Object URL。
- 从项目依赖和 Android 原生工程中彻底移除未使用的 `@capacitor/filesystem`。

**Non-Goals:**
- 不改变正常导出“先写 `cacheDir` 临时 MP4 再写入 `Movies/WotageiCompare`”的两阶段落盘机制。
- 不引入后台定时任务、原生持久化数据库或缓存大小设置页。

## Decisions

1. **临时文件启动清扫、相册回滚与 URI 权限按通道释放** — 详见 [AgDR-0033](../../../docs/decisions/AgDR-0033-原生临时文件兜底清扫与URI权限生命周期回收.md)（status: `proposed`）。
   - `NativeMediaPlugin.load()`：遍历 `getContext().getCacheDir().listFiles()`，清理文件名匹配 `wotagei_export_*.mp4` 的历史残片。
   - `NativeOfflineExporter.saveToPublicMovies()`：Android 10+ 分支在 `resolver.insert(...)` 之后用 `try / catch` 包裹流拷贝；若发生异常先 `resolver.delete(itemUri, null, null)` 再重新抛出异常。
   - `NativeMediaPlugin`：维护 `ConcurrentHashMap<Integer, Uri> channelUriMap` 与辅助方法 `releaseUriIfUnused(Uri candidate)`；选片覆盖同通道或 `handleOnDestroy()` 时，先从映射移除旧 URI，确认另一通道未使用后再尝试 `releasePersistableUriPermission`（需对历史已持有的权限标志做安全释放）。
2. **本地音频代理未消费载荷清理**
   - `LocalRangeProxyServer.registerAudioPcm(...)` 接收 `channel` 或 `uri` 关联，或每次注册前先清理之前未被消费的旧载荷（若一次仅服务当前分析中的通道，或者按 `channel` 追踪 `channelAudioTokenMap`：同一通道再次提取或更换视频 `registerChannelUri(channel, ...)` 时顺带移除该通道尚未被 `GET` 取走的旧 `audioToken`）。采用按通道 `channelAudioTokenMap` 追踪最精准，避免 CH1 和 CH2 并行提取时相互误删！
3. **Web 端 Object URL 生命周期管理**
   - `ImportStep.tsx`：对 CH1 / CH2 当前在组件及上层使用的预览 `blob:` URL 用 `useRef` 追踪，每次同通道选入新本地 `File` 并生成新 `URL.createObjectURL(file)` 时，安全撤销旧的 `blob:` URL（注意：仅撤销与旧状态匹配的 `blob:` 前缀 URL，且在离开 `ImportStep` 进入后续向导步骤时不提前撤销，因为 `GeometryStep`、`AudioStep` 和 `Workbench` 仍需使用该 `url` 播放；仅当同通道被替换为新文件时撤销旧 `blob:` URL）。
   - `ExportPage.tsx`：使用 `useEffect` / `ref` 追踪当前 `downloadUrl`，在生成新 `downloadUrl` 前以及 `ExportPage` 卸载时自动调用 `URL.revokeObjectURL` 释放。
4. **移除 `@capacitor/filesystem`**
   - 执行 `npm uninstall @capacitor/filesystem` 并运行 `npx cap sync android`，由 Capacitor CLI 自动更新 `android/capacitor.settings.gradle` 和 `android/app/capacitor.build.gradle`。

## Risks / Trade-offs

- **Risk**: `ImportStep` 组件在用户从对比台切回“导入”步骤再切出去时可能会重新挂载；若在 `ImportStep` 卸载时盲目 `revokeObjectURL`，会导致 `Workbench` / `GeometryStep` 的 `<video src="blob:...">` 失效！
  → **Mitigation**: `ImportStep.tsx` 绝不在组件 `useEffect` cleanup 中撤销仍传给 `App` 状态的 `video1.url` / `video2.url`；仅在用户**主动为某通道重新选择新文件**替换旧 `LoadedVideoItem` 时，才撤销该通道被替换掉的旧 `blob:` URL。
- **Risk**: `releasePersistableUriPermission` 时，如果选了不同文件但 Android 系统返回的权限 flags 与 `takePersistableUriPermission` 不一致或该 URI 本身不支持持久化授权，可能抛 `SecurityException`。
  → **Mitigation**: 在 `try { ... } catch (Exception ignored)` 中安全调用，并记录申请时使用的 `takeFlags`（与 `Intent.FLAG_GRANT_READ_URI_PERMISSION` 对齐）用于释放。
- **Risk**: 卸载 `@capacitor/filesystem` 后需确认 Android Gradle 配置同步无残留引用。
  → **Mitigation**: 执行 `npx cap sync android` 后核查 `android/capacitor.settings.gradle` 与 `android/app/capacitor.build.gradle`，并运行原生编译及 Web 构建验证。
