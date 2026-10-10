// Relative to the existing min(DPR, 1.5) default; no device/OS detection.
export const glassQualityScales = [1, 0.8, 2 / 3] as const;
// Only the glass texture is rate-limited, never the source video or page.
export const glassFrameIntervals = [0, 1000 / 30, 1000 / 20] as const;
export type GlassWorkSample = {
  now: number; cpuMs: number; gpuMs?: number;
  frameDelayMs?: number; wallNow?: number;
};

export function createGlassQuality() {
  let level = 0;
  let last = -Infinity;
  let lastWall = -Infinity;
  let cooldownUntil = 0;
  let warmup = 6;
  let samples: GlassWorkSample[] = [];
  const reset = () => { samples = []; last = lastWall = -Infinity; warmup = 6; };
  return {
    get scale() { return glassQualityScales[level]; },
    get level() { return level; },
    get frameInterval() { return glassFrameIntervals[level]; },
    reset,
    sample(sample: GlassWorkSample): boolean {
      const { now, cpuMs, gpuMs, frameDelayMs, wallNow } = sample;
      if (!Number.isFinite(now) || !Number.isFinite(cpuMs) || cpuMs < 0
        || (gpuMs !== undefined && (!Number.isFinite(gpuMs) || gpuMs < 0))
        || (frameDelayMs !== undefined && (!Number.isFinite(frameDelayMs) || frameDelayMs < 0))
        || (wallNow !== undefined && !Number.isFinite(wallNow))) return false;
      // Cold starts, sparse events, idle/background gaps and context recovery
      // cannot accumulate evidence. No wall-clock timer is started here.
      // Some systems stop the performance clock during sleep. A wall-clock
      // discontinuity must also discard evidence, without treating it as lag.
      const gap = now - last;
      const activeGap = gap <= 1000
        && Math.max(cpuMs, gpuMs ?? 0, frameDelayMs ?? 0) >= gap / 2;
      if ((gap > 250 && !activeGap) || now < last
        || (wallNow !== undefined && lastWall !== -Infinity
          && (wallNow < lastWall || Math.abs(wallNow - lastWall - gap) > 1000))) reset();
      last = now;
      lastWall = wallNow ?? -Infinity;
      if (warmup > 0) { warmup--; return false; }
      if (now < cooldownUntil) { samples = []; return false; }
      samples.push(sample);
      const windowMs = 8000;
      while (samples.length && now - samples[0].now > windowMs + 250) samples.shift();
      const span = now - samples[0].now;
      const recent = samples.filter(s => now - s.now <= 2000);
      const poor = (s: GlassWorkSample) => s.cpuMs > 12 || (s.gpuMs ?? 0) > 14
        || (s.frameDelayMs ?? 0) > 28;
      if (level < glassQualityScales.length - 1 && span >= 2000 && recent.length >= 4
        && recent.filter(poor).length / recent.length >= 0.8) {
        level++;
      } else if (level > 0 && span >= windowMs && samples.length >= 40) {
        const nextCost = (glassQualityScales[level - 1] / glassQualityScales[level]) ** 2;
        // Estimate the next level's workload, not just this reduced level.
        // This headroom prevents recovery from immediately causing overload.
        if (samples.filter(s => s.cpuMs * nextCost < 7
           && (s.gpuMs ?? 0) * nextCost < 8
           && (s.frameDelayMs ?? 0) < 20).length / samples.length < 0.95) return false;
        level--;
      } else return false;
      cooldownUntil = now + 6000;
      reset();
      return true;
    },
  };
}
