import type { CustomTheme, ThemeBase } from './types';

/**
 * Color palettes. A palette is a few base colors (background, cards, text,
 * main, accent and the three macro colors); every other shade the app uses is
 * derived from them, and text shades are nudged until they are readable.
 */

export const TOKEN_NAMES = [
  'bg', 'surface', 'sunken', 'quiet', 'line', 'line-control', 'line-field', 'divider',
  'ink', 'ink-2', 'muted', 'faint', 'disabled', 'on-ink',
  'teal', 'teal-dark', 'teal-soft', 'teal-pale', 'teal-disabled', 'on-teal',
  'orange', 'orange-deep', 'orange-ink', 'orange-soft', 'orange-icon', 'orange-line', 'on-orange', 'on-orange-soft',
  'ring-track',
  'protein', 'protein-soft', 'on-protein', 'carbs', 'carbs-text', 'fat', 'fat-soft', 'on-fat',
  'green', 'green-soft', 'green-ink', 'stripe-1', 'stripe-2',
] as const;

export type TokenName = (typeof TOKEN_NAMES)[number];
export type Tokens = Record<TokenName, string>;

export interface Palette {
  id: string;
  name: string;
  base: ThemeBase;
  /** Exact shades, where a palette was tuned by hand. */
  tokens?: Partial<Tokens>;
}

export const BASE_KEYS: { key: keyof ThemeBase; label: string }[] = [
  { key: 'bg', label: 'Background' },
  { key: 'surface', label: 'Cards' },
  { key: 'ink', label: 'Text' },
  { key: 'primary', label: 'Main' },
  { key: 'accent', label: 'Accent' },
  { key: 'protein', label: 'Protein' },
  { key: 'carbs', label: 'Carbs' },
  { key: 'fat', label: 'Fat' },
];

/** The original look; these shades match styles.css exactly. */
const HARBOR_TOKENS: Tokens = {
  bg: '#f7f3ee',
  surface: '#ffffff',
  sunken: '#efe8e0',
  quiet: '#f4eee7',
  line: '#ece5dc',
  'line-control': '#e8e0d6',
  'line-field': '#d9d0c5',
  divider: '#f1ebe4',
  ink: '#16262b',
  'ink-2': '#3e484c',
  muted: '#5b6468',
  faint: '#9aa3a6',
  disabled: '#b7b0a8',
  'on-ink': '#ffffff',
  teal: '#0f4c5c',
  'teal-dark': '#0a3642',
  'teal-soft': '#e3eef0',
  'teal-pale': '#a9c4ca',
  'teal-disabled': '#9fb8be',
  'on-teal': '#ffffff',
  orange: '#fb8b24',
  'orange-deep': '#e36414',
  'orange-ink': '#b8480c',
  'orange-soft': '#fdebdd',
  'orange-icon': '#c1510c',
  'orange-line': '#f5c9a6',
  'on-orange': '#2a1405',
  'on-orange-soft': '#3e2a1c',
  'ring-track': '#f4e7dc',
  protein: '#9a031e',
  'protein-soft': '#f6e1e4',
  'on-protein': '#ffffff',
  carbs: '#fb8b24',
  'carbs-text': '#a8520b',
  fat: '#5f0f40',
  'fat-soft': '#f2e5ec',
  'on-fat': '#ffffff',
  green: '#2f8a4a',
  'green-soft': '#e4efe6',
  'green-ink': '#2f6b3a',
  'stripe-1': '#e9e0d5',
  'stripe-2': '#f1eae1',
};

export const DEFAULT_THEME = 'harbor';
/** Harbor in light mode, Night in dark mode. */
export const AUTO_THEME = 'auto';

