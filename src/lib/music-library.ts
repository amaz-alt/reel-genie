/**
 * Copyright-free background music library.
 *
 * IMPORTANT: tracks are self-hosted in the private `brand-assets` bucket under
 * `music/`. We used to hotlink Pixabay/Mixkit CDN URLs directly — those started
 * returning 403 (hotlink protection), which made every render fail with
 * "Error while downloading ... status code 403". Self-hosting removes that
 * whole failure class. The renderer receives a freshly signed download URL at
 * dispatch time (see dispatchJob in render.functions.ts).
 */
export type MusicTrack = {
  id: string;
  title: string;
  artist: string;
  mood: "energetic" | "upbeat" | "chill" | "cinematic" | "trendy";
  bpm?: number;
  duration_s: number;
  /** Object path inside the private `brand-assets` bucket. */
  storagePath: string;
  source: "pixabay" | "mixkit";
  license: string;
};

export const MUSIC_LIBRARY: MusicTrack[] = [
  {
    id: "summer-walk",
    title: "Summer Walk",
    artist: "olexy",
    mood: "upbeat",
    bpm: 110,
    duration_s: 152,
    storagePath: "music/upbeat.mp3",
    source: "pixabay",
    license: "Pixabay Content License",
  },
  {
    id: "lofi-study",
    title: "Lofi Study",
    artist: "fassounds",
    mood: "chill",
    bpm: 85,
    duration_s: 149,
    storagePath: "music/chill.mp3",
    source: "pixabay",
    license: "Pixabay Content License",
  },
  {
    id: "cinematic-doc",
    title: "Cinematic Documentary",
    artist: "lexin_music",
    mood: "cinematic",
    bpm: 100,
    duration_s: 156,
    storagePath: "music/cinematic.mp3",
    source: "pixabay",
    license: "Pixabay Content License",
  },
];

/** Deterministically pick a track for a reel based on mood + seed. */
export function pickTrack(mood: MusicTrack["mood"] | undefined, seed: number): MusicTrack {
  const bucket = MUSIC_LIBRARY.filter((t) => (mood ? t.mood === mood : true));
  const list = bucket.length ? bucket : MUSIC_LIBRARY;
  return list[Math.abs(seed) % list.length];
}
