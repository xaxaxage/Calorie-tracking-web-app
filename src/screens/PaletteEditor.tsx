import { useEffect, useState } from 'preact/hooks';
import type { CustomTheme, ThemeBase } from '../lib/types';
import { getData, MAX_CUSTOM_THEMES, updateSettings } from '../lib/store';
import {
  applyTheme,
  applyThemeOutput,
  assignColors,
  AUTO_THEME,
  BASE_KEYS,
  findPalette,
  HARBOR,
  isHex,
  newCustomId,
  normalizeHex,
  paletteJson,
  paletteOutput,
  PALETTES,
  paletteWarnings,
  parsePaletteText,
  type ImportedPalette,
} from '../lib/theme';
import { goBack } from '../lib/router';
import { showToast } from '../lib/toast';
import { saveFile } from '../lib/files';
import { ChevronLeft } from '../components/Icons';
import { MacroLabel } from '../components/Common';

/** Start a new palette from whatever is on screen now, so small tweaks stay small. */
function startingBase(): ThemeBase {
  const { theme, customThemes } = getData().settings;
  if (theme === AUTO_THEME) {
    const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    return (dark ? PALETTES.find((p) => p.id === 'night')! : HARBOR).base;
  }
  return (findPalette(theme, customThemes) ?? HARBOR).base;
}

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'palette';

function Preview() {
  return (
    <section class="card stack-12 palette-preview" aria-label="Preview">
      <div class="preview-top">
        <svg viewBox="0 0 60 60" class="preview-ring" aria-hidden="true">
          <circle cx="30" cy="30" r="24" fill="none" stroke="var(--ring-track)" stroke-width="7" />
          <circle
            cx="30"
            cy="30"
            r="24"
            fill="none"
            stroke="var(--orange-deep)"
            stroke-width="7"
            stroke-linecap="round"
            stroke-dasharray="100 151"
            transform="rotate(-90 30 30)"
          />
        </svg>
        <div class="stack-2">
          <span class="stat-label">Eaten</span>
          <span class="stat-value num">
            1 240 <span class="unit">kcal</span>
          </span>
        </div>
      </div>
      <div class="preview-macros">
        <MacroLabel kind="p">Protein</MacroLabel>
        <MacroLabel kind="c">Carbs</MacroLabel>
        <MacroLabel kind="f">Fat</MacroLabel>
      </div>
      <div class="button-pair">
        <span class="btn-secondary preview-btn">Secondary</span>
        <span class="btn-primary preview-btn">Primary</span>
      </div>
      <p class="field-hint">
        Muted text and a <a href="#/settings" onClick={(e) => e.preventDefault()}>link</a>. The whole app shows these colors
        while you edit.
      </p>
    </section>
  );
}

