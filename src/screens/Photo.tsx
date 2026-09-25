import { useEffect, useRef, useState } from 'preact/hooks';
import type { MealId } from '../lib/types';
import type { EstimatedItem, PreparedImage } from '../lib/ai';
import { aiReady, estimate, prepareImage, providerName } from '../lib/ai';
import { getData, useData } from '../lib/store';
import { quip, useLoadingQuip } from '../lib/humor';
import { AiError, MAX_NOTE } from '../lib/ai/shared';
import { takeHandedOffPhoto } from '../lib/photoHandoff';
import { showToast } from '../lib/toast';
import { ProviderLine, UseGeminiButton } from '../components/AiProvider';
import { goBack, href } from '../lib/router';
import { EstimateReview, toReviewItem } from '../components/EstimateReview';
import { Camera, ChevronLeft } from '../components/Icons';

interface Done {
  state: 'done';
  image: PreparedImage;
  note: string;
  items: EstimatedItem[];
  source: string;
  /** Corrections applied so far, oldest first. */
  corrections: string[];
  id: number;
}

type Phase =
  | { state: 'pick'; message?: string }
  | { state: 'analyzing'; image: PreparedImage; progress?: string }
  | Done
  | { state: 'error'; image: PreparedImage; message: string; fix?: 'use-gemini' };

type Fixing = { busy: boolean; progress?: string; error?: string };

let runId = 0;

