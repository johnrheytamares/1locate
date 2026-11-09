<template>
  <ion-page>
    <ion-header class="picker-header">
      <ion-toolbar class="picker-toolbar">
        <ion-buttons slot="start">
          <ion-back-button default-href="/home" color="light" text="" />
        </ion-buttons>
        <div class="brand-lockup">
          <div class="brand-title">
            <img class="header-logo" src="/images/1locate-logo.png" alt="" />
            <strong>1Locate</strong>
          </div>
          <span class="brand-sub">Choose a Destination</span>
        </div>
        <div class="skyline" aria-hidden="true" slot="end">
          <span class="bldg b1" />
          <span class="bldg b2" />
          <span class="bldg b3" />
        </div>
      </ion-toolbar>
      <ion-toolbar class="search-toolbar">
        <div class="search-row">
          <ion-searchbar
            v-model="query"
            placeholder="Search destinations..."
            :debounce="150"
            @ion-input="clearVoiceMatches"
          />
          <ion-button
            class="mic"
            :class="{ listening }"
            :disabled="listening"
            :aria-label="listening ? 'Listening' : 'Search by voice'"
            data-test="voice-search"
            @click="onVoiceSearch"
          >
            <ion-icon slot="icon-only" :icon="listening ? micOutline : mic" aria-hidden="true" />
          </ion-button>
        </div>
      </ion-toolbar>
    </ion-header>

    <ion-content class="picker-content">
      <p v-if="voiceMessage" class="voice-status" role="status" data-test="voice-status">{{ voiceMessage }}</p>
      <div class="source-banner" :class="{ live: isLive }">
        <ion-icon :icon="isLive ? wifi : cloudOfflineOutline" aria-hidden="true" />
        <p class="source" data-test="source">{{ sourceLabel }}</p>
        <ion-button
          v-if="failed"
          size="small"
          fill="solid"
          :disabled="loading"
          data-test="retry"
          @click="load"
        >
          {{ loading ? 'Retrying...' : 'Retry' }}
        </ion-button>
      </div>

      <div class="category-filters" role="group" aria-label="Destination category"><button v-for="item in ['All', 'Buildings', 'Rooms', 'Offices'] as const" :key="item" :aria-pressed="category === item" :class="{ selected: category === item }" @click="category = item">{{ item }}</button></div>
      <p v-if="filtered.length === 0" class="empty">No destinations match that search.</p>

      <article v-for="destination in filtered" :key="destination.id" class="card">
        <div class="card-top">
          <span class="dest-icon" aria-hidden="true">
            <ion-icon :icon="iconFor(destination)" />
          </span>
          <div class="card-copy">
            <div class="name-row">
              <h2>{{ destination.name }}</h2>
              <ion-icon class="chevron" :icon="chevronForward" aria-hidden="true" />
            </div>
            <p class="building">
              <ion-icon :icon="locationOutline" aria-hidden="true" />
              {{ destination.building }}<template v-if="destination.details?.floorName"> &middot; {{ destination.details.floorName }}</template>
            </p>
            <p class="meta">
              {{ destinationTypeLabel(destination.type) }} · GPS to {{ destination.outdoorTarget.name }}
            </p>
            <p class="stats">
              <span>
                <ion-icon :icon="walkOutline" aria-hidden="true" />
                {{ destination.indoorRoute.length }} steps
              </span>
              <span>
                <ion-icon :icon="chevronForward" aria-hidden="true" />
                <ion-icon :icon="chevronForward" aria-hidden="true" />
                {{ Number(indoorRouteMeters(destination).toFixed(1)) }} m indoors
              </span>
            </p>
          </div>
        </div>
        <ion-button expand="block" class="select" @click="onSelect(destination.id)">
          <ion-icon slot="start" :icon="paperPlaneOutline" aria-hidden="true" />
          Select
        </ion-button>
      </article>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonPage,
  IonSearchbar,
  IonToolbar,
  onIonViewWillEnter,
  onIonViewWillLeave,
  useIonRouter,
} from '@ionic/vue';
import {
  bookOutline,
  businessOutline,
  cashOutline,
  chevronForward,
  cloudOfflineOutline,
  flaskOutline,
  locationOutline,
  mic,
  micOutline,
  paperPlaneOutline,
  peopleOutline,
  schoolOutline,
  walkOutline,
  wifi,
} from 'ionicons/icons';
import { useDestinationCatalog } from '@/composables/useDestinationCatalog';
import { useVoice } from '@/composables/useVoice';
import type { Destination } from '@/models/navigation';
import { destinationTypeLabel } from '@/services/destination-details.service';
import { indoorRouteMeters } from '@/services/navigation.service';
import { listenForDestination, stopListening } from '@/services/speech-input.service';
import { resolveVoiceSearch } from '@/services/voice-query.service';

