import type { Leaderboard } from "./api";
import { MEDALS, type MedalTier } from "./medal";

/**
 * Renders the podium to a standalone PNG so a teacher can keep or share the
 * moment — it goes on a WhatsApp group, a notice board, a school magazine.
 *
 * Everything on the canvas is sampled from the live document rather than
 * hardcoded: fonts come from the same utility classes the page uses, colours
 * come from the same custom properties, and the KAP logo is whichever variant
 * belongs on the background we actually have. The result is an image that
 * matches the screen it was captured from instead of drifting from it.
 *
 * The medal is redrawn here rather than reused from `components/medal.tsx`
 * because SVG-in-canvas needs a raster source. Keep the two shapes in the same
 * 100 × 134 space (see the component's viewBox) and they stay in step.
 */

interface PodiumInput {
  examTitle: string;
  batchName: string;
  board: Leaderboard;
}

type Rgb = readonly [number, number, number];

/** Canvas units. 1600 × 1000 lands at a clean 16:10 for slides and print. */
const W = 1600;
const H = 1000;
const PAD = 72;

/** Podium heights, indexed by place: first, second, third. */
const BLOCK_H = [300, 230, 175];
const COLUMN_W = 380;
const COLUMN_GAP = 48;
const BASELINE = 848;

/* ------------------------------------------------------------------ */
/* Reading the document                                                */
/* ------------------------------------------------------------------ */

/**
 * `getComputedStyle` hands back whatever notation the browser serialises to —
 * `oklch(...)`, `lab(...)`, `rgb(...)`. Canvas parses all of them, but we also
 * need real numbers to pick a logo variant, so every sampled colour is pushed
 * through a 1×1 canvas readback and comes out as 0–255.
 */
function readback(cssColor: string): Rgb {
  const probe = document.createElement("canvas");
  probe.width = 1;
  probe.height = 1;
  const ctx = probe.getContext("2d");
  if (!ctx) return [0, 0, 0];
  ctx.fillStyle = cssColor;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return [r, g, b];
}

/** Sample a colour token (`--foreground`) off the live document. */
function sampleColor(prop: "color" | "background-color", token: string): Rgb {
  const el = document.createElement("div");
  el.style.cssText = `position:absolute;left:-9999px;top:0;visibility:hidden;${prop}:var(${token})`;
  document.body.appendChild(el);
  const cs = getComputedStyle(el);
  const value = prop === "color" ? cs.color : cs.backgroundColor;
  el.remove();
  return readback(value);
}

