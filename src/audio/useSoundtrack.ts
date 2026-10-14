import { useEffect } from 'react';
import { useStore } from '../store/store';
import { shotStartTime } from '../model/scene';
import { loadTrack, playFrom, stopSoundtrack } from './soundtrack';
import { useTransient } from '../viewport/shared';

/**
 * Keeps the music in step with the film: it starts with playback (and with a
 * running take), restarts when a looped shot wraps around, and stops with it.
 */
export function useSoundtrack(): void {
  useEffect(() => {
    let lastTime = -1;
    let wasRunning = false;
    const unsubscribe = useStore.subscribe((s, prev) => {
      const track = s.project.audio;
      // Decode a newly added or opened track in the background, so the waveform can draw.
      if (track?.data && track.data !== prev.project.audio?.data) {
        loadTrack(track.data).then(() => useTransient.getState().bumpAudio());
      }
      if (!track?.data) {
        if (prev.playback || prev.take) stopSoundtrack();
        return;
      }

      // Playback.
      if (s.playback && !prev.playback) {
        playFrom(track, s.playback.time);
      } else if (!s.playback && prev.playback) {
        stopSoundtrack();
      } else if (s.playback && s.playback.time < lastTime - 0.05) {
        playFrom(track, s.playback.time); // a looped shot started over
      }
      lastTime = s.playback?.time ?? -1;

      // Takes: the music plays from the shot's start once the user starts performing.
      const running = !!s.take?.running;
      if (running && !wasRunning) playFrom(track, shotStartTime(s.project, s.take!.shotIndex) + s.take!.time);
      else if (!running && wasRunning) stopSoundtrack();
      wasRunning = running;
    });
    const track = useStore.getState().project.audio;
    if (track?.data) loadTrack(track.data).then(() => useTransient.getState().bumpAudio());
    return () => {
      unsubscribe();
      stopSoundtrack();
    };
  }, []);
}
