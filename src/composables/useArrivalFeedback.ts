import { ref } from 'vue';
import { createSessionId } from '@/services/navigation-feedback.service';

/** One feedback offer per completed navigation session. */
export function useArrivalFeedback() {
  const showFeedback = ref(false);
  const feedbackOffered = ref(false);
  const sessionId = ref(createSessionId());
  const notice = ref('');

  function beginSession() {
    sessionId.value = createSessionId();
    feedbackOffered.value = false;
    showFeedback.value = false;
    notice.value = '';
  }

  function offerAfterArrival() {
    if (feedbackOffered.value) return;
    feedbackOffered.value = true;
    showFeedback.value = true;
  }

  function closeFeedback(message?: string) {
    showFeedback.value = false;
    if (message) notice.value = message;
  }

  return {
    showFeedback,
    feedbackOffered,
    sessionId,
    notice,
    beginSession,
    offerAfterArrival,
    closeFeedback,
  };
}
