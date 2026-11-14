package com.wotagei.compare;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.file.Files;
import org.junit.Test;

/**
 * 验证临时导出文件启动清扫与未消费音频载荷覆盖清理逻辑
 */
public class ResourceCleanupTest {
    @Test
    public void cleanupStaleExportTempFiles_deletesOnlyMatchingExportFiles() throws Exception {
        File dir = Files.createTempDirectory("wotagei_cache_test").toFile();
        File stale1 = new File(dir, "wotagei_export_1700000000000.mp4");
        File stale2 = new File(dir, "wotagei_export_1700000001111.mp4");
        File keepFile = new File(dir, "other_cache.dat");
        assertTrue(stale1.createNewFile());
        assertTrue(stale2.createNewFile());
        assertTrue(keepFile.createNewFile());

        try {
            NativeMediaPlugin.cleanupStaleExportTempFiles(dir);
            assertFalse(stale1.exists());
            assertFalse(stale2.exists());
            assertTrue(keepFile.exists());
        } finally {
            //noinspection ResultOfMethodCallIgnored
            keepFile.delete();
            //noinspection ResultOfMethodCallIgnored
            dir.delete();
        }
    }

    @Test
    public void registerAudioPcm_overwritesUnconsumedPayloadForSameOwner() throws Exception {
        LocalRangeProxyServer server = new LocalRangeProxyServer(null);
        try {
            String url1 = server.registerAudioPcm("content://video/1", new byte[] {1, 2, 3, 4}, 16000, 1.0);
            String url2 = server.registerAudioPcm("content://video/1", new byte[] {5, 6, 7, 8}, 16000, 1.0);

            HttpURLConnection conn1 = (HttpURLConnection) new URL(url1).openConnection();
            assertEquals(404, conn1.getResponseCode());
            conn1.disconnect();

            HttpURLConnection conn2 = (HttpURLConnection) new URL(url2).openConnection();
            assertEquals(200, conn2.getResponseCode());
            conn2.disconnect();

            // 消费一次后再次读取应释放为 404
            HttpURLConnection conn2Again = (HttpURLConnection) new URL(url2).openConnection();
            assertEquals(404, conn2Again.getResponseCode());
            conn2Again.disconnect();
        } finally {
            server.shutdown();
        }
    }
}
