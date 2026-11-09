<template>
  <section class="card feedback-card" aria-labelledby="dashboard-feedback-title">
    <header class="feedback-head">
      <h2 id="dashboard-feedback-title">Navigation feedback</h2>
      <button class="refresh-ratings" type="button" :disabled="busy" aria-label="Refresh ratings" title="Refresh ratings" @click="load">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1" /></svg>
      </button>
    </header>
    <p v-if="busy" class="feedback-message" role="status">Loading ratings...</p>
    <p v-else-if="message" class="feedback-message" role="status">{{ message }}</p>
    <div v-if="items.length" class="feedback-body" :aria-busy="busy">
      <div class="rating-summary">
        <span class="rating-label">Average rating</span>
        <div class="rating-value"><strong>{{ average }}</strong><span>/ 5</span></div>
        <small>Latest {{ items.length }} {{ items.length === 1 ? 'rating' : 'ratings' }}</small>
      </div>
      <ul class="rating-list" aria-label="Most recent ratings">
        <li v-for="item in items.slice(0, 3)" :key="item.id">
          <span class="rating-destination">{{ item.destination_name }}</span>
          <strong class="rating-badge">{{ item.rating }} / 5</strong>
          <time :datetime="item.created_at">{{ new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }}</time>
        </li>
      </ul>
    </div>
    <router-link class="feedback-link" :to="{ name: 'feedback' }">View all feedback <span aria-hidden="true">&rarr;</span></router-link>
  </section>
</template>
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { requireClient } from '@/lib/supabase';
interface Rating { id: string; destination_name: string; rating: number; created_at: string; }
const items = ref<Rating[]>([]); const busy = ref(false); const message = ref('');
const average = computed(() => (items.value.reduce((sum, item) => sum + item.rating, 0) / items.value.length).toFixed(1));
async function load() {
  busy.value = true; message.value = '';
  try {
    const { data, error } = await requireClient().from('navigation_feedback').select('id,destination_name,rating,created_at').order('created_at', { ascending: false }).limit(20);
    if (error) throw error;
    items.value = (data ?? []) as Rating[]; if (!items.value.length) message.value = 'No navigation ratings yet.';
  } catch { items.value = []; message.value = 'Ratings are unavailable. Check the feedback migration and your content role.'; }
  finally { busy.value = false; }
}
onMounted(load);
</script>
<style scoped>
.feedback-card { margin: 0 0 20px; padding: 18px 22px; border: 1px solid #e1e7ef; border-radius: 12px; background: #fff; box-shadow: none; }
.feedback-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.feedback-head h2 { margin: 0; color: #173655; font-size: 15px; font-weight: 700; line-height: 1.4; }
.refresh-ratings { display: grid; place-items: center; flex: 0 0 40px; width: 40px; height: 40px; padding: 10px; border: 1px solid #e0e7f0; border-radius: 8px; background: #fff; color: #527093; }
.refresh-ratings svg { width: 18px; height: 18px; }
.refresh-ratings:hover:not(:disabled) { background: #f1f6fd; border-color: #b8cee9; color: #245ba2; }
.feedback-body { display: grid; grid-template-columns: 180px minmax(0, 1fr); gap: 24px; align-items: center; }
.rating-summary { border-right: 1px solid #e7edf4; padding: 2px 20px 2px 0; }
.rating-label { color: #5d728b; font-size: 12px; }
.rating-value { display: flex; align-items: baseline; gap: 7px; margin: 2px 0; color: #173655; }
.rating-value strong { font-size: 34px; font-weight: 700; line-height: 1.25; letter-spacing: -1px; font-variant-numeric: tabular-nums; }
.rating-value > span { font-size: 14px; color: #718298; }
.rating-summary small { font-size: 11px; color: #657b94; }
.rating-list { display: grid; gap: 10px; list-style: none; margin: 0; padding: 0; }
.rating-list li { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 12px; padding: 6px 0; }
.rating-list li + li { border-top: 1px solid #edf1f6; padding-top: 12px; }
.rating-destination { min-width: 0; overflow-wrap: anywhere; color: #304f70; font-size: 13px; font-weight: 600; }
.rating-badge { white-space: nowrap; background: #fff8e8; color: #946313; border-radius: 6px; padding: 5px 8px; font-size: 12px; font-weight: 650; }
.rating-list time { color: #73849a; font-size: 11px; white-space: nowrap; }
.feedback-message { margin: 0 0 12px; color: #647891; font-size: 13px; line-height: 1.6; }
.feedback-link { display: inline-flex; align-items: center; gap: 6px; margin-top: 14px; min-height: 32px; color: #2563eb; font-size: 12px; font-weight: 650; text-decoration: none; }
.feedback-link:hover { text-decoration: underline; }
.feedback-card button:focus-visible, .feedback-link:focus-visible { outline: 2px solid #2563eb; outline-offset: 3px; }
@media (max-width: 640px) {
  .feedback-card { padding: 14px 16px; margin-bottom: 14px; }
  .feedback-head { margin-bottom: 10px; }
  .feedback-head h2 { font-size: 14px; }
  .refresh-ratings { flex-basis: 44px; width: 44px; height: 44px; }
  .feedback-body { grid-template-columns: 94px minmax(0, 1fr); gap: 14px; align-items: start; }
  .rating-summary { padding-right: 10px; }
  .rating-label { font-size: 11px; }
  .rating-value strong { font-size: 30px; }
  .rating-list li { grid-template-columns: minmax(0, 1fr) auto; gap: 4px 8px; padding: 0; }
  .rating-list time { grid-column: 1 / -1; }
  .rating-destination { font-size: 12px; }
  .rating-badge { font-size: 11px; padding: 4px 6px; }
  .feedback-link { min-height: 40px; margin-top: 8px; }
}
</style>