const ionRouter = useIonRouter();
const query = ref('');
const category = ref<'All' | 'Buildings' | 'Rooms' | 'Offices'>('All');
const { destinations, failed, loading, isLive, sourceLabel, load } = useDestinationCatalog();
const voice = useVoice();
const listening = ref(false);
const voiceMessage = ref('');
/** Set when a spoken request matched several destinations; the list then shows only those. */
const voiceMatchIds = ref<string[] | null>(null);
let pageActive = false;

onIonViewWillEnter(() => {
  pageActive = true;
  void load();
});

onIonViewWillLeave(() => {
  pageActive = false;
  voiceMessage.value = '';
  voiceMatchIds.value = null;
  if (listening.value) void stopListening();
});

function clearVoiceMatches() {
  voiceMatchIds.value = null;
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;
}

async function onVoiceSearch() {
  if (listening.value) return;
  voice.reset();
  voiceMatchIds.value = null;
  voiceMessage.value = 'Listening... say where you want to go.';
  listening.value = true;
  const heard = await listenForDestination();
  listening.value = false;
  if (!pageActive) return;

  if (!heard.ok) {
    voiceMessage.value = heard.message;
    voice.announce(heard.message);
    return;
  }

  const result = resolveVoiceSearch(heard.transcripts, destinations.value);
  query.value = '';
  if (result.kind === 'single') {
    voiceMessage.value = `Found ${result.destination.name}.`;
    voice.announce(`${result.destination.name}. Review its details, then tap View on Map.`);
    onSelect(result.destination.id);
    return;
  }
  if (result.kind === 'multiple') {
    voiceMatchIds.value = result.destinations.map((item) => item.id);
    const names = joinNames(result.destinations.map((item) => item.name));
    voiceMessage.value = `I found ${result.destinations.length} places for "${result.query}". Pick one below.`;
    voice.announce(`I found ${names}. Pick one from the list.`);
    return;
  }
  const said = heard.transcripts[0];
  voiceMessage.value = `No destination matches "${said}". Try again or type the name.`;
  voice.announce('I could not find that destination. Try again or type the name.');
}

const filtered = computed(() => {
  if (voiceMatchIds.value) {
    const ids = voiceMatchIds.value;
    return destinations.value.filter((destination) => ids.includes(destination.id));
  }
  const needle = query.value.trim().toLowerCase();
  const available = destinations.value.filter(item => category.value === 'All'
    || (category.value === 'Rooms' && (!!item.details?.roomId || /room|classroom|laboratory/i.test(item.type)))
    || (category.value === 'Offices' && /office/i.test(item.type))
    || (category.value === 'Buildings' && /building/i.test(item.type)));
  if (!needle) return available;
  return available.filter((destination) => (
    destination.name.toLowerCase().includes(needle)
    || destination.building.toLowerCase().includes(needle)
    || destination.type.toLowerCase().includes(needle)
  ));
});

