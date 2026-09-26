import { describe, expect, it } from 'vitest';
import { dataUrlToBlob, fmtBytes, photoFileName, totalBytes, type MealPhoto } from '../src/lib/photos';
import { emptyData } from '../src/lib/store';

describe('meal photos', () => {
  it('turns a data URL back into the JPEG', async () => {
    const blob = dataUrlToBlob('data:image/jpeg;base64,' + btoa('\xff\xd8\xff\xe0jpeg'));
    expect(blob.type).toBe('image/jpeg');
    expect(blob.size).toBe(8);
    expect(new Uint8Array(await blob.arrayBuffer()).slice(0, 3)).toEqual(new Uint8Array([0xff, 0xd8, 0xff]));
  });

  it('names files by day, meal and time', () => {
    const at = new Date(2026, 8, 26, 9, 5).getTime();
    expect(photoFileName({ at, date: '2026-09-26', meal: 'breakfast' })).toBe('meal-2026-09-26-breakfast-0905.jpg');
  });

  it('adds up and shows sizes', () => {
    const p = (size: number) => ({ blob: new Blob([new Uint8Array(size)]) }) as MealPhoto;
    expect(totalBytes([p(1000), p(3000)])).toBe(4000);
    expect(fmtBytes(300)).toBe('1 KB');
    expect(fmtBytes(250 * 1024)).toBe('250 KB');
    expect(fmtBytes(12.34 * 1024 * 1024)).toBe('12.3 MB');
  });

  it('keeps photos by default', () => {
    expect(emptyData().settings.savePhotos).toBe(true);
  });
});
