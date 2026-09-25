/**
 * A photo picked on another screen (Add food, Describe) for the photo screen
 * to estimate straight away, together with the description typed there.
 * Kept in memory only: a reload simply drops it.
 */
let pending: Blob | null = null;

export function handOffPhoto(file: Blob) {
  pending = file;
}

export function takeHandedOffPhoto(): Blob | null {
  const file = pending;
  pending = null;
  return file;
}
