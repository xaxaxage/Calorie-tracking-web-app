import { useEffect, useRef, useState } from 'preact/hooks';
import type { Food, MealId } from '../lib/types';
import type { PhotoItem, PreparedImage } from '../lib/photo';
import { addEntries, deleteEntry, newId, useData } from '../lib/store';
import { cleanAmount, fmtKcal, macrosFor, parseNumber, sum } from '../lib/nutrition';
import { MEAL_LABEL } from '../lib/meals';
import { finishFlow, goBack, href } from '../lib/router';
import { showToast } from '../lib/toast';
import { Camera, ChevronLeft } from '../components/Icons';

type Phase =
  | { state: 'pick'; message?: string }
  | { state: 'analyzing'; image: PreparedImage }
  | { state: 'done'; image: PreparedImage; items: PhotoItem[] }
  | { state: 'error'; image: PreparedImage; message: string };

function toFood(item: PhotoItem): Food {
  return {
    id: `photo:${newId()}`,
    name: item.name,
    unit: 'g',
    per100: { ...item.per100 },
    defaultAmount: item.grams,
  };
}

export function Photo({ meal, date }: { meal: MealId; date: string }) {
  const data = useData();
  const apiKey = data.settings.apiKey;
  const [phase, setPhase] = useState<Phase>({ state: 'pick' });
  const [grams, setGrams] = useState<string[]>([]);
  const cameraInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const analyze = async (image: PreparedImage) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase({ state: 'analyzing', image });
    try {
      const { estimateFromPhoto } = await import('../lib/photo');
      const items = await estimateFromPhoto(apiKey, image, controller.signal);
      if (controller.signal.aborted) return;
      setGrams(items.map((it) => String(it.grams)));
      setPhase({ state: 'done', image, items });
    } catch (err) {
      if (controller.signal.aborted) return;
      console.error(err);
      setPhase({ state: 'error', image, message: (err as Error).message || 'Something went wrong. Try again.' });
    }
  };

  const onFile = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const { prepareImage } = await import('../lib/photo');
      const image = await prepareImage(file);
      await analyze(image);
    } catch (err) {
      setPhase({ state: 'pick', message: (err as Error).message });
    }
  };

  const retake = () => {
    abortRef.current?.abort();
    setPhase({ state: 'pick' });
    cameraInput.current?.click();
  };

  const items = phase.state === 'done' ? phase.items : [];
  const amounts = grams.map((g) => cleanAmount(parseNumber(g)));
  const perItem = items.map((it, i) => macrosFor(toFoodLike(it), amounts[i] ?? 0));
  const totals = sum(perItem);
  const counted = items.filter((_, i) => (amounts[i] ?? 0) > 0).length;

  const addAll = () => {
    const created = addEntries(
      items.flatMap((it, i) => {
        const amount = amounts[i] ?? 0;
        if (amount <= 0) return [];
        const food = toFood(it);
        return [{ date, meal, name: it.name, amount, unit: 'g' as const, food, ...perItem[i], source: 'photo' as const }];
      }),
    );
    showToast(`Added ${created.length} ${created.length === 1 ? 'item' : 'items'} to ${MEAL_LABEL[meal]}`, {
      label: 'Undo',
      run: () => created.forEach((e) => deleteEntry(e.id)),
    }, { carry: true });
    finishFlow(href('/', { date }));
  };

  const image = phase.state === 'pick' ? undefined : phase.image;

  return (
    <>
      <main class={`screen gap-16${phase.state === 'done' ? ' with-footer' : ''}`}>
        <header class="topbar">
          <button type="button" class="icon-btn ink" aria-label="Back" onClick={() => goBack(href('/add', { meal, date }))}>
            <ChevronLeft />
          </button>
          <h1>Photo estimate</h1>
          <span class="spacer-44" />
        </header>

        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          class="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => onFile(e.target as HTMLInputElement)}
        />
        <input
          ref={libraryInput}
          type="file"
          accept="image/*"
          class="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => onFile(e.target as HTMLInputElement)}
        />

        {image ? (
          <div class="photo-frame">
            <img src={image.dataUrl} alt="Your meal" />
            {phase.state === 'done' &&
              phase.items.map((it, i) => (
                <span class="marker" style={{ left: `${it.x * 100}%`, top: `${it.y * 100}%` }} aria-hidden="true">
                  {i + 1}
                </span>
              ))}
            {phase.state === 'analyzing' && (
              <div class="photo-overlay" role="status">
                <span class="spinner" />
                Estimating portions…
              </div>
            )}
          </div>
        ) : (
          <button type="button" class="photo-frame placeholder" onClick={() => apiKey && cameraInput.current?.click()} disabled={!apiKey}>
            <Camera size={32} strokeWidth={1.8} />
            <span>Take a photo of your meal</span>
          </button>
        )}

        {phase.state === 'pick' && (
          <>
            {!apiKey ? (
              <div class="notice plain">
                <span>
                  Photo estimates need an Anthropic API key. <a href="#/settings">Add one in Settings</a>, then come back
                  here.
                </span>
              </div>
            ) : (
              <>
                {phase.message && <div class="notice plain">{phase.message}</div>}
                <p class="lede">
                  Snap your plate from above with everything in view. Claude lists what it sees and estimates each portion —
                  you can adjust the grams before adding.
                </p>
                <div class="button-pair">
                  <button type="button" class="btn-secondary" onClick={() => libraryInput.current?.click()}>
                    From library
                  </button>
                  <button type="button" class="btn-primary" onClick={() => cameraInput.current?.click()}>
                    Take photo
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {phase.state === 'error' && (
          <>
            <div class="notice plain">{phase.message}</div>
            <div class="button-pair">
              <button type="button" class="btn-secondary" onClick={retake}>
                Retake
              </button>
              <button type="button" class="btn-primary" onClick={() => analyze(phase.image)}>
                Try again
              </button>
            </div>
          </>
        )}

        {phase.state === 'done' && phase.items.length === 0 && (
          <>
            <div class="stack-2 pad-4">
              <h2 class="section-title">No food found</h2>
              <span class="muted small-text">Try a closer photo with the whole plate in view.</span>
            </div>
            <button type="button" class="btn-primary" onClick={retake}>
              Retake
            </button>
          </>
        )}

        {phase.state === 'done' && phase.items.length > 0 && (
          <>
            <div class="stack-2 pad-4">
              <h2 class="section-title">
                {phase.items.length} {phase.items.length === 1 ? 'item' : 'items'} found
              </h2>
              <span class="muted small-text">Photo estimates can be off — check the portions. Set 0 g to leave an item out.</span>
            </div>

            <div class="list">
              {phase.items.map((it, i) => {
                const m = perItem[i];
                return (
                  <div class="photo-row">
                    <span class="badge">{i + 1}</span>
                    <div class="row-main">
                      <span class="row-title small">{it.name}</span>
                      <span class="row-sub num">
                        {fmtKcal(m.kcal)} kcal · P {Math.round(m.p)} · C {Math.round(m.c)} · F {Math.round(m.f)}
                      </span>
                    </div>
                    <label for={`grams-${i}`} class="sr-only">
                      {it.name} grams
                    </label>
                    <div class="input-wrap grams">
                      <input
                        id={`grams-${i}`}
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        value={grams[i]}
                        onFocus={(e) => (e.target as HTMLInputElement).select()}
                        onInput={(e) => {
                          const next = [...grams];
                          next[i] = (e.target as HTMLInputElement).value.replace(/[^\d]/g, '');
                          setGrams(next);
                        }}
                      />
                      <span class="input-suffix">g</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div class="strip">
              <span class="strip-label num">
                P {Math.round(totals.p)} g · C {Math.round(totals.c)} g · F {Math.round(totals.f)} g
              </span>
              <span class="strip-value kcal num">{fmtKcal(totals.kcal)} kcal</span>
            </div>
          </>
        )}
      </main>

      {phase.state === 'done' && phase.items.length > 0 && (
        <div class="footer">
          <div class="footer-inner">
            <button type="button" class="btn-secondary retake" onClick={retake}>
              Retake
            </button>
            <button type="button" class="btn-primary" disabled={counted === 0} onClick={addAll}>
              {counted === phase.items.length ? 'Add all' : `Add ${counted}`} to {MEAL_LABEL[meal]}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/** Minimal food shape for computing per-item macros. */
function toFoodLike(item: PhotoItem): Food {
  return { id: 'photo', name: item.name, unit: 'g', per100: item.per100 };
}
