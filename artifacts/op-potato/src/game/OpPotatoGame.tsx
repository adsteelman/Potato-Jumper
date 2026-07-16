import { useEffect, useRef, useCallback, useState } from "react";
import { SplashScreen } from "./SplashScreen";
import { HelpScreen } from "./HelpScreen";

const CANVAS_W = 420;
const CANVAS_H = 760;
const GRAVITY = 0.55;
const JUMP_VY = -13.5;
const PLAYER_W = 65;
const PLAYER_H = 70;
const PLAYER_SPEED = 4.5;
const PLAT_H = 16;
const CAMERA_LEAD = 0.38; // player at this fraction from top

type PlatformType = "board" | "sack" | "shelf" | "bakingsheet" | "spring" | "heal";
type HazardType = "grater" | "peeler" | "pot";
type PlayerState = "normal" | "fry" | "dead";
type GamePhase = "menu" | "playing" | "dead" | "winning" | "won" | "leaderboard";
type SoundEvent =
  | "powerup"
  | "potato_board" | "fry_board"
  | "potato_sack" | "fry_sack"
  | "potato_sheet" | "fry_sheet"
  | "potato_counter" | "fry_counter"
  | "heal"
  | "hazard_grate" | "hazard_peel" | "hazard_sizzle";

interface Platform {
  id: number;
  x: number;
  y: number;
  w: number;
  type: PlatformType;
  bounced: boolean;
  springAnim: number; // 0..1 spring compress
}

interface Hazard {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  type: HazardType;
  vx: number; // for moving hazards
  phase: number; // oscillation phase
}

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

interface Cloud {
  id: number;
  worldY: number; // fixed world Y — scrolls with camera like platforms/hazards
  x: number; // base horizontal position (before drift)
  phase: number; // drift sine phase, unique per cloud
  driftSpeed: number; // drift sine speed, unique per cloud
  driftAmp: number; // max horizontal drift in px (<=15)
  scale: number;
}

interface LeaderboardEntry {
  id: number;
  playerName: string;
  score: number;
  stageReached: number;
  createdAt: string;
}

interface Confetti {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotSpeed: number;
  color: string;
  w: number;
  h: number;
  shape: "rect" | "circle";
}

interface GameState {
  phase: GamePhase;
  player: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    state: PlayerState;
    buffLevel: number;
    invincTimer: number;
    deathY: number;
    wobble: number;
    stretchY: number; // 1 = normal, <1 squish, >1 stretch
    eyeBlink: number;
    jumpCount: number;
    levelUpAnim: number; // 1..0, drives flex burst on stage change
    prevBuffLevel: number;
  };
  platforms: Platform[];
  hazards: Hazard[];
  particles: Particle[];
  confetti: Confetti[];
  clouds: Cloud[];
  cameraY: number; // world Y of top of screen
  score: number;
  bestScore: number;
  startY: number;
  controlMode: "tilt" | "tap";
  tiltX: number; // current tilt value -1..1
  tapDir: number; // -1, 0, 1
  showSettings: boolean;
  musicOn: boolean;
  soundOn: boolean;
  nextId: number;
  bgPhase: number;
  jumpFlash: number;
  winTriggered: boolean;
  winAnim: number;   // 0→1: win overlay fade-in
  slowMo: number;    // 1.0 = normal, ramps to 0.05 during winning
  wonAsFry: boolean;
  formStartScore: number; // score when current form (potato/fry) began
}

function buffLevelForScore(score: number): number {
  if (score < 500) return 0;
  if (score < 2000) return 1;
  if (score < 5000) return 2;
  if (score < 10000) return 3;
  return 4;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

const MUSIC_PREF_KEY = "oppotato:musicOn";
const SOUND_PREF_KEY = "oppotato:soundOn";

function loadAudioPref(key: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    const v = window.localStorage.getItem(key);
    return v === null ? true : v === "true";
  } catch {
    return true;
  }
}

function saveAudioPref(key: string, value: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // localStorage unavailable — preference just won't persist across reloads
  }
}

function initPlatforms(startY: number): { platforms: Platform[]; nextId: number } {
  const platforms: Platform[] = [];
  let id = 0;
  // Starting platform under player
  platforms.push({ id: id++, x: CANVAS_W / 2 - 55, y: startY + 40, w: 110, type: "board", bounced: false, springAnim: 0 });
  // Generate initial set upward
  let py = startY - 80;
  for (let i = 0; i < 17; i++) {
    const type: PlatformType = i < 6 ? "board" : (Math.random() < 0.70 ? "board" : "sack");
    const w = 65 + Math.random() * 45;
    const x = 20 + Math.random() * (CANVAS_W - 40 - w);
    platforms.push({ id: id++, x, y: py, w, type, bounced: false, springAnim: 0 });
    py -= 90 + Math.random() * 50;
  }
  return { platforms, nextId: id };
}

const CLOUD_COUNT = 5;

function makeCloud(id: number, worldY: number): Cloud {
  return {
    id,
    worldY,
    x: 40 + Math.random() * (CANVAS_W - 80),
    phase: Math.random() * Math.PI * 2,
    driftSpeed: 0.00022 + Math.random() * 0.00035, // unique speed per cloud
    driftAmp: 6 + Math.random() * 9, // 6..15px, capped at 15px per side
    scale: 0.75 + Math.random() * 0.4,
  };
}

// Spreads clouds across the initial screen (in world space) so they're visible immediately.
function initClouds(cameraY: number): Cloud[] {
  const clouds: Cloud[] = [];
  for (let i = 0; i < CLOUD_COUNT; i++) {
    const worldY = cameraY + (i / CLOUD_COUNT) * (CANVAS_H + 160) - 60;
    clouds.push(makeCloud(i, worldY));
  }
  return clouds;
}

// World-space scroll: clouds sit at a fixed world Y and only wrap when they scroll off the bottom.
function updateClouds(gs: GameState) {
  for (const cloud of gs.clouds) {
    const screenY = cloud.worldY - gs.cameraY;
    if (screenY > CANVAS_H + 50) {
      cloud.worldY = gs.cameraY - CANVAS_H - Math.random() * 200;
      cloud.x = 40 + Math.random() * (CANVAS_W - 80);
      cloud.phase = Math.random() * Math.PI * 2;
    }
  }
}

function makeInitialState(bestScore: number): GameState {
  const startY = CANVAS_H * 0.7;
  const { platforms, nextId } = initPlatforms(startY);
  const cameraY = startY - CANVAS_H * (1 - CAMERA_LEAD);

  return {
    phase: "menu",
    player: {
      x: CANVAS_W / 2,
      y: startY,
      vx: 0,
      vy: JUMP_VY,
      state: "normal",
      buffLevel: 0,
      invincTimer: 0,
      deathY: 0,
      wobble: 0,
      stretchY: 1,
      eyeBlink: 300 + Math.random() * 200,
      jumpCount: 0,
      levelUpAnim: 0,
      prevBuffLevel: 0,
    },
    platforms,
    hazards: [],
    particles: [],
    confetti: [],
    clouds: initClouds(cameraY),
    cameraY,
    score: 0,
    bestScore,
    startY,
    controlMode: "tap",
    tiltX: 0,
    tapDir: 0,
    showSettings: false,
    musicOn: loadAudioPref(MUSIC_PREF_KEY),
    soundOn: loadAudioPref(SOUND_PREF_KEY),
    nextId,
    bgPhase: 0,
    jumpFlash: 0,
    winTriggered: false,
    winAnim: 0,
    slowMo: 1,
    wonAsFry: false,
    formStartScore: 0,
  };
}

// ─── DRAWING FUNCTIONS ────────────────────────────────────────────────────────

function drawRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawPlatformSprite(
  ctx: CanvasRenderingContext2D,
  img: HTMLCanvasElement,
  cx: number, // center X
  cy: number, // center Y (hitbox y)
  targetW: number,
  compress: number,
) {
  if (!img.width) return false; // not loaded yet
  const ar = img.width / img.height;
  const dw = targetW;
  const dh = dw / ar;
  ctx.drawImage(img, cx - dw / 2, cy - dh / 2 + compress, dw, dh - compress);
  return true;
}

