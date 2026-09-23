import { useEffect, useRef, useState } from 'preact/hooks';
import type { MealId } from '../lib/types';
import type { EstimatedItem, PreparedImage } from '../lib/ai';
import { aiReady, estimate, prepareImage, providerName } from '../lib/ai';
import { useData } from '../lib/store';
import { goBack, href } from '../lib/router';
import { EstimateReview } from '../components/EstimateReview';
import { Camera, ChevronLeft } from '../components/Icons';

type Phase =
  | { state: 'pick'; message?: string }
  | { state: 'analyzing'; image: PreparedImage; progress?: string }
  | { state: 'done'; image: PreparedImage; items: EstimatedItem[]; source: string; id: number }
  | { state: 'error'; image: PreparedImage; message: string };

let runId = 0;

export function Photo({ meal, date }: { meal: MealId; date: string }) {
  const data = useData();
  const settings = data.settings;
  const ready = aiReady(settings);
  const [phase, setPhase] = useState<Phase>({ state: 'pick' });
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
      const { items, source } = await estimate(settings, { kind: 'photo', image }, controller.signal, (progress) => {
        if (!controller.signal.aborted) setPhase({ state: 'analyzing', image, progress });
      });
      if (controller.signal.aborted) return;
      setPhase({ state: 'done', image, items, source, id: ++runId });
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
      await analyze(await prepareImage(file));
    } catch (err) {
      setPhase({ state: 'pick', message: (err as Error).message });
    }
  };

  const retake = () => {
    abortRef.current?.abort();
    setPhase({ state: 'pick' });
    cameraInput.current?.click();
  };

  const image = phase.state === 'pick' ? undefined : phase.image;
  const done = phase.state === 'done' ? phase : undefined;

  return (
    <main class={`screen gap-16${done && done.items.length > 0 ? ' with-footer' : ''}`}>
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
          {done?.items.map((it, i) => (
            <span class="marker" style={{ left: `${(it.x ?? 0.5) * 100}%`, top: `${(it.y ?? 0.5) * 100}%` }} aria-hidden="true">
              {i + 1}
            </span>
          ))}
          {phase.state === 'analyzing' && (
            <div class="photo-overlay" role="status">
              <span class="spinner" />
              {phase.progress ?? 'Estimating portions…'}
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          class="photo-frame placeholder"
          onClick={() => ready && cameraInput.current?.click()}
          disabled={!ready}
        >
          <Camera size={32} strokeWidth={1.8} />
          <span>Take a photo of your meal</span>
        </button>
      )}

      {phase.state === 'pick' &&
        (!ready ? (
          <div class="notice plain">
            <span>
              Photo estimates need an AI key. A <strong>Gemini key from Google is free</strong> —{' '}
              <a href="#/settings">add one in Settings</a>, then come back here. Or{' '}
              <a href={`#${href('/describe', { meal, date })}`}>describe your meal in words</a>, which also works without a
              key.
            </span>
          </div>
        ) : (
          <>
            {phase.message && <div class="notice plain">{phase.message}</div>}
            <p class="lede">
              Snap your plate from above with everything in view. {providerName(settings)} lists what it sees and estimates
              each portion — you can adjust the grams before adding.
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
        ))}

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

      {done && done.items.length === 0 && (
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

      {done && done.items.length > 0 && (
        <EstimateReview
          key={done.id}
          items={done.items.map((it) => ({ name: it.name, amount: it.grams, per100: it.per100 }))}
          meal={meal}
          date={date}
          source="photo"
          numbered
          title={`${done.items.length} ${done.items.length === 1 ? 'item' : 'items'} found`}
          note={`Estimated by ${done.source} — check the portions. Set 0 g to leave an item out.`}
          secondary={{ label: 'Retake', onClick: retake }}
        />
      )}
    </main>
  );
}
