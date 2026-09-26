import { useEffect, useState } from 'preact/hooks';
import type { MealId } from '../lib/types';
import { MEAL_LABEL } from '../lib/meals';
import { longDate } from '../lib/dates';
import { deletePhoto, photosFor, saveToPhotos, usePhotos, usePhotoUrls, type MealPhoto } from '../lib/photos';
import { showToast } from '../lib/toast';
import { Close, Download, Trash } from './Icons';

const clock = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export async function savePhotosToPhone(photos: MealPhoto[]) {
  try {
    const how = await saveToPhotos(photos);
    if (how === 'downloaded') showToast(photos.length === 1 ? 'Photo downloaded' : `${photos.length} photos downloaded`);
  } catch {
    showToast("Couldn't save the photo.");
  }
}

/** A photo full screen, with Save to Photos and Delete. */
export function PhotoViewer({ photo, url, onClose }: { photo: MealPhoto; url: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div class="photo-viewer" role="dialog" aria-modal="true" aria-label="Meal photo">
      <div class="photo-viewer-top">
        <span class="photo-viewer-title">
          {MEAL_LABEL[photo.meal]} · {longDate(photo.date)} · {clock(photo.at)}
        </span>
        <button type="button" class="icon-btn" aria-label="Close" onClick={onClose}>
          <Close />
        </button>
      </div>
      <img class="photo-viewer-img" src={url} alt={`${MEAL_LABEL[photo.meal]} photo`} />
      {photo.note && <p class="photo-viewer-note">“{photo.note}”</p>}
      <div class="photo-viewer-actions">
        <button
          type="button"
          class="btn-secondary"
          onClick={async () => {
            if (!confirm('Delete this photo from this phone?')) return;
            await deletePhoto(photo.id);
            onClose();
            showToast('Photo deleted');
          }}
        >
          <Trash size={18} /> Delete
        </button>
        <button type="button" class="btn-primary" onClick={() => savePhotosToPhone([photo])}>
          <Download size={18} /> Save to Photos
        </button>
      </div>
    </div>
  );
}

/** Thumbnails of the photos taken for a meal; tap one to see it. */
export function MealPhotoStrip({ date, meal }: { date: string; meal: MealId }) {
  const photos = usePhotos(() => photosFor(date, meal), [date, meal]);
  const urls = usePhotoUrls(photos);
  const [open, setOpen] = useState<string | null>(null);
  if (!photos || photos.length === 0) return null;
  const shown = photos.find((p) => p.id === open);
  return (
    <section class="stack-8" aria-label="Photos">
      <div class="photo-strip">
        {photos.map((p) => (
          <button type="button" class="photo-thumb" aria-label={`Photo from ${clock(p.at)}`} onClick={() => setOpen(p.id)}>
            {urls.get(p.id) && <img src={urls.get(p.id)} alt="" />}
          </button>
        ))}
      </div>
      {shown && urls.get(shown.id) && <PhotoViewer photo={shown} url={urls.get(shown.id)!} onClose={() => setOpen(null)} />}
    </section>
  );
}