function iconFor(destination: Destination) {
  const key = `${destination.id} ${destination.name} ${destination.type}`.toLowerCase();
  if (key.includes('library')) return bookOutline;
  if (key.includes('cashier') || key.includes('cash') || key.includes('finance')) return cashOutline;
  if (key.includes('guidance') || key.includes('counsel')) return peopleOutline;
  if (key.includes('lab')) return flaskOutline;
  if (key.includes('class') || key.includes('school')) return schoolOutline;
  if (key.includes('registrar')) return businessOutline;
  return businessOutline;
}

function onSelect(id: string) {
  ionRouter.push(`/destinations/${encodeURIComponent(id)}`);
}
</script>

<style scoped>
.picker-header {
  box-shadow: none;
}

.picker-toolbar,
.search-toolbar {
  --background: #0c2d52;
  --color: #ffffff;
  --border-width: 0;
  --min-height: 56px;
  padding-inline: 4px;
}

.search-toolbar {
  --min-height: 64px;
  padding-bottom: 8px;
}

.brand-lockup {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 44px;
}

.brand-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pin {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 999px;
  background: #1d4ed8;
  color: #ffffff;
  font-size: 15px;
}

.brand-lockup strong {
  color: #ffffff;
  font-size: 20px;
  font-weight: 800;
  line-height: 1.1;
}

.brand-sub {
  margin-left: 34px;
  color: #c5d4e8;
  font-size: 13px;
  font-weight: 500;
}

.skyline {
  display: flex;
  align-items: flex-end;
  gap: 3px;
  height: 36px;
  margin-right: 10px;
  opacity: 0.85;
}

