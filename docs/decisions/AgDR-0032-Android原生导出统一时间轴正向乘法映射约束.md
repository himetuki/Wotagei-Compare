---
id: AgDR-0032
date: 2026-11-13
status: executed
---

# Android 原生导出统一时间轴正向乘法映射约束

> 在【Android 原生离线导出管线 `NativeOfflineExporter` 将统一时间轴偏移 `tau` 换算为源视频时间戳 `sourceTime` 时误写为 `anchorTime + tau / rate`，导致非 `1.0` BPM 对齐倍率下出现反向变速与音画漂移】的处境下，面对【直接修复原生乘法公式并保留各自简单独立计算，还是把帧时间戳逐帧列表从前端传给原生】的取舍，我决定【保持前端只传 `(anchorTime, rate)` 的轻量化契约，修正 `NativeOfflineExporter.mapTauToSourceTime` 为与 `src/core/timeline.ts` 完全一致的正向乘法 `anchorTime + tau * rate`，并在双端校验脚本中覆盖非 `1.0` 速率比验收用例】，以达成【零额外跨桥数据开销、恢复双侧视频与单侧原声的精确倍速对齐，并阻止未来同源公式静默漂移】的目标，并接受【在两端各维护一行显式标明方向约定的映射公式】的代价。

## 考虑过的方案

| 方案 | 好处 | 代价 |
| --- | --- | --- |
| 方案 A：由前端预先算好每一帧的 `(t1, t2)` 数组通过 JSON 传给原生 | 原生侧无需了解 `anchorTime + tau * rate` 公式 | 慢放长视频会生成上万帧时间戳数组；音频按采样点重采样依然需要连续公式，无法靠帧时间戳数组解决 |
| 方案 B（本方案）：保留纯参数传递契约，修复 `NativeOfflineExporter.mapTauToSourceTime` 为 `anchorTime + tau * rate`，并补充非 `1.0` 速率比校验 | 跨桥 JSON 保持 `< 1KB`；同时修复视频初始寻道、视频逐帧解码与单侧原声重采样共 6 处调用；改动极简无冗余抽象 | 前端 `timeline.ts` 与原生 `NativeOfflineExporter.java` 各自保留该一行公式（通过校验用例保障一致性） |

## 决定

选 **方案 B**，因为统一时间轴的核心契约是 `tau = (sourceTime - anchorTime) / rate`（即当某视频原始 BPM 较慢时，需以高于 `1.0` 的相对速率 `rate = targetBpm / videoBpm` 追赶对齐，因此统一时间 `tau` 每推进 1 秒，源视频时间推进 `rate` 秒）。反解必须为乘法 `sourceTime = anchorTime + tau * rate`。在前端与原生侧仅需保持这一数学定义完全同构，并在原生侧与 `exporter.verify.ts` 中加入非 `1.0` 速率比验证即可根除问题。

## 代价

- 我们接受：前端 `src/core/timeline.ts` 与原生 `NativeOfflineExporter.java` 各自保留这一行时间映射公式。
- 我们放弃：由前端序列化逐帧时间戳列表驱动原生的重传输方案。
- 后面要还的债：无额外架构债务；后续若调整统一时间轴定义，需同步调整前端与原生映射函数及对应检验脚本。

## 什么情况下需要重新讨论

- 如果未来统一时间轴引入非线性变速曲线（而非恒定 `rate` 倍率），则需重新讨论由前端统一采样生成时间查找表还是原生同步实现曲线求值。
