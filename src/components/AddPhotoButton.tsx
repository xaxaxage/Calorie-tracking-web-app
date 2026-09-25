import { useRef } from 'preact/hooks';
import type { MealId } from '../lib/types';
import { handOffPhoto } from '../lib/photoHandoff';
import { href, navigate } from '../lib/router';
import { Camera } from './Icons';

/**
 * "Add a photo too": pick or take a photo and estimate it together with the
 * description typed so far, on the photo screen.
 */
export function AddPhotoButton({ meal, date, note }: { meal: MealId; date: string; note: string }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      {/* No capture attribute: on iPhone this offers both the camera and the photo library. */}
      <input
        ref={input}
        type="file"
        accept="image/*"
        class="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const el = e.target as HTMLInputElement;
          const file = el.files?.[0];
          el.value = '';
          if (!file) return;
          handOffPhoto(file);
          navigate(href('/photo', { meal, date, note: note.trim() || undefined }));
        }}
      />
      <button type="button" class="btn-secondary add-photo" onClick={() => input.current?.click()}>
        <Camera size={20} />
        Add a photo too
      </button>
    </>
  );
}
