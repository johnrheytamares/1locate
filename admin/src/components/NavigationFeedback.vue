<template><section class="card feedback-card"><h2>Navigation feedback</h2><button type="button" :disabled="busy" @click="load">Refresh ratings</button><p v-if="message" role="status">{{ message }}</p><template v-if="items.length"><p>Average of latest {{ items.length }} ratings: <strong>{{ average }} / 5</strong></p><ul><li v-for="item in items" :key="item.id"><strong>{{ item.rating }} / 5</strong> &middot; {{ item.destination_name }} <small>{{ new Date(item.created_at).toLocaleDateString() }}</small></li></ul></template></section></template>
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
<style scoped>.feedback-card { margin-top: 18px; }.feedback-card h2 { font-size: 18px; }.feedback-card ul { list-style: none; padding: 0; }.feedback-card li { padding: 9px 0; border-top: 1px solid #e2e8f0; }.feedback-card small { color: #64748b; margin-left: 8px; }</style>
