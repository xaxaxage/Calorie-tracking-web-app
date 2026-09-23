import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  assignColors,
  AUTO_THEME,
  cleanCustomTheme,
  contrast,
  deriveTokens,
  HARBOR,
  luminance,
  PALETTES,
  paletteJson,
  paletteTokens,
  paletteWarnings,
  parsePaletteText,
  themeOutput,
  TOKEN_NAMES,
  type Tokens,
} from '../src/lib/theme';
import { dominantColors } from '../src/lib/theme-image';
import { parseData } from '../src/lib/store';

/** The pairs people actually read: text on its background, labels on buttons. */
function readability(t: Tokens) {
  return {
    'ink on bg': contrast(t.ink, t.bg),
    'ink on surface': contrast(t.ink, t.surface),
    'muted on surface': contrast(t.muted, t.surface),
    'muted on bg': contrast(t.muted, t.bg),
    'main on surface': contrast(t.teal, t.surface),
    'label on main': contrast(t['on-teal'], t.teal),
    'accent text on surface': contrast(t['orange-ink'], t.surface),
    'protein on surface': contrast(t.protein, t.surface),
    'carbs text on surface': contrast(t['carbs-text'], t.surface),
    'toast text': contrast(t['on-ink'], t.ink),
    'error banner': contrast(t['on-protein'], t.protein),
    'green badge': contrast(t['green-ink'], t['green-soft']),
    'notice text': contrast(t['on-orange-soft'], t['orange-soft']),
  };
}

describe('palettes', () => {
  it('Harbor matches the stylesheet defaults exactly', () => {
    const css = readFileSync('src/styles.css', 'utf8');
    const root = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')));
    for (const name of TOKEN_NAMES) {
      const m = new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(root);
      expect(m?.[1]?.toLowerCase(), name).toBe(paletteTokens(HARBOR)[name]);
    }
  });

  it.each(PALETTES.map((p) => [p.name, p] as const))('%s is readable', (_, palette) => {
    const scores = readability(paletteTokens(palette));
    for (const [pair, ratio] of Object.entries(scores)) {
      expect(ratio, `${palette.name}: ${pair}`).toBeGreaterThanOrEqual(4.5);
    }
    // The + button's icon is a graphic, which needs 3:1.
    const t = paletteTokens(palette);
    expect(contrast(t['on-orange'], t.orange), `${palette.name}: + button`).toBeGreaterThanOrEqual(3);
  });

  it('has dark palettes that set a dark color scheme', () => {
    expect(themeOutput('night', []).scheme).toBe('dark');
    expect(themeOutput('harbor', []).scheme).toBe('light');
    expect(luminance(paletteTokens(PALETTES.find((p) => p.id === 'oled')!).bg)).toBe(0);
  });

  it('Auto follows the system setting', () => {
    const out = themeOutput(AUTO_THEME, []);
    expect(out.css).toContain('@media (prefers-color-scheme: dark)');
    expect(out.scheme).toBe('light dark');
    expect(out.bar).toEqual([HARBOR.base.bg, PALETTES.find((p) => p.id === 'night')!.base.bg]);
  });

  it('falls back to Harbor for an unknown palette', () => {
    expect(themeOutput('custom-gone', []).css).toBe(themeOutput('harbor', []).css);
  });

  it('uses a custom palette by id', () => {
    const custom = { id: 'custom-a1', name: 'Mine', base: { ...HARBOR.base, primary: '#6a0dad' } };
    expect(themeOutput('custom-a1', [custom]).css).toContain('--teal:#6a0dad;');
  });
});

