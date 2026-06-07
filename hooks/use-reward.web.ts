import { useCallback } from 'react';

import { useSettings } from '@/hooks/use-habits';

/**
 * Web variant of the reward. No haptics on web; plays a short synthesized
 * chime via the Web Audio API when sound is enabled. The visual burst is
 * driven separately by the caller via <RewardBurst trigger={...} />.
 */
export function useReward() {
  const { soundEnabled } = useSettings();

  return useCallback(() => {
    if (!soundEnabled) return;
    if (typeof window === 'undefined') return;
    const AudioCtx =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    try {
      const ctx = new AudioCtx();
      const now = ctx.currentTime;
      // Two quick rising notes mirroring the native chime.
      [
        { freq: 1046.5, at: 0 },
        { freq: 1568.0, at: 0.12 },
      ].forEach(({ freq, at }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = freq;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.001, now + at);
        gain.gain.exponentialRampToValueAtTime(0.3, now + at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + at + 0.4);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + at);
        osc.stop(now + at + 0.45);
      });
      setTimeout(() => ctx.close(), 800);
    } catch {
      // Best-effort.
    }
  }, [soundEnabled]);
}
