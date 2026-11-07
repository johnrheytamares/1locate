<template>
  <div v-if="isOpen" class="feedback-scrim" role="dialog" aria-modal="true" aria-labelledby="arrival-feedback-title">
    <form class="feedback-card" data-test="arrival-feedback" @submit.prevent="onSubmit">
      <h2 id="arrival-feedback-title">You've Arrived! 🎉</h2>
      <p class="lead">You've successfully reached your destination. How was your navigation experience?</p>

      <fieldset class="stars" :disabled="busy">
        <legend>Star rating</legend>
        <div class="star-row" role="radiogroup" aria-label="Navigation rating">
          <button
            v-for="value in FEEDBACK_RATINGS"
            :key="value"
            type="button"
            class="star"
            :class="{ selected: rating !== null && rating >= value }"
            role="radio"
            :aria-checked="rating === value"
            :aria-label="`${value} star${value === 1 ? '' : 's'} – ${FEEDBACK_RATING_LABELS[value]}`"
            :data-test="`rating-${value}`"
            @click="rating = value"
          >
            ★
          </button>
        </div>
        <p class="rating-label" data-test="rating-label">
          {{ rating ? `${rating} Star${rating === 1 ? '' : 's'} – ${FEEDBACK_RATING_LABELS[rating]}` : 'Select a rating to continue' }}
        </p>
      </fieldset>

      <label class="comment">
        Optional feedback
        <textarea
          v-model="comment"
          rows="4"
          maxlength="2000"
          :disabled="busy"
          placeholder="Did you experience any location inaccuracies or navigation issues? Share your suggestions to help us improve 1Locate."
          data-test="feedback-comment"
        />
      </label>

      <p v-if="error" class="error" role="alert" data-test="feedback-error">{{ error }}</p>

      <div class="actions">
        <button class="submit" type="submit" :disabled="busy || rating === null" data-test="submit-feedback">
          {{ busy ? 'Sending...' : 'Submit Feedback' }}
        </button>
        <button class="later" type="button" :disabled="busy" data-test="maybe-later" @click="onLater">
          Maybe Later
        </button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { FEEDBACK_RATING_LABELS, FEEDBACK_RATINGS, type FeedbackRating } from '@/models/feedback';
import {
  FEEDBACK_ERROR_MESSAGE,
  messageForSubmitStatus,
  submitNavigationFeedback,
} from '@/services/navigation-feedback.service';

const props = defineProps<{
  isOpen: boolean;
  sessionId: string;
  destinationId: string | null;
  destinationName: string;
}>();

const emit = defineEmits<{
  close: [message?: string];
}>();

const rating = ref<FeedbackRating | null>(null);
const comment = ref('');
const busy = ref(false);
const error = ref('');

watch(() => props.isOpen, (open) => {
  if (!open) return;
  rating.value = null;
  comment.value = '';
  busy.value = false;
  error.value = '';
});

function onLater() {
  if (busy.value) return;
  emit('close');
}

async function onSubmit() {
  if (rating.value === null || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    const status = await submitNavigationFeedback({
      sessionId: props.sessionId,
      destinationId: props.destinationId,
      destinationName: props.destinationName,
      rating: rating.value,
      comment: comment.value,
    });
    emit('close', messageForSubmitStatus(status));
  } catch {
    error.value = FEEDBACK_ERROR_MESSAGE;
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.feedback-scrim {
  position: fixed;
  inset: 0;
  z-index: 40000;
  display: grid;
  place-items: end center;
  padding: max(12px, env(safe-area-inset-top)) 12px max(16px, env(safe-area-inset-bottom));
  background: rgba(12, 45, 82, 0.55);
}

.feedback-card {
  width: min(420px, 100%);
  max-height: min(92vh, 720px);
  overflow: auto;
  padding: 22px 20px 18px;
  border-radius: 22px 22px 18px 18px;
  background: #ffffff;
  color: #12263f;
  box-shadow: 0 16px 48px #001c4050;
}

h2 {
  margin: 0 0 8px;
  text-align: center;
  font-size: 22px;
  font-weight: 800;
  line-height: 1.3;
  color: #0c2d52;
}

.lead {
  margin: 0 0 16px;
  text-align: center;
  color: #526b82;
  font-size: 15px;
  line-height: 1.5;
}

.stars {
  margin: 0 0 14px;
  padding: 0;
  border: 0;
}

.stars legend {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}

.star-row {
  display: flex;
  justify-content: center;
  gap: 6px;
}

.star {
  width: 48px;
  height: 48px;
  min-height: 48px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #d7e2ee;
  font-size: 34px;
  line-height: 1;
  cursor: pointer;
}

.star.selected { color: #f59e0b; }

.rating-label {
  margin: 8px 0 0;
  text-align: center;
  font-size: 13px;
  font-weight: 700;
  color: #1d4ed8;
}

.comment {
  display: grid;
  gap: 6px;
  font-size: 13px;
  font-weight: 700;
  color: #0c2d52;
}

textarea {
  width: 100%;
  min-height: 96px;
  resize: vertical;
  padding: 10px 12px;
  border: 1px solid #d5e2f0;
  border-radius: 12px;
  font: inherit;
  font-weight: 400;
  font-size: 15px;
  color: #12263f;
  background: #f8fbff;
}

textarea::placeholder { color: #7d93a8; }

.error {
  margin: 10px 0 0;
  color: #b91c1c;
  font-size: 13px;
  font-weight: 600;
}

.actions {
  display: grid;
  gap: 8px;
  margin-top: 16px;
}

.submit,
.later {
  min-height: 46px;
  border-radius: 12px;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.submit {
  border: 0;
  background: #1d4ed8;
  color: #ffffff;
}

.submit:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.later {
  border: 1px solid #d5e2f0;
  background: #ffffff;
  color: #1d4ed8;
}

@media (min-width: 480px) {
  .feedback-scrim { place-items: center; }
  .feedback-card { border-radius: 22px; }
}
</style>
