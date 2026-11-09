import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.wotagei.compare',
  appName: 'Wotagei-Compare',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    ScreenOrientation: {
      // 默认屏幕方向偏好
    },
  },
};

export default config;
