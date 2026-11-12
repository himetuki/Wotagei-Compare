/**
 * 节拍器状态机、锚点同相锁相与循环自愈离线校验脚本
 */

import {
  isDownbeatIndex,
  calculateBeatIndex,
  calculateInitialLastBeatIndex,
  SynthesizedMetronome,
} from './metronome.ts';

console.log('=== 1. 验证小节重拍全域无符号同余判定 (isDownbeatIndex) ===');

const downbeatCases = [-12, -8, -4, 0, 4, 8, 12];
const upbeatCases = [-7, -6, -5, -3, -2, -1, 1, 2, 3, 5, 6, 7];

for (const k of downbeatCases) {
  if (!isDownbeatIndex(k)) {
    throw new Error(`拍号 ${k} 期望为重拍 (Downbeat)，但判定为 false!`);
  }
}
for (const k of upbeatCases) {
  if (isDownbeatIndex(k)) {
    throw new Error(`拍号 ${k} 期望为弱拍 (Upbeat)，但判定为 true!`);
  }
}
console.log('✓ 负数、零与正数时间戳全域同余重拍判定验证全部通过');

console.log('=== 2. 验证锚点 (tau = 0) 及临界起播容差判定 ===');

const bpm = 120; // beatInterval = 0.5s

// (a) 在 tau = 0 (锚点) 处起播
const initAtZero = calculateInitialLastBeatIndex(0, bpm);
console.log('tau = 0 处初始化 lastBeatIndex:', initAtZero, '期望: -1');
if (initAtZero !== -1) {
  throw new Error(`tau = 0 处初始 lastBeatIndex 错误: 期望 -1, 实际 ${initAtZero}`);
}

// 第一帧 tau = 0.005 推进
const firstBeatAtZero = calculateBeatIndex(0.005, bpm);
if (firstBeatAtZero <= initAtZero) {
  throw new Error(`tau = 0.005 未能触发第 0 拍重拍!`);
}
console.log('✓ tau = 0 处起播立即触发第 0 拍重拍');

// (b) 在 tau = -0.01 (锚点前 10ms，属于容差内) 起播
const initNearZero = calculateInitialLastBeatIndex(-0.01, bpm);
if (initNearZero !== -1) {
  throw new Error(`tau = -0.01 处初始 lastBeatIndex 错误: 期望 -1, 实际 ${initNearZero}`);
}
console.log('✓ 锚点临近前夕起播容差吸附至第 0 拍');

// (c) 在两拍之间 tau = 0.25s 起播 (不应抢第 0 拍)
const initMidBeat = calculateInitialLastBeatIndex(0.25, bpm);
console.log('tau = 0.25 处初始化 lastBeatIndex:', initMidBeat, '期望: 0');
if (initMidBeat !== 0) {
  throw new Error(`tau = 0.25 处初始 lastBeatIndex 错误: 期望 0, 实际 ${initMidBeat}`);
}
const firstBeatAtMid = calculateBeatIndex(0.25, bpm);
if (firstBeatAtMid > initMidBeat) {
  throw new Error(`tau = 0.25 处发生了不当抢拍!`);
}
console.log('✓ 两拍之间起播平稳等待下一拍，无抢拍');

console.log('=== 3. 验证区间循环重放 (Loop/Replay) 自愈发声机制 ===');

const metronome = new SynthesizedMetronome();
// 模拟第一轮循环：从 tau = -2.0 播放到 tau = 3.0 (区间时长 5s)
metronome.reset(-2.0, bpm);

let triggersRound1 = 0;
const stepDt = 0.02; // 50fps 模拟帧步进
for (let t = -2.0; t <= 3.0; t += stepDt) {
  if (metronome.update(t, bpm, true)) {
    triggersRound1++;
  }
}
console.log(`第一轮循环触发拍数: ${triggersRound1} 拍`);
// 在 [-2.0, 3.0] 区间内，拍点为 -2.0, -1.5, -1.0, -0.5, 0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0，共 11 拍
if (triggersRound1 < 10) {
  throw new Error(`第一轮循环触发节拍过少: 实际 ${triggersRound1}`);
}

// 模拟视频到达终点 3.0s 后循环回绕跳回起点 -2.0s
console.log('模拟到达终点后回绕至 -2.0s...');
let triggersRound2 = 0;
// 注意：即使外部未显式调用 reset，内部也要自愈！
for (let t = -2.0; t <= 3.0; t += stepDt) {
  if (metronome.update(t, bpm, true)) {
    triggersRound2++;
  }
}
console.log(`第二轮循环自愈触发拍数: ${triggersRound2} 拍`);
if (triggersRound2 < 10) {
  throw new Error(`第二轮循环节拍器哑火失音! 实际仅触发 ${triggersRound2} 拍`);
}
console.log('✓ 循环重放无缝自愈发声验证通过，彻底告别第二轮哑音！');

console.log('=== 4. 验证反复快速向后 Seek 寻道自愈 ===');

// 推进到 2.0s
metronome.update(2.0, bpm, true);
// 突然向后拉动到 0.0s (锚点)
const triggeredAtAnchor = metronome.update(0.0, bpm, true);
console.log('向后 Seek 到 0.0s 触发发声状态:', triggeredAtAnchor);
// 继续推进到 0.5s (第 1 拍)
const triggeredNextBeat = metronome.update(0.5, bpm, true);
if (!triggeredNextBeat) {
  throw new Error('向后 Seek 后下一拍未能正常发声！');
}
console.log('✓ 向后寻道与拖拽自愈发声全部正常！');

console.log('\n所有节拍器状态机、锚点锁相与自愈验证全部通过！');
