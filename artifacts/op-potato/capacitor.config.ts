/// <reference types="@capacitor/splash-screen" />

import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.steelmancreative.oppotato',
  appName: 'Op Potato',
  webDir: 'dist/public',
  ios: {
    includePlugins: ['@capacitor/splash-screen', '@capacitor-community/admob'],
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      showSpinner: false,
      backgroundColor: '#87CEEB',
    },
  },
};

export default config;