/** Resolve the font stack behind a utility class (`display`, `font-mono`). */
function sampleFont(className: string): string {
  const el = document.createElement("span");
  el.className = className;
  el.style.cssText = "position:absolute;left:-9999px;top:0;visibility:hidden;white-space:nowrap";
  document.body.appendChild(el);
  const stack = getComputedStyle(el).fontFamily;
  el.remove();
  return stack;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function luminance([r, g, b]: Rgb): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/* ------------------------------------------------------------------ */
/* Canvas helpers                                                      */
/* ------------------------------------------------------------------ */

function rgba([r, g, b]: Rgb, alpha: number): string {
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Rounded only across the top — a podium plinth sits on the floor. */
function plinthPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
}

function drawMedal(
  ctx: CanvasRenderingContext2D,
  cx: number,
  top: number,
  size: number,
  tier: MedalTier,
  rank: number,
  display: string,
) {
  const metal = MEDALS[tier];
  const s = size / 100;

  ctx.save();
  ctx.translate(cx - size / 2, top);
  ctx.scale(s, s);

  // Ribbon
  ctx.fillStyle = metal.ribbon;
  ctx.beginPath();
  ctx.moveTo(24, 0);
  ctx.lineTo(40, 0);
  ctx.lineTo(55, 54);
  ctx.lineTo(41, 61);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 0.72;
  ctx.beginPath();
  ctx.moveTo(76, 0);
  ctx.lineTo(60, 0);
  ctx.lineTo(45, 54);
  ctx.lineTo(59, 61);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;

  // Disc: rim, face, catch of light, struck digit
  ctx.fillStyle = metal.edge;
  ctx.beginPath();
  ctx.arc(50, 92, 40, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = metal.face;
  ctx.beginPath();
  ctx.arc(50, 92, 34, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(50, 92, 27, Math.PI * 1.18, Math.PI * 1.62);
  ctx.stroke();

  ctx.fillStyle = metal.digit;
  ctx.font = `700 38px ${display}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(rank), 50, 94);
  ctx.lineCap = "butt";

  ctx.restore();
}

function fitText(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > max) out = out.slice(0, -1);
  return `${out}…`;
}

function centreText(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number) {
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(text, cx, y);
}

/* ------------------------------------------------------------------ */
/* Render                                                              */
/* ------------------------------------------------------------------ */

export async function renderPodiumPng({ examTitle, batchName, board }: PodiumInput): Promise<Blob> {
  const entries = board.entries.slice(0, 3);
  if (entries.length === 0) throw new Error("Nothing to render");

  // The page's fonts are lazy: ask for them before the first fillText or the
  // canvas silently falls back to Times.
  await document.fonts.ready;

  const display = sampleFont("display");
  const sans = getComputedStyle(document.body).fontFamily;
  const mono = sampleFont("font-mono");

  const bg = sampleColor("background-color", "--background");
  const ink = sampleColor("color", "--foreground");
  const mutedInk = sampleColor("color", "--muted-foreground");
  const border = sampleColor("background-color", "--border");
  const primary = sampleColor("background-color", "--primary");
  const muted = sampleColor("background-color", "--muted");

  const logo = await loadImage(luminance(bg) > 0.5 ? "/kap-logo.png" : "/kap-logo-white.png");

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");

  // Background — flat, warm, no theme alpha games.
  ctx.fillStyle = rgba(bg, 1);
  ctx.fillRect(0, 0, W, H);

  /* Header ------------------------------------------------------------ */
  if (logo && logo.naturalHeight > 0) {
    const h = 74;
    const w = h * (logo.naturalWidth / logo.naturalHeight);
    ctx.drawImage(logo, (W - w) / 2, 56, w, h);
  }

  ctx.fillStyle = rgba(ink, 1);
  ctx.font = `600 52px ${display}`;
  centreText(ctx, fitText(ctx, examTitle, W - PAD * 2), W / 2, 224);

  ctx.fillStyle = rgba(mutedInk, 1);
  ctx.font = `400 26px ${sans}`;
  centreText(ctx, `${batchName}  ·  ${board.appeared} of ${board.cohortSize} on the board`, W / 2, 266);

  /* Podium ------------------------------------------------------------ */
  const startX = (W - (entries.length * COLUMN_W + (entries.length - 1) * COLUMN_GAP)) / 2;
  const order = [1, 0, 2]; // second, first, third — the way a podium reads

  order.forEach((place, i) => {
    const entry = entries[place];
    if (!entry) return;

    const tier = (["gold", "silver", "bronze"] as const)[place];
    const blockH = BLOCK_H[place];
    const x = startX + i * (COLUMN_W + COLUMN_GAP);
    const cx = x + COLUMN_W / 2;
    const blockTop = BASELINE - blockH;

    // Stack upward from the plinth: score, roll, name, then the medal on top.
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";

    // Score, split the way it reads on screen: ink over a muted denominator.
    ctx.textAlign = "left";
    ctx.font = `600 44px ${display}`;
    const scoreText = String(entry.score);
    const scoreW = ctx.measureText(scoreText).width;
    ctx.font = `600 30px ${display}`;
    const denText = `/${entry.maxScore}`;
    const denW = ctx.measureText(denText).width;
    const scoreX = cx - (scoreW + denW) / 2;
    ctx.font = `600 44px ${display}`;
    ctx.fillStyle = rgba(ink, 1);
    ctx.fillText(scoreText, scoreX, blockTop - 28);
    ctx.font = `600 30px ${display}`;
    ctx.fillStyle = rgba(mutedInk, 1);
    ctx.fillText(denText, scoreX + scoreW, blockTop - 28);

    ctx.font = `500 24px ${mono}`;
    ctx.fillStyle = rgba(mutedInk, 1);
    centreText(ctx, entry.rollNo, cx, blockTop - 70);

    ctx.textAlign = "center";
    ctx.fillStyle = rgba(ink, 1);
    ctx.font = `600 30px ${sans}`;
    centreText(ctx, fitText(ctx, entry.name, COLUMN_W), cx, blockTop - 110);

    drawMedal(ctx, cx, blockTop - 259, 84, tier, place + 1, display);

    // Plinth
    plinthPath(ctx, x, blockTop, COLUMN_W, blockH, 24);
    if (place === 0) {
      ctx.fillStyle = rgba(primary, 0.14);
      ctx.fill();
      ctx.strokeStyle = rgba(primary, 0.5);
      ctx.lineWidth = 3;
    } else {
      ctx.fillStyle = rgba(muted, 0.8);
      ctx.fill();
      ctx.strokeStyle = rgba(border, 1);
      ctx.lineWidth = 2;
    }
    ctx.stroke();
  });

  /* Footer ------------------------------------------------------------- */
  ctx.strokeStyle = rgba(border, 1);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD, 906);
  ctx.lineTo(W - PAD, 906);
  ctx.stroke();

  ctx.fillStyle = rgba(mutedInk, 1);
  ctx.font = `500 22px ${mono}`;
  centreText(
    ctx,
    `KAP EXAM   ·   ${new Date().toLocaleDateString("en-GB", { dateStyle: "long" })}`,
    W / 2,
    950,
  );

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not encode PNG"))), "image/png");
  });
}

/** Render and hand the file to the browser's download path. */
export async function downloadPodiumPng(input: PodiumInput): Promise<void> {
  const blob = await renderPodiumPng(input);
  const slug =
    input.examTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "podium";

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `kap-${slug}-${new Date().toISOString().slice(0, 10)}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking immediately can cancel the download in some engines.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
