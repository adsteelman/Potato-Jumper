import { useState } from "react";

interface Props {
  onStart: () => void;
  onHelp: () => void;
  adBannerH: number;
}

export function SplashScreen({ onStart, onHelp, adBannerH }: Props) {
  const [fadingOut, setFadingOut] = useState(false);

  const handleTap = (e: React.PointerEvent) => {
    e.stopPropagation();
    setFadingOut(true);
  };

  const handleHelp = (e: React.PointerEvent) => {
    e.stopPropagation();
    onHelp();
  };

  return (
    <>
      <style>{`
        @keyframes op-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.45; transform: scale(0.95); }
        }
        @keyframes op-bob {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
        .op-pulse { animation: op-pulse 1.5s ease-in-out infinite; }
        .op-bob   { animation: op-bob   2.2s ease-in-out infinite; }
      `}</style>

      <div
        style={{
          position: "absolute",
          left: 0, right: 0, top: 0,
          bottom: adBannerH,
          background: "linear-gradient(180deg, #c9eaff 0%, #87CEEB 60%, #b5e0ff 100%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 50,
          opacity: fadingOut ? 0 : 1,
          transition: "opacity 0.45s ease",
          pointerEvents: fadingOut ? "none" : "all",
          fontFamily: "'Fredoka One', cursive",
          userSelect: "none",
          WebkitUserSelect: "none",
          overflow: "hidden",
        }}
        onPointerDown={handleTap}
        onTransitionEnd={() => { if (fadingOut) onStart(); }}
      >
        {/* Decorative clouds */}
        <img src="/sprites/cloud.png" draggable={false} style={{
          position: "absolute", top: "5%", left: "3%",
          width: 140, opacity: 0.82,
          filter: "drop-shadow(3px 5px 6px rgba(0,0,0,0.10))",
          pointerEvents: "none",
        }} />
        <img src="/sprites/cloud.png" draggable={false} style={{
          position: "absolute", top: "11%", right: "4%",
          width: 108, opacity: 0.70,
          filter: "drop-shadow(2px 4px 5px rgba(0,0,0,0.08))",
          pointerEvents: "none",
        }} />

        {/* Title graphic */}
        <img
          src="/sprites/TitleGraphic.png"
          draggable={false}
          style={{
            width: "92%",
            maxWidth: 400,
            objectFit: "contain",
            marginBottom: 12,
            filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.18))",
          }}
        />

        {/* Potato Stage 5 — bobbing */}
        <div className="op-bob" style={{ marginBottom: 28 }}>
          <img
            src="/sprites/potato-5.png"
            draggable={false}
            style={{
              width: 180,
              height: 180,
              objectFit: "contain",
              filter: "drop-shadow(0 6px 12px rgba(0,0,0,0.22))",
            }}
          />
        </div>

        {/* TAP TO START */}
        <div
          className="op-pulse"
          style={{
            fontSize: 30,
            color: "#3d2200",
            letterSpacing: 2,
            textShadow: "0 2px 0 rgba(255,255,255,0.55)",
          }}
        >
          TAP TO START
        </div>

        {/* How to Play button — bottom right, above ad strip */}
        <div
          style={{
            position: "absolute",
            bottom: 20,
            right: 18,
            background: "rgba(255,255,255,0.45)",
            borderRadius: 22,
            padding: "9px 18px",
            fontSize: 15,
            color: "#3a2800",
            border: "1.5px solid rgba(255,255,255,0.7)",
            cursor: "pointer",
            boxShadow: "0 2px 8px rgba(0,0,0,0.10)",
          }}
          onPointerDown={handleHelp}
        >
          How to Play
        </div>
      </div>
    </>
  );
}
