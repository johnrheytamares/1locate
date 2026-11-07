<template>
  <div>
    <header class="page-header catalog-head">
      <div class="title-row">
        <span class="page-mark" aria-hidden="true"><img class="page-brand-logo" src="/images/1locate-logo.png" alt="" />
        </span>
        <div>
          <h1>Navigation Feedback</h1>
          <p>Ratings and suggestions users submit after arriving at a destination.</p>
        </div>
      </div>
    </header>

    <div class="mini-stats feedback-stats">
      <article class="stat card tone-blue">
        <span class="stat-icon" style="color:#1d4ed8" aria-hidden="true"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M4 4h16v12H7l-3 3V4zm3 4v2h10V8H7zm0 4v2h7v-2H7z"/></svg></span>
        <div><strong data-test="stat-total">{{ summary.total }}</strong><span>Total Feedback Received</span></div>
      </article>
      <article class="stat card tone-amber">
        <span class="stat-icon" style="color:#d97706" aria-hidden="true"><svg viewBox="0 0 24 24"><path fill="currentColor" d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3z"/></svg></span>
        <div><strong data-test="stat-average">{{ summary.average === null ? '–' : summary.average.toFixed(1) }}</strong><span>Average Navigation Rating</span></div>
      </article>
      <article class="stat card tone-green">
        <span class="stat-icon" style="color:#16a34a" aria-hidden="true"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg></span>
        <div><strong data-test="stat-five">{{ summary.fiveStar }}</strong><span>5-Star Ratings</span></div>
      </article>
      <article class="stat card tone-red">
        <span class="stat-icon" style="color:#dc2626" aria-hidden="true"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2 1 21h22L12 2zm1 15h-2v-2h2v2zm0-4h-2V9h2v4z"/></svg></span>
        <div><strong data-test="stat-low">{{ summary.low }}</strong><span>Low Ratings (1–2 Stars)</span></div>
      </article>
    </div>

    <p v-if="error" class="notice error" role="alert" data-test="page-error">{{ error }}</p>

    <p v-if="loading" class="muted">Loading feedback...</p>
    <section v-else class="card feedback-panel">
      <div class="feedback-bar">
        <h2>Feedback List</h2>
        <label class="search-field">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M10 4a6 6 0 1 0 3.7 10.7l4.3 4.3 1.4-1.4-4.3-4.3A6 6 0 0 0 10 4zm0 2a4 4 0 1 1 0 8 4 4 0 0 1 0-8z" /></svg>
          <input v-model="search" type="search" placeholder="Search destination or comment..." aria-label="Search feedback" data-test="search" />
        </label>
        <select v-model="rating" aria-label="Filter by rating" data-test="filter-rating">
          <option value="">All ratings</option>
          <option v-for="value in [5, 4, 3, 2, 1]" :key="value" :value="String(value)">{{ value }} star{{ value === 1 ? '' : 's' }}</option>
          <option value="low">Low (1–2 stars)</option>
        </select>
        <select v-model="sort" aria-label="Sort by date" data-test="sort">
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
        <button class="secondary" type="button" :disabled="loading" data-test="refresh" @click="load">Refresh</button>
      </div>

      <div v-if="current.total === 0" class="table-wrap">
        <p class="empty" data-test="empty">{{ items.length === 0 ? 'No feedback has been submitted yet.' : 'No feedback matches your search.' }}</p>
      </div>
      <div v-else class="table-wrap data-table">
        <table>
          <thead>
            <tr><th>Date</th><th>Destination</th><th>Rating</th><th>Feedback / Suggestion</th><th class="actions-head">Action</th></tr>
          </thead>
          <tbody>
            <tr v-for="item in current.rows" :key="item.id" data-test="feedback-row">
              <td data-label="Date" class="nowrap"><time :datetime="item.created_at">{{ formatDate(item.created_at) }}</time></td>
              <td data-label="Destination"><span class="name-cell">{{ item.destination_name }}</span></td>
              <td data-label="Rating">
                <span class="stars" :class="{ low: item.rating <= 2 }" :aria-label="`${item.rating} out of 5 stars`" :title="RATING_LABELS[item.rating]">{{ stars(item.rating) }}</span>
              </td>
              <td data-label="Feedback" class="comment-cell">
                <span v-if="item.comment" class="clamp">{{ item.comment }}</span>
                <span v-else class="muted">No comment</span>
              </td>
              <td class="actions" data-label="Action">
                <button class="secondary small" type="button" data-test="view" @click="selected = item">View</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <nav v-if="current.total > 0" class="pager" aria-label="Feedback pages">
        <span class="muted" data-test="page-info">Showing {{ current.first }}–{{ current.last }} of {{ current.total }}</span>
        <div class="pager-buttons">
          <button class="secondary small" type="button" :disabled="current.page <= 1" data-test="prev" @click="page = current.page - 1">Previous</button>
          <span class="page-num">Page {{ current.page }} of {{ current.pages }}</span>
          <button class="secondary small" type="button" :disabled="current.page >= current.pages" data-test="next" @click="page = current.page + 1">Next</button>
        </div>
      </nav>
    </section>

    <div v-if="selected" class="overlay" role="dialog" aria-modal="true" aria-labelledby="feedback-detail-title" data-test="detail" @click.self="selected = null" @keydown.esc="selected = null">
      <div class="dialog small">
        <div class="dialog-title">
          <h2 id="feedback-detail-title">Feedback Details</h2>
        </div>
        <dl class="details">
          <dt>Destination</dt>
          <dd data-test="detail-destination">{{ selected.destination_name }}</dd>
          <dt>Rating</dt>
          <dd>
            <span class="stars" :class="{ low: selected.rating <= 2 }">{{ stars(selected.rating) }}</span>
            <span class="rating-text">{{ selected.rating }} / 5 – {{ RATING_LABELS[selected.rating] }}</span>
          </dd>
          <dt>Feedback / Suggestion</dt>
          <dd class="full-comment" data-test="detail-comment">{{ selected.comment || 'No comment provided.' }}</dd>
          <dt>Submitted</dt>
          <dd><time :datetime="selected.created_at">{{ formatDateTime(selected.created_at) }}</time></dd>
        </dl>
        <div class="form-actions">
          <button type="button" data-test="detail-close" @click="selected = null">Close</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { describeError } from '@/lib/errors';