function drawPlatform(ctx: CanvasRenderingContext2D, p: Platform, sy: number, sprites: SpriteMap | null = null) {
  const { x, w, type } = p;
  const h = PLAT_H;
  const compress = p.springAnim * 4;
  const cx = x + w / 2; // center X of the hitbox

  if (type === "board") {
    // Try sprite first; sprite is drawn centered on the hitbox line
    if (sprites?.platformBoard) {
      const drawn = drawPlatformSprite(ctx, sprites.platformBoard, cx, sy, w * 1.55, compress);
      if (drawn) return;
    }
    // Fallback: programmatic cutting board
    const grad = ctx.createLinearGradient(x, sy, x, sy + h);
    grad.addColorStop(0, "#f0c97a");
    grad.addColorStop(1, "#c8973a");
    ctx.fillStyle = grad;
    drawRoundRect(ctx, x, sy + compress, w, h - compress, 5);
    ctx.fill();
    ctx.strokeStyle = "#8B6020";
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.strokeStyle = "rgba(100,60,10,0.2)";
    ctx.lineWidth = 1;
    for (let gx = x + 12; gx < x + w - 10; gx += 14) {
      ctx.beginPath();
      ctx.moveTo(gx, sy + 3 + compress);
      ctx.lineTo(gx, sy + h - 2);
      ctx.stroke();
    }
    ctx.fillStyle = "#8B6020";
    drawRoundRect(ctx, x - 10, sy + 2 + compress, 10, h - 4 - compress, 3);
    ctx.fill();
  } else if (type === "sack") {
    // Try sprite first; sprite is drawn centered on the hitbox line
    if (sprites?.platformSack) {
      const drawn = drawPlatformSprite(ctx, sprites.platformSack, cx, sy, w * 1.4, compress);
      if (drawn) return;
    }
    // Fallback: programmatic potato sack
    ctx.fillStyle = "#b8956a";
    drawRoundRect(ctx, x, sy + compress, w, h - compress, 7);
    ctx.fill();
    ctx.strokeStyle = "#7a5c30";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = "#7a5c30";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(x + 6, sy + 4 + compress);
    ctx.lineTo(x + w - 6, sy + 4 + compress);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#5a3c10";
    ctx.font = `bold ${Math.max(7, h - 4)}px 'Fredoka One', cursive`;
    ctx.textAlign = "center";
    ctx.fillText("POTATO", x + w / 2, sy + h - 2 + compress);
  } else if (type === "bakingsheet") {
    if (sprites?.platformBakingSheet) {
      const drawn = drawPlatformSprite(ctx, sprites.platformBakingSheet, cx, sy, w * 1.55, compress);
      if (drawn) return;
    }
    // Fallback: silver baking sheet
    const grad = ctx.createLinearGradient(x, sy, x, sy + h);
    grad.addColorStop(0, "#d8d8d8");
    grad.addColorStop(1, "#a0a0a0");
    ctx.fillStyle = grad;
    drawRoundRect(ctx, x, sy + compress, w, h - compress, 3);
    ctx.fill();
    ctx.strokeStyle = "#777";
    ctx.lineWidth = 2;
    ctx.stroke();
  } else if (type === "shelf") {
    if (sprites?.platformCountertop) {
      const drawn = drawPlatformSprite(ctx, sprites.platformCountertop, cx, sy, w * 1.55, compress);
      if (drawn) return;
    }
    // Fallback: Kitchen shelf - darker wood with brackets
    const grad = ctx.createLinearGradient(x, sy, x, sy + h);
    grad.addColorStop(0, "#b07d45");
    grad.addColorStop(1, "#7a4f1a");
    ctx.fillStyle = grad;
    ctx.fillRect(x, sy + compress, w, h - compress);
    ctx.strokeStyle = "#4a2f08";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, sy + compress, w, h - compress);
    // Bracket left
    ctx.fillStyle = "#888";
    ctx.fillRect(x + 4, sy + compress, 6, h + 6 - compress);
    // Bracket right
    ctx.fillRect(x + w - 10, sy + compress, 6, h + 6 - compress);
    // Shine
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.fillRect(x, sy + compress, w, 4);
  } else if (type === "spring") {
    // Spring platform - bouncy green
    ctx.fillStyle = "#40c040";
    drawRoundRect(ctx, x, sy + compress, w, h - compress, 4);
    ctx.fill();
    ctx.strokeStyle = "#208020";
    ctx.lineWidth = 2;
    ctx.stroke();
    // Spring coil lines
    ctx.strokeStyle = "#208020";
    ctx.lineWidth = 1.5;
    for (let sx2 = x + 8; sx2 < x + w - 6; sx2 += 10) {
      ctx.beginPath();
      ctx.moveTo(sx2, sy + 3 + compress);
      ctx.lineTo(sx2 + 5, sy + h - 2);
      ctx.stroke();
    }
  } else if (type === "heal") {
    if (sprites?.platformHeal) {
      const drawn = drawPlatformSprite(ctx, sprites.platformHeal, cx, sy, w * 1.55, compress);
      if (drawn) return;
    }
    // Fallback: glowing teal with heart
    const hgr = ctx.createLinearGradient(x, sy, x, sy + h);
    hgr.addColorStop(0, "#7FFFCF");
    hgr.addColorStop(1, "#00C896");
    ctx.fillStyle = hgr;
    drawRoundRect(ctx, x, sy + compress, w, h - compress, 6);
    ctx.fill();
    ctx.strokeStyle = "#00A87A";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.shadowColor = "#4ECDC4";
    ctx.shadowBlur = 10;
    ctx.strokeStyle = "rgba(160,255,230,0.9)";
    ctx.lineWidth = 1.5;
    drawRoundRect(ctx, x + 1, sy + compress + 1, w - 2, h - compress - 2, 5);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${h - 2}px 'Fredoka One', cursive`;
    ctx.textAlign = "center";
    ctx.fillText("❤", x + w / 2, sy + h - 1 + compress);
  }
}

function drawHazard(ctx: CanvasRenderingContext2D, h: Hazard, sy: number, t: number, sprites: SpriteMap | null = null) {
  const { x, w, type } = h;
  const hh = h.h;
  const cx = x + w / 2;
  const cy = sy + hh / 2; // visual center of hitbox

  // Helper: draw sprite centered on hitbox center, scaled to fit target height
  const drawSprite = (img: HTMLCanvasElement | null, offsetY = 0): boolean => {
    if (!img || !img.width) return false;
    const ar = img.width / img.height;
    const dh = hh * 1.5;
    const dw = dh * ar;
    ctx.drawImage(img, cx - dw / 2, cy - dh / 2 + offsetY, dw, dh);
    return true;
  };

  if (type === "grater") {
    if (sprites && drawSprite(sprites.hazardGrater)) return;
    // Fallback
    ctx.fillStyle = "#c0c8d0";
    drawRoundRect(ctx, x, sy, w, hh, 4);
    ctx.fill();
    ctx.strokeStyle = "#606870";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#404850";
    for (let gy = sy + 6; gy < sy + hh - 4; gy += 9) {
      for (let gx = x + 6; gx < x + w - 4; gx += 9) {
        ctx.beginPath();
        ctx.ellipse(gx, gy, 2.5, 1.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = "rgba(255,60,0,0.25)";
    ctx.fillRect(x, sy, w, 5);
    ctx.fillStyle = "#303840";
    ctx.font = "bold 9px 'Fredoka One', cursive";
    ctx.textAlign = "center";
    ctx.fillText("GRATE", x + w / 2, sy + hh - 4);
  } else if (type === "peeler") {
    if (sprites && drawSprite(sprites.hazardPeeler)) return;
    // Fallback
    ctx.fillStyle = "#d8dde0";
    drawRoundRect(ctx, x, sy, w, hh, hh / 2);
    ctx.fill();
    ctx.strokeStyle = "#707880";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    drawRoundRect(ctx, x + 4, sy + 3, w - 8, 4, 2);
    ctx.fill();
    ctx.strokeStyle = "#505860";
    ctx.lineWidth = 1;
    for (let px = x + 5; px < x + w - 5; px += 6) {
      ctx.beginPath();
      ctx.moveTo(px, sy + hh - 6);
      ctx.lineTo(px + 3, sy + hh - 2);
      ctx.lineTo(px + 6, sy + hh - 6);
      ctx.stroke();
    }
  } else if (type === "pot") {
    const bobY = Math.sin(t * 0.003 + h.phase) * 3;
    if (sprites && drawSprite(sprites.hazardPot, bobY)) return;
    // Fallback
    ctx.fillStyle = "#222428";
    drawRoundRect(ctx, x, sy + bobY, w, hh, 8);
    ctx.fill();
    ctx.strokeStyle = "#111214";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#333840";
    drawRoundRect(ctx, x - 4, sy - 6 + bobY, w + 8, 10, 4);
    ctx.fill();
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = "#888";
    ctx.beginPath();
    ctx.arc(x + w / 2, sy - 10 + bobY, 5, Math.PI, 0);
    ctx.fill();
    for (let s = 0; s < 3; s++) {
      const sx2 = x + 15 + s * (w / 3 - 10);
      const steamPhase = (t * 0.002 + s * 2.1) % 1;
      ctx.globalAlpha = 1 - steamPhase;
      ctx.strokeStyle = "#aaccff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx2, sy - 8 + bobY);
      ctx.bezierCurveTo(sx2 - 4, sy - 16 - steamPhase * 20 + bobY, sx2 + 4, sy - 22 - steamPhase * 20 + bobY, sx2, sy - 30 - steamPhase * 20 + bobY);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = "#ff6020";
    const bub = Math.abs(Math.sin(t * 0.005));
    ctx.beginPath();
    ctx.ellipse(x + w / 2, sy + 6 + bobY, w / 2 - 6, 4 + bub * 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── Per-stage visual constants ──────────────────────────────────────────────
const STAGE_SCALES  = [0.72, 0.90, 1.12, 1.40, 1.78];
const STAGE_COLORS = [
  { body: "#b88540", shadow: "#8a6028", outline: "#5a3500", light: "#d4aa68" },
  { body: "#d4aa58", shadow: "#a07830", outline: "#5a3500", light: "#f0cc80" },
  { body: "#c8a830", shadow: "#966010", outline: "#4a3400", light: "#e8c850" },
  { body: "#e8c060", shadow: "#b08030", outline: "#4a3000", light: "#ffe880" },
  { body: "#f8d020", shadow: "#c09000", outline: "#7a5000", light: "#fff0a0" },
];

// HTMLCanvasElement is used instead of HTMLImageElement so we can pre-process
// pixels at load time and restore near-white semi-transparent areas to fully opaque
// (background-removal tools often make white sprite detail transparent).
interface SpriteMap {
  potato: (HTMLCanvasElement | null)[];
  fry: (HTMLCanvasElement | null)[];
  gameOver: HTMLCanvasElement | null;
  platformBoard: HTMLCanvasElement | null;
  platformSack: HTMLCanvasElement | null;
  platformCountertop: HTMLCanvasElement | null;
  platformBakingSheet: HTMLCanvasElement | null;
  platformHeal: HTMLCanvasElement | null;
  hazardPot: HTMLCanvasElement | null;
  hazardPeeler: HTMLCanvasElement | null;
  hazardGrater: HTMLCanvasElement | null;
  cloud: HTMLCanvasElement | null;
  title: HTMLCanvasElement | null;
}

function drawStar4(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const rd = i % 2 === 0 ? r : r * 0.42;
    if (i === 0) ctx.moveTo(x + Math.cos(a) * rd, y + Math.sin(a) * rd);
    else ctx.lineTo(x + Math.cos(a) * rd, y + Math.sin(a) * rd);
  }
  ctx.closePath();
}

function drawPotato(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  buffLevel: number,
  state: PlayerState,
  invincTimer: number,
  wobble: number,
  stretchY: number,
  eyeBlink: number,
  levelUpAnim: number,
  t: number,
  sprites: SpriteMap | null = null
) {
  if (state === "dead") return;

  if (invincTimer > 0 && Math.floor(t / 80) % 2 === 0) return;

  const si = Math.min(buffLevel, 4);
  const col = STAGE_COLORS[si];

  // Scale: stage size + sine-arc flex bump during level-up
  const flexBump = levelUpAnim > 0 ? Math.sin(levelUpAnim * Math.PI) * 0.40 : 0;
  const totalScale = STAGE_SCALES[si] * (1 + flexBump);
  const pw = PLAYER_W * totalScale;
  const ph = PLAYER_H * totalScale * stretchY;
  const wobX = Math.sin(wobble) * 0;

  // ── SPRITE DRAWING (when images are loaded) ───────────────────────────────
  if (sprites) {
    const img = state === "fry" ? sprites.fry[si] : sprites.potato[si];
    if (img) {
      // Stage 4 golden glow ring (both potato and fry)
      if (si === 4) {
        const gr = pw * 1.5 + flexBump * 45;
        const glowRGB = state === "fry" ? "255,200,50" : "255,230,60";
        const glow = ctx.createRadialGradient(cx + wobX, cy, pw * 0.2, cx + wobX, cy, gr);
        glow.addColorStop(0, `rgba(${glowRGB},${0.48 + flexBump * 0.4})`);
        glow.addColorStop(0.55, `rgba(${glowRGB},${0.18 + flexBump * 0.1})`);
        glow.addColorStop(1, "rgba(255,180,0,0)");
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.ellipse(cx + wobX, cy, gr, gr * 0.82, 0, 0, Math.PI * 2); ctx.fill();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + t * 0.0016;
          const dist = pw * 0.82 + Math.sin(t * 0.003 + i * 1.7) * 9;
          const sx2 = cx + wobX + Math.cos(a) * dist;
          const sy2 = cy + Math.sin(a) * dist * 0.72;
          const ss = 4.5 + Math.sin(t * 0.004 + i) * 2.2;
          ctx.fillStyle = i % 2 === 0 ? "#FFD700" : "#fff";
          ctx.globalAlpha = 0.65 + Math.sin(t * 0.005 + i) * 0.35;
          drawStar4(ctx, sx2, sy2, ss); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      // Preserve natural aspect ratio — derive width from height, don't squish width
      const naturalAR = img.width / img.height;
      const targetH = (state === "fry" ? PLAYER_H * 1.65 : PLAYER_H) * totalScale;
      const sh = targetH * stretchY;   // height squishes on landing
      const sw = targetH * naturalAR;  // width stays proportional to full height
      ctx.save();
      ctx.translate(cx + wobX, cy);
      ctx.drawImage(img, -sw / 2, -sh / 2, sw, sh);
      ctx.restore();
      return;
    }
  }

  // ── FRENCH FRY STATE ─────────────────────────────────────────────────────
  if (state === "fry") {
    ctx.save();
    ctx.translate(cx + wobX, cy);
    const fryH = ph * 1.1;
    ctx.fillStyle = "#f5c842"; ctx.strokeStyle = "#c08010"; ctx.lineWidth = 3;
    drawRoundRect(ctx, -12, -fryH / 2, 24, fryH, 5);
    ctx.fill(); ctx.stroke();
    // crispy bottom
    ctx.fillStyle = "rgba(180,100,0,0.28)";
    drawRoundRect(ctx, -12, fryH / 2 - 10, 24, 10, 3); ctx.fill();
    // shine stripe
    ctx.fillStyle = "rgba(255,255,200,0.45)";
    drawRoundRect(ctx, -8, -fryH / 2 + 5, 7, fryH / 3, 2); ctx.fill();
    // worried eyes
    if (eyeBlink > 5) {
      ctx.fillStyle = "#2a1800";
      ctx.beginPath(); ctx.ellipse(-5, -fryH * 0.2, 3, 3.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(5, -fryH * 0.2, 3, 3.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.ellipse(-3.8, -fryH * 0.2 - 1.2, 1.3, 1.3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(6.2, -fryH * 0.2 - 1.2, 1.3, 1.3, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.strokeStyle = "#2a1800"; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(-8, -fryH * 0.2); ctx.lineTo(-2, -fryH * 0.2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(2, -fryH * 0.2); ctx.lineTo(8, -fryH * 0.2); ctx.stroke();
    }
    ctx.strokeStyle = "#2a1800"; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.arc(0, -fryH * 0.08, 5, 0.2, Math.PI - 0.2); ctx.stroke();
    ctx.restore();
    return;
  }

  // ── STAGE 4 GLOW (drawn before body, in world coords) ─────────────────────
  if (si === 4) {
    const gr = pw * 1.5 + flexBump * 45;
    const glow = ctx.createRadialGradient(cx + wobX, cy, pw * 0.2, cx + wobX, cy, gr);
    glow.addColorStop(0, `rgba(255,230,60,${0.50 + flexBump * 0.4})`);
    glow.addColorStop(0.55, `rgba(255,200,0,${0.22 + flexBump * 0.12})`);
    glow.addColorStop(1, "rgba(255,180,0,0)");
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.ellipse(cx + wobX, cy, gr, gr * 0.82, 0, 0, Math.PI * 2); ctx.fill();
    // Orbiting sparkle stars
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + t * 0.0016;
      const dist = pw * 0.82 + Math.sin(t * 0.003 + i * 1.7) * 9;
      const sx = cx + wobX + Math.cos(a) * dist;
      const sy = cy + Math.sin(a) * dist * 0.72;
      const ss = 4.5 + Math.sin(t * 0.004 + i) * 2.2;
      ctx.fillStyle = i % 2 === 0 ? "#FFD700" : "#fff";
      ctx.globalAlpha = 0.65 + Math.sin(t * 0.005 + i) * 0.35;
      drawStar4(ctx, sx, sy, ss); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  ctx.save();
  ctx.translate(cx + wobX, cy);

  const bodyW = pw * [0.93, 0.91, 0.94, 0.97, 0.99][si];
  const bodyH = ph * [0.88, 0.88, 0.91, 0.93, 0.95][si];

  // ── ARMS (behind body) ────────────────────────────────────────────────────
  if (si >= 2 && state === "normal") {
    ctx.strokeStyle = col.outline;
    if (si === 2) {
      // Tiny bicep bumps
      ctx.fillStyle = col.body; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(-bodyW / 2 - 9, bodyH * 0.05, 10, 7, -0.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse( bodyW / 2 + 9, bodyH * 0.05, 10, 7,  0.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else if (si === 3) {
      // Distinct flexed arms with bicep + forearm
      ctx.lineWidth = 2.5;
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(side * (bodyW / 2 + 2), -bodyH * 0.05);
        ctx.scale(side, 1);
        ctx.rotate(-Math.PI / 5.5);
        // bicep
        ctx.fillStyle = col.body;
        ctx.beginPath(); ctx.ellipse(-9, 0, 17, 10, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        // bicep peak shading
        ctx.fillStyle = col.shadow; ctx.globalAlpha = 0.45;
        ctx.beginPath(); ctx.ellipse(-9, -6, 11, 5.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        // forearm
        ctx.fillStyle = col.body;
        ctx.beginPath(); ctx.ellipse(-24, 7, 11, 7.5, 0.45, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.restore();
      }
    } else if (si === 4) {
      // MASSIVE overhead flex
      ctx.lineWidth = 3;
      const flexExtra = levelUpAnim * 0.25;
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(side * (bodyW / 2 + 2), -bodyH * 0.08);
        ctx.scale(side, 1);
        ctx.rotate(-Math.PI / 4.2 - flexExtra);
        ctx.fillStyle = col.body;
        ctx.beginPath(); ctx.ellipse(-13, 0, 23, 13.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = col.shadow; ctx.globalAlpha = 0.45;
        ctx.beginPath(); ctx.ellipse(-13, -8, 15, 7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = col.body;
        ctx.beginPath(); ctx.ellipse(-33, 9, 15, 10.5, 0.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.restore();
      }
    }
  }

  // ── SHADOW ────────────────────────────────────────────────────────────────
  ctx.fillStyle = "rgba(0,0,0,0.14)";
  ctx.beginPath(); ctx.ellipse(3, bodyH / 2 + 5, bodyW / 2 + 5, 7, 0, 0, Math.PI * 2); ctx.fill();

  // ── BODY ──────────────────────────────────────────────────────────────────
  const bg = ctx.createRadialGradient(-bodyW * 0.22, -bodyH * 0.22, bodyH * 0.06, 0, 0, bodyH * 0.78);
  bg.addColorStop(0, col.light); bg.addColorStop(0.55, col.body); bg.addColorStop(1, col.shadow);
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.ellipse(0, 0, bodyW / 2, bodyH / 2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = col.outline; ctx.lineWidth = 2.5 + si * 0.5; ctx.stroke();

  // Potato-skin texture spots
  ctx.fillStyle = col.shadow; ctx.globalAlpha = 0.22;
  ctx.beginPath(); ctx.ellipse(-bodyW * 0.24, bodyH * 0.12, 4.5 + si * 0.8, 3.5 + si * 0.5, -0.3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse( bodyW * 0.20, -bodyH * 0.17, 3.5 + si * 0.4, 2.8, 0.5, 0, Math.PI * 2); ctx.fill();
  if (si === 0) { ctx.beginPath(); ctx.ellipse(bodyW * 0.28, bodyH * 0.28, 3, 2, 0.8, 0, Math.PI * 2); ctx.fill(); }
  ctx.globalAlpha = 1;

  // ── STAGE 0: TINY SPROUT ──────────────────────────────────────────────────
  if (si === 0) {
    const sx0 = -3, stY = -bodyH / 2 - 17;
    ctx.strokeStyle = "#40a040"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(sx0, -bodyH / 2 - 2); ctx.lineTo(sx0, stY); ctx.stroke();
    ctx.fillStyle = "#58c858"; ctx.strokeStyle = "#2a8040"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(sx0, stY + 4); ctx.bezierCurveTo(sx0 - 10, stY - 7, sx0 - 14, stY + 2, sx0 - 5, stY + 9); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx0, stY + 2); ctx.bezierCurveTo(sx0 + 10, stY - 7, sx0 + 14, stY + 1, sx0 + 5, stY + 8); ctx.closePath(); ctx.fill(); ctx.stroke();
  }

  // ── STAGE 2: SWEATBAND ────────────────────────────────────────────────────
  if (si === 2) {
    const bY = -bodyH * 0.30, bW = bodyW * 0.76;
    ctx.fillStyle = "#f2f2f2"; ctx.strokeStyle = "#c0c0c0"; ctx.lineWidth = 1;
    drawRoundRect(ctx, -bW / 2, bY - 7, bW, 14, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#e82010"; ctx.fillRect(-bW / 2 + 4, bY - 3, bW - 8, 6);
    ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.fillRect(-bW / 2 + 4, bY - 7, bW - 8, 4);
    // sweat drop
    ctx.fillStyle = "#7ad0ff"; ctx.strokeStyle = "#3090c0"; ctx.lineWidth = 1;
    const dX = bodyW * 0.31, dY = bodyH * 0.06;
    ctx.beginPath(); ctx.arc(dX, dY, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(dX - 3, dY - 2); ctx.lineTo(dX + 3, dY - 2); ctx.lineTo(dX, dY - 8); ctx.closePath(); ctx.fill(); ctx.stroke();
  }

  // ── STAGE 3: FOREHEAD VEIN ────────────────────────────────────────────────
  if (si === 3) {
    const vX = bodyW * 0.18, vY = -bodyH * 0.28;
    ctx.strokeStyle = "#a06040"; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(vX, vY - 5); ctx.lineTo(vX, vY + 5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(vX - 4, vY); ctx.lineTo(vX + 4, vY); ctx.stroke();
  }

  // ── STAGE 4: CROWN ────────────────────────────────────────────────────────
  if (si === 4) {
    const cW = bodyW * 0.70, cH = 21;
    const cX = -cW / 2, cTY = -bodyH / 2 - cH - 5;
    const cBob = Math.sin(t * 0.0025) * 2.5;
    ctx.save(); ctx.translate(0, cBob);
    ctx.fillStyle = "#FFD700"; ctx.strokeStyle = "#B8860B"; ctx.lineWidth = 2.5;
    ctx.fillRect(cX, cTY + cH * 0.45, cW, cH * 0.56);
    ctx.beginPath();
    ctx.moveTo(cX, cTY + cH * 0.45); ctx.lineTo(cX, cTY);
    ctx.lineTo(cX + cW * 0.22, cTY + cH * 0.45);
    ctx.lineTo(cX + cW * 0.50, cTY - cH * 0.18);
    ctx.lineTo(cX + cW * 0.78, cTY + cH * 0.45);
    ctx.lineTo(cX + cW, cTY); ctx.lineTo(cX + cW, cTY + cH * 0.45);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // jewels
    for (const [jx, jc] of [[cX + cW * 0.50, "#e040fb"], [cX + cW * 0.22, "#f44336"], [cX + cW * 0.78, "#2196F3"]] as [number, string][]) {
      ctx.fillStyle = jc; ctx.beginPath(); ctx.arc(jx, cTY + cH * 0.78, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.beginPath(); ctx.ellipse(jx - 1.2, cTY + cH * 0.75, 1.8, 1.8, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // ── EYES ──────────────────────────────────────────────────────────────────
  const eyeBaseY = -bodyH * 0.08;
  const isBlinking = eyeBlink < 5;
  const eXL = -bodyW * 0.225, eXR = bodyW * 0.225;

  if (si === 0) {
    // SLEEPY: droopy heavy upper lid
    const ew = 7, eh = 8.5;
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.ellipse(eXL, eyeBaseY, ew, eh, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(eXR, eyeBaseY, ew, eh, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#1a0800";
    ctx.beginPath(); ctx.ellipse(eXL, eyeBaseY + 2, 3.5, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(eXR, eyeBaseY + 2, 3.5, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    // Droopy top lid (covers upper 58%)
    ctx.fillStyle = col.body;
    ctx.beginPath(); ctx.ellipse(eXL, eyeBaseY - eh * 0.28, ew + 1.2, eh * 0.72, 0, Math.PI, 0); ctx.fill();
    ctx.beginPath(); ctx.ellipse(eXR, eyeBaseY - eh * 0.28, ew + 1.2, eh * 0.72, 0, Math.PI, 0); ctx.fill();
    ctx.strokeStyle = col.outline; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(eXL, eyeBaseY, ew, eh, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(eXR, eyeBaseY, ew, eh, 0, 0, Math.PI * 2); ctx.stroke();
    // zzz dot above
    ctx.fillStyle = col.outline;
    ctx.font = "bold 8px 'Fredoka One', cursive"; ctx.textAlign = "center";
    ctx.fillText("z", eXR + 10, eyeBaseY - eh - 5);

  } else if (si === 1) {
    // ALERT: big bright wide-open eyes with raised brows
    const ew = 8.5, eh = 9.5;
    ctx.fillStyle = "#fff";
    if (!isBlinking) {
      ctx.beginPath(); ctx.ellipse(eXL, eyeBaseY, ew, eh, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(eXR, eyeBaseY, ew, eh, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#1a0800";
      ctx.beginPath(); ctx.ellipse(eXL, eyeBaseY, 5.5, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(eXR, eyeBaseY, 5.5, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.ellipse(eXL + 2.2, eyeBaseY - 2, 2.2, 2.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(eXR + 2.2, eyeBaseY - 2, 2.2, 2.2, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.strokeStyle = col.outline; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(eXL - ew, eyeBaseY); ctx.lineTo(eXL + ew, eyeBaseY); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(eXR - ew, eyeBaseY); ctx.lineTo(eXR + ew, eyeBaseY); ctx.stroke();
    }
    ctx.strokeStyle = col.outline; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.ellipse(eXL, eyeBaseY, ew, eh, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(eXR, eyeBaseY, ew, eh, 0, 0, Math.PI * 2); ctx.stroke();
    // Raised brows
    ctx.strokeStyle = col.outline; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(eXL - 7, eyeBaseY - eh - 4); ctx.quadraticCurveTo(eXL, eyeBaseY - eh - 8, eXL + 7, eyeBaseY - eh - 4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(eXR - 7, eyeBaseY - eh - 4); ctx.quadraticCurveTo(eXR, eyeBaseY - eh - 8, eXR + 7, eyeBaseY - eh - 4); ctx.stroke();

  } else if (si === 2) {
    // DETERMINED: squinting, furrowed V brows
    const eyeTY = eyeBaseY - bodyH * 0.06;
    const ew = 7.5, eh = 7;
    if (!isBlinking) {
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.ellipse(eXL, eyeTY, ew, eh, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(eXR, eyeTY, ew, eh, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#1a0800";
      ctx.beginPath(); ctx.ellipse(eXL, eyeTY, 4.5, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(eXR, eyeTY, 4.5, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.ellipse(eXL + 2, eyeTY - 2, 1.6, 1.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(eXR + 2, eyeTY - 2, 1.6, 1.6, 0, 0, Math.PI * 2); ctx.fill();
      // squint lid (top 32%)
      ctx.fillStyle = col.body;
      ctx.beginPath(); ctx.ellipse(eXL, eyeTY - eh * 0.38, ew + 1, eh * 0.58, 0, Math.PI, 0); ctx.fill();
      ctx.beginPath(); ctx.ellipse(eXR, eyeTY - eh * 0.38, ew + 1, eh * 0.58, 0, Math.PI, 0); ctx.fill();
    }
    ctx.strokeStyle = col.outline; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.ellipse(eXL, eyeTY, ew, eh, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(eXR, eyeTY, ew, eh, 0, 0, Math.PI * 2); ctx.stroke();
    // Furrowed V brows
    ctx.strokeStyle = col.outline; ctx.lineWidth = 2.8;
    ctx.beginPath(); ctx.moveTo(eXL - 8, eyeTY - eh - 1); ctx.lineTo(eXL + 7, eyeTY - eh - 6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(eXR + 8, eyeTY - eh - 1); ctx.lineTo(eXR - 7, eyeTY - eh - 6); ctx.stroke();

  } else if (si === 3) {
    // CONFIDENT: cool half-lidded squint, one cocked brow
    const ew = 9, eh = 8.5;
    if (!isBlinking) {
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.ellipse(eXL, eyeBaseY, ew, eh, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(eXR, eyeBaseY, ew, eh, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#1a0800";
      ctx.beginPath(); ctx.ellipse(eXL, eyeBaseY + 1, 5.5, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(eXR, eyeBaseY + 1, 5.5, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.ellipse(eXL + 2.3, eyeBaseY - 1.2, 2, 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(eXR + 2.3, eyeBaseY - 1.2, 2, 2, 0, 0, Math.PI * 2); ctx.fill();
      // Half-lid (covers 48%)
      ctx.fillStyle = col.body;
      ctx.beginPath(); ctx.ellipse(eXL, eyeBaseY - eh * 0.24, ew + 1, eh * 0.62, 0, Math.PI, 0); ctx.fill();
      ctx.beginPath(); ctx.ellipse(eXR, eyeBaseY - eh * 0.24, ew + 1, eh * 0.62, 0, Math.PI, 0); ctx.fill();
    }
    ctx.strokeStyle = col.outline; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(eXL, eyeBaseY, ew, eh, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(eXR, eyeBaseY, ew, eh, 0, 0, Math.PI * 2); ctx.stroke();
    // Cocked brows (left higher than right)
    ctx.strokeStyle = col.outline; ctx.lineWidth = 2.8;
    ctx.beginPath(); ctx.moveTo(eXL - 8, eyeBaseY - eh - 3); ctx.lineTo(eXL + 8, eyeBaseY - eh - 8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(eXR - 8, eyeBaseY - eh - 5); ctx.lineTo(eXR + 8, eyeBaseY - eh - 4); ctx.stroke();

  } else {
    // STAGE 4: Gold-framed sunglasses
    const lW = 20, lH = 11;
    const gY = eyeBaseY - 1;
    ctx.fillStyle = "#0a0a28";
    drawRoundRect(ctx, eXL - lW, gY - lH, lW * 2, lH * 2, 5); ctx.fill();
    drawRoundRect(ctx, eXR - lW, gY - lH, lW * 2, lH * 2, 5); ctx.fill();
    ctx.strokeStyle = "#DAA520"; ctx.lineWidth = 3;
    drawRoundRect(ctx, eXL - lW, gY - lH, lW * 2, lH * 2, 5); ctx.stroke();
    drawRoundRect(ctx, eXR - lW, gY - lH, lW * 2, lH * 2, 5); ctx.stroke();
    // bridge
    ctx.beginPath(); ctx.moveTo(eXL + lW, gY); ctx.lineTo(eXR - lW, gY); ctx.stroke();
    // shine
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.beginPath(); ctx.ellipse(eXL - lW * 0.25, gY - 3, lW * 0.52, lH * 0.3, -0.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(eXR - lW * 0.25, gY - 3, lW * 0.52, lH * 0.3, -0.2, 0, Math.PI * 2); ctx.fill();
  }

  // ── MOUTH ─────────────────────────────────────────────────────────────────
  const mY = bodyH * 0.20;
  ctx.strokeStyle = col.outline; ctx.lineWidth = 2;

  if (si === 0) {
    // Tiny downturned / sleepy mouth
    ctx.beginPath(); ctx.arc(0, mY - 1, 4.5, 0.25, Math.PI - 0.25, true); ctx.stroke();
  } else if (si === 1) {
    // Wide happy smile with teeth
    ctx.beginPath(); ctx.arc(0, mY - 6, 11, 0.1, Math.PI - 0.1); ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(0, mY - 6, 10, 0.15, Math.PI - 0.15); ctx.fill();
    ctx.strokeStyle = col.outline; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, mY - 6, 11, 0.1, Math.PI - 0.1); ctx.stroke();
  } else if (si === 2) {
    // Gritted flat teeth bar
    const tW = bodyW * 0.42;
    ctx.fillStyle = "#dcdcdc"; ctx.strokeStyle = col.outline; ctx.lineWidth = 1.6;
    drawRoundRect(ctx, -tW / 2, mY - 6, tW, 11, 3); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = col.outline; ctx.lineWidth = 1;
    for (let tx = -tW / 2 + tW / 4; tx < tW / 2 - 2; tx += tW / 4) {
      ctx.beginPath(); ctx.moveTo(tx, mY - 6); ctx.lineTo(tx, mY + 5); ctx.stroke();
    }
  } else if (si === 3) {
    // Asymmetric smirk (right-side grin)
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-13, mY - 1);
    ctx.bezierCurveTo(-4, mY - 1, 5, mY - 9, 15, mY - 7);
    ctx.stroke();
    // tooth hint
    ctx.fillStyle = "#fff"; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(3, mY - 5); ctx.bezierCurveTo(6, mY - 9, 11, mY - 9, 15, mY - 7);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  } else {
    // OP full grin showing top tooth row
    const gR = bodyW * 0.32;
    ctx.beginPath(); ctx.arc(0, mY - 9, gR, 0.08, Math.PI - 0.08); ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(0, mY - 9, gR - 1, 0.12, Math.PI - 0.12); ctx.fill();
    ctx.strokeStyle = col.outline; ctx.lineWidth = 1;
    for (let a = 0.25; a < Math.PI - 0.22; a += 0.32) {
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * (gR - 1), mY - 9 + Math.sin(a) * (gR - 1));
      ctx.lineTo(Math.cos(a) * (gR - 6), mY - 9 + Math.sin(a) * (gR - 6));
      ctx.stroke();
    }
  }

  // ── STAGE 4: OP! BADGE ────────────────────────────────────────────────────
  if (si === 4) {
    ctx.fillStyle = "#ff4400"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 3;
    ctx.font = "bold 17px 'Fredoka One', cursive"; ctx.textAlign = "center";
    ctx.strokeText("OP!", bodyW * 0.42, -bodyH * 0.40);
    ctx.fillText("OP!", bodyW * 0.42, -bodyH * 0.40);
  }

  ctx.restore();

  // ── LEVEL-UP BURST (world coordinates) ───────────────────────────────────
  if (levelUpAnim > 0) {
    const stageNames  = ["RAW", "FRESH! 🥔", "COOKIN'! 🔥", "BUFF! 💪", "OP POTATO! 👑"];
    const stageColors = ["#c8a050", "#d4aa58", "#d4b040", "#e8c060", "#FFD700"];
    const sc = stageColors[si];

    // Expanding rings
    for (const [rMult, rAlpha] of [[1.0, 0.7], [1.4, 0.4]] as [number, number][]) {
      const rr = (1 - levelUpAnim) * 80 * rMult + 18;
      ctx.strokeStyle = `rgba(255,240,100,${levelUpAnim * rAlpha})`;
      ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke();
    }

    // 8 stars shooting outward
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const dist = (1 - levelUpAnim) * 88 + 18;
      const sx = cx + Math.cos(a) * dist;
      const sy = cy + Math.sin(a) * dist * 0.78;
      const ss = 5 + (1 - levelUpAnim) * 5;
      ctx.fillStyle = i % 2 === 0 ? sc : "#fff";
      ctx.globalAlpha = Math.min(levelUpAnim * 1.8, 1);
      drawStar4(ctx, sx, sy, ss); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Floating stage name text
    const fadeAlpha = Math.min(levelUpAnim * 2.2, 1);
    const textY = cy - 58 - (1 - levelUpAnim) * 55;
    ctx.globalAlpha = fadeAlpha;
    ctx.font = "bold 23px 'Fredoka One', cursive"; ctx.textAlign = "center";
    ctx.strokeStyle = "rgba(0,0,0,0.7)"; ctx.lineWidth = 5;
    ctx.strokeText(stageNames[si], cx, textY);
    ctx.fillStyle = sc;
    ctx.fillText(stageNames[si], cx, textY);
    ctx.globalAlpha = 1;
  }
}

function drawBackground(ctx: CanvasRenderingContext2D, cameraY: number, score: number, t: number, sprites: SpriteMap | null = null, clouds: Cloud[] = []) {
  // Sky gradient based on score
  const progression = Math.min(score / 15000, 1);
  const skyColors: [string, string][] = [
    ["#87ceeb", "#c8e8ff"],
    ["#6ab4e0", "#a8d0f0"],
    ["#4090c0", "#8ab8e8"],
    ["#203070", "#5080c0"],
    ["#0a0a30", "#202060"],
  ];
  const ci = Math.min(Math.floor(progression * 4), 3);
  const ct = (progression * 4) % 1;
  const [s1a, s1b] = skyColors[ci];
  const [s2a, s2b] = skyColors[ci + 1] || skyColors[ci];

  function blendHex(c1: string, c2: string, t: number): string {
    const r1 = parseInt(c1.slice(1, 3), 16);
    const g1 = parseInt(c1.slice(3, 5), 16);
    const b1 = parseInt(c1.slice(5, 7), 16);
    const r2 = parseInt(c2.slice(1, 3), 16);
    const g2 = parseInt(c2.slice(3, 5), 16);
    const b2 = parseInt(c2.slice(5, 7), 16);
    const r = Math.round(lerp(r1, r2, t));
    const g = Math.round(lerp(g1, g2, t));
    const b = Math.round(lerp(b1, b2, t));
    return `rgb(${r},${g},${b})`;
  }

  const topColor = blendHex(s1a, s2a, ct);
  const botColor = blendHex(s1b, s2b, ct);

  const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  grad.addColorStop(0, topColor);
  grad.addColorStop(1, botColor);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Stars at high altitude
  if (score > 5000) {
    const starAlpha = Math.min((score - 5000) / 5000, 1);
    ctx.globalAlpha = starAlpha * 0.8;
    ctx.fillStyle = "#fff";
    for (let i = 0; i < 40; i++) {
      const sx = ((i * 137.5 + 50) % CANVAS_W);
      const sy = ((i * 97.3 + cameraY * 0.05) % CANVAS_H + CANVAS_H) % CANVAS_H;
      const ss = 0.5 + Math.sin(t * 0.002 + i) * 0.4;
      ctx.beginPath();
      ctx.arc(sx, sy, ss, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // Clouds at low altitude — positioned in world space, same as platforms/hazards
  if (score < 8000) {
    const cloudAlpha = Math.max(0, 1 - score / 8000);
    const img = sprites?.cloud;
    for (const cloud of clouds) {
      const screenY = cloud.worldY - cameraY;
      if (screenY < -100 || screenY > CANVAS_H + 100) continue;
      const cloudX = cloud.x + Math.sin(t * cloud.driftSpeed + cloud.phase) * cloud.driftAmp;
      const dw = 140 * cloud.scale;
      const dh = img?.width ? dw / (img.width / img.height) : dw * 0.5;

      if (img?.width) {
        // Blurred shadow offset downward for depth
        ctx.save();
        ctx.filter = "blur(2px)";
        ctx.globalAlpha = cloudAlpha * 0.10;
        ctx.drawImage(img, cloudX - dw / 2 + 4, screenY - dh / 2 + 7, dw, dh);
        ctx.filter = "none";
        ctx.globalAlpha = cloudAlpha * 0.88;
        ctx.drawImage(img, cloudX - dw / 2, screenY - dh / 2, dw, dh);
        ctx.restore();
      } else {
        // Fallback: programmatic cloud
        ctx.globalAlpha = cloudAlpha * 0.6;
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.ellipse(cloudX, screenY, 40 * cloud.scale, 18 * cloud.scale, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath();
        ctx.ellipse(cloudX + 30 * cloud.scale, screenY + 5 * cloud.scale, 28 * cloud.scale, 14 * cloud.scale, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath();
        ctx.ellipse(cloudX - 25 * cloud.scale, screenY + 6 * cloud.scale, 24 * cloud.scale, 13 * cloud.scale, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}

function drawParticle(ctx: CanvasRenderingContext2D, p: Particle) {
  const alpha = p.life / p.maxLife;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = p.color;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawHUD(ctx: CanvasRenderingContext2D, score: number, buffLevel: number, playerState: PlayerState, bestScore: number) {
  // Score panel
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  drawRoundRect(ctx, 10, 70, 140, 54, 12);
  ctx.fill();

  ctx.fillStyle = "#fff";
  ctx.font = "bold 22px 'Fredoka One', cursive";
  ctx.textAlign = "left";
  ctx.fillText(score.toLocaleString(), 20, 95);
  ctx.font = "12px 'Fredoka One', cursive";
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fillText(`BEST: ${bestScore.toLocaleString()}`, 20, 115);

  // Buff level display
  const potatoNames = ["Raw", "Fresh", "Cookin'", "Buff", "OP POTATO!"];
  const fryNames = ["Raw Fry", "Fresh Fry", "Cookin' Fry", "Buff Fry", "OP FRY!"];
  const buffNames = playerState === "fry" ? fryNames : potatoNames;
  const buffColors = ["#c8a050", "#d4aa58", "#8bc84a", "#e8c060", "#FFD700"];
  const bname = buffNames[Math.min(buffLevel, 4)];
  const bcolor = buffColors[Math.min(buffLevel, 4)];

  const bw = 150;
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  drawRoundRect(ctx, CANVAS_W - bw - 10, 70, bw, 54, 12);
  ctx.fill();

  ctx.fillStyle = bcolor;
  ctx.font = "bold 14px 'Fredoka One', cursive";
  ctx.textAlign = "right";
  ctx.fillText(bname, CANVAS_W - 18, 90);

  // Buff progress pips
  const pipW = 22;
  const pipStartX = CANVAS_W - bw - 5 + (bw - (5 * pipW + 4 * 4)) / 2;
  for (let i = 0; i < 5; i++) {
    const px = pipStartX + i * (pipW + 4);
    ctx.fillStyle = i <= buffLevel ? buffColors[i] : "rgba(255,255,255,0.15)";
    drawRoundRect(ctx, px, 100, pipW, 16, 5);
    ctx.fill();
    if (i <= buffLevel) {
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      drawRoundRect(ctx, px, 100, pipW, 5, 3);
      ctx.fill();
    }
  }

  // Fry warning indicator
  if (playerState === "fry") {
    ctx.fillStyle = "rgba(255,100,0,0.85)";
    drawRoundRect(ctx, CANVAS_W / 2 - 70, 70, 140, 36, 10);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 14px 'Fredoka One', cursive";
    ctx.textAlign = "center";
    ctx.fillText("🍟 FRENCH FRIED!", CANVAS_W / 2, 93);
  }
}

function drawMenu(ctx: CanvasRenderingContext2D, bestScore: number, t: number, sprites: SpriteMap | null = null) {
  // Best score
  if (bestScore > 0) {
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    drawRoundRect(ctx, CANVAS_W / 2 - 90, CANVAS_H * 0.78, 180, 40, 10);
    ctx.fill();
    ctx.fillStyle = "#000";
    ctx.font = "bold 13px 'Fredoka One', cursive";
    ctx.fillText(`BEST: ${bestScore.toLocaleString()}`, CANVAS_W / 2, CANVAS_H * 0.78 + 16);
    ctx.fillStyle = "#000";
    ctx.font = "12px 'Fredoka One', cursive";
    ctx.fillText("Keep jumping higher!", CANVAS_W / 2, CANVAS_H * 0.78 + 32);
  }

  // Leaderboard button
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  drawRoundRect(ctx, MENU_LB_BTN.x, MENU_LB_BTN.y, MENU_LB_BTN.w, MENU_LB_BTN.h, 14);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = "#000";
  ctx.font = "bold 15px 'Fredoka One', cursive";
  ctx.fillText("Leaderboard", CANVAS_W / 2, MENU_LB_BTN.y + 28);
}

function drawDeadScreen(ctx: CanvasRenderingContext2D, score: number, bestScore: number, t: number, sprites: SpriteMap | null = null) {
  ctx.fillStyle = "rgba(0,0,0,0.65)";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Panel
  ctx.fillStyle = "#1a0a2e";
  drawRoundRect(ctx, DEAD_PX, DEAD_PY, 300, DEAD_PH, 20);
  ctx.fill();
  ctx.strokeStyle = "#FFD700";
  ctx.lineWidth = 3;
  drawRoundRect(ctx, DEAD_PX, DEAD_PY, 300, DEAD_PH, 20);
  ctx.stroke();

  // Mashed potato sprite or fallback emoji
  ctx.textAlign = "center";
  if (sprites?.gameOver) {
    const goW = 138, goH = 92;
    ctx.drawImage(sprites.gameOver, CANVAS_W / 2 - goW / 2, DEAD_PY + 6, goW, goH);
  } else {
    ctx.font = "56px 'Fredoka One', cursive";
    ctx.fillText("🥣", CANVAS_W / 2, DEAD_PY + 65);
  }

  ctx.fillStyle = "#fff";
  ctx.font = "bold 26px 'Fredoka One', cursive";
  ctx.fillText("MASHED!", CANVAS_W / 2, DEAD_PY + 104);

  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = "14px 'Fredoka One', cursive";
  ctx.fillText("Your potato got obliterated", CANVAS_W / 2, DEAD_PY + 122);

  ctx.fillStyle = "#FFD700";
  ctx.font = "bold 20px 'Fredoka One', cursive";
  ctx.fillText(`Score: ${score.toLocaleString()}`, CANVAS_W / 2, DEAD_PY + 154);

  if (score >= bestScore && score > 0) {
    ctx.fillStyle = "#ff4";
    ctx.font = "bold 14px 'Fredoka One', cursive";
    ctx.fillText("NEW BEST!", CANVAS_W / 2, DEAD_PY + 177);
  } else {
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = "13px 'Fredoka One', cursive";
    ctx.fillText(`Best: ${bestScore.toLocaleString()}`, CANVAS_W / 2, DEAD_PY + 177);
  }

  // Divider
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(DEAD_PX + 20, DEAD_PY + 192); ctx.lineTo(DEAD_PX + 280, DEAD_PY + 192);
  ctx.stroke();

  // Submit Score button
  ctx.fillStyle = "#FFD700";
  ctx.shadowColor = "#FFD700"; ctx.shadowBlur = 10;
  drawRoundRect(ctx, DEAD_SUBMIT_BTN.x, DEAD_SUBMIT_BTN.y, DEAD_SUBMIT_BTN.w, DEAD_SUBMIT_BTN.h, 12);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#1a0a00";
  ctx.font = "bold 16px 'Fredoka One', cursive";
  ctx.fillText("Submit Score", CANVAS_W / 2, DEAD_SUBMIT_BTN.y + 29);

  // Play Again button
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  drawRoundRect(ctx, DEAD_REPLAY_BTN.x, DEAD_REPLAY_BTN.y, DEAD_REPLAY_BTN.w, DEAD_REPLAY_BTN.h, 10);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.lineWidth = 1;
  ctx.stroke();
  const pulseAlpha = 0.7 + Math.sin(t * 0.005) * 0.3;
  ctx.globalAlpha = pulseAlpha;
  ctx.fillStyle = "#fff";
  ctx.font = "14px 'Fredoka One', cursive";
  ctx.fillText("Play Again", CANVAS_W / 2, DEAD_REPLAY_BTN.y + 25);
  ctx.globalAlpha = 1;
}

function drawSettingsPanel(
  ctx: CanvasRenderingContext2D,
  controlMode: "tilt" | "tap",
  musicOn: boolean,
  soundOn: boolean
) {
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  const px = SET_PX;
  const py = SET_PY;

  ctx.fillStyle = "#1a0a2e";
  drawRoundRect(ctx, px, py, SET_PW, SET_PH, 20);
  ctx.fill();
  ctx.strokeStyle = "#FFD700";
  ctx.lineWidth = 3;
  drawRoundRect(ctx, px, py, SET_PW, SET_PH, 20);
  ctx.stroke();

  ctx.fillStyle = "#fff";
  ctx.font = "bold 22px 'Fredoka One', cursive";
  ctx.textAlign = "center";
  ctx.fillText("⚙ SETTINGS", CANVAS_W / 2, py + 38);

  ctx.font = "16px 'Fredoka One', cursive";
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.fillText("Controls", CANVAS_W / 2, py + 72);

  // Tilt button
  const isTilt = controlMode === "tilt";
  ctx.fillStyle = isTilt ? "#FFD700" : "rgba(255,255,255,0.2)";
  drawRoundRect(ctx, SET_TILT_BTN.x, SET_TILT_BTN.y, SET_TILT_BTN.w, SET_TILT_BTN.h, 10);
  ctx.fill();
  ctx.fillStyle = isTilt ? "#000" : "#fff";
  ctx.font = "bold 14px 'Fredoka One', cursive";
  ctx.fillText("📱 Tilt", SET_TILT_BTN.x + SET_TILT_BTN.w / 2, SET_TILT_BTN.y + 26);

  // Tap button
  ctx.fillStyle = !isTilt ? "#FFD700" : "rgba(255,255,255,0.2)";
  drawRoundRect(ctx, SET_TAP_BTN.x, SET_TAP_BTN.y, SET_TAP_BTN.w, SET_TAP_BTN.h, 10);
  ctx.fill();
  ctx.fillStyle = !isTilt ? "#000" : "#fff";
  ctx.fillText("👆 Tap", SET_TAP_BTN.x + SET_TAP_BTN.w / 2, SET_TAP_BTN.y + 26);

  ctx.font = "16px 'Fredoka One', cursive";
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.fillText("Audio", CANVAS_W / 2, py + 142);

  // Music toggle button
  ctx.fillStyle = musicOn ? "#FFD700" : "rgba(255,255,255,0.2)";
  drawRoundRect(ctx, SET_MUSIC_BTN.x, SET_MUSIC_BTN.y, SET_MUSIC_BTN.w, SET_MUSIC_BTN.h, 10);
  ctx.fill();
  ctx.fillStyle = musicOn ? "#000" : "#fff";
  ctx.font = "bold 14px 'Fredoka One', cursive";
  ctx.fillText(`🎵 Music: ${musicOn ? "ON" : "OFF"}`, SET_MUSIC_BTN.x + SET_MUSIC_BTN.w / 2, SET_MUSIC_BTN.y + 26);

  // Sound effects toggle button
  ctx.fillStyle = soundOn ? "#FFD700" : "rgba(255,255,255,0.2)";
  drawRoundRect(ctx, SET_SFX_BTN.x, SET_SFX_BTN.y, SET_SFX_BTN.w, SET_SFX_BTN.h, 10);
  ctx.fill();
  ctx.fillStyle = soundOn ? "#000" : "#fff";
  ctx.fillText(`🔊 Sound FX: ${soundOn ? "ON" : "OFF"}`, SET_SFX_BTN.x + SET_SFX_BTN.w / 2, SET_SFX_BTN.y + 26);

  // Close / Done button
  ctx.fillStyle = "#f5a020";
  drawRoundRect(ctx, SET_DONE_BTN.x, SET_DONE_BTN.y, SET_DONE_BTN.w, SET_DONE_BTN.h, 12);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "bold 15px 'Fredoka One', cursive";
  ctx.fillText("Done", CANVAS_W / 2, SET_DONE_BTN.y + 25);
}

function drawSettingsButton(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  drawRoundRect(ctx, CANVAS_W - 54, CANVAS_H - 54, 44, 44, 10);
  ctx.fill();
  ctx.font = "24px 'Fredoka One', cursive";
  ctx.textAlign = "center";
  ctx.fillText("⚙", CANVAS_W - 32, CANVAS_H - 24);
}

function drawTapZones(ctx: CanvasRenderingContext2D) {
  // Subtle left/right tap zone indicators at bottom
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.fillRect(0, CANVAS_H - 130, CANVAS_W / 2, 130);
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.fillRect(CANVAS_W / 2, CANVAS_H - 130, CANVAS_W / 2, 130);
  // Arrows
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.font = "28px 'Fredoka One', cursive";
  ctx.textAlign = "center";
  ctx.fillText("◀", CANVAS_W / 4, CANVAS_H - 40);
  ctx.fillText("▶", (CANVAS_W * 3) / 4, CANVAS_H - 40);
}

// ─── WIN SEQUENCE HELPERS ─────────────────────────────────────────────────────

function playVictoryFanfare() {
  try {
    const actx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    // Ascending arpeggio: C5 E5 G5 C6 E6
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    const timings = [0, 0.13, 0.26, 0.39, 0.55];
    const durs   = [0.38, 0.38, 0.38, 0.38, 1.4];
    notes.forEach((freq, i) => {
      const osc  = actx.createOscillator();
      const gain = actx.createGain();
      osc.connect(gain); gain.connect(actx.destination);
      osc.frequency.value = freq;
      osc.type = i < 4 ? "square" : "sawtooth";
      const t0 = actx.currentTime + timings[i];
      gain.gain.setValueAtTime(0.001, t0);
      gain.gain.linearRampToValueAtTime(i < 4 ? 0.10 : 0.16, t0 + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + durs[i]);
      osc.start(t0); osc.stop(t0 + durs[i] + 0.05);
    });
    // Low bass thump on the final beat
    const bass = actx.createOscillator();
    const bg   = actx.createGain();
    bass.connect(bg); bg.connect(actx.destination);
    bass.frequency.value = 130; bass.type = "sine";
    const bt = actx.currentTime + 0.39;
    bg.gain.setValueAtTime(0.001, bt);
    bg.gain.linearRampToValueAtTime(0.38, bt + 0.04);
    bg.gain.exponentialRampToValueAtTime(0.001, bt + 0.9);
    bass.start(bt); bass.stop(bt + 0.95);
  } catch (_) { /* audio not available */ }
}

function spawnConfetti(gs: GameState) {
  const colors = ["#FFD700","#FF6B6B","#4ECDC4","#45B7D1","#C3A5FF","#FFEAA7","#FF9FF3","#A8E6CF","#FFB347","#87CEEB"];
  for (let i = 0; i < 100; i++) {
    gs.confetti.push({
      id: gs.nextId++,
      x: Math.random() * CANVAS_W,
      y: -30 - Math.random() * 300,
      vx: (Math.random() - 0.5) * 4,
      vy: 2 + Math.random() * 3,
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.18,
      color: colors[Math.floor(Math.random() * colors.length)],
      w: 8 + Math.random() * 10,
      h: 4 + Math.random() * 7,
      shape: Math.random() > 0.35 ? "rect" : "circle",
    });
  }
}

function tickConfetti(gs: GameState, dt: number) {
  const step = dt / 16;
  for (const c of gs.confetti) {
    c.x += c.vx * step;
    c.y += c.vy * step;
    c.vy = Math.min(c.vy + 0.04 * step, 6);
    c.vx += Math.sin(c.rotation * 2.1) * 0.06 * step;
    c.rotation += c.rotSpeed * step;
    if (c.y > CANVAS_H + 20) {
      c.y = -20 - Math.random() * 60;
      c.x = Math.random() * CANVAS_W;
      c.vy = 2 + Math.random() * 3;
    }
    if (c.x < -20) c.x = CANVAS_W + 10;
    if (c.x > CANVAS_W + 20) c.x = -10;
  }
}

function drawConfetti(ctx: CanvasRenderingContext2D, confetti: Confetti[]) {
  for (const c of confetti) {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.rotation);
    ctx.fillStyle = c.color;
    ctx.globalAlpha = 0.92;
    if (c.shape === "circle") {
      ctx.beginPath();
      ctx.ellipse(0, 0, c.w / 2, c.h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

// ── Hit-area constants (canvas coords) ─────────────────────────────────────
// Win screen
const WIN_SHARE_BTN  = { x: CANVAS_W / 2 - 145, y: 568, w: 134, h: 50 };
const WIN_REPLAY_BTN = { x: CANVAS_W / 2 + 11,  y: 568, w: 134, h: 50 };
const WIN_LB_BTN     = { x: CANVAS_W / 2 - 100, y: 632, w: 200, h: 46 };

// Dead screen (panel is 300 tall, centered)
const DEAD_PH = 300;
const DEAD_PY = (CANVAS_H - DEAD_PH) / 2; // 230
const DEAD_PX = (CANVAS_W - 300) / 2;     // 60
const DEAD_SUBMIT_BTN = { x: DEAD_PX + 25, y: DEAD_PY + 196, w: 250, h: 44 };
const DEAD_REPLAY_BTN  = { x: DEAD_PX + 60, y: DEAD_PY + 254, w: 180, h: 38 };

// Menu leaderboard button
const MENU_LB_BTN = { x: CANVAS_W / 2 - 100, y: 648, w: 200, h: 44 };

// Leaderboard screen "Play Again" button
const LB_PLAY_BTN = { x: CANVAS_W / 2 - 100, y: CANVAS_H - 88, w: 200, h: 50 };

// Settings panel (panel is 300 wide x 340 tall, centered)
const SET_PW = 300;
const SET_PH = 340;
const SET_PX = (CANVAS_W - SET_PW) / 2; // 60
const SET_PY = (CANVAS_H - SET_PH) / 2; // 210
const SET_TILT_BTN  = { x: SET_PX + 20,  y: SET_PY + 82,  w: 120, h: 40 };
const SET_TAP_BTN   = { x: SET_PX + 160, y: SET_PY + 82,  w: 120, h: 40 };
const SET_MUSIC_BTN = { x: SET_PX + 20,  y: SET_PY + 152, w: 260, h: 40 };
const SET_SFX_BTN   = { x: SET_PX + 20,  y: SET_PY + 202, w: 260, h: 40 };
const SET_DONE_BTN  = { x: SET_PX + 80,  y: SET_PY + 262, w: 140, h: 38 };

function drawWinScreen(ctx: CanvasRenderingContext2D, score: number, bestScore: number, winAnim: number, t: number, wonAsFry = false) {
  const alpha = Math.min(1, winAnim * 1.6);
  if (alpha <= 0) return;

  // Dark overlay
  ctx.fillStyle = `rgba(10,5,30,${alpha * 0.82})`;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  ctx.save();
  ctx.globalAlpha = alpha;

  // Pulsing gold glow behind text
  const pulse = 0.75 + Math.sin(t * 0.004) * 0.25;
  const glow = ctx.createRadialGradient(CANVAS_W / 2, 230, 20, CANVAS_W / 2, 230, 210);
  glow.addColorStop(0, `rgba(255,215,0,${0.35 * pulse})`);
  glow.addColorStop(1, "rgba(255,150,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 60, CANVAS_W, 380);

  // "YOU ARE" line
  ctx.textAlign = "center";
  ctx.font = "bold 32px 'Fredoka One', cursive";
  ctx.fillStyle = "#fff";
  ctx.shadowColor = "#FFD700";
  ctx.shadowBlur = 18;
  ctx.fillText("YOU ARE", CANVAS_W / 2, 145);

  // Main title — OP POTATO! or OP FRY!
  const mainTitle = wonAsFry ? "OP FRY!" : "OP POTATO!";
  ctx.font = `bold ${wonAsFry ? 74 : 68}px 'Fredoka One', cursive`;
  ctx.shadowBlur = 36;
  const bounce = Math.sin(t * 0.005) * 5;
  ctx.strokeStyle = wonAsFry ? "#C07000" : "#B8860B";
  ctx.lineWidth = 6;
  ctx.strokeText(mainTitle, CANVAS_W / 2, 228 + bounce);
  const tg = ctx.createLinearGradient(0, 170, 0, 240);
  if (wonAsFry) {
    tg.addColorStop(0, "#FFE98A");
    tg.addColorStop(0.5, "#FFC300");
    tg.addColorStop(1, "#FF6B00");
  } else {
    tg.addColorStop(0, "#FFF176");
    tg.addColorStop(0.5, "#FFD700");
    tg.addColorStop(1, "#FF8C00");
  }
  ctx.fillStyle = tg;
  ctx.fillText(mainTitle, CANVAS_W / 2, 228 + bounce);

  // Trophy / fry emoji + optional subtitle
  ctx.shadowBlur = 0;
  ctx.font = "52px 'Fredoka One', cursive";
  ctx.fillText(wonAsFry ? "🍟" : "🏆", CANVAS_W / 2, wonAsFry ? 288 : 295);
  if (wonAsFry) {
    ctx.font = "italic 14px 'Fredoka One', cursive";
    ctx.fillStyle = "rgba(255,220,120,0.90)";
    ctx.fillText("You got cooked but never quit.", CANVAS_W / 2, 312);
    ctx.fillText("A true warrior.", CANVAS_W / 2, 328);
  }

  // Score display
  ctx.shadowBlur = 0;
  ctx.font = "bold 22px 'Fredoka One', cursive";
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.fillText("FINAL SCORE", CANVAS_W / 2, 338);
  ctx.font = "bold 52px 'Fredoka One', cursive";
  ctx.fillStyle = "#FFD700";
  ctx.shadowColor = "#FF8C00";
  ctx.shadowBlur = 14;
  ctx.fillText(score.toLocaleString(), CANVAS_W / 2, 392);
  ctx.shadowBlur = 0;

  // New best badge
  if (score >= bestScore) {
    ctx.font = "bold 17px 'Fredoka One', cursive";
    ctx.fillStyle = "#fff";
    ctx.fillStyle = "#FF6B6B";
    drawRoundRect(ctx, CANVAS_W / 2 - 68, 402, 136, 30, 15);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 15px 'Fredoka One', cursive";
    ctx.fillText("NEW BEST!", CANVAS_W / 2, 421);
  }

  // Share button
  ctx.shadowBlur = 12;
  ctx.shadowColor = "#FFD700";
  ctx.fillStyle = "#FFD700";
  drawRoundRect(ctx, WIN_SHARE_BTN.x, WIN_SHARE_BTN.y, WIN_SHARE_BTN.w, WIN_SHARE_BTN.h, 14);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#1a0a00";
  ctx.font = "bold 17px 'Fredoka One', cursive";
  ctx.fillText("Share", WIN_SHARE_BTN.x + WIN_SHARE_BTN.w / 2, WIN_SHARE_BTN.y + 31);

  // Replay button
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  drawRoundRect(ctx, WIN_REPLAY_BTN.x, WIN_REPLAY_BTN.y, WIN_REPLAY_BTN.w, WIN_REPLAY_BTN.h, 14);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.fillText("Play Again", WIN_REPLAY_BTN.x + WIN_REPLAY_BTN.w / 2, WIN_REPLAY_BTN.y + 31);

  // Submit & Leaderboard button (full-width below)
  ctx.shadowColor = "#4ECDC4"; ctx.shadowBlur = 8;
  ctx.fillStyle = "rgba(78,205,196,0.28)";
  drawRoundRect(ctx, WIN_LB_BTN.x, WIN_LB_BTN.y, WIN_LB_BTN.w, WIN_LB_BTN.h, 14);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(78,205,196,0.7)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.font = "bold 15px 'Fredoka One', cursive";
  ctx.fillText("Submit & View Leaderboard", CANVAS_W / 2, WIN_LB_BTN.y + 30);

  ctx.restore();
}

const STAGE_EMOJIS = ["🥔", "✨", "💪", "🔥", "👑"];

function drawLeaderboard(
  ctx: CanvasRenderingContext2D,
  entries: LeaderboardEntry[],
  loading: boolean,
  t: number
) {
  // Background
  ctx.fillStyle = "rgba(10,5,30,0.96)";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Header glow
  const glow = ctx.createRadialGradient(CANVAS_W / 2, 80, 10, CANVAS_W / 2, 80, 160);
  glow.addColorStop(0, "rgba(255,215,0,0.22)");
  glow.addColorStop(1, "rgba(255,150,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, CANVAS_W, 200);

  // Title
  ctx.textAlign = "center";
  ctx.font = "bold 36px 'Fredoka One', cursive";
  ctx.fillStyle = "#FFD700";
  ctx.shadowColor = "#FF8C00"; ctx.shadowBlur = 18;
  ctx.fillText("🏆 TOP 10", CANVAS_W / 2, 60);
  ctx.shadowBlur = 0;
  ctx.font = "13px 'Fredoka One', cursive";
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.fillText("Global Leaderboard", CANVAS_W / 2, 84);

  if (loading) {
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "18px 'Fredoka One', cursive";
    const dots = ".".repeat(1 + (Math.floor(t / 400) % 3));
    ctx.fillText(`Loading${dots}`, CANVAS_W / 2, 380);
  } else if (entries.length === 0) {
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = "18px 'Fredoka One', cursive";
    ctx.fillText("No scores yet — be the first!", CANVAS_W / 2, 380);
  } else {
    const rowH = 46;
    const startY = 108;
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const ry = startY + i * rowH;

      // Row background
      const isTop3 = i < 3;
      ctx.fillStyle = isTop3
        ? `rgba(255,215,0,${0.08 - i * 0.02})`
        : "rgba(255,255,255,0.04)";
      drawRoundRect(ctx, 14, ry, CANVAS_W - 28, rowH - 4, 10);
      ctx.fill();

      // Rank medal
      ctx.font = "bold 18px 'Fredoka One', cursive";
      const medals = ["🥇", "🥈", "🥉"];
      const rankStr = i < 3 ? medals[i] : `#${i + 1}`;
      ctx.fillStyle = i < 3 ? "#FFD700" : "rgba(255,255,255,0.55)";
      ctx.textAlign = "left";
      ctx.font = i < 3 ? "18px 'Fredoka One', cursive" : "bold 14px 'Fredoka One', cursive";
      ctx.fillText(rankStr, 26, ry + 28);

      // Name
      ctx.textAlign = "left";
      ctx.font = `bold 15px 'Fredoka One', cursive`;
      ctx.fillStyle = i < 3 ? "#fff" : "rgba(255,255,255,0.85)";
      ctx.fillText(e.playerName.slice(0, 12), 72, ry + 28);

      // Stage emoji
      ctx.font = "16px 'Fredoka One', cursive";
      ctx.textAlign = "right";
      ctx.fillText(STAGE_EMOJIS[Math.min(e.stageReached, 4)], CANVAS_W - 80, ry + 28);

      // Score
      ctx.font = `bold ${i < 3 ? 16 : 14}px 'Fredoka One', cursive`;
      ctx.fillStyle = i === 0 ? "#FFD700" : i === 1 ? "#C0C0C0" : i === 2 ? "#CD7F32" : "rgba(255,255,255,0.75)";
      ctx.fillText(e.score.toLocaleString(), CANVAS_W - 20, ry + 28);
    }
  }

  // Play Again button
  ctx.shadowColor = "#FFD700"; ctx.shadowBlur = 10;
  ctx.fillStyle = "#FFD700";
  drawRoundRect(ctx, LB_PLAY_BTN.x, LB_PLAY_BTN.y, LB_PLAY_BTN.w, LB_PLAY_BTN.h, 14);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#1a0a00";
  ctx.font = "bold 17px 'Fredoka One', cursive";
  ctx.textAlign = "center";
  ctx.fillText("Play Again", CANVAS_W / 2, LB_PLAY_BTN.y + 33);
}

