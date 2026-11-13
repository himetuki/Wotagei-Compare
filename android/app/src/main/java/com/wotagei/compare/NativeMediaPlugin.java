package com.wotagei.compare;

import android.Manifest;
import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.os.Build;
import android.provider.OpenableColumns;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * 原生媒体选择、本地流式代理与 GPU 离线导出插件入口
 */
@CapacitorPlugin(
    name = "NativeMedia",
    permissions = {
        @Permission(
            alias = "storage",
            strings = {Manifest.permission.WRITE_EXTERNAL_STORAGE}
        )
    }
)
public class NativeMediaPlugin extends Plugin {
    private LocalRangeProxyServer proxyServer;
    private final ExecutorService audioExecutor = Executors.newSingleThreadExecutor();
    private final ExecutorService exportExecutor = Executors.newSingleThreadExecutor();
    private final AtomicBoolean exportCancelFlag = new AtomicBoolean(false);

    @Override
    public void load() {
        proxyServer = new LocalRangeProxyServer(getContext());
    }

    @Override
    protected void handleOnDestroy() {
        exportCancelFlag.set(true);
        audioExecutor.shutdownNow();
        exportExecutor.shutdownNow();
        if (proxyServer != null) {
            proxyServer.shutdown();
            proxyServer = null;
        }
        super.handleOnDestroy();
    }

