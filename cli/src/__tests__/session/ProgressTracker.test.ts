/**
 * Tests for ProgressTracker.
 *
 * Tests progress tracking functionality for interactive improvement sessions.
 */

import { ProgressTracker } from '../../session/ProgressTracker.js';

describe('ProgressTracker', () => {
  describe('initialization', () => {
    it('should initialize with correct total items', () => {
      const tracker = new ProgressTracker(10);
      const progress = tracker.getProgress();

      expect(progress.totalItems).toBe(10);
      expect(progress.completedItems).toBe(0);
      expect(progress.acceptedItems).toBe(0);
      expect(progress.skippedItems).toBe(0);
      expect(progress.errorItems).toBe(0);
      expect(progress.quitAt).toBeNull();
    });

    it('should handle zero items', () => {
      const tracker = new ProgressTracker(0);
      const progress = tracker.getProgress();

      expect(progress.totalItems).toBe(0);
      expect(tracker.isComplete()).toBe(true);
    });
  });

  describe('recordAccepted', () => {
    it('should increment accepted and completed counts', () => {
      const tracker = new ProgressTracker(5);

      tracker.recordAccepted();

      const progress = tracker.getProgress();
      expect(progress.acceptedItems).toBe(1);
      expect(progress.completedItems).toBe(1);
      expect(progress.skippedItems).toBe(0);
    });

    it('should handle multiple accepts', () => {
      const tracker = new ProgressTracker(5);

      tracker.recordAccepted();
      tracker.recordAccepted();
      tracker.recordAccepted();

      const progress = tracker.getProgress();
      expect(progress.acceptedItems).toBe(3);
      expect(progress.completedItems).toBe(3);
    });
  });

  describe('recordSkipped', () => {
    it('should increment skipped and completed counts', () => {
      const tracker = new ProgressTracker(5);

      tracker.recordSkipped();

      const progress = tracker.getProgress();
      expect(progress.skippedItems).toBe(1);
      expect(progress.completedItems).toBe(1);
      expect(progress.acceptedItems).toBe(0);
    });

    it('should handle multiple skips', () => {
      const tracker = new ProgressTracker(5);

      tracker.recordSkipped();
      tracker.recordSkipped();

      const progress = tracker.getProgress();
      expect(progress.skippedItems).toBe(2);
      expect(progress.completedItems).toBe(2);
    });
  });

  describe('recordError', () => {
    it('should increment error and completed counts', () => {
      const tracker = new ProgressTracker(5);

      tracker.recordError();

      const progress = tracker.getProgress();
      expect(progress.errorItems).toBe(1);
      expect(progress.completedItems).toBe(1);
      expect(progress.acceptedItems).toBe(0);
      expect(progress.skippedItems).toBe(0);
    });

    it('should handle multiple errors', () => {
      const tracker = new ProgressTracker(5);

      tracker.recordError();
      tracker.recordError();
      tracker.recordError();

      const progress = tracker.getProgress();
      expect(progress.errorItems).toBe(3);
      expect(progress.completedItems).toBe(3);
    });
  });

  describe('recordQuit', () => {
    it('should record quit index', () => {
      const tracker = new ProgressTracker(10);

      tracker.recordQuit(3);

      const progress = tracker.getProgress();
      expect(progress.quitAt).toBe(3);
    });

    it('should not affect completed counts', () => {
      const tracker = new ProgressTracker(10);
      tracker.recordAccepted();
      tracker.recordSkipped();

      tracker.recordQuit(2);

      const progress = tracker.getProgress();
      expect(progress.completedItems).toBe(2);
      expect(progress.quitAt).toBe(2);
    });
  });

  describe('mixed operations', () => {
    it('should handle combination of accepts and skips', () => {
      const tracker = new ProgressTracker(10);

      tracker.recordAccepted();
      tracker.recordSkipped();
      tracker.recordAccepted();
      tracker.recordAccepted();
      tracker.recordSkipped();

      const progress = tracker.getProgress();
      expect(progress.completedItems).toBe(5);
      expect(progress.acceptedItems).toBe(3);
      expect(progress.skippedItems).toBe(2);
    });

    it('should handle combination of accepts, skips, and errors', () => {
      const tracker = new ProgressTracker(10);

      tracker.recordAccepted();
      tracker.recordError();
      tracker.recordSkipped();
      tracker.recordAccepted();
      tracker.recordError();

      const progress = tracker.getProgress();
      expect(progress.completedItems).toBe(5);
      expect(progress.acceptedItems).toBe(2);
      expect(progress.skippedItems).toBe(1);
      expect(progress.errorItems).toBe(2);
    });
  });

  describe('getProgressString', () => {
    it('should return formatted progress string with no items', () => {
      const tracker = new ProgressTracker(10);

      const progressString = tracker.getProgressString();

      expect(progressString).toBe('0/10 items (0 accepted, 0 skipped)');
    });

    it('should return formatted progress string with mixed items', () => {
      const tracker = new ProgressTracker(10);
      tracker.recordAccepted();
      tracker.recordAccepted();
      tracker.recordSkipped();

      const progressString = tracker.getProgressString();

      expect(progressString).toBe('3/10 items (2 accepted, 1 skipped)');
    });

    it('should return formatted progress string when complete', () => {
      const tracker = new ProgressTracker(3);
      tracker.recordAccepted();
      tracker.recordAccepted();
      tracker.recordSkipped();

      const progressString = tracker.getProgressString();

      expect(progressString).toBe('3/3 items (2 accepted, 1 skipped)');
    });

    it('should include errors in progress string when present', () => {
      const tracker = new ProgressTracker(10);
      tracker.recordAccepted();
      tracker.recordError();
      tracker.recordSkipped();

      const progressString = tracker.getProgressString();

      expect(progressString).toBe('3/10 items (1 accepted, 1 skipped, 1 error)');
    });

    it('should not include errors in progress string when zero', () => {
      const tracker = new ProgressTracker(10);
      tracker.recordAccepted();
      tracker.recordSkipped();

      const progressString = tracker.getProgressString();

      expect(progressString).toBe('2/10 items (1 accepted, 1 skipped)');
    });

    it('should handle multiple errors in progress string', () => {
      const tracker = new ProgressTracker(10);
      tracker.recordAccepted();
      tracker.recordError();
      tracker.recordError();
      tracker.recordError();

      const progressString = tracker.getProgressString();

      expect(progressString).toBe('4/10 items (1 accepted, 0 skipped, 3 errors)');
    });
  });

  describe('isComplete', () => {
    it('should return false when no items completed', () => {
      const tracker = new ProgressTracker(5);

      expect(tracker.isComplete()).toBe(false);
    });

    it('should return false when partially complete', () => {
      const tracker = new ProgressTracker(5);
      tracker.recordAccepted();
      tracker.recordSkipped();

      expect(tracker.isComplete()).toBe(false);
    });

    it('should return true when all items completed', () => {
      const tracker = new ProgressTracker(3);
      tracker.recordAccepted();
      tracker.recordAccepted();
      tracker.recordSkipped();

      expect(tracker.isComplete()).toBe(true);
    });

    it('should return true when user quits', () => {
      const tracker = new ProgressTracker(10);
      tracker.recordAccepted();
      tracker.recordQuit(1);

      expect(tracker.isComplete()).toBe(true);
    });

    it('should return true for zero items', () => {
      const tracker = new ProgressTracker(0);

      expect(tracker.isComplete()).toBe(true);
    });
  });
});
