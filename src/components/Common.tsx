import type { ComponentChildren } from 'preact';
import type { MealId } from '../lib/types';
import { MEALS } from '../lib/types';
import { MEAL_CHIP } from '../lib/meals';
import { href, navigate } from '../lib/router';
import { dismissToast, useToast } from '../lib/toast';
import { HistoryIcon, Plus, TodayIcon } from './Icons';

export function MealPicker({ value, onChange }: { value: MealId; onChange: (m: MealId) => void }) {
  return (
    <div role="group" aria-label="Meal" class="segmented">
      {MEALS.map((m) => (
        <button type="button" aria-pressed={m === value} onClick={() => onChange(m)}>
          {MEAL_CHIP[m]}
        </button>
      ))}
    </div>
  );
}

export function BottomNav({ current, date }: { current: 'today' | 'history'; date?: string }) {
  return (
    <nav aria-label="Main" class="bottom-nav">
      <div class="bottom-nav-inner">
        <a href="#/" class="nav-link" aria-current={current === 'today' ? 'page' : undefined}>
          <TodayIcon />
          Today
        </a>
        <a
          href={`#${href('/add', { date })}`}
          class="fab"
          aria-label="Add food"
          onClick={(e) => {
            e.preventDefault();
            navigate(href('/add', { date }), { startFlow: true });
          }}
        >
          <Plus size={28} strokeWidth={2.4} />
        </a>
        <a href="#/history" class="nav-link" aria-current={current === 'history' ? 'page' : undefined}>
          <HistoryIcon />
          History
        </a>
      </div>
    </nav>
  );
}

export function ToastHost({ raised }: { raised: boolean }) {
  const toast = useToast();
  if (!toast) return null;
  return (
    <div class="toast-wrap" style={raised ? undefined : { bottom: 'calc(var(--safe-bottom) + 100px)' }} role="status" aria-live="polite">
      <div class={`toast${toast.action ? '' : ' no-action'}`} key={toast.id}>
        <span class="toast-text">
          <span>{toast.message}</span>
          {toast.note && <span class="toast-note">{toast.note}</span>}
        </span>
        {toast.action && (
          <button
            type="button"
            onClick={() => {
              toast.action!.run();
              dismissToast();
            }}
          >
            {toast.action.label}
          </button>
        )}
      </div>
    </div>
  );
}

export function MacroLabel({ kind, children }: { kind: 'p' | 'c' | 'f'; children: ComponentChildren }) {
  return (
    <span class="macro-label">
      <span class={`dot ${kind}`} />
      {children}
    </span>
  );
}

export function SplitBar({ p, c, f, thin }: { p: number; c: number; f: number; thin?: boolean }) {
  return (
    <div class={`split${thin ? ' thin' : ''}`} aria-hidden="true">
      <span class="bg-p" style={{ width: `${p.toFixed(1)}%` }} />
      <span class="bg-c" style={{ width: `${c.toFixed(1)}%` }} />
      <span class="bg-f" style={{ width: `${f.toFixed(1)}%` }} />
    </div>
  );
}
