/**
 * 全局步骤流转契约
 */

/** 全局步骤标识 */
export type WizardStep =
  | 'import' // 01 导入两路视频
  | 'geometry-video1' // 02 视频 1 空间标定
  | 'geometry-video2' // 03 视频 2 空间标定
  | 'audio-video1' // 04 视频 1 对拍标定
  | 'audio-video2' // 05 视频 2 对拍与 BPM 策略
  | 'workbench'; // 06 同台对比工作台
