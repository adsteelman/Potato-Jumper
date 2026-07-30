import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import {
  AdMob,
  BannerAdPluginEvents,
  BannerAdPosition,
  BannerAdSize,
  type AdMobError,
} from "@capacitor-community/admob";
import { markRuntimeActivity, noteRuntimeActivity } from "@/runtimeDiagnostics";

const IOS_TEST_BANNER_ID = "ca-app-pub-3940256099942544/2435281174";
const ANDROID_TEST_BANNER_ID = "ca-app-pub-3940256099942544/6300978111";
const TEMP_DISABLE_ADMOB_FOR_DIAGNOSTICS = true;

function isSupportedNativePlatform(platform: string): platform is "ios" | "android" {
  return Capacitor.isNativePlatform() && (platform === "ios" || platform === "android");
}

export async function initializeAdMobBanner(): Promise<() => Promise<void>> {
  if (TEMP_DISABLE_ADMOB_FOR_DIAGNOSTICS) {
    console.info("[TEMP ADMOB DISABLED]");
    return async () => {};
  }

  const platform = Capacitor.getPlatform();
  if (!isSupportedNativePlatform(platform)) return async () => {};

  const listeners: PluginListenerHandle[] = [];

  try {
    markRuntimeActivity("admob", true, "initialize.begin", { platform });
    await AdMob.initialize({ initializeForTesting: true });
    markRuntimeActivity("admob", false, "initialize.resolved", { platform });

    listeners.push(
      await AdMob.addListener(BannerAdPluginEvents.Loaded, () => {
        noteRuntimeActivity("admob", "banner.loaded");
      }),
      await AdMob.addListener(BannerAdPluginEvents.FailedToLoad, (error: AdMobError) => {
        noteRuntimeActivity("admob", "banner.failedToLoad", error);
        console.error("[AdMob] Banner failed to load", error);
      }),
      await AdMob.addListener(BannerAdPluginEvents.AdImpression, () => {
        noteRuntimeActivity("admob", "banner.impression");
      }),
    );

    markRuntimeActivity("admob", true, "showBanner.begin");
    await AdMob.showBanner({
      adId: platform === "ios" ? IOS_TEST_BANNER_ID : ANDROID_TEST_BANNER_ID,
      adSize: BannerAdSize.BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      margin: 0,
      isTesting: true,
    });
    markRuntimeActivity("admob", false, "showBanner.resolved");
  } catch (error: unknown) {
    noteRuntimeActivity("admob", "initializeOrShow.failed", error);
    markRuntimeActivity("admob", false, "initializeOrShow.finishedAfterFailure");
    console.error("[AdMob] Initialization failed", error);
  }

  return async () => {
    markRuntimeActivity("admob", true, "cleanup.begin");
    await Promise.allSettled(listeners.map((listener) => listener.remove()));
    try {
      await AdMob.removeBanner();
      markRuntimeActivity("admob", false, "cleanup.resolved");
    } catch (error: unknown) {
      noteRuntimeActivity("admob", "cleanup.failed", error);
      markRuntimeActivity("admob", false, "cleanup.finishedAfterFailure");
      console.error("[AdMob] Banner cleanup failed", error);
    }
  };
}

export function supportsAdMobBanner(): boolean {
  return isSupportedNativePlatform(Capacitor.getPlatform());
}