describe('deriving shades from a few colors', () => {
  it('keeps text readable even when the chosen colors clash', () => {
    const t = deriveTokens({ ...HARBOR.base, bg: '#777777', surface: '#808080', ink: '#7a7a7a', primary: '#8a8a8a' });
    expect(contrast(t.ink, t.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t.muted, t.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t['on-teal'], t.teal)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps pastel main colors readable as link text', () => {
    const t = deriveTokens({ ...HARBOR.base, primary: '#ffd1dc', accent: '#b5ead7' });
    const scores = readability(t);
    for (const [pair, ratio] of Object.entries(scores)) expect(ratio, pair).toBeGreaterThanOrEqual(4.5);
  });

  it('warns about low-contrast choices', () => {
    expect(paletteWarnings(HARBOR.base)).toEqual([]);
    expect(paletteWarnings({ ...HARBOR.base, ink: '#dddddd' })[0]).toMatch(/hard to read/);
    expect(paletteWarnings({ ...HARBOR.base, surface: '#111111' }).join(' ')).toMatch(/darker than the light background/);
  });
});

describe('importing palettes', () => {
  it('reads a Coolors link', () => {
    const { base } = parsePaletteText('https://coolors.co/264653-2a9d8f-e9c46a-f4a261-e76f51');
    expect(base.primary).toBe('#264653');
    expect(base.accent).toBe('#e76f51');
    expect(base.surface).toBe('#ffffff');
  });

  it('reads a plain list of hex codes', () => {
    const { base } = parsePaletteText('#FAFAF7, #111111, #0B6E4F, #F4A259');
    expect(base.bg).toBe('#fafaf7');
    expect(base.ink).toBe('#111111');
    expect(base.primary).toBe('#0b6e4f');
    expect(base.accent).toBe('#f4a259');
  });

  it('round-trips its own shared file', () => {
    const shared = paletteJson({ name: 'Sunset', base: PALETTES[3].base });
    expect(parsePaletteText(shared)).toEqual({ name: 'Sunset', base: PALETTES[3].base });
  });

  it('reads JSON with other names for the colors', () => {
    const { name, base } = parsePaletteText(
      JSON.stringify({ name: 'Mint', background: '#f0fff4', text: '#102a1c', main: '#1b7f4b', accent: '#ff9f1c' }),
    );
    expect(name).toBe('Mint');
    expect(base).toMatchObject({ bg: '#f0fff4', ink: '#102a1c', primary: '#1b7f4b', accent: '#ff9f1c' });
    expect(base.protein).toBe(HARBOR.base.protein);
  });

  it('fills in a background and text color when only brand colors are given', () => {
    const base = assignColors(['#e63946', '#1d3557']);
    expect(base.primary).toBe('#1d3557');
    expect(base.accent).toBe('#e63946');
    expect(luminance(base.bg)).toBeGreaterThan(0.8);
    expect(contrast(base.ink, base.bg)).toBeGreaterThan(7);
  });

  it('explains what went wrong', () => {
    expect(() => parsePaletteText('')).toThrow(/Paste some colors/);
    expect(() => parsePaletteText('blue and orange')).toThrow(/at least two colors/);
    expect(() => parsePaletteText('{"name": "x",')).toThrow(/couldn't be read/);
    expect(() => parsePaletteText('{"name": "x"}')).toThrow(/No colors found/);
  });

  it('picks the main colors of a picture', () => {
    const px: number[] = [];
    const paint = (n: number, rgb: number[]) => {
      for (let i = 0; i < n; i++) px.push(...rgb, 255);
    };
    paint(600, [245, 240, 232]); // background
    paint(250, [15, 76, 92]); // teal
    paint(120, [251, 139, 36]); // orange
    paint(30, [247, 242, 234]); // near-duplicate of the background
    const colors = dominantColors(new Uint8ClampedArray(px), 5);
    expect(colors).toHaveLength(3);
    expect(colors).toContain('#0f4c5c');
    expect(colors).toContain('#fb8b24');
  });
});

describe('saved appearance settings', () => {
  it('defaults to Harbor with humor on', () => {
    const data = parseData({ version: 1 });
    expect(data.settings.theme).toBe('harbor');
    expect(data.settings.humor).toBe(true);
    expect(data.settings.customThemes).toEqual([]);
  });

  it('keeps valid custom palettes and drops broken ones', () => {
    const data = parseData({
      version: 1,
      settings: {
        theme: 'custom-abc',
        humor: false,
        customThemes: [
          { id: 'custom-abc', name: 'Mine', base: { bg: '#fff', primary: 'not a color' } },
          { id: 'evil"><script>', name: 'x', base: {} },
        ],
      },
    });
    expect(data.settings.humor).toBe(false);
    expect(data.settings.theme).toBe('custom-abc');
    expect(data.settings.customThemes).toHaveLength(1);
    expect(data.settings.customThemes[0].base.bg).toBe('#ffffff');
    expect(data.settings.customThemes[0].base.primary).toBe(HARBOR.base.primary);
    expect(cleanCustomTheme({ id: 'custom-x', name: '', base: {} })?.name).toBe('My palette');
  });

  it('never lets a palette inject CSS', () => {
    const data = parseData({ version: 1, settings: { theme: 'x;}body{display:none' } });
    expect(data.settings.theme).toBe('harbor');
  });
});