export const PALETTES: Palette[] = [
  {
    id: 'harbor',
    name: 'Harbor',
    base: { bg: '#f7f3ee', surface: '#ffffff', ink: '#16262b', primary: '#0f4c5c', accent: '#fb8b24', protein: '#9a031e', carbs: '#fb8b24', fat: '#5f0f40' },
    tokens: HARBOR_TOKENS,
  },
  {
    id: 'matcha',
    name: 'Matcha',
    base: { bg: '#f1f4ec', surface: '#ffffff', ink: '#1b2a1e', primary: '#2d6a4f', accent: '#e9a23b', protein: '#b5323f', carbs: '#e9a23b', fat: '#6b4e8f' },
  },
  {
    id: 'berry',
    name: 'Berry',
    base: { bg: '#fbf2f4', surface: '#ffffff', ink: '#2b1625', primary: '#7b1e57', accent: '#ff7a85', protein: '#b3261e', carbs: '#f29e4c', fat: '#4b3b8f' },
  },
  {
    id: 'ocean',
    name: 'Ocean',
    base: { bg: '#eef3f8', surface: '#ffffff', ink: '#122238', primary: '#1d4e89', accent: '#ff6f59', protein: '#c1121f', carbs: '#f4a261', fat: '#6a4c93' },
  },
  {
    id: 'lavender',
    name: 'Lavender',
    base: { bg: '#f5f3fa', surface: '#ffffff', ink: '#221d33', primary: '#5b4b9a', accent: '#f2a65a', protein: '#b8336a', carbs: '#f2a65a', fat: '#2f7a8a' },
  },
  {
    id: 'graphite',
    name: 'Graphite',
    base: { bg: '#f2f2f0', surface: '#ffffff', ink: '#151515', primary: '#222222', accent: '#ffb000', protein: '#b3261e', carbs: '#e59500', fat: '#5e548e' },
  },
  {
    id: 'night',
    name: 'Night',
    base: { bg: '#0e1719', surface: '#172326', ink: '#e8efee', primary: '#6cc0cf', accent: '#fb8b24', protein: '#ff7088', carbs: '#fb8b24', fat: '#d88ac0' },
  },
  {
    id: 'espresso',
    name: 'Espresso',
    base: { bg: '#17120f', surface: '#231c18', ink: '#f2e9e1', primary: '#e2a86b', accent: '#ff7b54', protein: '#ff7070', carbs: '#f5b041', fat: '#c39bd3' },
  },
  {
    id: 'oled',
    name: 'OLED black',
    base: { bg: '#000000', surface: '#121212', ink: '#f2f2f2', primary: '#8ab4f8', accent: '#fdd663', protein: '#f28b82', carbs: '#fdd663', fat: '#c58af9' },
  },
];

export const HARBOR = PALETTES[0];
const NIGHT = PALETTES.find((p) => p.id === 'night')!;

// ── Color math ────────────────────────────────────────────────────────────

export function isHex(value: unknown): value is string {
  return typeof value === 'string' && /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());
}

