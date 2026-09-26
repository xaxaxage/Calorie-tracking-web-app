import { useState } from 'preact/hooks';
import { useData } from '../lib/store';
import { MEAL_LABEL } from '../lib/meals';
import { longDate } from '../lib/dates';
import { deleteAllPhotos, fmtBytes, listPhotos, totalBytes, usePhotos, usePhotoUrls, type MealPhoto } from '../lib/photos';
import { goBack } from '../lib/router';
import { showToast } from '../lib/toast';
import { PhotoViewer, savePhotosToPhone } from '../components/MealPhotos';
import { ChevronLeft } from '../components/Icons';

/** Every meal photo kept on this phone, by day. */
export function MealPhotos() {
  const { settings } = useData();
  const photos = usePhotos(listPhotos, []);
  const urls = usePhotoUrls(photos);
  const [open, setOpen] = useState<string | null>(null);

  const days: { date: string; photos: MealPhoto[] }[] = [];
  for (const p of photos ?? []) {
    const day = days.find((d) => d.date === p.date);
    if (day) day.photos.push(p);
    else days.push({ date: p.date, photos: [p] });
  }
  days.sort((a, b) => (a.date < b.date ? 1 : -1));
  const shown = photos?.find((p) => p.id === open);

  return (
    <main class="screen gap-16">
      <header class="topbar">
        <button type="button" class="icon-btn ink" aria-label="Back" onClick={() => goBack('/settings')}>
          <ChevronLeft />
        </button>
        <h1>Meal photos</h1>
        <span class="spacer-44" />
      </header>

      {photos && photos.length > 0 && (
        <p class="muted small-text pad-4">
          {photos.length} {photos.length === 1 ? 'photo' : 'photos'} · {fmtBytes(totalBytes(photos))}, kept on this phone only.
          Tap one to save it to your Photos app.
        </p>
      )}

      {photos && photos.length === 0 && (
        <div class="card stack-8">
          <p class="body-text">No photos yet. Photos you take for estimates show up here.</p>
          {!settings.savePhotos && (
            <p class="field-hint">
              Keeping photos is off — turn on <strong>Keep meal photos</strong> in <a href="#/settings">Settings → Logging</a>.
            </p>
          )}
        </div>
      )}

      {days.map((day) => (
        <section class="stack-8" aria-label={longDate(day.date)}>
          <div class="photo-day-head">
            <h2 class="list-section-label">{longDate(day.date)}</h2>
            <button type="button" class="link-btn" onClick={() => savePhotosToPhone(day.photos)}>
              Save {day.photos.length === 1 ? 'it' : `all ${day.photos.length}`} to Photos
            </button>
          </div>
          <div class="photo-grid">
            {day.photos.map((p) => (
              <button type="button" class="photo-thumb" aria-label={`${MEAL_LABEL[p.meal]} photo`} onClick={() => setOpen(p.id)}>
                {urls.get(p.id) && <img src={urls.get(p.id)} alt="" />}
                <span class="photo-thumb-label">{MEAL_LABEL[p.meal]}</span>
              </button>
            ))}
          </div>
        </section>
      ))}

      {photos && photos.length > 0 && (
        <button
          type="button"
          class="link-btn left danger"
          onClick={async () => {
            if (!confirm(`Delete all ${photos.length} meal photos from this phone? Your logged meals stay.`)) return;
            await deleteAllPhotos();
            showToast('Meal photos deleted');
          }}
        >
          Delete all photos
        </button>
      )}

      {shown && urls.get(shown.id) && <PhotoViewer photo={shown} url={urls.get(shown.id)!} onClose={() => setOpen(null)} />}
    </main>
  );
}
