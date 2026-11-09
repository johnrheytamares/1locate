<template>
  <div class="dash">
    <header class="hello">
      <div>
        <span class="dashboard-eyebrow">CAMPUS DASHBOARD</span>
        <h1>{{ greeting }}!</h1>
        <p>Here's an overview of your 1Locate campus data.</p>
      </div>
      <time class="hello-side">{{ today }}</time>
    </header>

    <p v-if="error" class="notice error" role="alert">{{ error }}</p>
    <p v-if="loading" class="muted">Loading summary...</p>

    <template v-else-if="summary">
      <div class="stat-grid">
        <article class="card stat-card tone-blue">
          <span class="stat-icon navy" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round">
              <path d="M4 20V9l8-5 8 5v11" />
              <path d="M9 20v-6h6v6" />
            </svg>
          </span>
          <div>
            <strong>{{ summary.buildings }}</strong>
            <span>Buildings</span>
            <small>Total buildings on campus</small>
          </div>
        </article>
        <article class="card stat-card tone-indigo">
          <span class="stat-icon blue" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
              <path d="M5 7h14M5 12h14M5 17h14" />
            </svg>
          </span>
          <div>
            <strong>{{ summary.floors }}</strong>
            <span>Floors</span>
            <small>Total floors added</small>
          </div>
        </article>
        <article class="card stat-card tone-green">
          <span class="stat-icon green" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round">
              <path d="M4 11 12 4l8 7v8H4v-8z" />
              <path d="M10 19v-5h4v5" />
            </svg>
          </span>
          <div>
            <strong>{{ summary.rooms }}</strong>
            <span>Rooms</span>
            <small>Total rooms recorded</small>
          </div>
        </article>
        <article class="card stat-card tone-amber">
          <span class="stat-icon amber" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round">
              <path d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10z" />
              <circle cx="12" cy="11" r="2" />
            </svg>
          </span>
          <div>
            <strong>{{ summary.destinations }}</strong>
            <span>Destinations</span>
            <small>Total destination records</small>
          </div>
        </article>
      </div>

      <NavigationFeedback />

      <p v-if="summary.unsurveyedBuildings > 0" class="notice warn">
        {{ summary.unsurveyedBuildings }} building(s) have no surveyed entrance coordinates yet, so they do not appear on the map preview.
      </p>
      <p v-if="summary.roomsWithoutDestination > 0" class="notice">
        {{ summary.roomsWithoutDestination }} room(s) are not yet available for navigation because they have no destination link.
        <router-link :to="{ name: 'destinations' }">Open Destination Links</router-link>
      </p>

      <div class="dash-grid">
        <section class="card panel">
          <div class="panel-head">
            <h2>Campus Overview</h2>
          </div>
          <div class="overview">
            <div class="donut" :style="{ background: donutGradient }">
              <div>
                <strong>{{ totalRecords }}</strong>
                <span>Total Records</span>
              </div>
            </div>
            <ul class="legend">
              <li><i class="swatch buildings"></i> Buildings <b>{{ summary.buildings }}</b></li>
              <li><i class="swatch floors"></i> Floors <b>{{ summary.floors }}</b></li>
              <li><i class="swatch rooms"></i> Rooms <b>{{ summary.rooms }}</b></li>
              <li><i class="swatch destinations"></i> Destinations <b>{{ summary.destinations }}</b></li>
            </ul>
          </div>
        </section>

        <section class="card panel map-panel">
          <div class="panel-head">
            <h2>Campus Map Preview</h2>
            <router-link class="text-link" :to="{ name: 'buildings' }">Buildings <span aria-hidden="true">↗</span></router-link>
          </div>
          <div class="map" role="group" aria-label="Illustrative campus location preview, not to scale">
            <svg class="map-art" viewBox="0 0 640 280" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
              <rect width="640" height="280" fill="#d9ecfb" />
              <ellipse cx="120" cy="200" rx="90" ry="36" fill="#b7d7a8" />
              <ellipse cx="460" cy="70" rx="120" ry="40" fill="#c5e0b4" />
              <path d="M0 150 C 140 120, 220 190, 340 160 C 460 130, 540 180, 640 150 L 640 190 C 520 220, 440 160, 320 190 C 200 220, 120 150, 0 180 Z" fill="#f4f8fc" />
              <rect x="70" y="78" width="90" height="58" rx="6" fill="#8fb7e8" />
              <polygon points="70,78 115,48 160,78" fill="#6f9edc" />
              <rect x="250" y="96" width="120" height="70" rx="6" fill="#9ec0ea" />
              <polygon points="250,96 310,58 370,96" fill="#7eabd8" />
              <rect x="430" y="120" width="110" height="64" rx="6" fill="#8fb7e8" />
              <polygon points="430,120 485,86 540,120" fill="#6f9edc" />
            </svg>
            <router-link
              v-for="pin in pins"
              :key="pin.id"
              class="pin"
              :style="{ left: `${pin.x}%`, top: `${pin.y}%` }"
              :to="{ name: 'buildings' }"
              :title="pin.name"
            ><span>{{ pin.name }}</span></router-link>
            <span class="map-caption">Schematic preview · not to scale</span>
          </div>
        </section>

        <section class="card panel activity-panel">
          <div class="panel-head">
            <h2>Recent Activities</h2>
            <button v-if="activity.length > 4" class="text-link" type="button" @click="showAll = !showAll">
              {{ showAll ? 'Show less' : 'View All' }}
            </button>
          </div>
          <p v-if="activity.length === 0" class="muted">No campus records yet. Add a building to start the activity list.</p>
          <ul v-else class="activity">
            <li v-for="item in visibleActivity" :key="item.id">
              <span class="dot" :class="item.kind" aria-hidden="true"></span>
              <div>
                <strong>{{ item.title }}</strong>
                <p>{{ item.detail }}</p>
              </div>
              <time :datetime="item.at">{{ relativeTime(item.at) }}</time>
            </li>
          </ul>
        </section>

        <section class="card panel quick-panel">
          <div class="panel-head"><h2>Quick Actions</h2><span class="panel-description">Manage campus records</span></div>
          <div class="actions">
            <router-link class="tile blue" :to="{ name: 'buildings', query: { create: '1' } }">
              <span>+</span> Add Building
            </router-link>
            <router-link class="tile green" :to="{ name: 'floors', query: { create: '1' } }">
              <span>+</span> Add Floor
            </router-link>
            <router-link class="tile purple" :to="{ name: 'rooms', query: { create: '1' } }">
              <span>+</span> Add Room
            </router-link>
            <router-link class="tile amber" :to="{ name: 'destinations' }">
              <span>◎</span> Destinations
            </router-link>
          </div>
          <router-link v-if="session.isAdmin.value" class="roles-link" :to="{ name: 'roles' }">Manage roles <span aria-hidden="true">↗</span></router-link>
        </section>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import NavigationFeedback from '@/components/NavigationFeedback.vue';
