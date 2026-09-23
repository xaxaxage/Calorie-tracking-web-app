import { useEffect, useRef, useState } from 'preact/hooks';
import type { Food, MealId } from '../lib/types';
import { addEntry, deleteEntry, rememberFood } from '../lib/store';
import { fmtGrams, fmtKcal, macrosFor, oneDecimal } from '../lib/nutrition';
import { MEAL_LABEL } from '../lib/meals';
import { finishFlow, href, navigate } from '../lib/router';
import { showToast } from '../lib/toast';
import { LookupError, lookupBarcode } from '../lib/openfoodfacts';
import { cameraProblem, getDetector, isValidProductCode, openCamera, type CameraProblem } from '../lib/scanner';
import { Check, Close, Flashlight } from '../components/Icons';

type Result =
  | { state: 'none' }
  | { state: 'manual' }
  | { state: 'lookup'; code: string }
  | { state: 'found'; code: string; food: Food }
  | { state: 'missing'; code: string }
  | { state: 'error'; code: string; message: string };

const CAMERA_MESSAGES: Record<CameraProblem, string> = {
  denied: 'Camera access is off. Allow it for this site in your browser settings, or type the number instead.',
  missing: 'No camera was found on this device. Type the number instead.',
  insecure: 'The camera only works when the app is opened over https.',
  other: 'The camera could not start. Type the number instead.',
};

const lookupCache = new Map<string, Food | null>();

