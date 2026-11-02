import { QueueStrategy, TextToSpeech, type TextToSpeechPlugin } from '@capacitor-community/text-to-speech';

export const VOICE_LANGUAGE = 'en-US';

export interface Speaker {
  /** Starts speaking right away, cutting off anything still being spoken. */
  speak(text: string): void;
  stop(): void;
}

type Plugin = Pick<TextToSpeechPlugin, 'speak' | 'stop'>;

/** Device text-to-speech. Failures are logged and never interrupt navigation. */
export function createTtsSpeaker(plugin: Plugin = TextToSpeech): Speaker {
  return {
    speak(text: string) {
      void plugin
        .speak({ text, lang: VOICE_LANGUAGE, rate: 1, pitch: 1, volume: 1, queueStrategy: QueueStrategy.Flush })
        .catch((error: unknown) => console.warn('[1Locate] Voice guidance unavailable', error));
    },
    stop() {
      void plugin.stop().catch(() => undefined);
    },
  };
}
