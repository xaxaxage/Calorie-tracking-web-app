import type { ThemeBase } from '../lib/types';
import { updateSettings, useData } from '../lib/store';
import { AUTO_THEME, HARBOR, PALETTES } from '../lib/theme';
import { href } from '../lib/router';
import { Check, Plus } from '../components/Icons';

/** A tiny picture of the app in a palette: page, a card with a line of text, the main and accent colors. */
export function Swatch({ base }: { base: ThemeBase }) {
  return (
    <span class="swatch" style={{ background: base.bg }} aria-hidden="true">
      <span class="swatch-card" style={{ background: base.surface }}>
        <span class="swatch-text" style={{ background: base.ink }} />
        <span class="swatch-dots">
          <i style={{ background: base.primary }} />
          <i style={{ background: base.accent }} />
          <i style={{ background: base.protein }} />
        </span>
      </span>
    </span>
  );
}

function AutoSwatch() {
  const night = PALETTES.find((p) => p.id === 'night')!;
  return (
    <span class="swatch-split" aria-hidden="true">
      <Swatch base={HARBOR.base} />
      <Swatch base={night.base} />
    </span>
  );
}

export function AppearanceSettings() {
  const data = useData();
  const { theme, customThemes, humor } = data.settings;
  const options = [
    ...PALETTES.slice(0, 1).map((p) => ({ id: p.id, name: p.name, swatch: <Swatch base={p.base} /> })),
    { id: AUTO_THEME, name: 'Auto', swatch: <AutoSwatch /> },
    ...PALETTES.slice(1).map((p) => ({ id: p.id, name: p.name, swatch: <Swatch base={p.base} /> })),
    ...customThemes.map((p) => ({ id: p.id, name: p.name, swatch: <Swatch base={p.base} /> })),
  ];
  const known = options.some((o) => o.id === theme);
  const selected = known ? theme : HARBOR.id;
  const custom = customThemes.find((c) => c.id === selected);

  return (
    <section class="card stack-12" aria-labelledby="look-title">
      <h2 id="look-title" class="section-title">
        Appearance
      </h2>
      <div class="palette-grid" role="radiogroup" aria-label="Color palette">
        {options.map((o) => (
          <button
            type="button"
            role="radio"
            aria-checked={o.id === selected}
            class="palette-option"
            onClick={() => updateSettings({ theme: o.id })}
          >
            {o.swatch}
            <span class="palette-name">
              {o.id === selected && <Check size={14} strokeWidth={3} />}
              {o.name}
            </span>
          </button>
        ))}
        <a class="palette-option new" href={`#${href('/palette/new')}`}>
          <span class="swatch new" aria-hidden="true">
            <Plus size={22} />
          </span>
          <span class="palette-name">Your own</span>
        </a>
      </div>
      <p class="field-hint">
        {selected === AUTO_THEME
          ? 'Auto uses Harbor by day and Night when your phone is in dark mode.'
          : 'Palettes apply to this device only.'}{' '}
        {custom ? (
          <a href={`#${href(`/palette/${custom.id}`)}`}>Edit “{custom.name}”</a>
        ) : (
          <a href={`#${href('/palette/new', { import: '1' })}`}>Import a palette</a>
        )}
      </p>

      <label class="toggle-row switch-row">
        <input
          type="checkbox"
          role="switch"
          class="switch"
          checked={humor}
          onChange={(e) => updateSettings({ humor: (e.target as HTMLInputElement).checked })}
        />
        <span>
          <strong>Humor mode</strong>
          <span class="muted">
            {humor
              ? 'On: a light-hearted remark here and there. Never about your weight or food choices.'
              : 'Off: plain, to-the-point text everywhere.'}
          </span>
        </span>
      </label>
    </section>
  );
}
