/**
 * The soundtrack: one music or dialogue track under the shots, its
 * waveform, beat marks found by simple onset detection, and snapping shot
 * edges to those beats.
 *
 * Times: `offset` is the film time at which the track starts, so a beat at
 * track time b falls at film time offset + b.
 */

const FRAME = 1024;
const HOP = 512;
/** Beats closer than this are one beat (seconds). */
const MIN_BEAT_GAP = 0.18;
/** How far around a point the threshold looks (seconds, each side). */
const THRESHOLD_WINDOW = 0.6;
const THRESHOLD_FACTOR = 1.6;
/** An onset must be at least this much louder than the frame before (0.25 = 25 %). */
const MIN_RISE = 0.25;

/** Loudest absolute sample in each of `buckets` equal slices: the waveform to draw. */
export function waveformPeaks(samples: Float32Array, buckets: number): Float32Array {
  const out = new Float32Array(Math.max(0, buckets));
  if (!samples.length || buckets <= 0) return out;
  const size = samples.length / buckets;
  for (let b = 0; b < buckets; b++) {
    const from = Math.floor(b * size);
    const to = Math.min(samples.length, Math.max(from + 1, Math.floor((b + 1) * size)));
    let peak = 0;
    for (let i = from; i < to; i++) {
      const v = Math.abs(samples[i]);
      if (v > peak) peak = v;
    }
    out[b] = peak;
  }
  return out;
}

/**
 * Beat (onset) times in seconds from the track start. Energy per short frame,
 * then rises in energy that stand out from their surroundings: a sound
 * starting is a beat. Good enough for music videos with a clear pulse.
 */
export function detectBeats(samples: Float32Array, sampleRate: number): number[] {
  const frames = Math.floor((samples.length - FRAME) / HOP) + 1;
  if (frames < 3) return [];
  const energy = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    const from = f * HOP;
    for (let i = from; i < from + FRAME; i++) sum += samples[i] * samples[i];
    energy[f] = Math.sqrt(sum / FRAME);
  }
  // Onset strength: how much louder this frame is than the one before.
  const flux = new Float32Array(frames);
  for (let f = 1; f < frames; f++) flux[f] = Math.max(0, energy[f] - energy[f - 1]);

  const secondsPerFrame = HOP / sampleRate;
  const win = Math.max(1, Math.round(THRESHOLD_WINDOW / secondsPerFrame));
  let peakFlux = 0;
  for (const v of flux) peakFlux = Math.max(peakFlux, v);
  const floor = peakFlux * 0.08;

  const beats: number[] = [];
  let lastBeat = -Infinity;
  for (let f = 1; f < frames - 1; f++) {
    const v = flux[f];
    if (v <= floor || v < flux[f - 1] || v < flux[f + 1]) continue;
    // A beat is a clear jump in loudness, not the flicker of a steady sound.
    if (v < energy[f - 1] * MIN_RISE + 1e-4) continue;
    let sum = 0;
    let n = 0;
    for (let j = Math.max(0, f - win); j <= Math.min(frames - 1, f + win); j++) {
      sum += flux[j];
      n++;
    }
    if (v < (sum / n) * THRESHOLD_FACTOR) continue;
    // The onset is where the louder frame begins.
    const time = (f * HOP) / sampleRate;
    if (time - lastBeat < MIN_BEAT_GAP) continue;
    beats.push(Math.round(time * 1000) / 1000);
    lastBeat = time;
  }
  return beats;
}

/** The film time of the beat nearest `time`, if one is within `tolerance` seconds. */
export function snapToBeat(time: number, beats: number[] | undefined, offset: number, tolerance: number): number | null {
  if (!beats?.length) return null;
  let best: number | null = null;
  let bestD = tolerance;
  for (const b of beats) {
    const d = Math.abs(offset + b - time);
    if (d <= bestD) {
      bestD = d;
      best = offset + b;
    }
  }
  return best;
}

/** Mixes channels down to one, for analysis. */
export function mixDown(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0];
  const out = new Float32Array(channels[0].length);
  for (const ch of channels) for (let i = 0; i < out.length; i++) out[i] += ch[i] / channels.length;
  return out;
}
