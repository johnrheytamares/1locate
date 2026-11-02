import { readonly, ref } from 'vue';
import { createTtsSpeaker } from '@/services/tts.service';
import { createVoiceGuide, type VoiceGuide } from '@/services/voice-guidance.service';

let guide: VoiceGuide | null = null;
const muted = ref(false);

/** One voice for the whole app, so a new screen cuts off the previous one and mute applies everywhere. */
export function useVoice() {
  if (!guide) {
    guide = createVoiceGuide(createTtsSpeaker());
    muted.value = guide.isMuted();
  }
  const voice = guide;
  return {
    muted: readonly(muted),
    guide: (instruction: string) => voice.guide(instruction),
    announce: (text: string) => voice.announce(text),
    reset: () => voice.reset(),
    toggleMuted() {
      voice.setMuted(!voice.isMuted());
      muted.value = voice.isMuted();
    },
  };
}
