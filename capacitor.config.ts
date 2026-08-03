import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ink.kuke.chat',
  appName: 'KukeChat',
  webDir: 'dist-mobile',
  bundledWebRuntime: false,
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_kukechat',
      iconColor: '#168BFF',
      sound: 'default'
    },
    Keyboard: {
      resize: 'none',
      resizeOnFullScreen: false
    }
  },
  android: {
    backgroundColor: '#11161f',
    allowMixedContent: true
  }
};

export default config;