    /**
     * 拉起系统原生文档/视频选择器，获取持久化 content:// URI、流式播放地址及媒体元信息
     */
    @PluginMethod
    public void pickVideo(PluginCall call) {
        int channel = call.getInt("channel", 1);
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("video/*");
        intent.addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
        );
        startActivityForResult(call, intent, "handlePickVideoResult");
    }

    @ActivityCallback
    private void handlePickVideoResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            JSObject canceled = new JSObject();
            canceled.put("canceled", true);
            call.resolve(canceled);
            return;
        }

        Uri uri = result.getData().getData();
        if (uri == null) {
            call.reject("未获取到有效视频 URI");
            return;
        }

        int channel = call.getInt("channel", 1);
        ContentResolver resolver = getContext().getContentResolver();

        try {
            int takeFlags = result.getData().getFlags() & Intent.FLAG_GRANT_READ_URI_PERMISSION;
            if (takeFlags == 0) {
                takeFlags = Intent.FLAG_GRANT_READ_URI_PERMISSION;
            }
            resolver.takePersistableUriPermission(uri, takeFlags);
        } catch (Exception ignored) {
            // 部分第三方 Provider 不支持持久化授权，会话内临时读取授权依然有效
        }

        try {
            if (proxyServer == null) {
                proxyServer = new LocalRangeProxyServer(getContext());
            }
            String streamUrl = proxyServer.registerChannelUri(channel, uri);

            String name = "video_" + channel + ".mp4";
            long size = 0;
            try (Cursor cursor = resolver.query(
                uri,
                new String[] {OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE},
                null,
                null,
                null
            )) {
                if (cursor != null && cursor.moveToFirst()) {
                    int nameIdx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                    int sizeIdx = cursor.getColumnIndex(OpenableColumns.SIZE);
                    if (nameIdx >= 0 && !cursor.isNull(nameIdx)) {
                        name = cursor.getString(nameIdx);
                    }
                    if (sizeIdx >= 0 && !cursor.isNull(sizeIdx)) {
                        size = cursor.getLong(sizeIdx);
                    }
                }
            } catch (Exception ignored) {}

            int width = 1920;
            int height = 1080;
            double duration = 10.0;

            MediaMetadataRetriever retriever = new MediaMetadataRetriever();
            try {
                retriever.setDataSource(getContext(), uri);
                String wStr = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH);
                String hStr = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT);
                String rotStr = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION);
                String durStr = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);

                int rawW = wStr != null ? Integer.parseInt(wStr) : 1920;
                int rawH = hStr != null ? Integer.parseInt(hStr) : 1080;
                int rot = rotStr != null ? Integer.parseInt(rotStr) : 0;

                if (rot == 90 || rot == 270) {
                    width = rawH;
                    height = rawW;
                } else {
                    width = rawW;
                    height = rawH;
                }

                if (durStr != null) {
                    long durMs = Long.parseLong(durStr);
                    if (durMs > 0) {
                        duration = durMs / 1000.0;
                    }
                }
            } catch (Exception ignored) {
                // 元数据解析失败时回退标准默认参数
            } finally {
                try {
                    retriever.release();
                } catch (Exception ignored) {}
            }

            JSObject res = new JSObject();
            res.put("canceled", false);
            res.put("uri", uri.toString());
            res.put("streamUrl", streamUrl);
            res.put("name", name);
            res.put("size", size);
            res.put("width", width);
            res.put("height", height);
            res.put("duration", duration);
            call.resolve(res);
        } catch (Exception e) {
            call.reject("原生视频载入失败: " + e.getMessage(), e);
        }
    }

    /**
     * 在后台线程流式提取降采样单声道 Int16 PCM 并通过本地代理 URL 零拷贝传回前端
     */
    @PluginMethod
    public void extractAudioAnalysis(PluginCall call) {
        String uriStr = call.getString("uri");
        if (uriStr == null || uriStr.isEmpty()) {
            call.reject("缺少 uri 参数");
            return;
        }
        Uri uri = Uri.parse(uriStr);
        audioExecutor.execute(() -> {
            try {
                NativeAudioExtractor.ExtractionResult ext =
                    NativeAudioExtractor.extractMonoPcm(getContext(), uri);

                JSObject res = new JSObject();
                res.put("hasAudio", ext.hasAudio);
                res.put("sampleRate", ext.sampleRate);
                res.put("duration", ext.durationSec);
                if (ext.hasAudio && ext.pcmInt16Le.length > 0) {
                    if (proxyServer == null) {
                        proxyServer = new LocalRangeProxyServer(getContext());
                    }
                    String pcmUrl = proxyServer.registerAudioPcm(
                        ext.pcmInt16Le,
                        ext.sampleRate,
                        ext.durationSec
                    );
                    res.put("pcmUrl", pcmUrl);
                }
                call.resolve(res);
            } catch (Exception e) {
                call.reject("原生音频解析失败: " + e.getMessage(), e);
            }
        });
    }

    /**
     * 启动 GPU 零拷贝离线硬件导出 MP4（Android 6~9 自动先请求公开目录存储权限）
     */
    @PluginMethod
    public void exportVideo(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
            && getPermissionState("storage") != PermissionState.GRANTED) {
            requestPermissionForAlias("storage", call, "storagePermissionCallback");
            return;
        }
        startExportTask(call);
    }

    @PermissionCallback
    private void storagePermissionCallback(PluginCall call) {
        // 即使被拒绝，saveToPublicMovies 仍可回退到应用私有目录完成保存
        startExportTask(call);
    }

    @PluginMethod
    public void cancelExport(PluginCall call) {
        exportCancelFlag.set(true);
        call.resolve();
    }

    private void startExportTask(PluginCall call) {
        JSObject v1Obj = call.getObject("video1");
        JSObject v2Obj = call.getObject("video2");
        if (v1Obj == null || v2Obj == null) {
            call.reject("缺少导出视频布局配置");
            return;
        }

        NativeOfflineExporter.ExportParams params = new NativeOfflineExporter.ExportParams();
        params.mode = call.getString("mode", "split-screen");
        params.width = call.getInt("width", 1280);
        params.height = call.getInt("height", 720);
        params.fps = call.getInt("fps", 30);
        params.exportStartTau = call.getDouble("exportStartTau", 0.0);
        params.exportEndTau = call.getDouble("exportEndTau", 1.0);
        params.slowMotionRate = call.getDouble("slowMotionRate", 1.0);
        params.effectiveBpm = call.getDouble("effectiveBpm", 160.0);
        params.soundSource = call.getString("soundSource", "metronome");

        params.uri1 = Uri.parse(v1Obj.getString("uri", ""));
        params.anchor1 = v1Obj.optDouble("anchorTime", 1.0);
        params.rate1 = v1Obj.optDouble("rate", 1.0);
        params.span1Start = v1Obj.optDouble("spanStart", -1000.0);
        params.span1End = v1Obj.optDouble("spanEnd", 1000.0);
        params.spec1 = parseLayerSpec(v1Obj);

        params.uri2 = Uri.parse(v2Obj.getString("uri", ""));
        params.anchor2 = v2Obj.optDouble("anchorTime", 1.0);
        params.rate2 = v2Obj.optDouble("rate", 1.0);
        params.span2Start = v2Obj.optDouble("spanStart", -1000.0);
        params.span2End = v2Obj.optDouble("spanEnd", 1000.0);
        params.spec2 = parseLayerSpec(v2Obj);

        exportCancelFlag.set(false);
        exportExecutor.execute(() -> {
            try {
                NativeOfflineExporter.ExportResult res = NativeOfflineExporter.export(
                    getContext(),
                    params,
                    exportCancelFlag,
                    (cur, total, pct, text) -> {
                        JSObject ev = new JSObject();
                        ev.put("currentFrame", cur);
                        ev.put("totalFrames", total);
                        ev.put("percent", pct);
                        ev.put("statusText", text);
                        notifyListeners("exportProgress", ev);
                    }
                );

                JSObject out = new JSObject();
                out.put("savedPath", res.savedPath);
                out.put("width", res.width);
                out.put("height", res.height);
                out.put("durationSec", res.durationSec);
                call.resolve(out);
            } catch (Exception e) {
                call.reject(e.getMessage() != null ? e.getMessage() : "原生导出失败", e);
            }
        });
    }

    private NativeGlRenderer.VideoLayerSpec parseLayerSpec(JSObject obj) {
        NativeGlRenderer.VideoLayerSpec spec = new NativeGlRenderer.VideoLayerSpec();
        spec.mirror = obj.optBoolean("mirror", false);
        spec.alpha = (float) obj.optDouble("alpha", 1.0);
        spec.clipRect = parseRect(obj.optJSONObject("clipRect"));
        spec.mainRect = parseRect(obj.optJSONObject("mainRect"));
        spec.bgRect = parseRect(obj.optJSONObject("bgRect"));
        spec.bgAlpha = (float) obj.optDouble("bgAlpha", 0.0);
        return spec;
    }

    private NativeGlRenderer.NormRect parseRect(org.json.JSONObject rectObj) {
        if (rectObj == null) return null;
        return new NativeGlRenderer.NormRect(
            (float) rectObj.optDouble("x", 0.0),
            (float) rectObj.optDouble("y", 0.0),
            (float) rectObj.optDouble("w", 1.0),
            (float) rectObj.optDouble("h", 1.0)
        );
    }
}
