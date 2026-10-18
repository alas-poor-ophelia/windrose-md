/**
 * Ring-buffer bounds and crossing-ratio math for the ladder's frame telemetry.
 *
 * The ratio is the actual measurement gate, so the arithmetic is pinned against
 * a hand-built sequence rather than a recorded one: a crossing is compared with
 * the median NON-crossing frame in its OWN level band, never a global median.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { CAPACITY, recordFrame, recordRebuild, crossingStats, snapshot, reset } from '../../../../src/geometry/renderers/ladderTelemetry';

describe('ladderTelemetry', () => {
  beforeEach(() => {
    reset();
  });

  describe('ring buffer', () => {
    it('holds nothing before the first frame', () => {
      const shot = snapshot();
      expect(shot.capacity).toBe(CAPACITY);
      expect(shot.frames).toHaveLength(0);
      expect(shot.stats.maxCrossingRatio).toBe(0);
    });

    it('keeps every frame while under capacity, oldest first', () => {
      for (let i = 0; i < 5; i++) recordFrame(i, 0, false);
      expect(snapshot().frames.map((f) => f.frameMs)).toEqual([0, 1, 2, 3, 4]);
    });

    it('caps at CAPACITY and drops the oldest frames', () => {
      const overflow = 100;
      for (let i = 0; i < CAPACITY + overflow; i++) recordFrame(i, 0, false);
      const frames = snapshot().frames;
      expect(frames).toHaveLength(CAPACITY);
      // Chronological order survives the wrap: the first `overflow` frames are gone.
      expect(frames[0].frameMs).toBe(overflow);
      expect(frames[CAPACITY - 1].frameMs).toBe(CAPACITY + overflow - 1);
    });

    it('records level and crossing per frame', () => {
      recordFrame(8, 2, false);
      recordFrame(9, 3, true);
      const frames = snapshot().frames;
      expect(frames[0]).toMatchObject({ frameMs: 8, level: 2, crossing: false, rebuildMs: null });
      expect(frames[1]).toMatchObject({ frameMs: 9, level: 3, crossing: true, rebuildMs: null });
    });
  });

  describe('rebuild attribution', () => {
    it('gives a reported bake to the frame that follows it', () => {
      recordRebuild(42);
      recordFrame(50, 1, false);
      recordFrame(5, 1, false);
      const frames = snapshot().frames;
      expect(frames[0].rebuildMs).toBe(42);
      // The bake is claimed once, not carried forward.
      expect(frames[1].rebuildMs).toBeNull();
    });

    it('lets an explicit rebuildMs override the pending bake', () => {
      recordRebuild(42);
      recordFrame(50, 1, false, null);
      expect(snapshot().frames[0].rebuildMs).toBeNull();
    });
  });

  describe('crossingStats', () => {
    it('medians the non-crossing frames per level band', () => {
      recordFrame(10, 3, false);
      recordFrame(20, 3, false);
      recordFrame(30, 3, false);
      recordFrame(4, 2, false);
      recordFrame(6, 2, false);
      const stats = crossingStats();
      // odd count -> middle; even count -> mean of the middle pair
      expect(stats.medianBandFrameMs[3]).toBe(20);
      expect(stats.medianBandFrameMs[2]).toBe(5);
      expect(stats.crossingFrames).toEqual([]);
      expect(stats.maxCrossingRatio).toBe(0);
    });

    it('rates each crossing against its own band, not the global median', () => {
      // Band 3 is the expensive band: a global median would flatter the crossing.
      recordFrame(10, 3, false);
      recordFrame(20, 3, false);
      recordFrame(30, 3, false);
      recordFrame(4, 2, false);
      recordFrame(6, 2, false);
      recordFrame(60, 3, true);
      recordFrame(5, 2, true);
      const stats = crossingStats();
      expect(stats.crossingFrames).toEqual([60, 5]);
      expect(stats.maxCrossingRatio).toBeCloseTo(3, 10);
    });

    it('ignores a crossing whose band has no non-crossing baseline', () => {
      recordFrame(10, 1, false);
      recordFrame(10, 1, false);
      recordFrame(15, 1, true);
      recordFrame(900, 7, true);
      const stats = crossingStats();
      expect(stats.crossingFrames).toEqual([15, 900]);
      expect(stats.medianBandFrameMs[7]).toBeUndefined();
      expect(stats.maxCrossingRatio).toBeCloseTo(1.5, 10);
    });

    it('ignores a zero baseline rather than dividing by it', () => {
      recordFrame(0, 4, false);
      recordFrame(12, 4, true);
      expect(crossingStats().maxCrossingRatio).toBe(0);
    });
  });

  describe('reset', () => {
    it('clears frames and any pending bake', () => {
      recordRebuild(7);
      recordFrame(11, 2, true);
      reset();
      expect(snapshot().frames).toHaveLength(0);
      recordFrame(11, 2, false);
      expect(snapshot().frames[0].rebuildMs).toBeNull();
      expect(crossingStats().maxCrossingRatio).toBe(0);
    });
  });

  describe('per-canvas filtering', () => {
    it('two panes interleaving frames are measured separately by canvasId', () => {
      recordFrame(10, 1, false, null, 1);
      recordFrame(100, 1, false, null, 2);
      recordFrame(10, 1, false, null, 1);
      recordFrame(100, 1, false, null, 2);
      recordFrame(30, 1, true, null, 1);
      expect(snapshot(1).frames.map(f => f.frameMs)).toEqual([10, 10, 30]);
      expect(snapshot(2).frames.every(f => f.canvasId === 2)).toBe(true);
      expect(crossingStats(1).maxCrossingRatio).toBe(3);
      expect(crossingStats(2).crossingFrames).toEqual([]);
      // Unfiltered keeps the mixed view, with each frame tagged.
      expect(snapshot().frames).toHaveLength(5);
    });
  });
});
