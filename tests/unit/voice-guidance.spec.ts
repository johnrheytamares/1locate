import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { CALIBRATION_INSTRUCTION, PAUSED_INSTRUCTION } from '@/services/navigation.service';
import {
  VOICE_MUTED_KEY,
  VOICE_SETTLE_MS,
  createVoiceGuide,
  spokenInstruction,
} from '@/services/voice-guidance.service';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => { data[key] = value; },
  };
}

function setup(initial: Record<string, string> = {}) {
  const speaker = { speak: vi.fn(), stop: vi.fn() };
  const storage = memoryStorage(initial);
  const guide = createVoiceGuide(speaker, { storage });
  return { speaker, storage, guide };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('spokenInstruction', () => {
  test('describes the drawn path in words', () => {
    expect(spokenInstruction('Follow the blue path')).toBe('Go straight ahead.');
    expect(spokenInstruction(CALIBRATION_INSTRUCTION)).toBe('Point your phone along the path, then tap Set Forward.');
    expect(spokenInstruction(PAUSED_INSTRUCTION)).toContain('cannot tell where you are inside the building');
  });

  test('reads turn and arrival instructions as shown, ending as a sentence', () => {
    expect(spokenInstruction('Turn right ahead')).toBe('Turn right ahead.');
    expect(spokenInstruction('Continue straight')).toBe('Continue straight.');
    expect(spokenInstruction('You have reached Library.')).toBe('You have reached Library.');
  });
});

describe('createVoiceGuide', () => {
  test('speaks each new instruction once', () => {
    const { speaker, guide } = setup();
    guide.guide('Continue straight');
    guide.guide('Continue straight');
    guide.guide('Turn right ahead');
    expect(speaker.speak.mock.calls.map((call) => call[0])).toEqual(['Continue straight.', 'Turn right ahead.']);
  });

  test('waits for facing corrections to settle so compass jitter stays quiet', () => {
    const { speaker, guide } = setup();
    guide.guide('Continue straight');
    guide.guide('Turn left to face the path');
    vi.advanceTimersByTime(VOICE_SETTLE_MS - 100);
    guide.guide('Continue straight');
    vi.advanceTimersByTime(VOICE_SETTLE_MS);
    expect(speaker.speak).toHaveBeenCalledTimes(1);

    guide.guide('Turn left to face the path');
    vi.advanceTimersByTime(VOICE_SETTLE_MS - 100);
    guide.guide('Turn left to face the path');
    vi.advanceTimersByTime(100);
    expect(speaker.speak).toHaveBeenLastCalledWith('Turn left to face the path.');
    expect(speaker.speak).toHaveBeenCalledTimes(2);
  });

  test('turn and arrival instructions are spoken right away', () => {
    const { speaker, guide } = setup();
    guide.guide('Turn right to face the path');
    guide.guide('You have reached Library.');
    expect(speaker.speak).toHaveBeenCalledWith('You have reached Library.');
    vi.advanceTimersByTime(VOICE_SETTLE_MS * 2);
    expect(speaker.speak).toHaveBeenCalledTimes(1);
  });

  test('announce always speaks and cancels a pending correction', () => {
    const { speaker, guide } = setup();
    guide.guide('Turn left to face the path');
    guide.announce('Found Library.');
    guide.announce('Found Library.');
    vi.advanceTimersByTime(VOICE_SETTLE_MS * 2);
    expect(speaker.speak.mock.calls.map((call) => call[0])).toEqual(['Found Library.', 'Found Library.']);
  });

  test('mute stops speech, stays silent, and is remembered', () => {
    const { speaker, storage, guide } = setup();
    guide.guide('Turn left to face the path');
    guide.setMuted(true);
    expect(speaker.stop).toHaveBeenCalled();
    expect(storage.data[VOICE_MUTED_KEY]).toBe('true');

    guide.guide('Turn right ahead');
    guide.announce('Hello');
    vi.advanceTimersByTime(VOICE_SETTLE_MS * 2);
    expect(speaker.speak).not.toHaveBeenCalled();

    const again = createVoiceGuide(speaker, { storage });
    expect(again.isMuted()).toBe(true);
  });

  test('unmuting speaks the next new instruction, without replaying old ones', () => {
    const { speaker, guide } = setup({ [VOICE_MUTED_KEY]: 'true' });
    expect(guide.isMuted()).toBe(true);
    guide.guide('Turn right ahead');
    guide.setMuted(false);
    guide.guide('Turn right ahead');
    expect(speaker.speak).not.toHaveBeenCalled();
    guide.guide('Continue straight');
    expect(speaker.speak).toHaveBeenCalledWith('Continue straight.');
  });

  test('reset stops speech so the same instruction is spoken again next time', () => {
    const { speaker, guide } = setup();
    guide.guide('Continue straight');
    guide.reset();
    expect(speaker.stop).toHaveBeenCalled();
    guide.guide('Continue straight');
    expect(speaker.speak).toHaveBeenCalledTimes(2);
  });

  test('works without storage', () => {
    const speaker = { speak: vi.fn(), stop: vi.fn() };
    const broken = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
    };
    const guide = createVoiceGuide(speaker, { storage: broken });
    expect(guide.isMuted()).toBe(false);
    guide.setMuted(true);
    expect(guide.isMuted()).toBe(true);
  });
});
