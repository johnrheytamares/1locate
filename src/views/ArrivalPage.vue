<template>
  <ion-page><ion-content class="arrival-content"><main v-if="record" class="arrival-card">
    <div class="arrival-check" aria-hidden="true">&#10003;</div><h1>You've Arrived!</h1><p>You confirmed that you reached</p><h2>{{ record.destination.name }}</h2><p>{{ record.destination.building }}<template v-if="record.destination.details?.floorName"> &middot; {{ record.destination.details.floorName }}</template></p>
    <form v-if="!submitted" @submit.prevent="submit"><fieldset :disabled="busy"><legend>How was your navigation? (optional)</legend><div class="stars"><button v-for="star in 5" :key="star" type="button" :aria-label="`${star} out of 5 stars`" :aria-pressed="rating === star" :class="{ selected: star <= rating }" @click="rating = star">&#9733;</button></div><ion-button v-if="rating" expand="block" fill="outline" type="submit">{{ busy ? 'Saving...' : 'Submit feedback' }}</ion-button></fieldset></form>
    <p v-if="message" role="status">{{ message }}</p><ion-button expand="block" :disabled="busy" data-test="done" @click="done">Done</ion-button>
  </main></ion-content></ion-page>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import { IonPage, IonContent, IonButton, onIonViewWillEnter, useIonRouter } from '@ionic/vue';
import { clearJourney, getArrival } from '@/services/journey.service';
import { clearSelectedDestination } from '@/services/navigation.service';
import { sendFeedback } from '@/services/feedback.service';
const router = useIonRouter(); const record = ref(getArrival()); const rating = ref(0); const busy = ref(false); const submitted = ref(false); const message = ref('');
onIonViewWillEnter(() => { record.value = getArrival(); rating.value = 0; submitted.value = false; message.value = ''; if (!record.value) router.replace('/destinations'); });
async function submit() {
  if (!record.value || busy.value || !rating.value || submitted.value) return;
  busy.value = true;
  try { const result = await sendFeedback({ id: record.value.feedbackId, destination_id: record.value.destination.id, destination_name: record.value.destination.name, rating: rating.value }); submitted.value = true; message.value = result === 'sent' ? 'Thank you for your feedback!' : 'Feedback saved on this device. It will be retried when connected.'; }
  catch (error) { message.value = error instanceof Error ? error.message : 'Could not save feedback.'; }
  finally { busy.value = false; }
}
function done() { clearJourney(); clearSelectedDestination(); router.replace('/destinations'); }
</script>
<style scoped>
.arrival-content { --background: linear-gradient(150deg, #0c2d52, #1b528d); }.arrival-card { margin: max(8dvh, 24px) auto 30px; width: calc(100% - 36px); max-width: 430px; padding: 28px 20px; border-radius: 24px; background: white; color: #12263f; text-align: center; }.arrival-check { width: 72px; height: 72px; display: grid; place-items: center; margin: auto; background: #22a45b; color: white; border-radius: 50%; font-size: 45px; }h1 { font-size: 26px; font-weight: 800; }h2 { font-size: 22px; }p { color: #52687d; }fieldset { border: 0; padding: 12px 0; margin: 0; }legend { font-size: 14px; }.stars { display: flex; justify-content: center; }.stars button { background: transparent; font-size: 36px; padding: 8px; color: #c3cfda; }.stars .selected { color: #e1a314; }ion-button { --background: #1d4ed8; --border-radius: 12px; min-height: 46px; text-transform: none; }
</style>
