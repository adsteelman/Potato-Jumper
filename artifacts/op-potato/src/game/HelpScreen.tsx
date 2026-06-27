interface Props {
  onBack: () => void;
  adBannerH: number;
}

const SKY = "linear-gradient(180deg, #c9eaff 0%, #87CEEB 60%, #b5e0ff 100%)";
const CARD = "rgba(255,255,255,0.55)";
const HEADING = "#3d2200";
const BODY = "#4a3000";
const FONT = "'Fredoka One', cursive";

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: CARD,
      borderRadius: 18,
      padding: "14px 16px",
      marginBottom: 14,
      boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
      border: "1.5px solid rgba(255,255,255,0.8)",
    }}>
      <div style={{ fontSize: 18, color: HEADING, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 22 }}>{icon}</span>
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ sprite, label, sub }: { sprite?: string; label: string; sub?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
      {sprite && (
        <img
          src={sprite}
          draggable={false}
          style={{ width: 44, height: 44, objectFit: "contain", flexShrink: 0 }}
        />
      )}
      <div>
        <div style={{ fontSize: 15, color: HEADING, lineHeight: 1.2 }}>{label}</div>
        {sub && <div style={{ fontSize: 13, color: BODY, opacity: 0.75, marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

function StageRow({ sprite, name, desc }: { sprite: string; name: string; desc: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
      <img src={sprite} draggable={false} style={{ width: 40, height: 40, objectFit: "contain", flexShrink: 0 }} />
      <div>
        <span style={{ fontSize: 15, color: HEADING, fontWeight: "bold" }}>{name}</span>
        <span style={{ fontSize: 13, color: BODY, opacity: 0.8 }}> — {desc}</span>
      </div>
    </div>
  );
}

export function HelpScreen({ onBack, adBannerH }: Props) {
  return (
    <div
      style={{
        position: "absolute",
        left: 0, right: 0, top: 0,
        bottom: adBannerH,
        background: SKY,
        zIndex: 52,
        display: "flex",
        flexDirection: "column",
        fontFamily: FONT,
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      {/* Fixed header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        padding: "14px 16px 10px",
        background: "rgba(255,255,255,0.35)",
        borderBottom: "1.5px solid rgba(255,255,255,0.6)",
        flexShrink: 0,
        gap: 12,
      }}>
        <div
          style={{
            background: "rgba(255,255,255,0.55)",
            borderRadius: 20,
            padding: "7px 16px",
            fontSize: 16,
            color: HEADING,
            border: "1.5px solid rgba(255,255,255,0.7)",
            cursor: "pointer",
          }}
          onPointerDown={(e) => { e.stopPropagation(); onBack(); }}
        >
          ← Back
        </div>
        <div style={{ fontSize: 22, color: HEADING }}>How to Play</div>
      </div>

      {/* Scrollable content */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        padding: "16px 14px 24px",
        WebkitOverflowScrolling: "touch",
      }}>

        {/* Controls */}
        <Section title="Controls" icon="🕹️">
          <Row sprite="/sprites/potato-3.png" label="Tilt your phone left or right to steer" />
          <Row label="Or tap the left / right side of the screen" />
        </Section>

        {/* Buff Stages */}
        <Section title="Buff Stages" icon="💪">
          <div style={{ fontSize: 13, color: BODY, opacity: 0.8, marginBottom: 10 }}>
            Climb higher to power up. Fall back and you'll lose buffs!
          </div>
          <StageRow sprite="/sprites/potato-1.png" name="Raw"      desc="Just a spud. Keep jumping!" />
          <StageRow sprite="/sprites/potato-2.png" name="Fresh"    desc="Getting warmed up." />
          <StageRow sprite="/sprites/potato-3.png" name="Cookin'"  desc="Things are heating up." />
          <StageRow sprite="/sprites/potato-4.png" name="Buff"     desc="Fully juiced potato." />
          <StageRow sprite="/sprites/potato-5.png" name="OP POTATO" desc="Max power — you made it!" />
        </Section>

        {/* Platforms */}
        <Section title="Platforms" icon="🪵">
          <Row sprite="/sprites/platform-board.png"      label="Cutting Board"  sub="Safe. Common at the start." />
          <Row sprite="/sprites/platform-sack.png"       label="Potato Sack"    sub="Safe. Mix of early and mid game." />
          <Row sprite="/sprites/platform-countertop.png" label="Countertop"     sub="Solid shelf. Mid game." />
          <Row sprite="/sprites/platform-bakingsheet.png" label="Baking Sheet"  sub="Late game — things are hot!" />
          <Row sprite="/sprites/platform-heal.png"       label="Bandaid Platform" sub="Rare! Heals you back to potato if you're a fry." />
        </Section>

        {/* Hazards */}
        <Section title="Hazards" icon="⚠️">
          <div style={{ fontSize: 13, color: BODY, opacity: 0.8, marginBottom: 10 }}>
            Dodge these — touching them hurts!
          </div>
          <Row sprite="/sprites/hazard-grater.png"  label="Cheese Grater"  sub="Floats in your path. Avoid!" />
          <Row sprite="/sprites/hazard-peeler.png"  label="Potato Peeler"  sub="Watch out mid-air." />
          <Row sprite="/sprites/hazard-pot.png"     label="Boiling Pot"    sub="Hazard near the top tiers." />
        </Section>

        {/* Getting Hit */}
        <Section title="Getting Hit" icon="🤕">
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <img src="/sprites/potato-1.png" style={{ width: 38, height: 38, objectFit: "contain" }} />
            <span style={{ fontSize: 20, color: HEADING }}>→</span>
            <img src="/sprites/fry-1.png"    style={{ width: 38, height: 38, objectFit: "contain" }} />
            <span style={{ fontSize: 13, color: BODY, flex: 1, marginLeft: 6 }}>First hit: you become a fry. You can still play!</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <img src="/sprites/fry-1.png" style={{ width: 38, height: 38, objectFit: "contain" }} />
            <span style={{ fontSize: 20, color: "#c0392b" }}>→</span>
            <span style={{ fontSize: 26 }}>💀</span>
            <span style={{ fontSize: 13, color: BODY, flex: 1, marginLeft: 6 }}>Second hit as a fry = MASHED. Game over!</span>
          </div>
        </Section>

        {/* Healing */}
        <Section title="Healing" icon="💊">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <img src="/sprites/fry-1.png"          style={{ width: 38, height: 38, objectFit: "contain" }} />
            <span style={{ fontSize: 16, color: HEADING }}>+</span>
            <img src="/sprites/platform-heal.png"  style={{ width: 52, height: 38, objectFit: "contain" }} />
            <span style={{ fontSize: 20, color: "#27ae60" }}>→</span>
            <img src="/sprites/potato-1.png"       style={{ width: 38, height: 38, objectFit: "contain" }} />
            <span style={{ fontSize: 13, color: BODY, flex: 1, marginLeft: 6 }}>Land on a bandaid while a fry to recover!</span>
          </div>
        </Section>

      </div>
    </div>
  );
}
