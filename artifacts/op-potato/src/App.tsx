import { useEffect } from "react";
import OpPotatoGame from "@/game/OpPotatoGame";
import { ADS_ENABLED, initializeAdMobBanner, supportsAdMobBanner } from "@/adMob";

function App() {
  const adsEnabled = supportsAdMobBanner();

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
