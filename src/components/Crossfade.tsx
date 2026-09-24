import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { motionOn } from '../lib/motion';

const EXIT_MS = 170;

interface Shown {
  view: string;
  children: ComponentChildren;
}

/**
 * Swaps between views with a cross-fade: when `view` changes, the old content
 * stays for a moment (on top, not clickable) while it fades out and the new
 * content comes in. The new view gets the class `enter-<view>` so each
 * direction can move its own way. With animations off it just swaps.
 */
export function Crossfade({ view, children }: { view: string; children: ComponentChildren }) {
  const shown = useRef<Shown>({ view, children });
  // Kept in refs, not state, so the old view is part of the very render that replaces it.
  const leaving = useRef<Shown | null>(null);
  const entered = useRef<string | null>(null);
  const [, redraw] = useState(0);

  if (shown.current.view !== view) {
    const animate = motionOn();
    leaving.current = animate ? shown.current : null;
    entered.current = animate ? view : null;
  }
  shown.current = { view, children };
  const out = leaving.current;

  useEffect(() => {
    if (!out) return;
    const t = setTimeout(() => {
      if (leaving.current === out) {
        leaving.current = null;
        redraw((n) => n + 1);
      }
    }, EXIT_MS);
    return () => clearTimeout(t);
  }, [out]);

  return (
    <div class="mode-stage">
      <div key={view} class={`mode-panel${entered.current === view ? ` enter-${view}` : ''}`}>
        {children}
      </div>
      {out && out.view !== view && (
        <div key={out.view} class="mode-panel leaving" aria-hidden="true" inert>
          {out.children}
        </div>
      )}
    </div>
  );
}