.bldg {
  display: block;
  width: 14px;
  border-radius: 2px 2px 0 0;
  background:
    linear-gradient(#dbe7f5, #dbe7f5) 3px 6px / 3px 3px no-repeat,
    linear-gradient(#dbe7f5, #dbe7f5) 8px 6px / 3px 3px no-repeat,
    linear-gradient(#dbe7f5, #dbe7f5) 3px 12px / 3px 3px no-repeat,
    linear-gradient(#dbe7f5, #dbe7f5) 8px 12px / 3px 3px no-repeat,
    #8fb0d4;
}

.b1 { height: 22px; }
.b2 { height: 32px; width: 16px; }
.b3 { height: 18px; }

.picker-content {
  --background: #eef3f8;
}

.search-toolbar ion-searchbar {
  --background: #ffffff;
  --border-radius: 14px;
  --box-shadow: none;
  --color: #102a43;
  --placeholder-color: #8aa0b8;
  --icon-color: #8aa0b8;
  --clear-button-color: #8aa0b8;
  padding-inline: 12px;
  padding-top: 0;
  padding-bottom: 4px;
}

.source-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 14px 16px 4px;
  padding: 10px 12px;
  border-radius: 14px;
  background: #e7f0fb;
  color: #1e4b7a;
}

.source-banner.live {
  background: #e5f6ee;
  color: #0f6b45;
}

.source-banner > ion-icon {
  flex: 0 0 auto;
  font-size: 20px;
}

.source {
  flex: 1;
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.3;
}

.source-banner ion-button {
  --background: #ffffff;
  --color: #1d4ed8;
  --border-radius: 10px;
  --box-shadow: none;
  margin: 0;
  height: 32px;
  font-weight: 700;
  text-transform: none;
}

.empty {
  margin: 24px 16px;
  color: #0c2d52;
  text-align: center;
}

.card {
  margin: 12px 16px;
  padding: 14px 14px 12px;
  border-radius: 18px;
  background: #ffffff;
  box-shadow: 0 8px 22px rgba(15, 42, 74, 0.06);
}

.card-top {
  display: flex;
  gap: 12px;
}

.dest-icon {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 46px;
  height: 46px;
  border-radius: 999px;
  background: #e8f1fb;
  color: #1d4ed8;
  font-size: 22px;
}

.card-copy {
  flex: 1;
  min-width: 0;
}

.name-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.card h2 {
  margin: 0;
  color: #12263f;
  font-size: 18px;
  font-weight: 800;
}

.chevron {
  flex: 0 0 auto;
  color: #9eb0c3;
  font-size: 18px;
}

.building,
.meta,
.stats {
  margin: 0;
}

.building {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
  color: #5d738a;
  font-size: 13px;
}

.building ion-icon {
  color: #3b82f6;
  font-size: 14px;
}

.meta {
  margin-top: 2px;
  color: #6b8096;
  font-size: 13px;
}

.stats {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  margin-top: 8px;
  color: #1d4ed8;
  font-size: 13px;
  font-weight: 700;
}

.stats span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.stats ion-icon {
  font-size: 15px;
}

.stats span ion-icon + ion-icon {
  margin-left: -10px;
}

.select {
  margin-top: 12px;
  --background: #1d4ed8;
  --background-hover: #1e40af;
  --border-radius: 12px;
  --box-shadow: none;
  font-weight: 700;
  letter-spacing: 0.01em;
  text-transform: none;
  height: 44px;
}
.picker-toolbar { --min-height: 50px; }
.search-toolbar { --min-height: 54px; padding-bottom: 4px; }
.brand-lockup strong { font-size: 18px; }
.brand-sub { font-size: 11px; }
.search-toolbar ion-searchbar { --border-radius: 11px; padding-inline: 8px; font-size: 14px; }
.source-banner { margin: 10px 12px 4px; padding: 8px 10px; border-radius: 10px; gap: 8px; }
.source { font-size: 11px; line-height: 1.5; }
.source-banner > ion-icon { font-size: 17px; }
.source-banner ion-button { --color: #1d4ed8; font-size: 11px; min-height: 40px; height: 40px; }
.card { margin: 9px 12px; padding: 12px; border-radius: 14px; box-shadow: 0 3px 12px #153d7308; }
.card-top { gap: 10px; }
.dest-icon { width: 36px; height: 36px; border-radius: 11px; font-size: 19px; }
.card h2 { font-size: 16px; line-height: 1.3; font-weight: 750; }
.building { font-size: 11px; line-height: 1.5; }
.building ion-icon { flex-shrink: 0; }
.meta { font-size: 11px; line-height: 1.4; margin-top: 3px; }
.stats { font-size: 11px; gap: 10px; margin-top: 6px; }
.stats ion-icon { font-size: 13px; }
.select { --color: #fff; --border-radius: 10px; margin: 10px 0 0; height: 44px; min-height: 44px; font-size: 13px; letter-spacing: 0; }
.picker-content::part(scroll) { padding-bottom: env(safe-area-inset-bottom, 0px); }
@media (min-width: 600px) {
  .card, .source-banner, .empty { max-width: 520px; margin-left: auto; margin-right: auto; }
}
.search-row { display: flex; align-items: center; gap: 6px; padding-right: 8px; }
.search-row ion-searchbar { flex: 1; }
.mic { --background: #1d4ed8; --border-radius: 11px; --box-shadow: none; margin: 0 0 4px; width: 44px; height: 44px; min-height: 44px; }
.mic.listening { --background: #dc2626; opacity: 1; }
.voice-status { margin: 10px 12px 0; padding: 8px 10px; border-radius: 10px; background: #fff7e6; color: #7a4b00; font-size: 12px; font-weight: 600; line-height: 1.4; }
@media (min-width: 600px) {
  .voice-status { max-width: 520px; margin-left: auto; margin-right: auto; }
}
.header-logo { width: 30px; height: 34px; object-fit: contain; flex-shrink: 0; }
</style>

<style scoped>.category-filters { display: flex; gap: 8px; overflow-x: auto; padding: 8px 16px; }.category-filters button { background: white; color: #25445f; border: 1px solid #d5e2ee; padding: 10px 16px; border-radius: 12px; font-weight: 700; }.category-filters .selected { background: #1d4ed8; color: white; border-color: #1d4ed8; }</style>
