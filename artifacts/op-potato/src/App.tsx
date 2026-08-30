import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { SplashScreen as NativeSplashScreen } from "@capacitor/splash-screen";
import OpPotatoGame from "@/game/OpPotatoGame";
import { ADS_ENABLED, initializeAdMobBanner, supportsAdMobBanner } from "@/adMob";

function App() {
  const adsEnabled = supportsAdMobBanner();

  useEffect(() => {
    if (Capacitor.getPlatform() !== "ios") return;

    let animationFrame = 0;
    const hideNativeSplash = () => {
      animationFrame = window.requestAnimationFrame(() => {
        void NativeSplashScreen.hide({ fadeOutDuration: 200 });
      });
    };

    if (document.readyState === "complete") hideNativeSplash();
    else window.addEventListener("load", hideNativeSplash, { once: true });

    return () => {
      window.removeEventListener("load", hideNativeSplash);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  useEffect(() => {
    if (!ADS_ENABLED) return;

    let disposed = false;
    let cleanup: (() => Promise<void>) | undefined;

    void initializeAdMobBanner().then((removeBanner) => {
      if (disposed) void removeBanner();
      else cleanup = removeBanner;
    });

    return () => {
      disposed = true;
      if (cleanup) void cleanup();
    };
  }, []);

  return <OpPotatoGame adsEnabled={adsEnabled} />;
}

export default App;