// ─── GAME LOGIC ───────────────────────────────────────────────────────────────

function spawnPlatformsAbove(gs: GameState) {
  if (gs.platforms.length === 0) return;
  const topY = Math.min(...gs.platforms.map((p) => p.y));
  const topOfScreen = gs.cameraY - 200;
  let y = topY - (70 + Math.random() * 60);
  let nextId = gs.nextId;

  while (y > topOfScreen) {
    const difficulty = Math.min(gs.score / 3000, 1);
    const narrowing = 1 - difficulty * 0.4;
    const w = (55 + Math.random() * 50) * narrowing;
    const x = 15 + Math.random() * (CANVAS_W - 30 - w);
    const typeRoll = Math.random();
    // Spring: rare bonus at high score
    const type: PlatformType = (() => {
      if (gs.score > 4000 && typeRoll > 0.92) return "spring";
      // Score-tiered platform weights (cumulative):
      // Low  (0–1500):   board 70%, sack 30%
      // Mid  (1500–4000): board 55%, sack 15%, bakingsheet 30%
      // High (4000+):    board 50%, bakingsheet 25%, shelf 20%, sack 5%
      const r = Math.random();
      if (gs.score < 1500) {
        return r < 0.70 ? "board" : "sack";
      } else if (gs.score < 4000) {
        if (r < 0.55) return "board";
        if (r < 0.70) return "sack";
        return "bakingsheet";
      } else {
        if (r < 0.50) return "board";
        if (r < 0.75) return "bakingsheet";
        if (r < 0.95) return "shelf";
        return "sack";
      }
    })();

    // Occasionally override with heal platform when player is in fry state
    const isEdgePosition = x < 80 || (x + w) > CANVAS_W - 80;
    const finalType: PlatformType =
      (gs.player.state === "fry" && isEdgePosition && Math.random() < 0.18) ? "heal" : type;
    gs.platforms.push({ id: nextId++, x, y, w, type: finalType, bounced: false, springAnim: 0 });

    // Possibly spawn a hazard near this platform
    const hazardChance = Math.min(0.20 + gs.score / 25000, 0.55);
    if (gs.score > 200 && Math.random() < hazardChance) {
      const hazTypes: HazardType[] = ["grater", "peeler", "pot"];
      const hType = hazTypes[Math.floor(Math.random() * hazTypes.length)];
      const hw = hType === "peeler" ? 20 : 42;
      const hh = hType === "peeler" ? 60 : 44;
      const vx = gs.score > 3000 && Math.random() > 0.6 ? (Math.random() - 0.5) * 1.5 : 0;
      const CLEARANCE = 80;
      // Returns true if the hazard rect comes within CLEARANCE px of any platform
      const conflictsPlatforms = (hx: number, hy: number) =>
        gs.platforms.some((p) =>
          !(
            hx + hw + CLEARANCE <= p.x ||
            hx >= p.x + p.w + CLEARANCE ||
            hy + hh + CLEARANCE <= p.y ||
            hy >= p.y + PLAT_H + CLEARANCE
          )
        );
      // Try up to 14 random positions spread across a wider vertical band
      let placed = false;
      for (let attempt = 0; attempt < 14; attempt++) {
        const hx = 10 + Math.random() * (CANVAS_W - 20 - hw);
        // Search 100–250px above the triggering platform so there's room to clear it
        const hy = y - hh - 100 - Math.random() * 150;
        if (!conflictsPlatforms(hx, hy)) {
          gs.hazards.push({ id: nextId++, x: hx, y: hy, w: hw, h: hh, type: hType, vx, phase: Math.random() * Math.PI * 2 });
          placed = true;
          break;
        }
      }
      void placed; // skip if no clear spot found
    }

    y -= 120 + Math.random() * 80;
  }

  gs.nextId = nextId;
}