import {
  filterFeedback,
  formatDate,
  formatDateTime,
  paginate,
  RATING_LABELS,
  stars,
  summarize,
  type RatingFilter,
  type SortOrder,
} from '@/lib/feedback';
import { listNavigationFeedback } from '@/services/feedback';
import type { NavigationFeedback } from '@/types';

const PAGE_SIZE = 10;

const items = ref<NavigationFeedback[]>([]);
const loading = ref(true);
const error = ref('');
const search = ref('');
const rating = ref<RatingFilter>('');
const sort = ref<SortOrder>('newest');
const page = ref(1);
const selected = ref<NavigationFeedback | null>(null);

const summary = computed(() => summarize(items.value));
const filtered = computed(() => filterFeedback(items.value, { search: search.value, rating: rating.value, sort: sort.value }));
const current = computed(() => paginate(filtered.value, page.value, PAGE_SIZE));

watch([search, rating, sort], () => { page.value = 1; });

async function load() {
  loading.value = true;
  error.value = '';
  try {
    items.value = await listNavigationFeedback();
  } catch (err) {
    error.value = describeError(err);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.tone-red { background: #fee2e2; border-color: #fecaca; }
.feedback-stats { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.feedback-panel { padding: 16px; }
.feedback-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 12px; }
.feedback-bar h2 { margin: 0; flex: 0 0 auto; }
.feedback-bar .search-field { flex: 1 1 200px; }
.feedback-bar select { width: auto; min-width: 140px; height: 42px; }
.feedback-bar button { height: 42px; }
.nowrap { white-space: nowrap; }
.stars { color: #f59e0b; letter-spacing: 1px; white-space: nowrap; font-size: 15px; }
.stars.low { color: #dc2626; }
.comment-cell { max-width: 420px; }
.clamp {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
}
.pager { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; margin-top: 12px; font-size: 13px; }
.pager-buttons { display: flex; align-items: center; gap: 8px; }
.page-num { font-size: 13px; color: var(--admin-secondary); font-weight: 600; }
.details { display: grid; grid-template-columns: 1fr; gap: 4px; margin: 8px 0 0; }
.details dt { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); margin-top: 8px; }
.details dd { margin: 0; color: var(--ink); }
.rating-text { margin-left: 8px; font-size: 13px; color: var(--admin-secondary); font-weight: 600; }
.full-comment { white-space: pre-wrap; overflow-wrap: anywhere; background: #f8fafc; border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; }

@media (max-width: 1024px) {
  .feedback-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 640px) {
  .content .feedback-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .feedback-bar select, .feedback-bar button { flex: 1 1 120px; }
  .comment-cell { max-width: none; }
  .comment-cell .clamp { text-align: right; }
}
</style>
