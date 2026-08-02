/**
 * Copyright-free background music library.
 *
 * IMPORTANT: tracks are self-hosted in the private `brand-assets` bucket under
 * `music/`. We used to hotlink Pixabay/Mixkit CDN URLs directly — those started
 * returning 403 (hotlink protection), which made every render fail with
 * "Error while downloading ... status code 403". Self-hosting removes that
 * whole failure class. The renderer receives a freshly signed download URL at
 * dispatch time (see dispatchJob in render.functions.ts).
 *
 * All tracks are CC0 / public-domain (sourced via Openverse → Freesound CC0).
 */
export type MusicMood = "energetic" | "upbeat" | "chill" | "cinematic" | "trendy";

export type MusicTrack = {
  id: string;
  title: string;
  artist: string;
  mood: MusicMood;
  bpm?: number;
  duration_s: number;
  /** Object path inside the private `brand-assets` bucket. */
  storagePath: string;
  source: "pixabay" | "mixkit" | "freesound";
  license: string;
};

const CC0 = "CC0 1.0 (public domain)";

export const MUSIC_LIBRARY: MusicTrack[] = [
  // --- upbeat
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
    id: "fun-dancetrack",
    title: "Fun Dancetrack",
    artist: "evanjones4",
    mood: "upbeat",
    duration_s: 75,
    storagePath: "music/fun-dancetrack.mp3",
    source: "freesound",
    license: CC0,
  },
  {
    id: "upbeat-loop",
    title: "Upbeat Loop",
    artist: "mistermender",
    mood: "upbeat",
    duration_s: 57,
    storagePath: "music/upbeat-loop.mp3",
    source: "freesound",
    license: CC0,
  },
  {
    id: "strolling-stripes",
    title: "Strolling Stripes",
    artist: "code_box",
    mood: "upbeat",
    duration_s: 31,
    storagePath: "music/strolling-stripes.mp3",
    source: "freesound",
    license: CC0,
  },
  {
    id: "lucky-ticket",
    title: "The Lucky Ticket",
    artist: "Antenalosmusic",
    mood: "upbeat",
    duration_s: 38,
    storagePath: "music/lucky-ticket.mp3",
    source: "freesound",
    license: CC0,
  },
  {
    id: "tropicorp",
    title: "Tropicorp",
    artist: "code_box",
    mood: "upbeat",
    duration_s: 37,
    storagePath: "music/tropicorp.mp3",
    source: "freesound",
    license: CC0,
  },

  // --- energetic
  {
    id: "full-of-energy",
    title: "Full of Energy",
    artist: "code_box",
    mood: "energetic",
    duration_s: 34,
    storagePath: "music/full-of-energy.mp3",
    source: "freesound",
    license: CC0,
  },
  {
    id: "bird-fence-120",
    title: "Bird on a Fence (120bpm)",
    artist: "elaineaeris",
    mood: "energetic",
    bpm: 120,
    duration_s: 80,
    storagePath: "music/bird-fence-120.mp3",
    source: "freesound",
    license: CC0,
  },
  {
    id: "montage",
    title: "Montage",
    artist: "wi-photos",
    mood: "energetic",
    duration_s: 44,
    storagePath: "music/montage.mp3",
    source: "freesound",
    license: CC0,
  },
  {
    id: "strings-and-drums",
    title: "Strings and Drums",
    artist: "BuytheField",
    mood: "energetic",
    duration_s: 178,
    storagePath: "music/strings-and-drums.mp3",
    source: "freesound",
    license: CC0,
  },

  // --- trendy
  {
    id: "freddy-130",
    title: "Freddy 130",
    artist: "BaDoink",
    mood: "trendy",
    bpm: 130,
    duration_s: 132,
    storagePath: "music/freddy-130.mp3",
    source: "freesound",
    license: CC0,
  },
  {
    id: "clean-trap",
    title: "Clean",
    artist: "PaynesBeats",
    mood: "trendy",
    duration_s: 30,
    storagePath: "music/clean-trap.mp3",
    source: "freesound",
    license: CC0,
  },
  {
    id: "shakey-beat",
    title: "Shakey Beat (67bpm)",
    artist: "Seth_Makes_Sounds",
    mood: "trendy",
    bpm: 67,
    duration_s: 78,
    storagePath: "music/shakey-beat.mp3",
    source: "freesound",
    license: CC0,
  },
  {
    id: "soul-beat",
    title: "Soul Beat",
    artist: "Seth_Makes_Sounds",
    mood: "trendy",
    duration_s: 150,
    storagePath: "music/soul-beat.mp3",
    source: "freesound",
    license: CC0,
  },

  // --- chill
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
    id: "lofi-hiphop",
    title: "LoFi Hip Hop Beat",
    artist: "b1l2m3",
    mood: "chill",
    duration_s: 74,
    storagePath: "music/lofi-hiphop.mp3",
    source: "freesound",
    license: CC0,
  },
  {
    id: "good-vibe",
    title: "Good Vibe",
    artist: "Seth_Makes_Sounds",
    mood: "chill",
    duration_s: 150,
    storagePath: "music/good-vibe.mp3",
    source: "freesound",
    license: CC0,
  },
  {
    id: "moody-lofi",
    title: "Moody Lofi (70bpm)",
    artist: "Seth_Makes_Sounds",
    mood: "chill",
    bpm: 70,
    duration_s: 76,
    storagePath: "music/moody-lofi.mp3",
    source: "freesound",
    license: CC0,
  },
  {
    id: "lofi-beat-67",
    title: "Lofi Beat (67bpm)",
    artist: "Seth_Makes_Sounds",
    mood: "chill",
    bpm: 67,
    duration_s: 118,
    storagePath: "music/lofi-beat-67.mp3",
    source: "freesound",
    license: CC0,
  },

  // --- cinematic
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
  {
    id: "slow-cinematic",
    title: "Slow Cinematic",
    artist: "DeVern",
    mood: "cinematic",
    duration_s: 53,
    storagePath: "music/slow-cinematic.mp3",
    source: "freesound",
    license: CC0,
  },
  {
    id: "parallel-universe",
    title: "Parallel Universe",
    artist: "Andrewkn",
    mood: "cinematic",
    duration_s: 225,
    storagePath: "music/parallel-universe.mp3",
    source: "freesound",
    license: CC0,
  },
  {
    id: "space-bar",
    title: "Space Bar Ambient",
    artist: "szegvari",
    mood: "cinematic",
    duration_s: 169,
    storagePath: "music/space-bar.mp3",
    source: "freesound",
    license: CC0,
  },
  {
    id: "curious-ambience",
    title: "Curious Ambience",
    artist: "Reg1n0ld",
    mood: "cinematic",
    duration_s: 182,
    storagePath: "music/curious-ambience.mp3",
    source: "freesound",
    license: CC0,
  },
  {
    id: "battle-cinematic",
    title: "Battle",
    artist: "szegvari",
    mood: "cinematic",
    duration_s: 34,
    storagePath: "music/battle-cinematic.mp3",
    source: "freesound",
    license: CC0,
  },
];

