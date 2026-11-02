import { SpeechRecognition, type SpeechRecognitionPlugin } from '@capacitor-community/speech-recognition';

export type SpeechFailure = 'unavailable' | 'denied' | 'no-speech' | 'error';

export type ListenResult =
  | { ok: true; transcripts: string[] }
  | { ok: false; reason: SpeechFailure; message: string };

export const SPEECH_MESSAGES: Record<SpeechFailure, string> = {
  unavailable: 'Voice search is not available on this device. Type the destination instead.',
  denied: 'Microphone access is off. Allow it for 1Locate in Android Settings, or type the destination.',
  'no-speech': 'I did not catch that. Tap the microphone and say the destination again.',
  error: 'Voice search stopped unexpectedly. Try again or type the destination.',
};

export const SPEECH_LANGUAGE = 'en-US';

type Plugin = Pick<
  SpeechRecognitionPlugin,
  'available' | 'checkPermissions' | 'requestPermissions' | 'start' | 'stop'
>;

function failure(reason: SpeechFailure): ListenResult {
  return { ok: false, reason, message: SPEECH_MESSAGES[reason] };
}

/** Android reports "nothing heard" as an error; those are not real failures. */
function isNoSpeech(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error ?? '');
  return /no match|didn.?t understand|no speech|speech timeout|^\s*(6|7)\s*$/i.test(text);
}

/**
 * Listens once for a spoken destination using the device speech recognizer.
 * Asks for the microphone permission first. Never throws.
 */
export async function listenForDestination(plugin: Plugin = SpeechRecognition): Promise<ListenResult> {
  try {
    const { available } = await plugin.available();
    if (!available) return failure('unavailable');
  } catch {
    return failure('unavailable');
  }

  try {
    let permission = (await plugin.checkPermissions()).speechRecognition;
    if (permission !== 'granted') permission = (await plugin.requestPermissions()).speechRecognition;
    if (permission !== 'granted') return failure('denied');
  } catch {
    return failure('denied');
  }

  try {
    const { matches } = await plugin.start({
      language: SPEECH_LANGUAGE,
      maxResults: 5,
      partialResults: false,
      popup: false,
      prompt: 'Say where you want to go',
    });
    const transcripts = (matches ?? []).map((item) => item.trim()).filter(Boolean);
    return transcripts.length > 0 ? { ok: true, transcripts } : failure('no-speech');
  } catch (error) {
    return failure(isNoSpeech(error) ? 'no-speech' : 'error');
  }
}

export async function stopListening(plugin: Pick<SpeechRecognitionPlugin, 'stop'> = SpeechRecognition): Promise<void> {
  try {
    await plugin.stop();
  } catch {
    // Nothing to stop.
  }
}
