# Spec Delta

## MODIFIED Requirements

### Requirement: Android 原生全机型 GPU 零拷贝离线 MP4 导出
在 Android 原生平台上（API 23+），无论系统 WebView 内核版本新旧（含缺少 WebCodecs 的 Chrome 70~93），系统 MUST 统一通过原生硬件解码与 GPU 离线编码管线输出标准 `.mp4` 文件。前端与原生层之间 MUST 仅传递纯 JSON 布局、时间轴及音频合成参数，严禁跨桥传输视频帧像素、大体积 Base64 或全量 PCM 数组；原生层在慢放重复帧区间 MUST 直接复用 GPU 纹理并递增展示时间戳（PTS），使老版本手机也能以显著快于实时回放的速度完成导出；当双通道存在非 `1.0` 的 BPM 对齐速率比（`rate1 != 1` 或 `rate2 != 1`）时，原生层解码视频帧与提取单侧原声 MUST 严格按统一时间轴正向乘法公式 `sourceTime = anchorTime + tau * rate` 换算源视频时间戳，保证导出成片中两侧视频倍速与工作台预览完全对齐。

#### Scenario: Chrome 74 老版本 Android 10 设备离线高速导出 MP4
- **WHEN** 用户在无 `VideoEncoder` 的 Android 10（Chrome 74 WebView）上截取任意有效 A-B 区间（如 0.2x 慢放 6 秒原片得到 30 秒成片）并点击「开始渲染导出」
- **THEN** 系统无需实时等待 30 秒录制回放，进度稳定推进至 100%，最终生成非空且可正常播放的标准 `.mp4` 文件并写入系统相册，全程不出现兼容模式 `.webm` 实时录制提示

#### Scenario: 老版本设备导出页面标签与能力一致性
- **WHEN** 用户在 Android 原生设备上进入「导出片段」页面
- **THEN** 顶部规格徽章展示标准 `.mp4` 输出参数，不展示「兼容模式将实时录制导出 WebM」提示

#### Scenario: 双通道 BPM 不同并开启对齐时原生导出倍速严格对齐
- **WHEN** CH1 与 CH2 原始 BPM 不同（例如 CH1 为 160 BPM、CH2 为 140 BPM），用户在对比台选择「随 CH1」「随 CH2」或「手动」BPM 对齐策略（使至少一侧速率比 `rate != 1.0`），并在 Android 原生设备执行离线导出（含原声或节拍器音轨）
- **THEN** 原生导出成片中的左右两侧动作节奏在全片起止区间内严格同频对齐，CH2（或变速侧）实际推进速率等于 `rate * slowMotionRate`，不存在反向变速或首尾漂移，且所选单侧原声与该侧画面保持同步
