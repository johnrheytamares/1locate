import { CALIBRATION_INSTRUCTION, PAUSED_INSTRUCTION } from '@/services/navigation.service';
import type { Speaker } from '@/services/tts.service';

/** Facing corrections must stay the same this long before they are spoken, so compass jitter stays quiet. */
export const VOICE_SETTLE_MS = 1500;

export const VOICE_MUTED_KEY = '1locate-voice-muted';

const FACING_PATTERN = /to face the path$/;

/** Screen phrases that refer to the drawing get a spoken equivalent. Everything else is read as shown. */
const SPOKEN: Record<string, string> = {
  'Follow the blue path': 'Go straight ahead.',
  [CALIBRATION_INSTRUCTION]: 'Point your phone along the path, then tap Set Forward.',
  [PAUSED_INSTRUCTION]:
    'Guidance paused. 1Locate cannot tell where you are inside the building. '
    + 'Choose resume, restart from the entrance, or another destination.',
};

export function spokenInstruction(instruction: string): string {
  const text = SPOKEN[instruction] ?? instruction;
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

export function isFacingCorrection(instruction: string): boolean {
  return FACING_PATTERN.test(instruction);
}

interface Storage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface Timers {
  set(callback: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const browserTimers: Timers = {
  set: (callback, ms) => setTimeout(callback, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export interface VoiceGuide {
  /** Speaks a guidance instruction when it differs from the last one spoken. */
  guide(instruction: string): void;
  /** Speaks a one-off message, such as a voice search answer or the entrance prompt. */
  announce(text: string): void;
  isMuted(): boolean;
  setMuted(muted: boolean): void;
  /** Stops speaking and forgets the last instruction, for example when the screen closes. */
  reset(): void;
}

export function createVoiceGuide(
  speaker: Speaker,
  options: { storage?: Storage | null; timers?: Timers; settleMs?: number } = {},
): VoiceGuide {
  const storage = options.storage === undefined ? safeStorage() : options.storage;
  const timers = options.timers ?? browserTimers;
  const settleMs = options.settleMs ?? VOICE_SETTLE_MS;

  let muted = false;
  try {
    muted = storage?.getItem(VOICE_MUTED_KEY) === 'true';
  } catch {
    muted = false;
  }
  let lastSpoken: string | null = null;
  let pending: { text: string; handle: unknown } | null = null;

  function clearPending() {
    if (pending) timers.clear(pending.handle);
    pending = null;
  }

  function say(text: string) {
    lastSpoken = text;
    if (!muted) speaker.speak(text);
  }

  return {
    guide(instruction) {
      const text = spokenInstruction(instruction);
      if (pending?.text === text) return;
      clearPending();
      if (text === lastSpoken) return;
      if (isFacingCorrection(instruction)) {
        const handle = timers.set(() => {
          pending = null;
          say(text);
        }, settleMs);
        pending = { text, handle };
        return;
      }
      say(text);
    },
    announce(text) {
      clearPending();
      say(text);
    },
    isMuted: () => muted,
    setMuted(value) {
      muted = value;
      try {
        storage?.setItem(VOICE_MUTED_KEY, String(value));
      } catch {
        // Preference is kept for this session only.
      }
      if (value) {
        clearPending();
        speaker.stop();
      }
    },
    reset() {
      clearPending();
      lastSpoken = null;
      speaker.stop();
    },
  };
}