export function Scan({ meal, date }: { meal: MealId; date: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraState, setCameraState] = useState<'starting' | 'on' | CameraProblem>('starting');
  const [torch, setTorch] = useState<{ supported: boolean; on: boolean }>({ supported: false, on: false });
  const [result, setResult] = useState<Result>({ state: 'none' });
  const [manualCode, setManualCode] = useState('');
  const scanning = result.state === 'none' && cameraState === 'on';
  const scanningRef = useRef(scanning);
  scanningRef.current = scanning;

  // Camera lifecycle.
  useEffect(() => {
    let cancelled = false;

    const stop = () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };

    const start = async () => {
      setCameraState('starting');
      try {
        const stream = await openCamera();
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current!;
        // iOS only plays camera video inline and without a gesture when these are attributes.
        video.setAttribute('playsinline', '');
        video.setAttribute('muted', '');
        video.muted = true;
        video.srcObject = stream;
        await video.play().catch(() => undefined);
        const track = stream.getVideoTracks()[0];
        const caps = (track?.getCapabilities?.() ?? {}) as { torch?: boolean };
        setTorch({ supported: !!caps.torch, on: false });
        setCameraState('on');
      } catch (err) {
        if (!cancelled) setCameraState(cameraProblem(err));
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !streamRef.current?.active) start();
    };

    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      stop();
    };
  }, []);

  // Detection loop: a few frames per second while no result is showing.
  useEffect(() => {
    if (!scanning) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      if (stopped) return;
      const video = videoRef.current;
      try {
        const detector = await getDetector();
        if (!stopped && video && video.readyState >= 2 && scanningRef.current) {
          const found = await detector.detect(video);
          const code = found.map((b) => b.rawValue.trim()).find(isValidProductCode);
          if (code && !stopped && scanningRef.current) {
            lookup(code);
            return;
          }
        }
      } catch (err) {
        console.warn('Barcode detection failed', err);
      }
      timer = setTimeout(tick, 180);
    };

    tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [scanning]);

  const lookup = async (code: string) => {
    setResult({ state: 'lookup', code });
    try {
      let food = lookupCache.get(code);
      if (food === undefined) {
        food = (await lookupBarcode(code)) ?? null;
        lookupCache.set(code, food);
      }
      if (food) {
        rememberFood(food);
        setResult({ state: 'found', code, food });
      } else {
        setResult({ state: 'missing', code });
      }
    } catch (err) {
      setResult({
        state: 'error',
        code,
        message: err instanceof LookupError ? err.message : 'The lookup failed. Try again.',
      });
    }
  };

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const on = !torch.on;
    try {
      await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
      setTorch({ supported: true, on });
    } catch {
      setTorch({ supported: false, on: false });
    }
  };

  const close = () => finishFlow(href('/', { date }));
  const scanAgain = () => setResult({ state: 'none' });

  const addFound = (food: Food) => {
    const amount = food.defaultAmount ?? 100;
    const created = addEntry({
      date,
      meal,
      name: food.name,
      amount,
      unit: food.unit,
      food,
      ...macrosFor(food, amount),
      source: 'barcode',
    });
    showToast(`Added to ${MEAL_LABEL[meal]}`, { label: 'Undo', run: () => deleteEntry(created.id) }, { carry: true });
    close();
  };

  let prompt = 'Point the camera at the barcode';
  if (cameraState === 'starting') prompt = 'Starting camera…';
  else if (cameraState !== 'on') prompt = CAMERA_MESSAGES[cameraState];

  return (
    <div class="scanner">
      <video ref={videoRef} class={`scanner-video${cameraState === 'on' ? ' live' : ''}`} playsInline muted autoPlay />

      <header class="scanner-header">
        <button type="button" class="scanner-btn" aria-label="Close scanner" onClick={close}>
          <Close />
        </button>
        <h1>Scan barcode</h1>
        {torch.supported ? (
          <button
            type="button"
            class="scanner-btn"
            aria-label={torch.on ? 'Turn off flashlight' : 'Turn on flashlight'}
            aria-pressed={torch.on}
            onClick={toggleTorch}
          >
            <Flashlight on={torch.on} />
          </button>
        ) : (
          <span class="spacer-44" />
        )}
      </header>

      <div class={`viewfinder${scanning ? ' active' : ''}`} aria-hidden="true">
        <i class="corner tl" />
        <i class="corner tr" />
        <i class="corner bl" />
        <i class="corner br" />
        <i class="scan-line" />
      </div>

      <div class="scanner-copy">
        <p role="status">{prompt}</p>
        <button type="button" class="ghost-btn" onClick={() => setResult({ state: 'manual' })}>
          Type the number instead
        </button>
      </div>

      {result.state !== 'none' && (
        <>
          <button type="button" class="sheet-backdrop" aria-label="Scan again" onClick={scanAgain} />
          <section class="sheet" aria-label={result.state === 'found' ? 'Scanned product' : 'Barcode'}>
            <button type="button" class="grabber" aria-label="Dismiss" onClick={scanAgain} />

            {result.state === 'manual' && (
              <form
                class="stack-12"
                onSubmit={(e) => {
                  e.preventDefault();
                  const code = manualCode.replace(/\D/g, '');
                  if (code.length >= 8) lookup(code);
                }}
              >
                <label for="manual-code" class="sheet-title">
                  Barcode number
                </label>
                <input
                  id="manual-code"
                  class="input strong"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  enterKeyHint="search"
                  placeholder="e.g. 5000112637922"
                  value={manualCode}
                  autoFocus
                  onInput={(e) => setManualCode((e.target as HTMLInputElement).value.replace(/[^\d]/g, ''))}
                />
                <div class="button-pair">
                  <button type="button" class="btn-secondary" onClick={scanAgain}>
                    Cancel
                  </button>
                  <button type="submit" class="btn-primary" disabled={manualCode.length < 8}>
                    Look up
                  </button>
                </div>
              </form>
            )}

            {result.state === 'lookup' && (
              <div class="sheet-status">
                <span class="spinner" />
                <span>Looking up {result.code}…</span>
              </div>
            )}

            {result.state === 'found' && <FoundProduct food={result.food} meal={meal} date={date} onAdd={addFound} />}

            {result.state === 'missing' && (
              <div class="stack-12">
                <div class="stack-4">
                  <h2 class="sheet-title">Product not found</h2>
                  <p class="muted">
                    {result.code} isn't in Open Food Facts yet, or has no calorie info. You can log it by hand.
                  </p>
                </div>
                <div class="button-pair">
                  <button type="button" class="btn-secondary" onClick={scanAgain}>
                    Scan again
                  </button>
                  <a class="btn-primary" href={`#${href('/quick', { meal, date })}`}>
                    Quick add
                  </a>
                </div>
              </div>
            )}

            {result.state === 'error' && (
              <div class="stack-12">
                <div class="stack-4">
                  <h2 class="sheet-title">Couldn't look it up</h2>
                  <p class="muted">{result.message}</p>
                </div>
                <div class="button-pair">
                  <button type="button" class="btn-secondary" onClick={scanAgain}>
                    Scan again
                  </button>
                  <button type="button" class="btn-primary" onClick={() => lookup(result.code)}>
                    Try again
                  </button>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function FoundProduct({ food, meal, date, onAdd }: { food: Food; meal: MealId; date: string; onAdd: (f: Food) => void }) {
  const amount = food.defaultAmount ?? 100;
  const m = macrosFor(food, amount);
  return (
    <div class="stack-16">
      <div class="found-head">
        <div class="stack-3">
          <span class="found-badge">
            <Check size={16} strokeWidth={2.6} />
            Found
          </span>
          <h2 class="sheet-title">{food.name}</h2>
          <span class="muted small-text">
            {food.brand ? `${food.brand} · ` : ''}Per 100 {food.unit}: {fmtKcal(food.per100.kcal)} kcal
          </span>
        </div>
        <div class="found-kcal">
          <span class="num">{fmtKcal(m.kcal)}</span>
          <span>kcal</span>
        </div>
      </div>
      <div class="facts">
        <div>
          <span>Amount</span>
          <strong>
            {fmtGrams(amount)} {food.unit}
          </strong>
        </div>
        <div>
          <span class="t-p">Protein</span>
          <strong>{oneDecimal(m.p)} g</strong>
        </div>
        <div>
          <span class="t-c">Carbs</span>
          <strong>{oneDecimal(m.c)} g</strong>
        </div>
        <div>
          <span class="t-f">Fat</span>
          <strong>{oneDecimal(m.f)} g</strong>
        </div>
      </div>
      <div class="button-pair">
        <button
          type="button"
          class="btn-secondary"
          onClick={() => navigate(href(`/food/${encodeURIComponent(food.id)}`, { meal, date, amount }))}
        >
          Change amount
        </button>
        <button type="button" class="btn-primary" onClick={() => onAdd(food)}>
          Add to {MEAL_LABEL[meal]}
        </button>
      </div>
    </div>
  );
}
