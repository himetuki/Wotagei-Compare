/**
 * 全局步骤流转契约
 */

/** 全局步骤标识 */
export type WizardStep =
  | 'import' // 导入两路视频
  | 'calibrate-video1' // 视频1 标定（空间/时间）
  | 'calibrate-video2' // 视频2 标定（空间/时间）
  | 'workbench' // 对比台
  | 'export'; // 导出片段
