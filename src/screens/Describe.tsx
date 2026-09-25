import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Food, MealId } from '../lib/types';
import { aiReady, estimate, providerName } from '../lib/ai';
import { FOODS } from '../lib/foods';
import { matchDescription } from '../lib/textmatch';
import { getData, recentFoods, useData } from '../lib/store';
import { useLoadingQuip } from '../lib/humor';
import { AiError, type EstimatedItem } from '../lib/ai/shared';
import { showToast } from '../lib/toast';
import { ProviderLine, UseGeminiButton } from '../components/AiProvider';
import { AddPhotoButton } from '../components/AddPhotoButton';
import { goBack, href, navigate } from '../lib/router';
import { EstimateReview, toReviewItem, type ReviewItem } from '../components/EstimateReview';
import { MealPicker } from '../components/Common';
import { ChevronLeft } from '../components/Icons';

interface Done {
  state: 'done';
  via: 'ai' | 'list';
  source: string;
  items: ReviewItem[];
  unmatched: string[];
  /** Corrections the AI applied so far, oldest first. */
  corrections: string[];
  id: number;
}

type Phase = { state: 'edit'; message?: string; fix?: 'use-gemini' } | { state: 'loading'; progress?: string } | Done;

type Fixing = { busy: boolean; progress?: string; error?: string };

let runId = 0;

const EXAMPLE = 'e.g. 2 scrambled eggs, a slice of wholemeal toast with butter and a latte';

