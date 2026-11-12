/**
 * 全局步骤流转契约
 */

/** 全局步骤标识 */
export type WizardStep =
  | 'import' // 导入两路视频
  | 'geometry-video1' // CH1 空间标定
  | 'geometry-video2' // CH2 空间标定
  | 'audio-video1' // CH1 时间标定
  | 'audio-video2' // CH2 时间标定
  | 'workbench' // 对比台
  | 'export'; // 导出片段