/** "#ABC", "abc" or "#aabbcc" → "#aabbcc". */
export function normalizeHex(value: string): string {
  let h = value.trim().replace(/^#/, '').toLowerCase();
  if (h.length === 3) h = h.replace(/./g, (c) => c + c);
  return `#${h}`;
}

function rgb(hex: string): [number, number, number] {
  const h = normalizeHex(hex);
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

function toHex([r, g, b]: number[]): string {
  return `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
}

/** Mix `b` into `a` by `t` (0 = a, 1 = b). */
export function mix(a: string, b: string, t: number): string {
  const x = rgb(a);
  const y = rgb(b);
  return toHex(x.map((v, i) => v + (y[i] - v) * t));
}

export function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1–21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Hue angle, 0–360. */
export function hue(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

export function saturation(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

/** Darken or lighten `fg` just enough to reach `min` contrast on `bg`. */
export function ensureContrast(fg: string, bg: string, min: number): string {
  if (contrast(fg, bg) >= min) return normalizeHex(fg);
  const lightBg = luminance(bg) > 0.18;
  for (const target of lightBg ? ['#000000', '#ffffff'] : ['#ffffff', '#000000']) {
    for (let t = 0.05; t <= 1.001; t += 0.05) {
      const c = mix(fg, target, t);
      if (contrast(c, bg) >= min) return c;
    }
  }
  return lightBg ? '#000000' : '#ffffff';
}

/** Text color for a filled button: white, or a very dark tint of the fill. */
function textOn(fill: string): string {
  const dark = mix(fill, '#000000', 0.85);
  return contrast('#ffffff', fill) >= 4.5 || contrast('#ffffff', fill) >= contrast(dark, fill) ? '#ffffff' : dark;
}

export function isDark(base: ThemeBase): boolean {
  return luminance(base.bg) < 0.2;
}

/** Every shade the app uses, from a palette's base colors. */
export function deriveTokens(input: ThemeBase): Tokens {
  const base = cleanBase(input);
  const dark = isDark(base);
  const { bg, surface } = base;
  const ink = ensureContrast(ensureContrast(base.ink, surface, 7), bg, 7);
  const shade = (t: number) => mix(surface, ink, t);
  // Text sits on both cards and the page, so it must read on both.
  const readable = (fg: string, min: number) => ensureContrast(ensureContrast(fg, surface, min), bg, min);
  const ground = (t: number) => mix(bg, ink, t);

  const teal = readable(base.primary, 4.5);
  const orange = base.accent;
  const orangeSoft = mix(surface, orange, dark ? 0.2 : 0.15);
  const protein = readable(base.protein, 4.5);
  const fat = ensureContrast(base.fat, surface, 4.5);
  const green = ensureContrast(dark ? '#4cc36e' : '#2f8a4a', surface, 3);
  const greenSoft = mix(surface, green, 0.16);

  return {
    bg,
    surface,
    sunken: ground(dark ? 0.08 : 0.05),
    // Round + buttons sit on cards; in the dark they need a visibly lighter circle.
    quiet: dark ? shade(0.1) : ground(0.03),
    line: shade(dark ? 0.12 : 0.08),
    'line-control': shade(dark ? 0.16 : 0.1),
    'line-field': shade(dark ? 0.26 : 0.18),
    divider: shade(dark ? 0.08 : 0.05),
    ink,
    'ink-2': ensureContrast(mix(ink, surface, 0.18), surface, 7),
    muted: readable(mix(ink, surface, 0.38), 4.6),
    faint: ensureContrast(mix(ink, surface, 0.55), surface, 2.4),
    disabled: mix(ink, surface, 0.66),
    'on-ink': textOn(ink),
    teal,
    'teal-dark': dark ? mix(teal, '#ffffff', 0.2) : mix(teal, '#000000', 0.3),
    'teal-soft': mix(surface, teal, dark ? 0.18 : 0.11),
    'teal-pale': mix(surface, teal, 0.35),
    'teal-disabled': mix(surface, teal, 0.42),
    'on-teal': textOn(teal),
    orange,
    'orange-deep': ensureContrast(dark ? orange : mix(orange, '#000000', 0.1), surface, 3),
    'orange-ink': readable(orange, 4.6),
    'orange-soft': orangeSoft,
    'orange-icon': ensureContrast(orange, orangeSoft, 3.5),
    'orange-line': mix(surface, orange, 0.4),
    'on-orange': textOn(orange),
    'on-orange-soft': ensureContrast(mix(ink, orange, 0.2), orangeSoft, 7),
    'ring-track': mix(surface, orange, dark ? 0.16 : 0.12),
    protein,
    'protein-soft': mix(surface, protein, dark ? 0.2 : 0.12),
    'on-protein': textOn(protein),
    carbs: base.carbs,
    'carbs-text': readable(base.carbs, 4.6),
    fat,
    'fat-soft': mix(surface, fat, dark ? 0.2 : 0.12),
    'on-fat': textOn(fat),
    green,
    'green-soft': greenSoft,
    'green-ink': ensureContrast(green, greenSoft, 4.6),
    'stripe-1': ground(dark ? 0.1 : 0.07),
    'stripe-2': ground(dark ? 0.05 : 0.035),
  };
}

export function paletteTokens(p: Pick<Palette, 'base' | 'tokens'>): Tokens {
  return { ...deriveTokens(p.base), ...(p.tokens ?? {}) };
}

// ── Choosing and applying ─────────────────────────────────────────────────

export function findPalette(id: string, custom: CustomTheme[]): Palette | undefined {
  return PALETTES.find((p) => p.id === id) ?? custom.find((c) => c.id === id);
}

function block(tokens: Tokens, dark: boolean): string {
  const vars = TOKEN_NAMES.map((n) => `--${n}:${tokens[n]};`).join('');
  return `${vars}color-scheme:${dark ? 'dark' : 'light'};`;
}

/** Beats the stylesheet's own :root defaults, which may load after this. */
const ROOT = 'html:root';

export interface ThemeOutput {
  css: string;
  /** Status bar color: [light mode, dark mode]. */
  bar: [string, string];
  scheme: 'light' | 'dark' | 'light dark';
}

export function themeOutput(themeId: string, custom: CustomTheme[]): ThemeOutput {
  if (themeId === AUTO_THEME) {
    const light = paletteTokens(HARBOR);
    const dark = paletteTokens(NIGHT);
    return {
      css: `${ROOT}{${block(light, false)}}@media (prefers-color-scheme: dark){${ROOT}{${block(dark, true)}}}`,
      bar: [light.bg, dark.bg],
      scheme: 'light dark',
    };
  }
  return paletteOutput(findPalette(themeId, custom) ?? HARBOR);
}

export function paletteOutput(palette: Pick<Palette, 'base' | 'tokens'>): ThemeOutput {
  const tokens = paletteTokens(palette);
  const dark = isDark(palette.base);
  return { css: `${ROOT}{${block(tokens, dark)}}`, bar: [tokens.bg, tokens.bg], scheme: dark ? 'dark' : 'light' };
}

/** Where index.html finds the theme before the app loads, so it doesn't flash the default colors. */
export const THEME_CACHE_KEY = 'calorie-tracker:theme';

let mediaListener: (() => void) | null = null;

export function applyThemeOutput(out: ThemeOutput) {
  let style = document.getElementById('theme-vars') as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = 'theme-vars';
    document.head.appendChild(style);
  }
  if (style.textContent !== out.css) style.textContent = out.css;
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', out.scheme);

  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  const setBar = () => {
    const color = media?.matches ? out.bar[1] : out.bar[0];
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
  };
  setBar();
  if (mediaListener) media?.removeEventListener?.('change', mediaListener);
  mediaListener = out.bar[0] !== out.bar[1] ? setBar : null;
  if (mediaListener) media?.addEventListener?.('change', mediaListener);
}

export function applyTheme(themeId: string, custom: CustomTheme[]) {
  const out = themeOutput(themeId, custom);
  applyThemeOutput(out);
  try {
    localStorage.setItem(THEME_CACHE_KEY, JSON.stringify(out));
  } catch {
    // The theme still applies; it just may flash on the next launch.
  }
}

// ── Custom palettes ───────────────────────────────────────────────────────

export function cleanBase(raw: any, fallback: ThemeBase = HARBOR.base): ThemeBase {
  const out = { ...fallback };
  for (const { key } of BASE_KEYS) if (isHex(raw?.[key])) out[key] = normalizeHex(raw[key]);
  return out;
}

export function cleanCustomTheme(raw: any): CustomTheme | undefined {
  if (!raw || typeof raw.id !== 'string' || !/^custom-[a-z0-9-]{1,40}$/.test(raw.id)) return undefined;
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 40) : 'My palette';
  return { id: raw.id, name, base: cleanBase(raw.base) };
}

export function newCustomId(): string {
  return `custom-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Names people might use for each base color in a palette file. */
const ALIASES: Record<keyof ThemeBase, string[]> = {
  bg: ['bg', 'background', 'page', 'base'],
  surface: ['surface', 'cards', 'card', 'panel'],
  ink: ['ink', 'text', 'foreground', 'fg'],
  primary: ['primary', 'main', 'brand'],
  accent: ['accent', 'secondary', 'highlight'],
  protein: ['protein'],
  carbs: ['carbs', 'carbohydrates'],
  fat: ['fat', 'fats'],
};

export interface ImportedPalette {
  name?: string;
  base: ThemeBase;
}

/**
 * Read a palette from pasted text or a file: this app's palette JSON, any JSON
 * with named colors, a list of hex codes, or a Coolors link.
 */
export function parsePaletteText(text: string): ImportedPalette {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Paste some colors first.');
  if (trimmed.startsWith('{')) {
    let raw: any;
    try {
      raw = JSON.parse(trimmed);
    } catch {
      throw new Error("That looks like JSON but couldn't be read. Check for a missing quote or comma.");
    }
    const colors = raw.colors ?? raw.base ?? raw;
    const base: Partial<ThemeBase> = {};
    for (const [key, names] of Object.entries(ALIASES) as [keyof ThemeBase, string[]][]) {
      const found = names.map((n) => colors?.[n]).find(isHex);
      if (found) base[key] = normalizeHex(found);
    }
    if (Object.keys(base).length === 0) {
      const list = Object.values(colors ?? {}).filter(isHex) as string[];
      if (list.length >= 2) return { name: nameOf(raw), base: assignColors(list) };
      throw new Error('No colors found. Use names like "background", "text", "main" and "accent" with #hex values.');
    }
    const filled = base.bg && base.ink ? cleanBase(base) : { ...assignColors(Object.values(base) as string[]), ...base };
    return { name: nameOf(raw), base: cleanBase(filled) };
  }
  const hexes = trimmed.match(/#?\b[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi) ?? [];
  if (hexes.length < 2) throw new Error('Add at least two colors, like #0f4c5c #fb8b24, or paste a Coolors link.');
  return { base: assignColors(hexes) };
}

function nameOf(raw: any): string | undefined {
  return typeof raw?.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 40) : undefined;
}

/**
 * Give a loose list of colors roles: the lightest becomes the background, the
 * darkest the text, and the strongest remaining ones the main and accent colors.
 * Missing roles are filled with gentle tints so any 2+ colors make a usable theme.
 */
export function assignColors(list: string[]): ThemeBase {
  const colors = [...new Set(list.filter(isHex).map(normalizeHex))];
  const byLight = [...colors].sort((a, b) => luminance(b) - luminance(a));
  const lightest = byLight[0];
  const darkest = byLight[byLight.length - 1];

  const bgFromList = luminance(lightest) > 0.75 && saturation(lightest) < 0.25;
  const inkFromList = luminance(darkest) < 0.04 && saturation(darkest) < 0.6;
  const rest = colors.filter((c) => !(bgFromList && c === lightest) && !(inkFromList && c === darkest));
  const pool = rest.length > 0 ? rest : colors;

  // Main: a deep color that holds white text; accent: the most vivid of the others.
  const primary =
    [...pool].sort((a, b) => luminance(a) - luminance(b)).find((c) => contrast(c, '#ffffff') >= 3) ??
    [...pool].sort((a, b) => luminance(a) - luminance(b))[0];
  const others = pool.filter((c) => c !== primary);
  const hueGap = (c: string) => {
    const d = Math.abs(hue(c) - hue(primary));
    return Math.min(d, 360 - d);
  };
  // Prefer a vivid color that stands apart from the main one (orange next to teal, not a second teal).
  const contrasting = others.filter((c) => hueGap(c) >= 60 && saturation(c) > 0.3);
  const vivid = (list: string[]) => [...list].sort((a, b) => saturation(b) - saturation(a))[0];
  const accent = contrasting.length > 0 ? vivid(contrasting) : others.length > 0 ? vivid(others) : mix(primary, '#ffffff', 0.35);

  const bg = bgFromList ? lightest : mix('#ffffff', primary, 0.05);
  const ink = inkFromList ? darkest : mix(primary, '#000000', 0.75);
  return { ...HARBOR.base, bg, surface: '#ffffff', ink, primary, accent };
}

/** The file people can share or import on another device. */
export function paletteJson(p: { name: string; base: ThemeBase }): string {
  const colors = Object.fromEntries(BASE_KEYS.map(({ key }) => [key, p.base[key]]));
  return JSON.stringify({ name: p.name, app: 'calorie-tracker-palette', version: 1, colors }, null, 2);
}

/** Readability problems worth telling someone about while they edit a palette. */
export function paletteWarnings(input: ThemeBase): string[] {
  const base = cleanBase(input);
  const warnings: string[] = [];
  if (contrast(base.ink, base.surface) < 7 || contrast(base.ink, base.bg) < 7) {
    warnings.push('Text is hard to read on this background, so it was made darker or lighter.');
  }
  if (contrast(base.primary, base.surface) < 4.5) {
    warnings.push('The main color was adjusted so links and buttons stay readable.');
  }
  const dark = isDark(base);
  if (dark !== luminance(base.surface) < 0.2) {
    warnings.push(dark ? 'Cards are much lighter than the dark background.' : 'Cards are much darker than the light background.');
  }
  return warnings;
}