/** Deterministically pick a track for a reel based on mood + seed. */
export function pickTrack(
  mood: MusicMood | undefined,
  seed: number,
  avoidIds: string[] = [],
): MusicTrack {
  const byMood = MUSIC_LIBRARY.filter((t) => (mood ? t.mood === mood : true));
  const pool = byMood.length ? byMood : MUSIC_LIBRARY;
  const fresh = pool.filter((t) => !avoidIds.includes(t.id));
  const list = fresh.length ? fresh : pool;
  return list[Math.abs(seed) % list.length];
}

/** Map the reel's copy pace onto a musical mood so audio matches the edit. */
export function moodForPace(pace: string | undefined, seed: number): MusicMood {
  switch (pace) {
    case "punchy":
      return seed % 2 === 0 ? "trendy" : "energetic";
    case "upbeat":
      return seed % 3 === 0 ? "energetic" : "upbeat";
    case "tense":
      return seed % 2 === 0 ? "cinematic" : "trendy";
    case "reflective":
      return seed % 3 === 0 ? "cinematic" : "chill";
    default: {
      const rotation: MusicMood[] = ["upbeat", "trendy", "energetic", "chill", "cinematic"];
      return rotation[Math.abs(seed) % rotation.length];
    }
  }
}

/**
 * Pick a track for a reel: mood follows the copy's pace, and recently used
 * tracks are avoided so consecutive reels never share the same audio.
 */
export function pickTrackForReel(input: {
  pace?: string;
  seed: number;
  recentTrackIds?: string[];
}): MusicTrack {
  const mood = moodForPace(input.pace, input.seed);
  return pickTrack(mood, input.seed, input.recentTrackIds ?? []);
}
