---
id: AgDR-0039
date: 2026-11-16
status: executed
---

# Android 端内 GitHub Releases 自动更新与安装包生命周期清扫

> 在【用户需要在软件「设置与关于」页面通过自动更新按钮直接完成版本检查，并在 Android 端内自动下载最新 `.apk` 安装包并调起安装，同时要求更新完后不残留旧安装包】的处境下，面对【Android 8.0+ 未知来源安装权限限制、Android 7.0+ `FileProvider` URI 约束、GitHub CDN 多级重定向、以及应用自升级会杀掉旧进程导致常规回调无法清理 APK】的顾虑，我决定【在 `NativeMediaPlugin` 中通过 `HttpURLConnection` 跟随重定向下载 APK 至 `cacheDir/wotagei_update_<ver>.apk` 并发射进度事件，按系统版本检查并引导 `REQUEST_INSTALL_PACKAGES` 权限后拉起系统安装器；同时建立“冷启动扫盘 + 新下载前清理 + 安装界面取消回调删除”三道闭环清扫机制】，以达成【Android 全版本一键端内更新、Web/桌面端平滑降级跳转 Releases、任何场景下不滞留 `.apk` 残留垃圾】的目标，并接受【在 `AndroidManifest.xml` 声明 `REQUEST_INSTALL_PACKAGES` 权限（不涉及上架 Google Play）及自建轻量 HTTP 下载代码】的代价。

## 考虑过的方案

| 方案 | 好处 | 代价 |
| --- | --- | --- |
| **方案 A（入选）：`cacheDir` 私有目录下载 + `FileProvider`（API 24+）/ 全局可读 `file://`（API 23）拉起安装 + 三重闭环清理** | 无需外部存储写入权限；已有 `file_paths.xml` `<cache-path>` 直接覆盖；`NativeMediaPlugin.load()` 冷启动清理完美解决“安装成功进程被杀后旧安装包残留”问题；取消或再次下载亦即时清理 | 需声明 `REQUEST_INSTALL_PACKAGES` 并编写 HTTP 重定向下载循环与进度事件桥接 |
| **方案 B：仅前端检查版本后跳系统浏览器下载 APK** | 无需新增任何原生代码和权限 | 不满足用户“Android 端内下载并安装 APK”及“更新完自动删除安装包”的明确需求，系统 `Download/` 目录会永久残留 APK |
| **方案 C：接入系统 `DownloadManager` 下载到公共 `Download/` 目录** | 系统接管断点下载通知栏 | 需要额外申请/适配不同 Android 版本的公共下载目录访问与广播监听；下载到公共目录后应用无权在更新重启后稳定静默删除，极易遗留安装包 |

## 决定

选 **方案 A**，因为：
1. **更新后删除安装包的第一性原理**：Android 应用原地覆盖安装自己时，系统包安装器会强杀当前旧进程；只有当用户打开**新版本应用**时，应用代码才能再次运行。因此在 `NativeMediaPlugin.load()`（与 `AgDR-0033` 清理 `wotagei_export_*.mp4` 同处）扫描 `context.getCacheDir()` 删除所有 `wotagei_update_*.apk`，是唯一能在“安装完成 → 启动新版”后 100% 确定删掉刚才那个安装包的可靠时机；再叠加“新下载前清理”与“安装页面取消/失败返回时在 `@ActivityCallback` 中清理”，覆盖全部成功与失败分支。
2. **避开公共目录权限泥潭与 WebView CORS 限制**：`cacheDir` 属于应用私有空间，且 `file_paths.xml` 已通过 `<cache-path name="my_cache_images" path="." />` 暴露给 `FileProvider`；同时由原生 Java 请求 GitHub Releases API 与下载二进制流（显式携带 `User-Agent` 并循环处理 `301/302/303/307/308` 至 `objects.githubusercontent.com`），绕开老旧 Android WebView 的 TLS/CORS 隐患。
3. **Android 6.0 ~ 15 安装兼容性**：API 26+ 校验 `PackageManager.canRequestPackageInstalls()`，未授权时引导至 `Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES` 并在授权返回回调中无缝续接安装；API 24+ 使用 `FileProvider` + `FLAG_GRANT_READ_URI_PERMISSION`；API 23 设置文件可读后以 `file://` URI 拉起安装，全版本覆写安装无崩溃。

## 代价

- 我们接受：`AndroidManifest.xml` 声明 `REQUEST_INSTALL_PACKAGES` 权限（本项目面向 GitHub Releases 直接分发 APK，不上架 Google Play）；
- 我们接受：安装器返回前若用户在系统安装界面直接按 Home 键划掉安装器，临时 APK 会保留至下次冷启动或下次检查更新时被 `load()` 清扫；
- 后面要还的债：需保证每次发布新版本时同步更新 `package.json` 的 `version` 与 `android/app/build.gradle` 的 `versionName`，使前后端版本号保持单一真实源一致；且签名密钥需一致才能覆盖安装（Debug 包仅能覆盖同签名的 Debug 包，Release 包同理）。

## 什么情况下需要重新讨论

- 如果未来项目计划上架 Google Play 商店（受 `REQUEST_INSTALL_PACKAGES` 审核限制），届时需将端内下载安装分支拆为 Play 渠道禁用（改由商店更新）而仅在 GitHub 独立分发包中保留。