export function Describe({
  meal,
  date,
  initialText,
  autoRun,
}: {
  meal: MealId;
  date: string;
  initialText: string;
  /** Start straight away (from typing on Add food): estimate with the AI, or match the food list. */
  autoRun?: 'ai' | 'list';
}) {
  const data = useData();
  const settings = data.settings;
  const ready = aiReady(settings);
  const [text, setText] = useState(initialText);
  const [phase, setPhase] = useState<Phase>({ state: 'edit' });
  const [fixing, setFixing] = useState<Fixing>({ busy: false });
  const loadingQuip = useLoadingQuip(phase.state === 'loading', 'text');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Keep the text in the URL so it survives a trip to Settings and back.
  useEffect(() => {
    history.replaceState(history.state, '', `#${href('/describe', { meal, date, text: text.trim() || undefined })}`);
  }, [meal, date, text]);

  // Your own foods (recent, favorites) first, then the built-in list.
  const pool = useMemo(() => {
    const seen = new Map<string, Food>();
    for (const f of [...recentFoods(data.entries, 60).map((r) => r.food), ...data.favorites, ...FOODS]) {
      if (!seen.has(f.id)) seen.set(f.id, f);
    }
    return [...seen.values()];
  }, [data.entries, data.favorites]);

  const trimmed = text.trim();

  const matchFromList = () => {
    const { matches, unmatched } = matchDescription(trimmed, pool);
    if (matches.length === 0) {
      setPhase({
        state: 'edit',
        message: ready
          ? "None of that is in the food list. Try the AI estimate, or use Quick add."
          : 'None of that is in the food list. Try simpler words (like "2 eggs, toast, banana"), use Quick add, or add a free Gemini key in Settings for AI estimates.',
      });
      return;
    }
    setPhase({
      state: 'done',
      via: 'list',
      source: 'the food list',
      id: ++runId,
      unmatched,
      corrections: [],
      items: matches.map((m) => ({ name: m.food.name, amount: m.amount, per100: m.food.per100, food: m.food })),
    });
  };

  const restart = () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    return controller;
  };

  const askAi = async () => {
    const controller = restart();
    setFixing({ busy: false });
    setPhase({ state: 'loading' });
    try {
      // Read settings now, not from the render: the provider may have just been switched.
      const { items, source } = await estimate(
        getData().settings,
        { kind: 'text', text: trimmed.slice(0, 2000) },
        controller.signal,
        (progress) => !controller.signal.aborted && setPhase({ state: 'loading', progress }),
      );
      if (controller.signal.aborted) return;
      if (items.length === 0) {
        setPhase({ state: 'edit', message: "That didn't sound like food or drink. Try describing what you ate and how much." });
        return;
      }
      setPhase({
        state: 'done',
        via: 'ai',
        source,
        id: ++runId,
        unmatched: [],
        corrections: [],
        items: items.map(toReviewItem),
      });
    } catch (err) {
      if (controller.signal.aborted) return;
      console.error(err);
      setPhase({
        state: 'edit',
        message: (err as Error).message || 'Something went wrong. Try again.',
        fix: err instanceof AiError ? err.fix : undefined,
      });
    }
  };

  /** Ask the AI to fix its estimate, keeping the person's own changes. */
  const correct = async (done: Done, request: string, current: EstimatedItem[], removed: string[]) => {
    const controller = restart();
    const requests = [...done.corrections, request];
    setFixing({ busy: true });
    try {
      const { items, source } = await estimate(
        getData().settings,
        { kind: 'text', text: trimmed.slice(0, 2000), correction: { current, removed, requests } },
        controller.signal,
        (progress) => !controller.signal.aborted && setFixing({ busy: true, progress }),
      );
      if (controller.signal.aborted) return;
      if (items.length === 0) {
        setFixing({ busy: false, error: 'That correction left nothing to log. Try saying it differently.' });
        return;
      }
      setFixing({ busy: false });
      setPhase({ ...done, source, items: items.map(toReviewItem), corrections: requests, id: ++runId });
      showToast('Estimate updated', {
        label: 'Undo',
        // Back to the list as it was, the person's own changes included.
        run: () => {
          setFixing({ busy: false });
          setPhase({ ...done, items: current.map(toReviewItem), id: ++runId });
        },
      });
    } catch (err) {
      if (controller.signal.aborted) return;
      console.error(err);
      setFixing({ busy: false, error: (err as Error).message || 'Something went wrong. Try again.' });
    }
  };

  // Arriving from Add food with the text already typed: no second tap needed.
  useEffect(() => {
    if (!trimmed || !autoRun) return;
    if (autoRun === 'ai' && ready) askAi();
    else matchFromList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const backToEdit = () => {
    abortRef.current?.abort();
    setFixing({ busy: false });
    setPhase({ state: 'edit' });
  };

  const done = phase.state === 'done' ? phase : undefined;

  return (
    <main class={`screen gap-16${done ? ' with-footer' : ''}`}>
      <header class="topbar">
        <button type="button" class="icon-btn ink" aria-label="Back" onClick={() => goBack(href('/add', { meal, date }))}>
          <ChevronLeft />
        </button>
        <h1>Describe food</h1>
        <span class="spacer-44" />
      </header>

      {done ? (
        <>
          <button type="button" class="said" onClick={backToEdit} aria-label="Edit description">
            <span class="said-text">“{trimmed}”</span>
            <span class="said-edit">Edit</span>
          </button>
          {done.unmatched.length > 0 && (
            <div class="notice plain">
              <span>
                Not in the food list: <strong>{done.unmatched.join(', ')}</strong>.{' '}
                {ready ? 'Try the AI estimate for these, or ' : ''}
                <a href={`#${href('/quick', { meal, date })}`}>use Quick add</a>.
              </span>
            </div>
          )}
          <EstimateReview
            key={done.id}
            items={done.items}
            meal={meal}
            date={date}
            source={done.via === 'ai' ? 'text' : 'food'}
            title={`${done.items.length} ${done.items.length === 1 ? 'item' : 'items'}`}
            note={
              done.via === 'ai'
                ? `Estimated by ${done.source}${done.corrections.length ? ', with your corrections' : ''} — check the amounts.`
                : 'Matched from the food list, free and offline — check the amounts.'
            }
            secondary={{ label: 'Edit', onClick: backToEdit }}
            correction={
              done.via === 'ai'
                ? {
                    provider: providerName(settings),
                    history: done.corrections,
                    ...fixing,
                    onSubmit: (request, current, removed) => correct(done, request, current, removed),
                  }
                : undefined
            }
          />
        </>
      ) : (
        <>
          <MealPicker value={meal} onChange={(m) => navigate(href('/describe', { meal: m, date, text: trimmed || undefined }), { replace: true })} />

          <div class="field">
            <label for="describe" class="field-label">
              What did you eat?
            </label>
            <textarea
              id="describe"
              class="input textarea"
              rows={4}
              maxLength={2000}
              placeholder={EXAMPLE}
              value={text}
              disabled={phase.state === 'loading'}
              onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
            />
            <span class="field-hint">
              Include amounts if you know them. To talk instead of type, tap the microphone on your keyboard.
            </span>
          </div>

          {phase.state === 'edit' && phase.message && <div class="notice plain">{phase.message}</div>}
          {phase.state === 'edit' && phase.fix === 'use-gemini' && <UseGeminiButton onSwitched={askAi} />}

          {phase.state === 'loading' ? (
            <div class="sheet-status">
              <span class="spinner" />
              <span class="loading-text">
                <span>{phase.progress ?? `${providerName(settings)} is working it out…`}</span>
                {loadingQuip && <small>{loadingQuip}</small>}
              </span>
            </div>
          ) : ready ? (
            <div class="stack-10">
              <button type="button" class="btn-primary" disabled={!trimmed} onClick={askAi}>
                Estimate with {providerName(settings)}
              </button>
              <AddPhotoButton meal={meal} date={date} note={trimmed} />
              <button type="button" class="btn-secondary" disabled={!trimmed} onClick={matchFromList}>
                Match from food list (offline)
              </button>
              <ProviderLine />
            </div>
          ) : (
            <div class="stack-10">
              <button type="button" class="btn-primary" disabled={!trimmed} onClick={matchFromList}>
                Match from food list
              </button>
              <p class="field-hint">
                This matches your words to the app's food list — free and offline. For smarter estimates of any food or
                dish, <a href="#/settings">add a free Gemini key in Settings</a>.
              </p>
            </div>
          )}
        </>
      )}
    </main>
  );
}
