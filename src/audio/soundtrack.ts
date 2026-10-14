import type { Soundtrack } from '../model/types';
import { detectBeats, mixDown, waveformPeaks } from '../model/audio';

/**
 * The browser side of the soundtrack: decoding, the waveform, and playing it
 * in step with the film. Decoded audio is cached per data URL.
 */

let context: AudioContext | null = null;
function audioContext(): AudioContext {
  context ??= new AudioContext();
  return context;
}

const decoded = new Map<string, Promise<AudioBuffer>>();

export function decodeTrack(data: string): Promise<AudioBuffer> {
  let p = decoded.get(data);
  if (!p) {
    p = fetch(data)
      .then((r) => r.arrayBuffer())
      .then((buf) => audioContext().decodeAudioData(buf));
    decoded.set(data, p);
  }
  return p;
}

/** Synchronous access once decoded (for drawing). */
const ready = new Map<string, AudioBuffer>();
export function decodedTrack(data: string | undefined): AudioBuffer | null {
  return (data && ready.get(data)) || null;
}

export async function loadTrack(data: string): Promise<AudioBuffer> {
  const buffer = await decodeTrack(data);
  ready.set(data, buffer);
  return buffer;
}

function channels(buffer: AudioBuffer): Float32Array[] {
  return Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
}

/** Reads a picked file into a soundtrack: data URL, beats and length. */
export async function soundtrackFromFile(file: File): Promise<Soundtrack> {
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  const buffer = await loadTrack(data);
  const beats = detectBeats(mixDown(channels(buffer)), buffer.sampleRate);
  return { file: file.name, offset: 0, beats, data, duration: buffer.duration };
}

/**
 * Peaks for a stretch of film time, `buckets` wide, from a decoded track.
 * Film time maps to track time minus the offset; outside the track is silence.
 */
const peakCache = new Map<string, Float32Array>();
const PEAKS_PER_SECOND = 200;

export function peaksFor(track: Soundtrack, buffer: AudioBuffer, from: number, to: number, buckets: number): Float32Array {
  const key = track.data!;
  let all = peakCache.get(key);
  if (!all) {
    all = waveformPeaks(mixDown(channels(buffer)), Math.ceil(buffer.duration * PEAKS_PER_SECOND));
    peakCache.set(key, all);
  }
  const out = new Float32Array(buckets);
  const span = (to - from) / buckets;
  for (let b = 0; b < buckets; b++) {
    const a = Math.floor((from + b * span - track.offset) * PEAKS_PER_SECOND);
    const z = Math.max(a + 1, Math.floor((from + (b + 1) * span - track.offset) * PEAKS_PER_SECOND));
    let peak = 0;
    for (let i = Math.max(0, a); i < Math.min(all.length, z); i++) peak = Math.max(peak, all[i]);
    out[b] = peak;
  }
  return out;
}

let playing: AudioBufferSourceNode | null = null;

/** Plays the soundtrack from a film time; stops any earlier playback. */
export async function playFrom(track: Soundtrack, filmTime: number): Promise<void> {
  stopSoundtrack();
  if (!track.data) return;
  const buffer = await loadTrack(track.data);
  const ctx = audioContext();
  if (ctx.state === 'suspended') await ctx.resume();
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  const into = filmTime - track.offset;
  if (into >= buffer.duration) return;
  // Music that starts later in the film waits; music that started earlier joins in its middle.
  if (into >= 0) source.start(0, into);
  else source.start(ctx.currentTime - into);
  playing = source;
}

export function stopSoundtrack(): void {
  if (!playing) return;
  try {
    playing.stop();
  } catch {
    // Already stopped.
  }
  playing.disconnect();
  playing = null;
}

/**
 * The soundtrack mixed down to exactly the film's length and sample rate,
 * for the video export. Null when there is no track.
 */
export async function renderForFilm(track: Soundtrack | undefined, filmSeconds: number, sampleRate = 48000): Promise<AudioBuffer | null> {
  if (!track?.data || filmSeconds <= 0) return null;
  const buffer = await loadTrack(track.data);
  const offline = new OfflineAudioContext(2, Math.ceil(filmSeconds * sampleRate), sampleRate);
  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  if (track.offset >= 0) source.start(track.offset);
  else source.start(0, -track.offset);
  return offline.startRendering();
}
