/// <reference types="@capacitor/splash-screen" />

import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.steelmancreative.oppotato',
  appName: 'Op Potato',
  webDir: 'dist/public',
  ios: {
    // Ads are disabled for 1.0; include only the launch handoff plugin.
    includePlugins: ['@capacitor/splash-screen'],
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