import { computed, onMounted, ref } from 'vue';
import { buildActivity, layoutPins, mapPoints, relativeTime, type ActivityItem, type MapPin } from '@/lib/dashboard';
import { isVisible, mobileVisibility, roomsWithoutDestination } from '@/lib/destination-links';
import { describeError } from '@/lib/errors';
import { listBuildings, listDestinations, listFloors, listMapLabels, listRoles, listRooms } from '@/services/campus';
import { useSession } from '@/stores/session';

interface Summary {
  buildings: number;
  buildingsPublished: number;
  unsurveyedBuildings: number;
  floors: number;
  rooms: number;
  roomsPublished: number;
  destinations: number;
  visibleDestinations: number;
  roomsWithoutDestination: number;
}

const session = useSession();
const summary = ref<Summary | null>(null);
const activity = ref<ActivityItem[]>([]);
const pins = ref<MapPin[]>([]);
const loading = ref(true);
const error = ref('');
const showAll = ref(false);
const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const greeting = computed(() => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
});
const totalRecords = computed(() => {
  if (!summary.value) return 0;
  return summary.value.buildings + summary.value.floors + summary.value.rooms + summary.value.destinations;
});
const donutGradient = computed(() => {
  if (!summary.value || totalRecords.value === 0) return 'conic-gradient(#e2e8f0 0 100%)';
  const parts = [
    ['#3b82f6', summary.value.buildings],
    ['#8b5cf6', summary.value.floors],
    ['#22c55e', summary.value.rooms],
    ['#f59e0b', summary.value.destinations],
  ] as const;
  let cursor = 0;
  const stops = parts.map(([color, count]) => {
    const start = cursor;
    cursor += (count / totalRecords.value) * 100;
    return `${color} ${start}% ${cursor}%`;
  });
  return `conic-gradient(${stops.join(', ')})`;
});
const visibleActivity = computed(() => (showAll.value ? activity.value : activity.value.slice(0, 4)));

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const [buildings, floors, rooms, destinations, roles] = await Promise.all([
      listBuildings(), listFloors(), listRooms(), listDestinations(), listRoles(),
    ]);
    let labels: Awaited<ReturnType<typeof listMapLabels>> = [];
    try {
      labels = await listMapLabels();
    } catch {
      labels = [];
    }
    const roomMap = new Map(rooms.map((item) => [item.id, item]));
    const buildingMap = new Map(buildings.map((item) => [item.id, item]));
    summary.value = {
      buildings: buildings.length,
      buildingsPublished: buildings.filter((item) => item.is_active).length,
      unsurveyedBuildings: buildings.filter((item) => item.entrance_lat === null).length,
      floors: floors.length,
      rooms: rooms.length,
      roomsPublished: rooms.filter((item) => item.is_active).length,
      destinations: destinations.length,
      visibleDestinations: destinations.filter((item) => isVisible(mobileVisibility(item, roomMap, buildingMap))).length,
      roomsWithoutDestination: roomsWithoutDestination(rooms, destinations).length,
    };
    activity.value = buildActivity({
      buildings,
      floors,
      rooms,
      roles,
      buildingName: (id) => buildingMap.get(id)?.name ?? 'Building',
    });
    const surveyed = layoutPins(mapPoints(buildings, labels));
    const spots = [
      { x: 22, y: 34 }, { x: 46, y: 30 }, { x: 72, y: 36 },
      { x: 30, y: 68 }, { x: 55, y: 64 }, { x: 78, y: 66 },
    ];
    pins.value = surveyed.length > 0
      ? surveyed
      : buildings.slice(0, spots.length).map((building, index) => ({
        id: building.id,
        name: building.name,
        x: spots[index].x,
        y: spots[index].y,
      }));
  } catch (err) {
    error.value = describeError(err);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.dash { max-width: 1400px; margin: 0 auto; color: #193756; }
.dash .card { border: 1px solid #e0e7ef; box-shadow: none; border-radius: 12px; }
.dashboard-eyebrow { display: block; margin-bottom: 5px; color: #6a7e95; font-size: 10px; font-weight: 750; letter-spacing: .1em; }
.hello { display: flex; align-items: center; justify-content: space-between; gap: 18px; margin: 4px 0 24px; }
.hello h1 { margin: 0 0 6px; color: #102d4e; font-size: 26px; line-height: 1.25; letter-spacing: -.6px; }
.hello p { margin: 0; color: #6a7d93; font-size: 13px; line-height: 1.6; }
.hello-side { padding: 8px 12px; border: 1px solid #e0e7ef; border-radius: 8px; background: #fff; color: #61758d; font-size: 12px; white-space: nowrap; }
.stat-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-bottom: 20px; }
.stat-card { display: flex; align-items: center; gap: 14px; padding: 18px; background: #fff; min-width: 0; }
.stat-card > div { min-width: 0; }
.stat-card strong { display: block; color: #18395d; font-size: 28px; font-weight: 700; line-height: 1.1; letter-spacing: -.7px; font-variant-numeric: tabular-nums; }
.stat-card > div > span { display: block; margin-top: 5px; color: #3e5876; font-size: 12px; font-weight: 650; }
.stat-card small { display: block; margin-top: 4px; color: #77899e; font-size: 11px; line-height: 1.5; }
.stat-icon { flex: 0 0 42px; display: grid; place-items: center; width: 42px; height: 42px; border-radius: 11px; }
.stat-icon svg { width: 21px; height: 21px; }
.stat-icon.navy { background: #edf4ff; color: #3473ce; }
.stat-icon.blue { background: #f0edff; color: #8560cf; }
.stat-icon.green { background: #ebf8f1; color: #279967; }
.stat-icon.amber { background: #fff5e6; color: #cf8a25; }
.dash > .notice { font-size: 12px; line-height: 1.6; margin-bottom: 16px; }
.dash-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr); gap: 20px; align-items: stretch; }
.panel { display: flex; flex-direction: column; min-width: 0; padding: 20px; background: #fff; }
.panel-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 18px; }
.panel h2 { margin: 0; color: #173655; font-size: 15px; font-weight: 700; line-height: 1.4; }
.panel-description { color: #74869c; font-size: 12px; }
.text-link { display: inline-flex; align-items: center; gap: 6px; min-height: 32px; padding: 0; border: 0; background: none; color: #2563eb; font-size: 12px; font-weight: 650; text-decoration: none; white-space: nowrap; cursor: pointer; }
.text-link:hover { background: none; color: #174ba1; text-decoration: underline; }
.overview { display: flex; align-items: center; justify-content: center; flex: 1; gap: 28px; min-height: 190px; }
.donut { display: grid; place-items: center; flex: 0 0 156px; width: 156px; height: 156px; border-radius: 50%; }
.donut > div { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; width: 122px; height: 122px; border-radius: 50%; background: #fff; }
.donut strong { font-size: 28px; color: #18395d; line-height: 1.2; font-variant-numeric: tabular-nums; }
.donut span { color: #7b8ba1; font-size: 11px; }
.legend { display: grid; gap: 0; flex: 1 1 120px; min-width: 0; max-width: 250px; margin: 0; padding: 0; list-style: none; }
.legend li { display: flex; align-items: center; gap: 9px; padding: 10px 0; color: #5a708a; font-size: 13px; }
.legend li + li { border-top: 1px solid #edf1f6; }
.legend b { margin-left: auto; color: #304d6c; font-size: 13px; font-variant-numeric: tabular-nums; }
.swatch { flex: 0 0 8px; width: 8px; height: 8px; border-radius: 50%; }
.swatch.buildings { background: #3b82f6; }
.swatch.floors { background: #8b5cf6; }
.swatch.rooms { background: #22c55e; }
.swatch.destinations { background: #f59e0b; }
.map { position: relative; flex: 1; min-height: 210px; border: 1px solid #e0eaf4; border-radius: 9px; overflow: hidden; background: #d9ecfb; }
.map-art { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.map-caption { position: absolute; z-index: 2; right: 10px; bottom: 10px; padding: 5px 8px; border: 1px solid #dce6ef; border-radius: 5px; background: #fffffff0; color: #59718b; font-size: 10px; }
.pin { position: absolute; z-index: 1; transform: translate(-50%, -100%); text-decoration: none; }
.pin::before { content: ''; display: block; width: 18px; height: 18px; margin: 0 auto; border: 2px solid white; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); background: #2563eb; box-shadow: 0 2px 5px #183a6033; }
.pin span { display: block; max-width: 120px; margin-top: 6px; padding: 2px 5px; border-radius: 4px; background: #ffffffd9; color: #224365; text-align: center; font-size: 10px; font-weight: 650; overflow-wrap: anywhere; }
.activity { display: grid; gap: 0; margin: 0; padding: 0; list-style: none; }
.activity li { display: grid; grid-template-columns: 8px minmax(0, 1fr) auto; align-items: start; gap: 12px; padding: 13px 0; }
.activity li:first-child { padding-top: 0; }
.activity li + li { border-top: 1px solid #edf1f6; }
.activity strong { display: block; color: #304f70; font-size: 13px; font-weight: 650; }
.activity p { margin: 4px 0 0; color: #74869c; font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
.activity time { padding-top: 2px; color: #7f90a4; font-size: 11px; white-space: nowrap; }
.dot { width: 7px; height: 7px; margin-top: 6px; border-radius: 50%; background: #6f87a2; }
.dot.building { background: #3b82f6; }
.dot.floor { background: #22a871; }
.dot.room { background: #29a4d1; }
.dot.role { background: #d99c39; }
.actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.tile { display: flex; align-items: center; gap: 12px; min-width: 0; min-height: 72px; padding: 14px; border: 1px solid #e0e7ef; border-radius: 9px; background: #fff; color: #375574; font-size: 12px; font-weight: 650; text-decoration: none; transition: border-color .15s, background-color .15s; }
.tile:hover { border-color: #adc5e6; background: #f7faff; color: #2058a2; }
.tile > span { display: grid; place-items: center; flex: 0 0 32px; width: 32px; height: 32px; border-radius: 8px; font-size: 19px; font-weight: 400; }
.tile.blue > span { background: #edf4ff; color: #3473ce; }
.tile.green > span { background: #ebf8f1; color: #279967; }
.tile.purple > span { background: #f0edff; color: #8560cf; }
.tile.amber > span { background: #fff5e6; color: #cf8a25; }
.roles-link { display: inline-flex; align-items: center; align-self: flex-end; gap: 7px; min-height: 40px; margin-top: 12px; color: #617994; font-size: 12px; text-decoration: none; }
.roles-link:hover { color: #2563eb; text-decoration: underline; }
.dash a:focus-visible, .dash button:focus-visible { outline: 2px solid #2563eb; outline-offset: 3px; }
@media (max-width: 1200px) {
  .stat-grid { gap: 10px; }
  .stat-card { padding: 16px 12px; gap: 10px; }
  .stat-card small { display: none; }
  .overview { gap: 18px; }
  .donut { flex-basis: 128px; width: 128px; height: 128px; }
  .donut > div { width: 100px; height: 100px; }
  .activity li { grid-template-columns: 8px minmax(0, 1fr); gap: 5px 10px; }
  .activity time { grid-column: 2; padding: 0; }
}
@media (min-width: 901px) and (max-width: 1100px) {
  .stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .dash-grid { grid-template-columns: minmax(0, 1fr); }
  .overview { gap: 32px; }
  .activity li { grid-template-columns: 8px minmax(0, 1fr) auto; }
  .activity time { grid-column: 3; grid-row: 1; }
}
@media (max-width: 760px) {
  .dash-grid { grid-template-columns: minmax(0, 1fr); gap: 14px; }
  .stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-bottom: 14px; }
  .hello { align-items: flex-start; margin-bottom: 18px; }
  .hello h1 { font-size: 23px; }
  .hello p { font-size: 12px; max-width: 38ch; }
  .hello-side { padding: 6px 9px; font-size: 11px; }
  .panel { padding: 18px; }
  .overview { justify-content: center; gap: 24px; min-height: 160px; }
  .donut { flex-basis: 140px; width: 140px; height: 140px; }
  .donut > div { width: 110px; height: 110px; }
  .legend { max-width: 240px; }
  .map { min-height: 210px; }
  .activity li { grid-template-columns: 8px minmax(0, 1fr) auto; gap: 12px; }
  .activity time { grid-column: 3; grid-row: auto; }
}
@media (max-width: 480px) {
  .hello { display: grid; gap: 10px; margin: 0 0 16px; }
  .dashboard-eyebrow { font-size: 9px; }
  .hello h1 { font-size: 22px; margin-bottom: 5px; }
  .hello p { font-size: 12px; }
  .hello-side { justify-self: start; border: 0; background: none; padding: 0; color: #7a8ca2; font-size: 11px; }
  .stat-card { padding: 14px 12px; gap: 10px; border-radius: 10px; }
  .stat-card strong { font-size: 25px; }
  .stat-card > div > span { font-size: 11px; margin-top: 4px; }
  .stat-icon { flex-basis: 32px; width: 32px; height: 32px; border-radius: 9px; }
  .stat-icon svg { width: 17px; height: 17px; }
  .panel { padding: 16px; }
  .panel-head { margin-bottom: 14px; }
  .panel h2 { font-size: 14px; }
  .text-link { font-size: 11px; min-height: 40px; }
  .overview { gap: 18px; min-height: 140px; }
  .donut { flex-basis: 116px; width: 116px; height: 116px; }
  .donut > div { width: 90px; height: 90px; }
  .donut strong { font-size: 25px; }
  .donut span { font-size: 10px; }
  .legend li { padding: 9px 0; font-size: 12px; gap: 7px; }
  .legend b { font-size: 12px; }
  .swatch { flex-basis: 7px; width: 7px; height: 7px; }
  .map { min-height: 185px; }
  .activity li { grid-template-columns: 7px minmax(0, 1fr); gap: 5px 10px; padding: 12px 0; }
  .activity time { grid-column: 2; font-size: 10px; }
  .activity strong { font-size: 12px; }
  .activity p { font-size: 11px; margin-top: 3px; }
  .quick-panel .panel-head { display: block; }
  .panel-description { display: block; margin-top: 5px; font-size: 11px; }
  .actions { gap: 8px; }
  .tile { min-height: 64px; padding: 10px; gap: 9px; font-size: 11px; }
  .tile > span { flex-basis: 27px; width: 27px; height: 27px; font-size: 17px; }
  .roles-link { min-height: 44px; margin-top: 6px; }
}
@media (max-width: 360px) { .overview { gap: 12px; } .donut { flex-basis: 100px; width: 100px; height: 100px; } .donut > div { width: 78px; height: 78px; } .tile { gap: 6px; padding: 8px; } }
@media (prefers-reduced-motion: reduce) { .tile { transition: none; } }
</style>
