---
id: AgDR-0033
date: 2026-11-14
status: executed
---

# 原生临时文件兜底清扫与 URI 权限生命周期回收

> 在【导出临时文件仅靠 `finally` 删除（若导出途中闪退会永久滞留 `cacheDir`）、Android 10+ `MediaStore` 写入失败未回滚 `IS_PENDING` 记录，以及持久化 URI 读权限只申请不释放】的处境下，面对【是否改为 `MediaMuxer(FileDescriptor)` 直写相册或取消持久化 URI 权限】的顾虑，我决定【保留 `cacheDir` 临时缓冲文件并在插件启动时自动清扫历史 `wotagei_export_*.mp4`、为 `MediaStore` 写入失败补充 `delete` 回滚，同时按 CH1/CH2 通道引用追踪精准释放旧持久化 URI 读权限】，以达成【全机型导出稳定零残留、相册数据库零残缺记录、长期使用不触及系统 URI 权限配额上限】的目标，并接受【在插件启动初始化与导出异常分支增加少量文件/权限回收逻辑，以及双通道共享同一 URI 时延迟至双方均卸载再释放权限】的代价。

## 考虑过的方案

| 方案 | 好处 | 代价 |
| --- | --- | --- |
| 方案 A：放弃 `cacheDir` 临时文件，改用 `MediaMuxer(FileDescriptor)` 直接写入 `MediaStore` | 减少一次从私有缓存向公共相册的拷贝 I/O | Android 6~9 不支持 `IS_PENDING`，且部分老旧机型在编码中途取消或报错时，`MediaMuxer` 已创建的公共目录坏文件无法保证完整回收；私有目录回退路径仍需处理 |
| 方案 B：完全取消 `takePersistableUriPermission`，仅使用 `Intent` 临时读权限 | 不需要手动释放持久化 URI 权限 | 违背 `AgDR-0030` 与现有规格对持久化 URI 权限的约定，部分第三方网盘/相册 `DocumentProvider` 在长耗时导出或切后台后可能收回临时授权 |
| 方案 C（本方案）：保留 `cacheDir` 临时文件 + 启动清扫残留 + `MediaStore` 异常回滚 + 按通道追踪释放持久化 URI | 兼容 Android 6~14 全版本；崩溃重启即自愈清理；仅释放不再被任何通道占用的旧 URI，不误伤同文件对比 | 需在 `NativeMediaPlugin` 维护两路当前 `Uri` 的引用映射，并在启动时遍历 `cacheDir` 一次 |

## 决定

选 **方案 C**，因为从第一性原理看：

1. **临时文件自愈闭环**：导出完成或常规取消由 `finally` 立即 `tempMp4.delete()` 负责；进程闪退/被杀这种无法进入 `finally` 的情况，由下一次 `NativeMediaPlugin.load()` 扫描 `context.getCacheDir()` 删除所有 `wotagei_export_*.mp4` 兜底，做到“至多保留一次崩溃的残片，重启即清零”。
2. **相册数据库原子性**：Android 10+ 插入 `IS_PENDING = 1` 记录后若拷贝失败，在 `catch` 中立即调用 `resolver.delete(itemUri, null, null)` 并继续抛出异常，保证失败不留空壳占位。
3. **通道级 URI 权限生命周期**：在 `NativeMediaPlugin` 内用 `channelUris`（按 `channel` 记录 `Uri`）记录当前正在使用的 URI；更换同一通道或 `handleOnDestroy` 时，先校验该旧 `Uri` 是否仍被另一通道引用，仅在无人引用时调用 `releasePersistableUriPermission`（忽略不支持持久化授权的 Provider 异常）。
4. **工程依赖同步精简**：移除完全未被源码引用的 `@capacitor/filesystem`，同步更新 Android 原生插件配置。

## 代价

- 我们接受：插件内维护两通道当前 URI 状态，以及每次导出先写私有缓存再拷贝到公共相册的既有两步落盘流程。
- 我们放弃：通过 `MediaMuxer(FileDescriptor)` 直写相册的激进改造，以及无差别清空 `getPersistedUriPermissions()` 的粗暴做法。
- 后面要还的债：无额外技术债务；若未来支持多于 2 个通道或跨重启自动恢复上次选片，需要调整 URI 释放时机。

## 什么情况下需要重新讨论

- 如果未来应用增加“历史工程自动恢复”功能（冷启动后直接免选片继续编辑上次视频），则 `handleOnDestroy` 时不应释放仍保存在工程草稿中的 URI 权限。
