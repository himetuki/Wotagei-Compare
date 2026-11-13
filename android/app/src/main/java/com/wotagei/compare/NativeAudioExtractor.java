package com.wotagei.compare;

import android.content.Context;
import android.media.AudioFormat;
import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.net.Uri;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;

/**
 * 原生流式音频解码与降采样提取器
 * 通过 MediaExtractor + MediaCodec 逐帧解码并实时混单声道降采样至 16kHz Int16，
 * 避免在 WebView 内存中加载整部高清视频，彻底突破 80MB 大视频音频解析限制。
 */
public class NativeAudioExtractor {
    public static final int TARGET_SAMPLE_RATE = 16000;
    private static final int MAX_OUT_SAMPLES = TARGET_SAMPLE_RATE * 600; // 安全上限 10 分钟

    public static class ExtractionResult {
        public final boolean hasAudio;
        public final int sampleRate;
        public final double durationSec;
        public final byte[] pcmInt16Le;

        public ExtractionResult(boolean hasAudio, int sampleRate, double durationSec, byte[] pcmInt16Le) {
            this.hasAudio = hasAudio;
            this.sampleRate = sampleRate;
            this.durationSec = durationSec;
            this.pcmInt16Le = pcmInt16Le;
        }
    }

    /**
     * 从任意大小视频 URI 流式提取 16kHz 单声道 Int16 小端 PCM
     */
    public static ExtractionResult extractMonoPcm(Context context, Uri uri) {
        MediaExtractor extractor = new MediaExtractor();
        MediaCodec decoder = null;
        try {
            extractor.setDataSource(context, uri, null);

            int audioTrackIdx = -1;
            MediaFormat audioFormat = null;
            int trackCount = extractor.getTrackCount();
            for (int i = 0; i < trackCount; i++) {
                MediaFormat fmt = extractor.getTrackFormat(i);
                String mime = fmt.getString(MediaFormat.KEY_MIME);
                if (mime != null && mime.startsWith("audio/")) {
                    audioTrackIdx = i;
                    audioFormat = fmt;
                    break;
                }
            }

            if (audioTrackIdx < 0 || audioFormat == null) {
                return new ExtractionResult(false, TARGET_SAMPLE_RATE, 0.0, new byte[0]);
            }

            extractor.selectTrack(audioTrackIdx);
            String mime = audioFormat.getString(MediaFormat.KEY_MIME);
            if (mime == null) {
                return new ExtractionResult(false, TARGET_SAMPLE_RATE, 0.0, new byte[0]);
            }

            double durationSec = 0.0;
            if (audioFormat.containsKey(MediaFormat.KEY_DURATION)) {
                durationSec = audioFormat.getLong(MediaFormat.KEY_DURATION) / 1_000_000.0;
            }

            int srcSampleRate = audioFormat.containsKey(MediaFormat.KEY_SAMPLE_RATE)
                ? audioFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE)
                : 44100;
            int srcChannels = audioFormat.containsKey(MediaFormat.KEY_CHANNEL_COUNT)
                ? audioFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
                : 1;
            boolean isFloatPcm = false;
            if (audioFormat.containsKey("pcm-encoding")) {
                isFloatPcm = audioFormat.getInteger("pcm-encoding") == AudioFormat.ENCODING_PCM_FLOAT;
            }

            decoder = MediaCodec.createDecoderByType(mime);
            decoder.configure(audioFormat, null, null, 0);
            decoder.start();

            ByteArrayOutputStream outBytes = new ByteArrayOutputStream(262144);
            MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();

            boolean inputDone = false;
            boolean outputDone = false;
            int outSamplesCount = 0;
            double srcPos = 0.0;
            double lastMonoSample = 0.0;
            boolean hasPrevSample = false;

            while (!outputDone && outSamplesCount < MAX_OUT_SAMPLES) {
                // 1. 喂入压缩音频包
                if (!inputDone) {
                    int inIdx = decoder.dequeueInputBuffer(10000);
                    if (inIdx >= 0) {
                        ByteBuffer inBuf = decoder.getInputBuffer(inIdx);
                        if (inBuf != null) {
                            int sampleSize = extractor.readSampleData(inBuf, 0);
                            if (sampleSize < 0) {
                                decoder.queueInputBuffer(
                                    inIdx, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM
                                );
                                inputDone = true;
                            } else {
                                long pts = extractor.getSampleTime();
                                decoder.queueInputBuffer(inIdx, 0, sampleSize, pts, 0);
                                extractor.advance();
                            }
                        }
                    }
                }

                // 2. 取出解码后 PCM 并流式降采样至 16kHz 单声道 Int16
                int outIdx = decoder.dequeueOutputBuffer(info, 10000);
                if (outIdx >= 0) {
                    if ((info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) {
                        outputDone = true;
                    }

                    ByteBuffer outBuf = decoder.getOutputBuffer(outIdx);
                    if (outBuf != null && info.size > 0) {
                        outBuf.position(info.offset);
                        outBuf.limit(info.offset + info.size);
                        ByteBuffer leBuf = outBuf.slice().order(ByteOrder.LITTLE_ENDIAN);

                        int bytesPerSample = isFloatPcm ? 4 : 2;
                        int frameBytes = bytesPerSample * Math.max(1, srcChannels);
                        int frameCount = info.size / frameBytes;
                        double step = (double) srcSampleRate / (double) TARGET_SAMPLE_RATE;

                        for (int f = 0; f < frameCount; f++) {
                            double monoSum = 0.0;
                            for (int c = 0; c < srcChannels; c++) {
                                if (isFloatPcm) {
                                    monoSum += leBuf.getFloat();
                                } else {
                                    monoSum += leBuf.getShort() / 32768.0;
                                }
                            }
                            double curMono = monoSum / Math.max(1, srcChannels);

                            if (!hasPrevSample) {
                                lastMonoSample = curMono;
                                hasPrevSample = true;
                            }

                            // 线性插值降采样输出至 TARGET_SAMPLE_RATE
                            while (srcPos < 1.0 && outSamplesCount < MAX_OUT_SAMPLES) {
                                double interp = lastMonoSample + (curMono - lastMonoSample) * srcPos;
                                int sVal = (int) Math.round(Math.max(-1.0, Math.min(1.0, interp)) * 32767.0);
                                outBytes.write(sVal & 0xff);
                                outBytes.write((sVal >> 8) & 0xff);
                                outSamplesCount++;
                                srcPos += step;
                            }
                            srcPos -= 1.0;
                            lastMonoSample = curMono;
                        }
                    }
                    decoder.releaseOutputBuffer(outIdx, false);
                } else if (outIdx == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                    MediaFormat outFmt = decoder.getOutputFormat();
                    if (outFmt.containsKey(MediaFormat.KEY_SAMPLE_RATE)) {
                        srcSampleRate = outFmt.getInteger(MediaFormat.KEY_SAMPLE_RATE);
                    }
                    if (outFmt.containsKey(MediaFormat.KEY_CHANNEL_COUNT)) {
                        srcChannels = outFmt.getInteger(MediaFormat.KEY_CHANNEL_COUNT);
                    }
                    if (outFmt.containsKey("pcm-encoding")) {
                        isFloatPcm = outFmt.getInteger("pcm-encoding") == AudioFormat.ENCODING_PCM_FLOAT;
                    }
                }
            }

            if (durationSec <= 0.0 && outSamplesCount > 0) {
                durationSec = (double) outSamplesCount / (double) TARGET_SAMPLE_RATE;
            }
            byte[] resultBytes = outBytes.toByteArray();
            return new ExtractionResult(resultBytes.length > 0, TARGET_SAMPLE_RATE, durationSec, resultBytes);
        } catch (Exception e) {
            return new ExtractionResult(false, TARGET_SAMPLE_RATE, 0.0, new byte[0]);
        } finally {
            if (decoder != null) {
                try {
                    decoder.stop();
                } catch (Exception ignored) {}
                try {
                    decoder.release();
                } catch (Exception ignored) {}
            }
            try {
                extractor.release();
            } catch (Exception ignored) {}
        }
    }
}
