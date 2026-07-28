import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import {
  AdMob,
  BannerAdPluginEvents,
  BannerAdPosition,
  BannerAdSize,
  type AdMobError,
} from "@capacitor-community/admob";

const IOS_TEST_BANNER_ID = "ca-app-pub-3940256099942544/2435281174";
const ANDROID_TEST_BANNER_ID = "ca-app-pub-3940256099942544/6300978111";

function isSupportedNativePlatform(platform: string): platform is "ios" | "android" {
  return Capacitor.isNativePlatform() && (platform === "ios" || platform === "android");
}

export async function initializeAdMobBanner(): Promise<() => Promise<void>> {
  const platform = Capacitor.getPlatform();
  if (!isSupportedNativePlatform(platform)) return async () => {};

  const listeners: PluginListenerHandle[] = [];

  try {
    await AdMob.initialize({ initializeForTesting: true });

    listeners.push(
      await AdMob.addListener(BannerAdPluginEvents.FailedToLoad, (error: AdMobError) => {
        console.error("[AdMob] Banner failed to load", error);
      }),
    );

    await AdMob.showBanner({
      adId: platform === "ios" ? IOS_TEST_BANNER_ID : ANDROID_TEST_BANNER_ID,
      adSize: BannerAdSize.BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      margin: 0,
      isTesting: true,
    });
  } catch (error: unknown) {
    console.error("[AdMob] Initialization failed", error);
  }

  return async () => {
    await Promise.allSettled(listeners.map((listener) => listener.remove()));
    try {
      await AdMob.removeBanner();
    } catch (error: unknown) {
      console.error("[AdMob] Banner cleanup failed", error);
    }
  };
}

export function supportsAdMobBanner(): boolean {
  return isSupportedNativePlatform(Capacitor.getPlatform());
}
