import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.amisteelman.oppotato',
  appName: 'Op Potato',
  webDir: 'dist/public',
  server: {
    url: 'https://potato-jumper.pages.dev',
    cleartext: true
  }
};

export default config;
