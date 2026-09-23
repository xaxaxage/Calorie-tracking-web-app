/**
 * Barcode detection. Uses the browser's BarcodeDetector where it exists
 * (Chrome on Android, macOS) and otherwise a WebAssembly build of ZXing —
 * which is what runs on iPhone, since WebKit has no BarcodeDetector.
 * The WebAssembly file is bundled with the app so scanning works offline.
 */

export interface Detector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

let pending: Promise<Detector> | undefined;

async function create(): Promise<Detector> {
  const Native = (globalThis as any).BarcodeDetector;
  if (typeof Native === 'function') {
    try {
      const supported: string[] = await Native.getSupportedFormats();
      const formats = FORMATS.filter((f) => supported.includes(f));
      if (formats.length > 0) return new Native({ formats });
    } catch {
      // Fall through to the WebAssembly detector.
    }
  }
  const [{ BarcodeDetector, prepareZXingModule }, { default: wasmUrl }] = await Promise.all([
    import('barcode-detector/ponyfill'),
    import('zxing-wasm/reader/zxing_reader.wasm?url'),
  ]);
  await prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path),
    },
    fireImmediately: true,
  });
  return new BarcodeDetector({ formats: FORMATS as any });
}

export function getDetector(): Promise<Detector> {
  pending ??= create().catch((err) => {
    pending = undefined;
    throw err;
  });
  return pending;
}

/** EAN/UPC codes carry a check digit; reject misreads before looking them up. */
export function isValidProductCode(code: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false;
  const digits = code.split('').map(Number);
  const check = digits.pop()!;
  const total = digits
    .reverse()
    .reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (total % 10)) % 10 === check;
}

export type CameraProblem = 'denied' | 'missing' | 'insecure' | 'other';

export function cameraProblem(err: unknown): CameraProblem {
  const name = (err as Error)?.name;
  if (name === 'InsecureContext') return 'insecure';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'missing';
  return 'other';
}

export async function openCamera(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    const err = new Error('Camera API unavailable');
    err.name = window.isSecureContext ? 'NotFoundError' : 'InsecureContext';
    throw err;
  }
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
  });
}
