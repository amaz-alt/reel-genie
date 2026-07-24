/**
 * Copyright-free background music library (Pixabay + Mixkit).
 * All tracks are royalty-free for commercial use. `url` fields are direct-play
 * URLs so the render worker can fetch them at composition time.
 *
 * When we wire audio into the reel render, the worker picks one track from the
 * `mood` bucket that matches the brand's vibe (or `energetic` by default), then
 * trims to the reel's duration. Tracks are grouped so a brand feels consistent.
 */
export type MusicTrack = {
  id: string;
  title: string;
  artist: string;
  mood: "energetic" | "upbeat" | "chill" | "cinematic" | "trendy";
  bpm?: number;
  duration_s: number;
  url: string;
  source: "pixabay" | "mixkit";
  license: string;
};

export const MUSIC_LIBRARY: MusicTrack[] = [
  // Energetic / hype
  { id: "px-powerful", title: "Powerful Beat", artist: "penguinmusic", mood: "energetic", bpm: 140, duration_s: 132, url: "https://cdn.pixabay.com/audio/2022/10/25/audio_864e378283.mp3", source: "pixabay", license: "Pixabay Content License" },
  { id: "px-inspiring", title: "Inspiring Cinematic Ambient", artist: "lexin_music", mood: "energetic", bpm: 128, duration_s: 145, url: "https://cdn.pixabay.com/audio/2022/03/15/audio_1a6c3ea3f5.mp3", source: "pixabay", license: "Pixabay Content License" },
  { id: "px-electronic-future", title: "Electronic Future Beats", artist: "audiocoffee", mood: "energetic", bpm: 130, duration_s: 118, url: "https://cdn.pixabay.com/audio/2022/03/10/audio_c8c8a73467.mp3", source: "pixabay", license: "Pixabay Content License" },
  { id: "px-fashion-beat", title: "Fashion Beat", artist: "musicbyaden", mood: "energetic", bpm: 122, duration_s: 149, url: "https://cdn.pixabay.com/audio/2023/01/25/audio_a0d34f8d70.mp3", source: "pixabay", license: "Pixabay Content License" },

  // Upbeat / pop
  { id: "px-good-night", title: "Good Night", artist: "flembo", mood: "upbeat", bpm: 118, duration_s: 138, url: "https://cdn.pixabay.com/audio/2022/10/30/audio_347119c99a.mp3", source: "pixabay", license: "Pixabay Content License" },
  { id: "px-dreams", title: "Dreams", artist: "royalty-free", mood: "upbeat", bpm: 120, duration_s: 143, url: "https://cdn.pixabay.com/audio/2023/10/06/audio_1a97e0b5ea.mp3", source: "pixabay", license: "Pixabay Content License" },
  { id: "px-summer-walk", title: "Summer Walk", artist: "olexy", mood: "upbeat", bpm: 110, duration_s: 152, url: "https://cdn.pixabay.com/audio/2022/08/23/audio_d16737dc28.mp3", source: "pixabay", license: "Pixabay Content License" },
  { id: "mx-groovy-ambient", title: "Groovy Ambient Funk", artist: "Mixkit", mood: "upbeat", bpm: 108, duration_s: 130, url: "https://assets.mixkit.co/music/preview/mixkit-groovy-ambient-funk-641.mp3", source: "mixkit", license: "Mixkit Free Music License" },

  // Chill / vlog
  { id: "px-lofi-study", title: "Lofi Study", artist: "fassounds", mood: "chill", bpm: 85, duration_s: 149, url: "https://cdn.pixabay.com/audio/2022/05/27/audio_1808fbf07a.mp3", source: "pixabay", license: "Pixabay Content License" },
  { id: "px-morning", title: "Morning Garden", artist: "olexy", mood: "chill", bpm: 90, duration_s: 137, url: "https://cdn.pixabay.com/audio/2022/03/09/audio_be0ac25ea9.mp3", source: "pixabay", license: "Pixabay Content License" },
  { id: "px-relaxed-vlog", title: "Relaxed Vlog", artist: "audionautix", mood: "chill", bpm: 95, duration_s: 141, url: "https://cdn.pixabay.com/audio/2023/06/12/audio_c3b3aa4e35.mp3", source: "pixabay", license: "Pixabay Content License" },
  { id: "mx-serene-view", title: "Serene View", artist: "Mixkit", mood: "chill", bpm: 80, duration_s: 148, url: "https://assets.mixkit.co/music/preview/mixkit-serene-view-443.mp3", source: "mixkit", license: "Mixkit Free Music License" },

  // Cinematic
  { id: "px-cinematic-doc", title: "Cinematic Documentary", artist: "lexin_music", mood: "cinematic", bpm: 100, duration_s: 156, url: "https://cdn.pixabay.com/audio/2022/08/04/audio_2dde668d05.mp3", source: "pixabay", license: "Pixabay Content License" },
  { id: "px-epic-inspiration", title: "Epic Inspiration", artist: "audiocoffee", mood: "cinematic", bpm: 128, duration_s: 143, url: "https://cdn.pixabay.com/audio/2022/03/23/audio_c8f60ad8c9.mp3", source: "pixabay", license: "Pixabay Content License" },
  { id: "mx-hip-hop-cinematic", title: "Hip-Hop Cinematic", artist: "Mixkit", mood: "cinematic", bpm: 92, duration_s: 137, url: "https://assets.mixkit.co/music/preview/mixkit-hip-hop-02-621.mp3", source: "mixkit", license: "Mixkit Free Music License" },

  // Trendy / TikTok-style
  { id: "px-tell-me", title: "Tell Me The Truth", artist: "aylex", mood: "trendy", bpm: 105, duration_s: 129, url: "https://cdn.pixabay.com/audio/2022/12/12/audio_5c86ff8a0a.mp3", source: "pixabay", license: "Pixabay Content License" },
  { id: "px-once-again", title: "Once Again", artist: "hot_dope", mood: "trendy", bpm: 115, duration_s: 149, url: "https://cdn.pixabay.com/audio/2023/06/25/audio_82d5e2ec5f.mp3", source: "pixabay", license: "Pixabay Content License" },
  { id: "px-stylish", title: "Stylish Deep Electronic", artist: "aylex", mood: "trendy", bpm: 120, duration_s: 154, url: "https://cdn.pixabay.com/audio/2023/03/29/audio_7ae3e2e8f9.mp3", source: "pixabay", license: "Pixabay Content License" },
  { id: "mx-driving-ambition", title: "Driving Ambition", artist: "Mixkit", mood: "trendy", bpm: 118, duration_s: 132, url: "https://assets.mixkit.co/music/preview/mixkit-driving-ambition-32.mp3", source: "mixkit", license: "Mixkit Free Music License" },
  { id: "mx-tech-house", title: "Tech House Vibes", artist: "Mixkit", mood: "trendy", bpm: 124, duration_s: 145, url: "https://assets.mixkit.co/music/preview/mixkit-tech-house-vibes-130.mp3", source: "mixkit", license: "Mixkit Free Music License" },
];

/** Deterministically pick a track for a reel based on mood + seed. */
export function pickTrack(mood: MusicTrack["mood"] | undefined, seed: number): MusicTrack {
  const bucket = MUSIC_LIBRARY.filter((t) => (mood ? t.mood === mood : true));
  const list = bucket.length ? bucket : MUSIC_LIBRARY;
  return list[Math.abs(seed) % list.length];
}
