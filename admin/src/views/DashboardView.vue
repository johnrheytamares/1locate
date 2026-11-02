<template>
  <div class="dash">
    <header class="hello">
      <div>
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
            <small>Total destinations available</small>
          </div>
        </article>
      </div>

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
            <router-link class="text-link" :to="{ name: 'buildings' }">View Map</router-link>
          </div>
          <div class="map" role="img" aria-label="Campus map preview">
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
          </div>
        </section>

        <section class="card panel tone-slate">
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

        <section class="card panel">
          <h2>Quick Actions</h2>
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
            <router-link v-if="session.isAdmin.value" class="round" :to="{ name: 'roles' }" aria-label="Manage roles">↗</router-link>
          </div>
        </section>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
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
.dash :deep(.card) { box-shadow: none; }
.dash :deep(.page-header) { margin-bottom: 10px; }
.dash :deep(h1) { font-size: 1.25rem; margin-bottom: 2px; }
.dash :deep(.page-header p) { font-size: 13px; }

.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 0;
  padding: 12px 14px;
}

.stat-card strong {
  display: block;
  font-size: 1.35rem;
  line-height: 1;
  color: #0f2744;
}

.stat-card > div span { display: block; font-weight: 700; margin-top: 2px; font-size: 13px; color: #0f2744; }
.stat-card small { display: block; margin-top: 0; color: #64748b; font-size: 12px; }

.stat-card .stat-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  line-height: 0;
}
.stat-icon svg {
  width: 18px;
  height: 18px;
  display: block;
  margin: 0;
}
.stat-icon.navy,
.stat-icon.blue,
.stat-icon.green,
.stat-icon.amber { background: #fff; }
.stat-icon.navy { color: #1e3a5f; }
.stat-icon.blue { color: #2563eb; }
.stat-icon.green { color: #15803d; }
.stat-icon.amber { color: #d97706; }
.tone-blue { background: #dbeafe; border-color: #bfdbfe; }
.tone-indigo { background: #e0e7ff; border-color: #c7d2fe; }
.tone-green { background: #dcfce7; border-color: #86efac; }
.tone-amber { background: #fef3c7; border-color: #fde68a; }
.tone-purple { background: #ede9fe; border-color: #ddd6fe; }
.tone-slate { background: #e2e8f0; border-color: #cbd5e1; }

.hello { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin: 8px 0 16px; }
.hello h1 { font-size: 1.35rem; margin: 0 0 2px; }
.hello p { margin: 0; color: var(--muted); font-size: 13px; }
.hello-side { color: #64748b; font-size: 13px; font-weight: 600; }

.dash-grid {
  display: grid;
  grid-template-columns: 1fr 1.15fr;
  gap: 16px;
  align-items: stretch;
}

.panel { padding: 18px 20px; display: flex; flex-direction: column; }
.panel h2 { margin: 0 0 10px; font-size: 0.95rem; }
.panel-head h2 { margin: 0; }
.panel-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.text-link {
  border: 0; background: transparent; color: #2563eb; font-weight: 700; font-size: 13px;
  padding: 0; text-decoration: none; cursor: pointer;
}

.overview {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 28px;
  min-height: 220px;
  padding: 8px 8px 8px 12px;
}
.donut {
  width: 176px; height: 176px; border-radius: 50%;
  display: grid; place-items: center; flex: 0 0 auto;
}
.donut > div {
  width: 112px; height: 112px; border-radius: 50%; background: #fff;
  display: grid; place-items: center; text-align: center;
}
.donut strong { font-size: 1.4rem; color: #0f2744; }
.donut span { font-size: 11px; color: #64748b; }
.legend { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; min-width: 160px; font-size: 14px; color: #334155; }
.legend li { display: flex; align-items: center; gap: 8px; }
.legend b { margin-left: auto; }
.swatch { width: 10px; height: 10px; border-radius: 99px; display: inline-block; }
.swatch.buildings { background: #3b82f6; }
.swatch.floors { background: #8b5cf6; }
.swatch.rooms { background: #22c55e; }
.swatch.destinations { background: #f59e0b; }

.actions {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr)) 56px;
  gap: 12px;
  align-items: stretch;
  flex: 1;
}

.tile, .round {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 108px;
  padding: 12px 8px;
  border-radius: 14px;
  text-decoration: none;
  text-align: center;
  font-size: 13px;
  font-weight: 700;
  color: #0f2744;
  background: #f8fafc;
  border: 1px solid #e6edf5;
}
.tile span {
  width: 28px; height: 28px; border-radius: 8px;
  display: grid; place-items: center; color: #fff; font-size: 16px;
}
.tile.blue { background: #dbeafe; border-color: #bfdbfe; }
.tile.green { background: #dcfce7; border-color: #86efac; }
.tile.purple { background: #ede9fe; border-color: #ddd6fe; }
.tile.amber { background: #fef3c7; border-color: #fde68a; }
.tile.blue span { background: #3b82f6; }
.tile.green span { background: #22c55e; }
.tile.purple span { background: #8b5cf6; }
.tile.amber span { background: #f59e0b; }
.round {
  width: 56px; height: 56px; min-width: 56px; min-height: 56px;
  align-self: center;
  border-radius: 999px; font-size: 18px; color: #64748b;
}

.activity { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.activity li { display: grid; grid-template-columns: 14px 1fr auto; gap: 12px; align-items: start; }
.activity strong { display: block; font-size: 13px; color: #0f2744; }
.activity p { margin: 0; color: #64748b; font-size: 12px; }
.activity time { color: #94a3b8; font-size: 12px; white-space: nowrap; padding-top: 1px; }

.dot { width: 10px; height: 10px; border-radius: 999px; margin-top: 5px; }
.dot.building { background: #2563eb; }
.dot.floor { background: #16a34a; }
.dot.room { background: #0ea5e9; }
.dot.role { background: #f59e0b; }

.map {
  position: relative;
  height: 240px;
  border-radius: 12px;
  overflow: hidden;
  background: #d9ecfb;
}

.map-art { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }

.map-note {
  position: absolute;
  left: 16px;
  bottom: 12px;
  margin: 0;
  color: #64748b;
  font-size: 13px;
}

.pin {
  position: absolute;
  z-index: 1;
  transform: translate(-50%, -100%);
  text-decoration: none;
}
.pin::before {
  content: "";
  display: block;
  width: 18px;
  height: 18px;
  margin: 0 auto;
  background: #2563eb;
  border: 2px solid #fff;
  border-radius: 50% 50% 50% 0;
  transform: rotate(-45deg);
  box-shadow: 0 2px 6px rgba(15, 39, 68, 0.25);
}
.pin span {
  display: block;
  margin-top: 6px;
  max-width: 140px;
  text-align: center;
  font-size: 12px;
  font-weight: 700;
  color: #0f2744;
}

@media (max-width: 1024px) {
  .stat-grid { grid-template-columns: 1fr 1fr; }
}

@media (max-width: 768px) {
  .hello { flex-direction: column; align-items: flex-start; gap: 4px; }
  .hello-side { white-space: nowrap; }
  .stat-grid,
  .dash-grid { grid-template-columns: 1fr; }
  .overview { flex-direction: column; align-items: center; min-height: 0; gap: 16px; padding: 0; }
  .legend { width: 100%; }
  .actions { grid-template-columns: 1fr 1fr; }
  .round { grid-column: 1 / -1; width: 56px; justify-self: center; }
  .map { height: 190px; }
  .activity li { grid-template-columns: 12px 1fr; }
  .activity time { grid-column: 2; }
}

@media (max-width: 640px) {
  .stat-grid { grid-template-columns: repeat(2,minmax(0,1fr)); gap: 8px; margin-bottom: 12px; }
  .stat-card { padding: 12px; gap: 10px; border-radius: 12px; min-width: 0; }
  .stat-card > div { min-width: 0; }
  .stat-card strong { font-size: 22px; }
  .stat-card > div span { font-size: 11px; overflow-wrap: anywhere; }
  .stat-card small { display: none; }
  .stat-card .stat-icon { width: 28px; height: 28px; border-radius: 8px; }
  .stat-card .stat-icon svg { width: 15px; height: 15px; }
  .hello { margin-bottom: 14px; }
  .hello h1 { font-size: 20px; }
  .hello p, .hello-side { font-size: 11px; line-height: 1.5; }
  .dash-grid { gap: 12px; }
  .panel { padding: 14px; border-radius: 12px; }
  .overview { flex-direction: row; flex-wrap: wrap; justify-content: center; gap: 14px; }
  .donut { width: 130px; height: 130px; flex-shrink: 0; }
  .legend { flex: 1 1 130px; min-width: 0; }
}
</style>
