import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import {
  AdMob,
  AdmobConsentStatus,
  BannerAdPluginEvents,
  BannerAdPosition,
  BannerAdSize,
  type AdMobError,
} from "@capacitor-community/admob";

// Keep the integration behind one switch so ads can be disabled without
// removing the native configuration.
export const ADS_ENABLED = true;

const IOS_BANNER_ID = "ca-app-pub-4194610760979195/5322171480";
const ANDROID_TEST_BANNER_ID = "ca-app-pub-3940256099942544/6300978111";

function isSupportedNativePlatform(platform: string): platform is "ios" | "android" {
  return Capacitor.isNativePlatform() && (platform === "ios" || platform === "android");
}

export async function initializeAdMobBanner(): Promise<() => Promise<void>> {
  const platform = Capacitor.getPlatform();
  if (!ADS_ENABLED || !isSupportedNativePlatform(platform)) return async () => {};

  const listeners: PluginListenerHandle[] = [];

  try {
    await AdMob.initialize({ initializeForTesting: false });

    let canRequestBanner = true;
    if (platform === "ios") {
      try {
        let consentInfo = await AdMob.requestConsentInfo();
        if (consentInfo.status === AdmobConsentStatus.REQUIRED && consentInfo.isConsentFormAvailable) {
          consentInfo = await AdMob.showConsentForm();
        }
        canRequestBanner = consentInfo.canRequestAds;
      } catch (error: unknown) {
        canRequestBanner = false;
        console.error("[AdMob] Consent handling failed; banner disabled for this launch", error);
      }
    }

    if (!canRequestBanner) return async () => {};

    listeners.push(
      await AdMob.addListener(BannerAdPluginEvents.FailedToLoad, (error: AdMobError) => {
        console.error("[AdMob] Banner failed to load", error);
      }),
    );

    await AdMob.showBanner({
      adId: platform === "ios" ? IOS_BANNER_ID : ANDROID_TEST_BANNER_ID,
      adSize: BannerAdSize.BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      margin: 0,
      isTesting: platform !== "ios",
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
  return ADS_ENABLED && isSupportedNativePlatform(Capacitor.getPlatform());
}