export function Photo({ meal, date, initialNote = '' }: { meal: MealId; date: string; initialNote?: string }) {
  const data = useData();
  const settings = data.settings;
  const ready = aiReady(settings);
  const [phase, setPhase] = useState<Phase>({ state: 'pick' });
  const [note, setNote] = useState(initialNote);
  const [fixing, setFixing] = useState<Fixing>({ busy: false });
  const loadingQuip = useLoadingQuip(phase.state === 'analyzing', 'photo');
  const cameraInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // The note as typed right now, for estimates started from a file picker callback.
  const noteRef = useRef(note);
  noteRef.current = note;

  useEffect(() => () => abortRef.current?.abort(), []);

  // Keep the note in the URL so it survives a trip to Settings and back.
  useEffect(() => {
    history.replaceState(history.state, '', `#${href('/photo', { meal, date, note: note.trim() || undefined })}`);
  }, [meal, date, note]);

  const restart = () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    return controller;
  };

  const analyze = async (image: PreparedImage) => {
    const controller = restart();
    const noteNow = noteRef.current.trim();
    setFixing({ busy: false });
    setPhase({ state: 'analyzing', image });
    try {
      // Read settings now, not from the render: the provider may have just been switched.
      const current = getData().settings;
      const { items, source } = await estimate(
        current,
        { kind: 'photo', image, note: noteNow || undefined },
        controller.signal,
        (progress) => {
          if (!controller.signal.aborted) setPhase({ state: 'analyzing', image, progress });
        },
      );
      if (controller.signal.aborted) return;
      setPhase({ state: 'done', image, note: noteNow, items, source, corrections: [], id: ++runId });
    } catch (err) {
      if (controller.signal.aborted) return;
      console.error(err);
      setPhase({
        state: 'error',
        image,
        message: (err as Error).message || 'Something went wrong. Try again.',
        fix: err instanceof AiError ? err.fix : undefined,
      });
    }
  };

  /** Ask the AI to fix the estimate, keeping the person's own changes. */
  const correct = async (done: Done, request: string, current: EstimatedItem[], removed: string[]) => {
    const controller = restart();
    const requests = [...done.corrections, request];
    setFixing({ busy: true });
    try {
      const { items, source } = await estimate(
        getData().settings,
        { kind: 'photo', image: done.image, note: done.note || undefined, correction: { current, removed, requests } },
        controller.signal,
        (progress) => !controller.signal.aborted && setFixing({ busy: true, progress }),
      );
      if (controller.signal.aborted) return;
      if (items.length === 0) {
        setFixing({ busy: false, error: 'That correction left nothing to log. Try saying it differently.' });
        return;
      }
      setFixing({ busy: false });
      setPhase({ ...done, items, source, corrections: requests, id: ++runId });
      showToast('Estimate updated', {
        label: 'Undo',
        // Back to the list as it was, the person's own changes included.
        run: () => {
          setFixing({ busy: false });
          setPhase({ ...done, items: current, id: ++runId });
        },
      });
    } catch (err) {
      if (controller.signal.aborted) return;
      console.error(err);
      setFixing({ busy: false, error: (err as Error).message || 'Something went wrong. Try again.' });
    }
  };

  const onBlob = async (file: Blob) => {
    try {
      await analyze(await prepareImage(file));
    } catch (err) {
      setPhase({ state: 'pick', message: (err as Error).message });
    }
  };

  const onFile = (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = '';
    if (file) onBlob(file);
  };

  // A photo picked on Add food or Describe, with what was typed there as the note.
  useEffect(() => {
    const handed = takeHandedOffPhoto();
    if (handed && ready) onBlob(handed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const retake = () => {
    abortRef.current?.abort();
    setFixing({ busy: false });
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
              <span class="loading-text">
                <span>{phase.progress ?? 'Estimating portions…'}</span>
                {loadingQuip && <small>{loadingQuip}</small>}
              </span>
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
            <div class="field">
              <label for="photo-note" class="field-label">
                Anything the photo doesn't show? <span class="muted">(optional)</span>
              </label>
              <textarea
                id="photo-note"
                class="input textarea"
                rows={2}
                maxLength={MAX_NOTE}
                placeholder="e.g. fried in butter, the drink is Coke Zero, I ate half"
                value={note}
                onInput={(e) => setNote((e.target as HTMLTextAreaElement).value)}
              />
            </div>
            <p class="lede">
              Snap your plate from above with everything in view. {providerName(settings)} lists what it sees
              {note.trim() ? ', using your note,' : ''} and estimates each portion — you can adjust the grams or tell it
              what's off before adding.
            </p>
            <div class="button-pair">
              <button type="button" class="btn-secondary" onClick={() => libraryInput.current?.click()}>
                From library
              </button>
              <button type="button" class="btn-primary" onClick={() => cameraInput.current?.click()}>
                Take photo
              </button>
            </div>
            <ProviderLine />
          </>
        ))}

      {phase.state === 'error' && (
        <>
          <div class="notice plain">{phase.message}</div>
          <div class="button-pair">
            <button type="button" class="btn-secondary" onClick={retake}>
              Retake
            </button>
            {phase.fix === 'use-gemini' ? (
              <UseGeminiButton onSwitched={() => analyze(phase.image)} />
            ) : (
              <button type="button" class="btn-primary" onClick={() => analyze(phase.image)}>
                Try again
              </button>
            )}
          </div>
          <ProviderLine />
        </>
      )}

      {done?.note && (
        <p class="said said-static">
          <span class="said-text">“{done.note}”</span>
        </p>
      )}

      {done && done.items.length === 0 && (
        <>
          <div class="stack-2 pad-4">
            <h2 class="section-title">No food found</h2>
            <span class="muted small-text">
              {quip('noFoodInPhoto', String(done.id))} Try a closer photo with the whole plate in view.
            </span>
          </div>
          <button type="button" class="btn-primary" onClick={retake}>
            Retake
          </button>
        </>
      )}

      {done && done.items.length > 0 && (
        <EstimateReview
          key={done.id}
          items={done.items.map(toReviewItem)}
          meal={meal}
          date={date}
          source="photo"
          numbered
          title={`${done.items.length} ${done.items.length === 1 ? 'item' : 'items'} found`}
          note={`Estimated by ${done.source}${done.corrections.length ? ', with your corrections' : ''} — check the portions. Set 0 g to leave an item out.`}
          secondary={{ label: 'Retake', onClick: retake }}
          correction={{
            provider: providerName(settings),
            history: done.corrections,
            ...fixing,
            onSubmit: (request, current, removed) => correct(done, request, current, removed),
          }}
        />
      )}
    </main>
  );
}
