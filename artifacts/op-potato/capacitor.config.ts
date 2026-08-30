import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.steelmancreative.oppotato',
  appName: 'Op Potato',
  webDir: 'dist/public',
  ios: {
    // Ads are disabled for 1.0; omit the native AdMob SDK from the iOS target.
    includePlugins: [],
  },
};

export default config;