export function PaletteEditor({ id, startWithImport }: { id: string; startWithImport: boolean }) {
  const existing: CustomTheme | undefined =
    id === 'new' ? undefined : getData().settings.customThemes.find((c) => c.id === id);
  const [name, setName] = useState(existing?.name ?? 'My palette');
  const [base, setBase] = useState<ThemeBase>(() => existing?.base ?? startingBase());
  const [hexText, setHexText] = useState<Record<string, string>>(() => ({ ...(existing?.base ?? startingBase()) }));
  const [importOpen, setImportOpen] = useState(startWithImport);
  const [pasted, setPasted] = useState('');
  const [importError, setImportError] = useState('');
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');

  // Preview on the whole app while editing; put the saved palette back when leaving.
  useEffect(() => {
    applyThemeOutput(paletteOutput({ base }));
  }, [base]);
  useEffect(
    () => () => {
      const s = getData().settings;
      applyTheme(s.theme, s.customThemes);
    },
    [],
  );

  const setColor = (key: keyof ThemeBase, value: string) => {
    setHexText((t) => ({ ...t, [key]: value }));
    if (isHex(value)) setBase((b) => ({ ...b, [key]: normalizeHex(value) }));
  };

  const takeImported = (imported: ImportedPalette, fallbackName?: string) => {
    setBase(imported.base);
    setHexText({ ...imported.base });
    const newName = imported.name ?? fallbackName;
    if (newName && !existing) setName(newName);
    setImportOpen(false);
    setImportError('');
    setPasted('');
    showToast('Colors imported — tweak them below');
  };

  const importText = () => {
    try {
      takeImported(parsePaletteText(pasted));
    } catch (err) {
      setImportError((err as Error).message);
    }
  };

  const importFile = async (file: File) => {
    setReading(true);
    setImportError('');
    try {
      if (file.type.startsWith('image/')) {
        const { extractColors } = await import('../lib/theme-image');
        const colors = await extractColors(file);
        if (colors.length < 2) throw new Error('That picture is too plain to pick colors from.');
        takeImported({ base: assignColors(colors) }, 'From a photo');
      } else {
        if (file.size > 200_000) throw new Error("That file is too big to be a palette.");
        takeImported(parsePaletteText(await file.text()), file.name.replace(/\.(palette\.)?json$|\.txt$/i, ''));
      }
    } catch (err) {
      setImportError((err as Error).message || "Couldn't read that file.");
    } finally {
      setReading(false);
    }
  };

  const save = () => {
    const clean = name.trim().slice(0, 40) || 'My palette';
    const list = getData().settings.customThemes;
    if (existing) {
      updateSettings({
        customThemes: list.map((c) => (c.id === existing.id ? { ...c, name: clean, base } : c)),
        theme: existing.id,
      });
      showToast('Palette saved');
    } else {
      if (list.length >= MAX_CUSTOM_THEMES) {
        setError(`You can keep up to ${MAX_CUSTOM_THEMES} palettes. Delete one first.`);
        return;
      }
      const created = { id: newCustomId(), name: clean, base };
      updateSettings({ customThemes: [...list, created], theme: created.id });
      showToast(`“${clean}” is on`);
    }
    goBack('/settings');
  };

  const remove = () => {
    if (!existing || !confirm(`Delete the palette “${existing.name}”?`)) return;
    const s = getData().settings;
    updateSettings({
      customThemes: s.customThemes.filter((c) => c.id !== existing.id),
      theme: s.theme === existing.id ? HARBOR.id : s.theme,
    });
    showToast('Palette deleted');
    goBack('/settings');
  };

  const share = () => {
    const clean = name.trim() || 'My palette';
    const json = paletteJson({ name: clean, base });
    saveFile(new File([json], `${slug(clean)}.palette.json`, { type: 'application/json' }), clean);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(paletteJson({ name: name.trim() || 'My palette', base }));
      showToast('Palette copied — paste it into Import on another device');
    } catch {
      showToast('Copy failed — use Share file instead');
    }
  };

  const warnings = paletteWarnings(base);
  const row = ({ key, label }: (typeof BASE_KEYS)[number]) => (
    <div class="color-row">
      <input
        type="color"
        class="color-well"
        aria-label={`${label} color`}
        value={base[key]}
        onInput={(e) => setColor(key, (e.target as HTMLInputElement).value)}
      />
      <label class="color-name" for={`hex-${key}`}>
        {label}
      </label>
      <input
        id={`hex-${key}`}
        class={`input mono hex${isHex(hexText[key]) ? '' : ' invalid'}`}
        value={hexText[key]}
        maxLength={7}
        autoCapitalize="off"
        autoCorrect="off"
        spellcheck={false}
        onInput={(e) => setColor(key, (e.target as HTMLInputElement).value)}
        onBlur={() => setHexText((t) => ({ ...t, [key]: base[key] }))}
      />
    </div>
  );

  return (
    <>
      <main class="screen with-footer">
        <header class="topbar">
          <button type="button" class="icon-btn ink" aria-label="Back" onClick={() => goBack('/settings')}>
            <ChevronLeft />
          </button>
          <h1>{existing ? 'Edit palette' : 'New palette'}</h1>
          <span class="spacer-44" />
        </header>

        <Preview />

        {importOpen ? (
          <section class="card stack-12" aria-labelledby="import-title">
            <h2 id="import-title" class="section-title">
              Import colors
            </h2>
            <label class="btn-secondary file-btn">
              {reading ? 'Reading…' : 'Choose a photo or palette file'}
              <input
                type="file"
                accept="image/*,application/json,.json,.txt"
                class="sr-only"
                disabled={reading}
                onChange={(e) => {
                  const input = e.target as HTMLInputElement;
                  const file = input.files?.[0];
                  input.value = '';
                  if (file) importFile(file);
                }}
              />
            </label>
            <p class="field-hint">A photo gives its main colors; a .json file is a palette someone shared from this app.</p>
            <label for="palette-paste" class="field-label">
              Or paste colors
            </label>
            <textarea
              id="palette-paste"
              class="input textarea mono short"
              rows={3}
              autoCapitalize="off"
              autoCorrect="off"
              spellcheck={false}
              placeholder="#264653 #2a9d8f #e9c46a #f4a261 — or a coolors.co link"
              value={pasted}
              onInput={(e) => setPasted((e.target as HTMLTextAreaElement).value)}
            />
            {importError && <div class="notice plain">{importError}</div>}
            <div class="button-pair">
              <button type="button" class="btn-secondary" onClick={() => setImportOpen(false)}>
                Cancel
              </button>
              <button type="button" class="btn-primary" disabled={!pasted.trim()} onClick={importText}>
                Use these colors
              </button>
            </div>
          </section>
        ) : (
          <button type="button" class="link-btn left" onClick={() => setImportOpen(true)}>
            Import from a photo, file or color list
          </button>
        )}

        <section class="card stack-12">
          <label for="palette-name" class="field-label">
            Name
          </label>
          <input
            id="palette-name"
            class="input"
            maxLength={40}
            value={name}
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
          />
        </section>

        <section class="card stack-4" aria-labelledby="colors-title">
          <h2 id="colors-title" class="section-title pad-bottom">
            Colors
          </h2>
          {BASE_KEYS.slice(0, 5).map(row)}
          <h3 class="list-section-label pad-top">Macros</h3>
          {BASE_KEYS.slice(5).map(row)}
        </section>

        {warnings.length > 0 && (
          <div class="notice plain">
            <span>{warnings.join(' ')}</span>
          </div>
        )}
        {error && <div class="notice plain">{error}</div>}

        <div class="button-pair">
          <button type="button" class="btn-secondary" onClick={share}>
            Share file
          </button>
          <button type="button" class="btn-secondary" onClick={copy}>
            Copy as text
          </button>
        </div>
        {existing && (
          <button type="button" class="link-btn left danger" onClick={remove}>
            Delete this palette
          </button>
        )}
      </main>

      <div class="footer">
        <div class="footer-inner">
          <button type="button" class="btn-secondary narrow" onClick={() => goBack('/settings')}>
            Cancel
          </button>
          <button type="button" class="btn-primary" onClick={save}>
            {existing ? 'Save palette' : 'Save and use'}
          </button>
        </div>
      </div>
    </>
  );
}
