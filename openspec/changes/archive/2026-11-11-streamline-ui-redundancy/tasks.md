# Tasks

## 1. 顶栏去冗余与极简导航改造

- [x] 1.1 在 `src/App.tsx` 中将 6 步导航标签精简为「01 导入 / 02 空间1 / 03 空间2 / 04 对拍1 / 05 对拍2 / 06 对比台」，并彻底移除顶栏常驻的 `CH1/CH2 BPM` 重复徽章，通过 `npm run build` 验证构建。
- [x] 1.2 优化 `.top-nav` 弹性排布，确保在任何窄视口下最右侧「下一步」按钮始终完全露出且处于安全可点区域。

## 2. 音频对拍（AudioStep）控制区瘦身与单一真实源整合

- [x] 2.1 重构 `src/components/AudioStep.tsx` 底栏排布，移除对拍阶段冗余的平铺慢放倍速组，紧凑整合播放/逐帧、锚点微调以及「TAP + BPM加减输入」，确保控件总宽度大幅缩减，通过 `npm run build` 验证。
- [x] 2.2 优化 `AudioStep` 顶部子工具栏参数与波形画布自适应，确保通道名称与锚点时间码在窄视口下紧凑不换行。

## 3. 播放工作台（Workbench）收敛与紧凑排布

- [x] 3.1 优化 `src/components/Workbench.tsx` 次级工具栏中的声音源与镜像开关布局，采用紧凑分段标签，确保最右侧「导出片段」按钮完全可见，远离金刚键。
- [x] 3.2 紧凑化 `Workbench` 底栏慢放倍率与透明度滑块，确保右侧滑块与数值徽章在窄视口下不被截断。

## 4. 自动化移动端仿真验收与原生打包

- [x] 4.1 运行 `node scripts/sim-device.cjs` 自动化仿真测试，生成全流程真机视口截图，并通过 `read` 工具逐一审查，确认零溢出与零截断。
- [x] 4.2 执行 `npm run build` 与 `npx cap sync android`，并在 Windows 环境重新编译生成 debug APK，确认产物有效。

## Workflow follow-up

- 在实现阶段将 `docs/decisions/AgDR-0008-移动端横向视口紧凑重构与状态冗余全面清除.md` 状态从 `proposed` 更新为 `executed`。
- 实现验证通过后，运行 `openspec archive` 归档本次变更并将 delta specs 合并至主 specs。