function removeOffscreen(gs: GameState) {
  const cutoff = gs.cameraY + CANVAS_H + 100;
  gs.platforms = gs.platforms.filter((p) => p.y < cutoff);
  gs.hazards = gs.hazards.filter((h) => h.y < cutoff && h.y > gs.cameraY - 400);
  gs.particles = gs.particles.filter((p) => p.life > 0);
}

function spawnParticles(gs: GameState, x: number, y: number, color: string, count: number, speed = 3) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const s = speed * (0.5 + Math.random());
    gs.particles.push({
      id: gs.nextId++,
      x,
      y,
      vx: Math.cos(angle) * s,
      vy: Math.sin(angle) * s - 2,
      life: 30 + Math.random() * 20,
      maxLife: 50,
      color,
      size: 3 + Math.random() * 4,
    });
  }
}

function tickGame(gs: GameState, tiltX: number, tapDir: number, dt: number, onSound?: (event: SoundEvent) => void): boolean {
  const { player } = gs;
  if (gs.phase !== "playing" && gs.phase !== "winning") return false;

  gs.bgPhase += dt;
  if (gs.jumpFlash > 0) gs.jumpFlash -= dt;

  // Determine horizontal input. Tilt mode still prefers device orientation, but
  // taps/arrow-WASD keys (tapDir) always work as a fallback so desktop/no-tilt
  // devices and quick taps immediately move the player.
  const inputX = gs.controlMode === "tilt" && tiltX !== 0 ? tiltX : tapDir;

  // Apply physics
  player.vx = lerp(player.vx, inputX * PLAYER_SPEED, 0.28);
  // Floaty apex: reduce gravity when near the peak of the arc
  const apexFactor = Math.min(1, Math.abs(player.vy) / 4);
  player.vy += GRAVITY * (0.25 + 0.75 * apexFactor);

  player.x += player.vx;
  player.y += player.vy;

  // Wrap horizontally
  const margin = PLAYER_W / 2;
  if (player.x < -margin) player.x = CANVAS_W + margin;
  if (player.x > CANVAS_W + margin) player.x = -margin;

  // Squish/stretch
  if (player.vy < -3) {
    player.stretchY = lerp(player.stretchY, 1.3, 0.15);
  } else if (player.vy > 3) {
    player.stretchY = lerp(player.stretchY, 0.75, 0.12);
  } else {
    player.stretchY = lerp(player.stretchY, 1, 0.18);
  }

  // Wobble
  player.wobble += 0.15;
  if (Math.abs(player.vx) < 0.5) player.wobble *= 0.9;

  // Blink timer
  player.eyeBlink -= dt;
  if (player.eyeBlink < 0) {
    player.eyeBlink = 200 + Math.random() * 300;
  }

  // Invincibility
  if (player.invincTimer > 0) player.invincTimer -= dt;

  // Camera: only scroll up
  const targetCameraY = player.y - CANVAS_H * (1 - CAMERA_LEAD);
  if (targetCameraY < gs.cameraY) {
    gs.cameraY = targetCameraY;
  }
  // Clouds live in world space, like platforms/hazards — moving the camera moves
  // their screen position automatically. This only recycles ones that scroll off.
  updateClouds(gs);

  // Score: based on upward distance
  const newScore = Math.max(0, Math.floor((gs.startY - player.y) / 5));
  if (newScore > gs.score) {
    gs.score = newScore;
    if (gs.score > gs.bestScore) gs.bestScore = gs.score;
  }

  // Update buff level relative to when this form started (so Stage 1 always on transition)
  const newBuffLevel = buffLevelForScore(gs.score - gs.formStartScore);
  if (newBuffLevel > player.prevBuffLevel) {
    player.levelUpAnim = 1.0;
    player.prevBuffLevel = newBuffLevel;
    onSound?.("powerup");
    spawnParticles(gs, player.x, player.y, "#FFD700", 18, 6);
    spawnParticles(gs, player.x, player.y, "#fff", 12, 4);
  }
  player.buffLevel = newBuffLevel;
  if (player.levelUpAnim > 0) {
    player.levelUpAnim = Math.max(0, player.levelUpAnim - dt * 0.0011);
  }

  // ── Win condition: first time reaching OP POTATO (stage 4) ──
  if (newBuffLevel === 4 && !gs.winTriggered) {
    gs.winTriggered = true;
    gs.wonAsFry = player.state === "fry";
    gs.phase = "winning";
    gs.slowMo = 1.0;
    playVictoryFanfare();
    spawnConfetti(gs);
    spawnParticles(gs, player.x, player.y, "#FFD700", 30, 8);
    spawnParticles(gs, player.x, player.y, "#fff",    20, 6);
    spawnParticles(gs, player.x, player.y, "#FF6B6B", 15, 5);
  }

  // Don't process hazard hits or death falls during the win sequence
  if (gs.phase === "winning") {
    spawnPlatformsAbove(gs);
    removeOffscreen(gs);
    return false;
  }

  // Platform collision (only when falling or barely moving up)
  if (player.vy >= -1 && player.state !== "dead") {
    const playerBottom = player.y + PLAYER_H / 2;
    const playerLeft = player.x - PLAYER_W / 2 * (player.state === "fry" ? 0.45 : 0.65);
    const playerRight = player.x + PLAYER_W / 2 * (player.state === "fry" ? 0.45 : 0.65);

    for (const plat of gs.platforms) {
      const sy = plat.y - gs.cameraY; // screen Y of platform
      const platTop = plat.y;
      if (
        playerBottom >= platTop - 4 &&
        playerBottom <= platTop + player.vy + 16 &&
        playerRight > plat.x &&
        playerLeft < plat.x + plat.w
      ) {
        // Land on platform
        const jumpV = plat.type === "spring" ? JUMP_VY * 1.4 : JUMP_VY;
        player.vy = jumpV;
        player.y = platTop - PLAYER_H / 2;
        player.stretchY = 0.65; // squish
        player.jumpCount++;
        gs.jumpFlash = 120;

        const isFry = player.state === "fry";
        if (plat.type === "board") onSound?.(isFry ? "fry_board" : "potato_board");
        else if (plat.type === "sack") onSound?.(isFry ? "fry_sack" : "potato_sack");
        else if (plat.type === "bakingsheet") onSound?.(isFry ? "fry_sheet" : "potato_sheet");
        else if (plat.type === "shelf") onSound?.(isFry ? "fry_counter" : "potato_counter");
        else if (plat.type === "heal") onSound?.("heal");

        if (plat.type === "spring") {
          plat.springAnim = 1;
          spawnParticles(gs, player.x, plat.y - gs.cameraY + gs.cameraY, "#40ff40", 6, 4);
        }

        // Heal platform: restore fry → potato stage 1
        if (plat.type === "heal" && player.state === "fry") {
          player.state = "normal";
          gs.formStartScore = gs.score;
          player.prevBuffLevel = 0;
          player.invincTimer = 1500;
          spawnParticles(gs, player.x, player.y, "#4ECDC4", 18, 6);
          spawnParticles(gs, player.x, player.y, "#7FFFCF", 12, 5);
          spawnParticles(gs, player.x, player.y, "#fff", 10, 4);
        }

        // Particles on jump
        spawnParticles(gs, player.x, player.y + PLAYER_H / 2, "#fff6", 4, 2);

        break;
      }
      // Animate spring
      if (plat.springAnim > 0) {
        plat.springAnim = Math.max(0, plat.springAnim - 0.05);
      }
    }
  } else {
    for (const plat of gs.platforms) {
      if (plat.springAnim > 0) {
        plat.springAnim = Math.max(0, plat.springAnim - 0.05);
      }
    }
  }

  // Hazard collision
  if (player.invincTimer <= 0 && player.state !== "dead") {
    const playerLeft = player.x - PLAYER_W / 2 * 0.55;
    const playerRight = player.x + PLAYER_W / 2 * 0.55;
    const playerTop = player.y - PLAYER_H / 2 * 0.7;
    const playerBottom = player.y + PLAYER_H / 2 * 0.7;

    for (const hz of gs.hazards) {
      if (
        playerRight > hz.x &&
        playerLeft < hz.x + hz.w &&
        playerBottom > hz.y &&
        playerTop < hz.y + hz.h
      ) {
        const hazardSound: SoundEvent =
          hz.type === "grater" ? "hazard_grate" :
          hz.type === "peeler" ? "hazard_peel" :
          "hazard_sizzle";
        if (player.state === "normal") {
          player.state = "fry";
          gs.formStartScore = gs.score;
          player.prevBuffLevel = 0;
          player.invincTimer = 2500;
          onSound?.(hazardSound);
          spawnParticles(gs, player.x, player.y, "#f5c842", 14, 5);
        } else if (player.state === "fry") {
          player.state = "dead";
          onSound?.(hazardSound);
          spawnParticles(gs, player.x, player.y, "#fff", 20, 6);
          spawnParticles(gs, player.x, player.y, "#c8a050", 14, 4);
          gs.phase = "dead";
          return true; // game over
        }
        break;
      }
    }
  }

  // Move hazards
  for (const hz of gs.hazards) {
    if (hz.vx !== 0) {
      hz.x += hz.vx;
      if (hz.x < 0 || hz.x + hz.w > CANVAS_W) hz.vx = -hz.vx;
    }
  }

  // Update particles
  for (const p of gs.particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.1;
    p.life -= 1;
  }

  // Death by falling
  if (player.y > gs.cameraY + CANVAS_H + 60) {
    if (player.state === "normal") {
      player.state = "fry";
      gs.formStartScore = gs.score;
      player.prevBuffLevel = 0;
      player.invincTimer = 2000;
      player.vy = JUMP_VY * 0.8;
    } else {
      player.state = "dead";
      gs.phase = "dead";
      return true;
    }
  }

  // Spawn more platforms
  spawnPlatformsAbove(gs);
  removeOffscreen(gs);

  return false;
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function OpPotatoGame() {
  // Set to true to remove ads and expand canvas to full screen
  const adsRemoved = true;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState>(makeInitialState(0));
  const rafRef = useRef<number>(0);
  const lastTRef = useRef<number>(0);
  const tiltRef = useRef(0);
  const tapDirRef = useRef(0);

  // Splash / help screens
  const [showSplash, setShowSplash] = useState(true);
  const [showHelp, setShowHelp] = useState(false);

  // Leaderboard state
  const [showNameInput, setShowNameInput] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const leaderboardRef = useRef<LeaderboardEntry[]>([]);
  const leaderboardLoadingRef = useRef(false);
  const pendingScoreRef = useRef({ score: 0, stageReached: 0 });
  const spritesRef = useRef<SpriteMap | null>(null);
  const soundsRef = useRef<{
    potatoBoard: HTMLAudioElement | null;
    fryBoard: HTMLAudioElement | null;
    potatoSack: HTMLAudioElement | null;
    frySack: HTMLAudioElement | null;
    potatoSheet: HTMLAudioElement | null;
    frySheet: HTMLAudioElement | null;
    potatoCounter: HTMLAudioElement | null;
    fryCounter: HTMLAudioElement | null;
    heal: HTMLAudioElement | null;
    hazardGrate: HTMLAudioElement | null;
    hazardPeel: HTMLAudioElement | null;
    hazardSizzle: HTMLAudioElement | null;
    mashed: HTMLAudioElement | null;
    powerUp: HTMLAudioElement | null;
    bgMusic: HTMLAudioElement | null;
  }>({
    potatoBoard: null, fryBoard: null,
    potatoSack: null, frySack: null,
    potatoSheet: null, frySheet: null,
    potatoCounter: null, fryCounter: null,
    heal: null,
    hazardGrate: null, hazardPeel: null, hazardSizzle: null,
    mashed: null, powerUp: null, bgMusic: null,
  });
  const prevPhaseRef = useRef<GamePhase>("menu");

  // Load sprite images once on mount
  useEffect(() => {
    // Preload Fredoka One so canvas draws it immediately
    document.fonts.load("16px 'Fredoka One'").catch(() => {});
    // Loads a sprite and restores near-white semi-transparent pixels to fully opaque.
    // Background-removal tools often make white sprite detail (fur, teeth, bandage) transparent;
    // this one-time pixel pass fixes that before the first draw.
    const loadSprite = (src: string): HTMLCanvasElement => {
      const canvas = document.createElement("canvas");
      const img = new Image();
      img.onload = () => {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const c = canvas.getContext("2d");
        if (!c) return;
        c.drawImage(img, 0, 0);
        const imageData = c.getImageData(0, 0, canvas.width, canvas.height);
        const d = imageData.data;
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3];
          // Near-white pixel that is semi-transparent → make fully opaque
          if (r > 180 && g > 180 && b > 180 && a > 10 && a < 250) {
            d[i + 3] = 255;
          }
        }
        c.putImageData(imageData, 0, 0);
      };
      img.src = src;
      return canvas;
    };
    const loadImg = loadSprite; // alias kept so call sites below need no change
    spritesRef.current = {
      potato: [
        loadImg("/sprites/potato-1.png"),
        loadImg("/sprites/potato-2.png"),
        loadImg("/sprites/potato-3.png"),
        loadImg("/sprites/potato-4.png"),
        loadImg("/sprites/potato-5.png"),
      ],
      fry: [
        loadImg("/sprites/fry-1.png"),
        loadImg("/sprites/fry-2.png"),
        loadImg("/sprites/fry-3.png"),
        loadImg("/sprites/fry-4.png"),
        loadImg("/sprites/fry-5.png"),
      ],
      gameOver: loadImg("/sprites/game-over.png"),
      platformBoard: loadImg("/sprites/platform-board.png"),
      platformSack: loadImg("/sprites/platform-sack.png"),
      platformCountertop: loadImg("/sprites/platform-countertop.png"),
      platformBakingSheet: loadImg("/sprites/platform-bakingsheet.png"),
      platformHeal: loadImg("/sprites/platform-heal.png"),
      hazardPot: loadImg("/sprites/hazard-pot.png"),
      hazardPeeler: loadImg("/sprites/hazard-peeler.png"),
      hazardGrater: loadImg("/sprites/hazard-grater.png"),
      cloud: loadImg("/sprites/cloud.png"),
      title: loadImg("/sprites/title.png"),
    };
  }, []);

  // Load sounds
  useEffect(() => {
    const load = (src: string, loop = false, volume = 1): HTMLAudioElement => {
      const a = new Audio(src);
      a.loop = loop;
      a.volume = volume;
      a.preload = "auto";
      return a;
    };
    soundsRef.current = {
      potatoBoard:   load("/sounds/Impact_potato_board.ogg",   false, 0.50),
      fryBoard:      load("/sounds/Impact_fry_board.ogg",      false, 0.50),
      potatoSack:    load("/sounds/Impact_potato_sack.ogg",    false, 0.50),
      frySack:       load("/sounds/Impact_fry_sack.ogg",       false, 0.50),
      potatoSheet:   load("/sounds/Impact_potato_sheet.ogg",   false, 0.50),
      frySheet:      load("/sounds/Impact_fry_sheet.ogg",      false, 0.50),
      potatoCounter: load("/sounds/Impact_potato_counter.ogg", false, 0.50),
      fryCounter:    load("/sounds/Impact_fry_counter.ogg",    false, 0.50),
      heal:          load("/sounds/Impact_heal.ogg",           false, 0.60),
      hazardGrate:   load("/sounds/Hazard_Grate.ogg",          false, 0.70),
      hazardPeel:    load("/sounds/Hazard_Peeler.ogg",         false, 0.70),
      hazardSizzle:  load("/sounds/Hazard_Sizzle.mp3",         false, 0.70),
      mashed:        load("/sounds/Mashed.wav",                false, 0.80),
      powerUp:       load("/sounds/PowerUP.ogg",                false, 0.75),
      bgMusic:       load("/sounds/loop.ogg",                   true,  0.35),
    };
    // Browsers occasionally interrupt background audio (tab backgrounding, phone
    // calls, etc.) by pausing the element outside of our own pause() calls. Resume
    // it automatically unless the pause matches a state we intentionally paused for.
    const bgMusic = soundsRef.current.bgMusic;
    const onMusicPause = () => {
      const gs = stateRef.current;
      if (gs.phase === "playing" && gs.musicOn) {
        bgMusic?.play().catch(() => {});
      }
    };
    bgMusic?.addEventListener("pause", onMusicPause);
    return () => {
      bgMusic?.removeEventListener("pause", onMusicPause);
      bgMusic?.pause();
    };
  }, []);

  const playOneShot = useCallback((el: HTMLAudioElement | null) => {
    if (!el) return;
    if (el === soundsRef.current.bgMusic) return; // never reset the loop
    if (!stateRef.current.soundOn) return;
    el.currentTime = 0;
    el.play().catch(() => {});
  }, []);

  const fetchLeaderboard = useCallback(async () => {
    leaderboardLoadingRef.current = true;
    try {
      const res = await fetch("/api/leaderboard");
      leaderboardRef.current = await res.json();
    } catch { leaderboardRef.current = []; }
    leaderboardLoadingRef.current = false;
  }, []);

  const submitScore = useCallback(async (name: string) => {
    const trimmed = name.trim().slice(0, 12);
    if (!trimmed) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const res = await fetch("/api/leaderboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerName: trimmed,
          score: pendingScoreRef.current.score,
          stageReached: pendingScoreRef.current.stageReached,
        }),
      });
      if (!res.ok) throw new Error("Server error");
      await fetchLeaderboard();
      setShowNameInput(false);
      setNameValue("");
      stateRef.current.phase = "leaderboard";
    } catch { setSubmitError("Failed to submit. Try again."); }
    setSubmitting(false);
  }, [fetchLeaderboard]);

  const getPixelRatio = () => {
    if (typeof window !== "undefined") return Math.min(window.devicePixelRatio || 1, 2);
    return 1;
  };

  const getSafeAreaTop = () => {
    if (typeof document === "undefined") return 0;
    const probe = document.createElement("div");
    probe.style.position = "fixed";
    probe.style.top = "0px";
    probe.style.height = "env(safe-area-inset-top)";
    probe.style.visibility = "hidden";
    probe.style.pointerEvents = "none";
    document.body.appendChild(probe);
    const inset = parseFloat(getComputedStyle(probe).height) || 0;
    document.body.removeChild(probe);
    return inset;
  };

  const AD_BANNER_H = adsRemoved ? 0 : 60;
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = getPixelRatio();

    const cw = window.innerWidth;
    const ch = window.innerHeight;
    const safeTop = getSafeAreaTop();
    const availH = ch - safeTop;
    const scale = Math.min(cw / CANVAS_W, availH / CANVAS_H);
    const drawW = CANVAS_W * scale;
    const drawH = CANVAS_H * scale;
    const offsetX = (cw - drawW) / 2;
    const offsetY = (availH - drawH) / 2;

    canvas.style.position = "absolute";
    canvas.style.left = "0px";
    canvas.style.top = `${safeTop}px`;
    canvas.style.width = `${cw}px`;
    canvas.style.height = `${availH}px`;
    canvas.width = Math.round(cw * ratio);
    canvas.height = Math.round(availH * ratio);

    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.setTransform(ratio * scale, 0, 0, ratio * scale, offsetX * ratio, offsetY * ratio);
    }
  }, []);

  const render = useCallback((t: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const gs = stateRef.current;
    const dt = Math.min(t - lastTRef.current, 32);
    lastTRef.current = t;

    // Slow-mo ramp during winning phase → fully paused when "won"
    if (gs.phase === "winning") {
      gs.slowMo = Math.max(0.05, gs.slowMo - dt * 0.00042);
      gs.winAnim = Math.min(1, gs.winAnim + dt * 0.00055);
      if (gs.winAnim >= 1) gs.phase = "won";
    }

    // Sound callback forwarded from tickGame events
    const onSound = (event: SoundEvent) => {
      const s = soundsRef.current;
      if (event === "powerup")             playOneShot(s.powerUp);
      else if (event === "potato_board")   playOneShot(s.potatoBoard);
      else if (event === "fry_board")      playOneShot(s.fryBoard);
      else if (event === "potato_sack")    playOneShot(s.potatoSack);
      else if (event === "fry_sack")       playOneShot(s.frySack);
      else if (event === "potato_sheet")   playOneShot(s.potatoSheet);
      else if (event === "fry_sheet")      playOneShot(s.frySheet);
      else if (event === "potato_counter") playOneShot(s.potatoCounter);
      else if (event === "fry_counter")    playOneShot(s.fryCounter);
      else if (event === "heal")           playOneShot(s.heal);
      else if (event === "hazard_grate")   playOneShot(s.hazardGrate);
      else if (event === "hazard_peel")    playOneShot(s.hazardPeel);
      else if (event === "hazard_sizzle")  playOneShot(s.hazardSizzle);
    };

    // Tick game (slowed during winning)
    if ((gs.phase === "playing" || gs.phase === "winning") && !gs.showSettings) {
      tickGame(gs, tiltRef.current, tapDirRef.current, dt * (gs.phase === "winning" ? gs.slowMo : 1), onSound);
    }

    // Phase-change side-effects: music start / stop / mashed
    const prevPhase = prevPhaseRef.current;
    if (prevPhase !== gs.phase) {
      const s = soundsRef.current;
      // Every new game (any phase → "playing") restarts the loop from the beginning
      if (gs.phase === "playing" && prevPhase !== "playing") {
        if (s.bgMusic) {
          s.bgMusic.currentTime = 0;
          if (gs.musicOn) s.bgMusic.play().catch(() => {});
        }
      }
      if (gs.phase === "dead") {
        s.bgMusic?.pause();
        playOneShot(s.mashed);
      }
      if (gs.phase === "winning") {
        s.bgMusic?.pause();
      }
      prevPhaseRef.current = gs.phase;
    }

    // Keep confetti alive after winning
    if (gs.phase === "winning" || gs.phase === "won") {
      tickConfetti(gs, dt);
    }

    // ── Draw ──
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, CANVAS_W, CANVAS_H);
    ctx.clip();

    drawBackground(ctx, gs.cameraY, gs.score, t, spritesRef.current, gs.clouds);

    // Draw tap zones in play mode
    if (gs.phase === "playing" && gs.controlMode === "tap") {
      drawTapZones(ctx);
    }

    // Draw platforms
    for (const plat of gs.platforms) {
      const sy = plat.y - gs.cameraY;
      if (sy > CANVAS_H + 30 || sy < -40) continue;
      drawPlatform(ctx, plat, sy, spritesRef.current);
    }

    // Draw hazards
    for (const hz of gs.hazards) {
      const sy = hz.y - gs.cameraY;
      if (sy > CANVAS_H + 60 || sy < -100) continue;
      drawHazard(ctx, hz, sy, t, spritesRef.current);
    }

    // Draw particles
    for (const p of gs.particles) {
      const sy = p.y - gs.cameraY;
      if (sy > CANVAS_H + 20 || sy < -20) continue;
      drawParticle(ctx, { ...p, y: sy });
    }

    // Draw player
    if (gs.phase === "menu") {
      // Idle bob: 30% slower cycle (0.0021 vs ~0.003), 30% lower height (5px vs 7px)
      const idleBob = Math.sin(t * 0.0021) * 5;
      drawPotato(
        ctx,
        gs.player.x,
        gs.player.y - gs.cameraY + idleBob,
        gs.player.buffLevel,
        gs.player.state,
        0, 0, 1, 0, 0,
        t,
        spritesRef.current
      );
    } else {
      const py = gs.player.y - gs.cameraY;
      drawPotato(
        ctx,
        gs.player.x,
        py,
        gs.player.buffLevel,
        gs.player.state,
        gs.player.invincTimer,
        gs.player.wobble,
        gs.player.stretchY,
        gs.player.eyeBlink,
        gs.player.levelUpAnim,
        t,
        spritesRef.current
      );
    }

    // Jump flash ring
    if (gs.jumpFlash > 0 && gs.phase === "playing") {
      const alpha = gs.jumpFlash / 120;
      const radius = 30 + (1 - alpha) * 30;
      ctx.strokeStyle = `rgba(255,255,200,${alpha * 0.5})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(gs.player.x, gs.player.y - gs.cameraY + PLAYER_H / 2, radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Menu title overlay (drawn after platforms/player so it's always in front)
    if (gs.phase === "menu") {
      drawMenu(ctx, gs.bestScore, t, spritesRef.current);
    }

    // HUD
    if (gs.phase === "playing" || gs.phase === "dead" || gs.phase === "winning") {
      drawHUD(ctx, gs.score, gs.player.buffLevel, gs.player.state, gs.bestScore);
    }

    // Settings button
    if (!gs.showSettings && gs.phase !== "winning" && gs.phase !== "won" && gs.phase !== "leaderboard") {
      drawSettingsButton(ctx);
    }

    // Dead screen overlay
    if (gs.phase === "dead") {
      drawDeadScreen(ctx, gs.score, gs.bestScore, t, spritesRef.current);
    }

    // Win sequence: confetti + overlay
    if (gs.phase === "winning" || gs.phase === "won") {
      drawConfetti(ctx, gs.confetti);
      drawWinScreen(ctx, gs.score, gs.bestScore, gs.winAnim, t, gs.wonAsFry);
    }

    // Leaderboard screen
    if (gs.phase === "leaderboard") {
      drawLeaderboard(ctx, leaderboardRef.current, leaderboardLoadingRef.current, t);
    }

    // Settings panel
    if (gs.showSettings) {
      drawSettingsPanel(ctx, gs.controlMode, gs.musicOn, gs.soundOn);
    }
    
    ctx.restore();

    rafRef.current = requestAnimationFrame(render);
  }, []);

  // Start game loop
  useEffect(() => {
    resizeCanvas();
    lastTRef.current = performance.now();
    rafRef.current = requestAnimationFrame(render);
    const onResize = () => resizeCanvas();
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
    };
  }, [render, resizeCanvas]);

  // Tilt control
  useEffect(() => {
    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (stateRef.current.controlMode !== "tilt") return;
      const gamma = e.gamma ?? 0; // -90 to 90
      tiltRef.current = Math.max(-1, Math.min(1, gamma / 30));
    };
    window.addEventListener("deviceorientation", handleOrientation);
    return () => window.removeEventListener("deviceorientation", handleOrientation);
  }, []);

  // Handle canvas interactions
  const getCanvasPoint = (clientX: number, clientY: number): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = useCallback((clientX: number, clientY: number) => {  // eslint-disable-line react-hooks/exhaustive-deps
    const gs = stateRef.current;
    const { x, y } = getCanvasPoint(clientX, clientY);

    // Settings panel interactions
    if (gs.showSettings) {
      // Tilt button
      if (x > SET_TILT_BTN.x && x < SET_TILT_BTN.x + SET_TILT_BTN.w && y > SET_TILT_BTN.y && y < SET_TILT_BTN.y + SET_TILT_BTN.h) {
        gs.controlMode = "tilt";
      }
      // Tap button
      if (x > SET_TAP_BTN.x && x < SET_TAP_BTN.x + SET_TAP_BTN.w && y > SET_TAP_BTN.y && y < SET_TAP_BTN.y + SET_TAP_BTN.h) {
        gs.controlMode = "tap";
      }
      // Music toggle button
      if (x > SET_MUSIC_BTN.x && x < SET_MUSIC_BTN.x + SET_MUSIC_BTN.w && y > SET_MUSIC_BTN.y && y < SET_MUSIC_BTN.y + SET_MUSIC_BTN.h) {
        gs.musicOn = !gs.musicOn;
        saveAudioPref(MUSIC_PREF_KEY, gs.musicOn);
        const bgMusic = soundsRef.current.bgMusic;
        if (bgMusic) {
          if (gs.musicOn && gs.phase === "playing") bgMusic.play().catch(() => {});
          else bgMusic.pause();
        }
      }
      // Sound effects toggle button
      if (x > SET_SFX_BTN.x && x < SET_SFX_BTN.x + SET_SFX_BTN.w && y > SET_SFX_BTN.y && y < SET_SFX_BTN.y + SET_SFX_BTN.h) {
        gs.soundOn = !gs.soundOn;
        saveAudioPref(SOUND_PREF_KEY, gs.soundOn);
      }
      // Done button
      if (x > SET_DONE_BTN.x && x < SET_DONE_BTN.x + SET_DONE_BTN.w && y > SET_DONE_BTN.y && y < SET_DONE_BTN.y + SET_DONE_BTN.h) {
        gs.showSettings = false;
      }
      return;
    }

    // Settings button
    if (x > CANVAS_W - 54 && y > CANVAS_H - 54) {
      gs.showSettings = true;
      return;
    }

    // Menu → leaderboard button or start
    if (gs.phase === "menu") {
      if (x >= MENU_LB_BTN.x && x <= MENU_LB_BTN.x + MENU_LB_BTN.w &&
          y >= MENU_LB_BTN.y && y <= MENU_LB_BTN.y + MENU_LB_BTN.h) {
        fetchLeaderboard();
        gs.phase = "leaderboard";
        return;
      }
      gs.phase = "playing";
      return;
    }

    // Dead screen: Submit Score or Play Again buttons only
    if (gs.phase === "dead") {
      if (x >= DEAD_SUBMIT_BTN.x && x <= DEAD_SUBMIT_BTN.x + DEAD_SUBMIT_BTN.w &&
          y >= DEAD_SUBMIT_BTN.y && y <= DEAD_SUBMIT_BTN.y + DEAD_SUBMIT_BTN.h) {
        pendingScoreRef.current = { score: gs.score, stageReached: gs.player.buffLevel };
        setShowNameInput(true);
        return;
      }
      if (x >= DEAD_REPLAY_BTN.x && x <= DEAD_REPLAY_BTN.x + DEAD_REPLAY_BTN.w &&
          y >= DEAD_REPLAY_BTN.y && y <= DEAD_REPLAY_BTN.y + DEAD_REPLAY_BTN.h) {
        const best = gs.bestScore;
        Object.assign(stateRef.current, makeInitialState(best));
        stateRef.current.bestScore = best;
        stateRef.current.phase = "playing";
      }
      return;
    }

    // Win screen: Share, Replay, or Submit & Leaderboard buttons
    if ((gs.phase === "won" || (gs.phase === "winning" && gs.winAnim > 0.7))) {
      // Share button
      if (x >= WIN_SHARE_BTN.x && x <= WIN_SHARE_BTN.x + WIN_SHARE_BTN.w &&
          y >= WIN_SHARE_BTN.y && y <= WIN_SHARE_BTN.y + WIN_SHARE_BTN.h) {
        const text = gs.wonAsFry
          ? `🍟 I became OP FRY in Op Potato! Score: ${gs.score.toLocaleString()}. You got cooked but never quit — can you?`
          : `🥔 I became OP POTATO in Op Potato! Final score: ${gs.score.toLocaleString()}. Can you beat me?`;
        if (navigator.share) {
          navigator.share({ title: "Op Potato", text }).catch(() => {});
        } else {
          navigator.clipboard?.writeText(text).catch(() => {});
        }
        return;
      }
      // Replay button
      if (x >= WIN_REPLAY_BTN.x && x <= WIN_REPLAY_BTN.x + WIN_REPLAY_BTN.w &&
          y >= WIN_REPLAY_BTN.y && y <= WIN_REPLAY_BTN.y + WIN_REPLAY_BTN.h) {
        const best = gs.bestScore;
        Object.assign(stateRef.current, makeInitialState(best));
        stateRef.current.bestScore = best;
        stateRef.current.phase = "playing";
        return;
      }
      // Submit & Leaderboard button
      if (x >= WIN_LB_BTN.x && x <= WIN_LB_BTN.x + WIN_LB_BTN.w &&
          y >= WIN_LB_BTN.y && y <= WIN_LB_BTN.y + WIN_LB_BTN.h) {
        pendingScoreRef.current = { score: gs.score, stageReached: gs.player.buffLevel };
        setShowNameInput(true);
        return;
      }
      return;
    }

    // Leaderboard screen: Play Again button
    if (gs.phase === "leaderboard") {
      if (x >= LB_PLAY_BTN.x && x <= LB_PLAY_BTN.x + LB_PLAY_BTN.w &&
          y >= LB_PLAY_BTN.y && y <= LB_PLAY_BTN.y + LB_PLAY_BTN.h) {
        const best = gs.bestScore;
        Object.assign(stateRef.current, makeInitialState(best));
        stateRef.current.bestScore = best;
        stateRef.current.phase = "playing";
      }
      return;
    }

    // Playing: tap direction (works as a fallback even in tilt mode)
    if (gs.phase === "playing") {
      tapDirRef.current = x < CANVAS_W / 2 ? -1 : 1;
    }
  }, [fetchLeaderboard]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePointerUp = useCallback(() => {
    tapDirRef.current = 0;
  }, []);

  // Keyboard (desktop fallback)
  useEffect(() => {
    const keys = new Set<string>();
    const onKey = (e: KeyboardEvent) => {
      // Don't hijack typing in the name-submission input (or any other input field)
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;

      if (e.type === "keydown") keys.add(e.key);
      else keys.delete(e.key);
      const left = keys.has("ArrowLeft") || keys.has("a") || keys.has("A");
      const right = keys.has("ArrowRight") || keys.has("d") || keys.has("D");
      tapDirRef.current = left ? -1 : right ? 1 : 0;

      // Any key = start/restart
      if (e.type === "keydown") {
        const gs = stateRef.current;
        if (gs.showSettings || showSplash || showHelp || showNameInput) return;
        if (gs.phase === "menu") { gs.phase = "playing"; return; }
        if (gs.phase === "dead" || gs.phase === "won") {
          const best = gs.bestScore;
          Object.assign(stateRef.current, makeInitialState(best));
          stateRef.current.bestScore = best;
          stateRef.current.phase = "playing";
        }
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }, [showSplash, showHelp, showNameInput]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        background: "#000",
        padding: 0,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ display: "block", touchAction: "none", userSelect: "none" }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          handlePointerDown(e.clientX, e.clientY);
        }}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />

      {/* Splash screen — shown on every fresh load */}
      {showSplash && !showHelp && (
        <SplashScreen
          adBannerH={AD_BANNER_H}
          onStart={() => setShowSplash(false)}
          onHelp={() => setShowHelp(true)}
        />
      )}

      {/* Help screen */}
      {showHelp && (
        <HelpScreen
          adBannerH={AD_BANNER_H}
          onBack={() => setShowHelp(false)}
        />
      )}

      {/* Ad banner strip — only shown when ads are active */}
      {!adsRemoved && (
        <div
          style={{
            position: "absolute", left: 0, right: 0, bottom: 0,
            height: 60,
            background: "#111",
            zIndex: 30,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        />
      )}

      {/* Name input overlay */}
      {showNameInput && (
        <div
          style={{
            position: "absolute", inset: 0, bottom: 60,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(10,5,30,0.88)", zIndex: 10,
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div style={{
            background: "#1a0a2e",
            border: "2px solid #FFD700",
            borderRadius: 20,
            padding: "32px 28px",
            width: 300,
            maxWidth: "90vw",
            textAlign: "center",
            boxShadow: "0 0 40px rgba(255,215,0,0.25)",
          }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>📋</div>
            <div style={{ color: "#FFD700", fontWeight: "bold", fontSize: 18, marginBottom: 4, fontFamily: "sans-serif" }}>
              Submit Your Score
            </div>
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, marginBottom: 16, fontFamily: "sans-serif" }}>
              Score: <strong style={{ color: "#FFD700" }}>{pendingScoreRef.current.score.toLocaleString()}</strong>
              &nbsp;·&nbsp; Stage: <strong>{["🥔","✨","💪","🔥","👑"][Math.min(pendingScoreRef.current.stageReached, 4)]}</strong>
            </div>
            <input
              autoFocus
              maxLength={12}
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitScore(nameValue); }}
              placeholder="Your name (max 12)"
              style={{
                width: "100%", padding: "10px 14px", borderRadius: 10,
                border: "1.5px solid rgba(255,215,0,0.5)",
                background: "rgba(255,255,255,0.08)",
                color: "#fff", fontSize: 16, fontFamily: "sans-serif",
                outline: "none", boxSizing: "border-box",
                marginBottom: 12,
              }}
            />
            {submitError && (
              <div style={{ color: "#FF6B6B", fontSize: 13, marginBottom: 10, fontFamily: "sans-serif" }}>
                {submitError}
              </div>
            )}
            <button
              onClick={() => submitScore(nameValue)}
              disabled={submitting || !nameValue.trim()}
              style={{
                width: "100%", padding: "12px 0",
                background: submitting || !nameValue.trim() ? "rgba(255,215,0,0.35)" : "#FFD700",
                color: "#1a0a00", fontWeight: "bold", fontSize: 16,
                border: "none", borderRadius: 12, cursor: "pointer",
                fontFamily: "sans-serif", marginBottom: 10,
              }}
            >
              {submitting ? "Submitting…" : "Submit →"}
            </button>
            <button
              onClick={() => { setShowNameInput(false); setSubmitError(""); }}
              style={{
                background: "none", border: "none", color: "rgba(255,255,255,0.45)",
                fontSize: 13, cursor: "pointer", fontFamily: "sans-serif",
              }}
            >
              Skip
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
