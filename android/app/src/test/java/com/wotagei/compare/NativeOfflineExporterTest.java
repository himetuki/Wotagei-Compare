package com.wotagei.compare;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

/**
 * 验证 Android 原生导出器统一时间轴正向乘法映射公式，防止与前端 timeline.ts 发生方向漂移
 */
public class NativeOfflineExporterTest {
    private static final double EPS = 1e-6;

    @Test
    public void mapTauToSourceTime_matchesUnifiedTimelineFormula() {
        // 等速 (rate = 1.0)
        assertEquals(2.5, NativeOfflineExporter.mapTauToSourceTime(1.5, 1.0, 1.0), EPS);

        // 加速追赶 (CH1=160, CH2=140, rate = 160/140)：tau 前进 1.4s，源视频应前进 1.6s
        double rateUp = 160.0 / 140.0;
        assertEquals(3.0 + 1.6, NativeOfflineExporter.mapTauToSourceTime(1.4, 3.0, rateUp), EPS);
        // 锚点前负区间 (-0.7s * rateUp = -0.8s)
        assertEquals(3.0 - 0.8, NativeOfflineExporter.mapTauToSourceTime(-0.7, 3.0, rateUp), EPS);

        // 减速对齐 (CH1=140, CH2=160, rate = 140/160)：tau 前进 1.6s，源视频应前进 1.4s
        double rateDown = 140.0 / 160.0;
        assertEquals(5.0 + 1.4, NativeOfflineExporter.mapTauToSourceTime(1.6, 5.0, rateDown), EPS);
        assertEquals(5.0 - 0.7, NativeOfflineExporter.mapTauToSourceTime(-0.8, 5.0, rateDown), EPS);
    }
}
