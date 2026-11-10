<template>
  <section class="map-preview" :class="{ fullscreen, embedded: external }" aria-label="Satellite destination preview">
    <div class="map-heading"><strong>{{ showSchoolMap && schoolMap ? 'School campus map' : 'Destination preview' }}</strong><button :disabled="!mapReady && !(showSchoolMap && schoolMap)" @click="recenter">Recenter</button></div>
    <div v-if="showSchoolMap && schoolMap" ref="schoolContainer" class="school-map-canvas"><div class="school-map-frame" :style="{ width: `${schoolZoom * 100}%` }"><CampusMapCanvas :map="schoolMap" :route="walkingRoute?.source === 'campus' ? walkingRoute.coordinates : undefined" :nodes="schoolNodes" :user="schoolMapVerified && !fixStale ? fix : null" /></div></div>
    <div v-show="!showSchoolMap || !schoolMap" ref="container" class="map-canvas" aria-label="Satellite map with your location and building entrance" />
    <div class="map-status">
    <p v-if="!(showSchoolMap && schoolMap)" class="legend"><span class="user-dot">●</span> Your location <span class="entrance-dot">●</span> Building entrance</p>
    <p v-if="mapMessage && !(showSchoolMap && schoolMap)" role="status">{{ mapMessage }}</p>
    <p role="status">{{ locationMessage }}</p>
    <p v-if="!target">Entrance coordinates are not set. Ask the campus administrator to verify this entrance.</p>
    <p v-if="rawFix">Latest GPS accuracy: ±{{ Math.round(rawFix.accuracy) }} m.</p>
    <p v-if="fixStale" role="status">Last reliable location is stale. Waiting for fresh GPS; location pin is hidden.</p>
    <p v-if="fix">Last accepted GPS accuracy: ±{{ Math.round(fix.accuracy) }} m. The pin is an estimate.</p>
    <div class="map-actions"><template v-if="showSchoolMap && schoolMap"><button :disabled="schoolZoom >= 4" @click="schoolZoom = Math.min(4, schoolZoom + 0.5)">Zoom +</button><button :disabled="schoolZoom <= 1" @click="schoolZoom = Math.max(1, schoolZoom - 0.5)">Zoom -</button></template><button v-if="schoolMap" @click="showSchoolMap = !showSchoolMap">{{ showSchoolMap ? 'Satellite view' : 'School map' }}</button><button v-if="mapMessage" @click="retryMap">Retry map</button><button v-if="!external" @click="locate">Update my location</button></div>
    <p v-if="showSchoolMap && schoolMap && (!schoolMapVerified || walkingRoute?.source !== 'campus')" role="status">School reference image only. Switch to Satellite view for GPS and any available walking route.</p>
    <p v-else-if="fullscreen" role="status">{{ routeMessage }}</p>
    <p v-if="fullscreen && walkingRoute?.source !== 'campus'" class="route-credit">Walking routes: <a href="https://routing.openstreetmap.de/about.html" target="_blank" rel="noopener noreferrer">FOSSGIS / OpenStreetMap</a> · <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener noreferrer">Fix the map</a></p>
    <p class="map-note">Outdoor entrance preview. Indoor guidance starts after entrance confirmation.</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { loadOutdoorNetwork } from '@/services/route-package-cache';
import type { CampusMap } from '../../shared/campus-map';
import { gpsToImage } from '../../shared/campus-map';
import CampusMapCanvas from '../../shared/CampusMapCanvas.vue';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Geolocation } from '@capacitor/geolocation';
import { App } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
import type { Map as MapInstance, Marker, GeoJSONSource } from 'maplibre-gl';
import type { OutdoorTarget } from '@/models/navigation';
import { MAX_ACCEPTED_GPS_ACCURACY, type UserLocation } from '@/models/location';
import { checkPermission, requestPermission, toLocationError, toUserLocation } from '@/services/location.service';
import { calculateDistance, destinationPoint } from '@/services/geo.service';
import { fetchOutdoorRoute, type OutdoorWalkingRoute } from '@/services/outdoor-route.service';
import type { WalkingRoute } from '@/services/walking-route.service';
import { surveyedTarget } from '@/services/outdoor-navigation.service';
import 'maplibre-gl/dist/maplibre-gl.css';

const props = defineProps<{ entrance: OutdoorTarget; fullscreen?: boolean; external?: boolean; liveLocation?: UserLocation | null; rawLocation?: UserLocation | null; liveRoute?: OutdoorWalkingRoute | null }>();
const emit = defineEmits<{ location: [value: UserLocation | null]; route: [value: WalkingRoute | null] }>();
const showSchoolMap = ref(true);
const schoolZoom = ref(1);
const referenceMap = ref<CampusMap | null>(null);
const referenceVerified = ref(false);
const schoolMap = computed(() => walkingRoute.value?.referenceMap ?? referenceMap.value);
const schoolMapVerified = computed(() => !!walkingRoute.value?.referenceMap || referenceVerified.value);
const schoolNodes = computed(() => schoolMapVerified.value && target.value ? [{ ...target.value, id: 'entrance', entrance: true }] : []);
const schoolContainer = ref<HTMLDivElement>();
const walkingRoute = ref<OutdoorWalkingRoute | null>(null);
const routeMessage = ref('Waiting for GPS to find a walking route.');
let routeAbort: AbortController | undefined;
let lastRouteAt = 0;
let lastRouteStart: UserLocation | null = null;

function renderRoute() {
  if (!map || !mapReady.value) return;
  const data: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: walkingRoute.value ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: walkingRoute.value.coordinates } }] : [] };
  const source = map.getSource('walking-route') as GeoJSONSource | undefined;
  if (source) source.setData(data);
  else {
    map.addSource('walking-route', { type: 'geojson', data });
    map.addLayer({ id: 'walking-route-outline', type: 'line', source: 'walking-route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 9 } });
    map.addLayer({ id: 'walking-route-line', type: 'line', source: 'walking-route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#2563eb', 'line-width': 5 } });
  }
}

async function updateRoute() {
  if (props.external || !props.fullscreen || !target.value || !fix.value || fixStale.value) return;
  if (fix.value.accuracy > 20) { routeMessage.value = 'Waiting for more accurate GPS to plan a walking route.'; return; }
  const now = Date.now();
  if (lastRouteAt && now - lastRouteAt < 15000) return;
  if (walkingRoute.value && lastRouteStart && calculateDistance(lastRouteStart.latitude, lastRouteStart.longitude, fix.value.latitude, fix.value.longitude) < 30) return;
  lastRouteAt = now;
  routeAbort?.abort();
  const controller = new AbortController(); routeAbort = controller;
  const start = fix.value;
  walkingRoute.value = null; emit('route', null); renderRoute();
  routeMessage.value = 'Finding a walking route…';
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const result = await fetchOutdoorRoute(start, target.value, controller.signal);
    if (disposed || controller !== routeAbort || controller.signal.aborted) return;
    walkingRoute.value = result; lastRouteStart = start;
    emit('route', result); renderRoute(); recenter();
    routeMessage.value = result.source === 'campus' ? 'Campus walking route. Check access and crossings on site.' : 'OpenStreetMap walking route. Campus paths and access may be incomplete.';
  } catch {
    if (!disposed && controller === routeAbort) routeMessage.value = 'Walking route unavailable. Entrance proximity is a straight-line GPS estimate, not a walkable route. Check network coverage, entrance GPS, or try Update my location.';
  } finally { clearTimeout(timeout); }
}
const target = computed(() => surveyedTarget(props.entrance));
const container = ref<HTMLDivElement>();
const fix = ref<UserLocation | null>(null);
const rawFix = ref<UserLocation | null>(null);
const now = ref(Date.now());
const fixStale = computed(() => !!fix.value && (now.value-fix.value.timestamp > 15000 || fix.value.timestamp > now.value+5000));
let freshnessClock: ReturnType<typeof setInterval> | undefined;
function acceptLocation(next: UserLocation | null) {
  now.value=Date.now();
  rawFix.value=next;
  if (!next) { locationMessage.value='Waiting for GPS.'; return false; }
  if (!Number.isFinite(next.accuracy) || next.accuracy<0 || next.accuracy>MAX_ACCEPTED_GPS_ACCURACY) {
    locationMessage.value=`GPS accuracy is ±${Math.round(next.accuracy)} m. Waiting for a better location fix. Move to an open area and enable Precise Location.`;
    return false;
  }
  if (!Number.isFinite(next.timestamp) || now.value-next.timestamp>15000 || next.timestamp>now.value+5000) {
    locationMessage.value='GPS reading is stale. Waiting for a fresh location fix.';return false;
  }
  fix.value=next;return true;
}
const mapReady = ref(false);
const mapMessage = ref('');
const locationMessage = ref('Getting your location…');
let map: MapInstance | undefined;
let userMarker: Marker | undefined;
let library: typeof import('maplibre-gl') | undefined;
let watchId: string | undefined;
let generation = 0;
let disposed = false;
let fittedUser = false;
let appHandle: PluginListenerHandle | undefined;
let resize: ResizeObserver | undefined;

function recenter() {
  if (showSchoolMap.value && schoolMap.value && schoolContainer.value) {
    const canvas = schoolContainer.value;
    const point = fix.value && schoolMapVerified.value ? gpsToImage(schoolMap.value, fix.value) : null;
    canvas.scrollTo({ left: Math.max(0, (point?.x ?? 0.5) * canvas.scrollWidth - canvas.clientWidth / 2), top: Math.max(0, (point?.y ?? 0.5) * canvas.scrollHeight - canvas.clientHeight / 2) });
    return;
  }
  if (!map) return;
  const points: [number, number][] = [];
  if (target.value) points.push([target.value.longitude, target.value.latitude]);
  if (fix.value) points.push([fix.value.longitude, fix.value.latitude]);
  if (walkingRoute.value) points.push(...walkingRoute.value.coordinates);
  if (points.length === 1) map.jumpTo({ center: points[0], zoom: 17 });
  if (points.length >= 2) {
    const bounds: [[number, number], [number, number]] = [[Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1]))], [Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))]];
    map.fitBounds(bounds, { padding: props.fullscreen ? { top: 75, right: 55, bottom: 310, left: 55 } : 65, maxZoom: 18, duration: 0 });
  }
}

function renderLocation() {
  if (!map || !library || !fix.value) return;
  if (fixStale.value) {
    userMarker?.remove(); userMarker=undefined;
    const source=map.getSource('gps-accuracy') as GeoJSONSource | undefined;
    source?.setData({type:'FeatureCollection',features:[]});return;
  }
  const position: [number, number] = [fix.value.longitude, fix.value.latitude];
  if (!userMarker) {
    userMarker = new library.Marker({ color: '#2563eb' })
      .setPopup(new library.Popup().setText('Your estimated location'));
  }
  userMarker.setLngLat(position).addTo(map);
  if (mapReady.value) {
    const location = fix.value;
    const coordinates = Array.from({ length: 64 }, (_, index) => {
      const point = destinationPoint(location.latitude, location.longitude, index * 360 / 64, location.accuracy);
      return [point.longitude, point.latitude];
    });
    coordinates.push(coordinates[0]);
    const data: GeoJSON.Feature<GeoJSON.Polygon> = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [coordinates] } };
    const source = map.getSource('gps-accuracy') as GeoJSONSource | undefined;
    if (source) source.setData(data);
    else {
      map.addSource('gps-accuracy', { type: 'geojson', data });
      map.addLayer({ id: 'gps-accuracy', type: 'fill', source: 'gps-accuracy', paint: { 'fill-color': '#3b82f6', 'fill-opacity': 0.18 } });
    }
  }
  if (!fittedUser && fix.value.accuracy <= 50) { recenter(); fittedUser = true; }
}

async function stopLocation() {
  routeAbort?.abort(); routeAbort = undefined;
  generation += 1;
  const id = watchId;
  watchId = undefined;
  if (id) await Geolocation.clearWatch({ id }).catch(() => {});
}

async function locate() {
  await stopLocation();
  const session = generation;
  if (disposed) return;
  locationMessage.value = 'Getting your location…';
  try {
    let permission = await checkPermission();
    if (session !== generation || disposed) return;
    if (permission.state !== 'granted') permission = await requestPermission();
    if (session !== generation || disposed) return;
    if (permission.state !== 'granted') { locationMessage.value = 'Allow location permission to show your pin.'; return; }
    const id = await Geolocation.watchPosition({ enableHighAccuracy: true, timeout: 20000, maximumAge: 0, minimumUpdateInterval: 3000 }, (position, error) => {
      if (disposed || session !== generation) return;
      if (error) { locationMessage.value = toLocationError(error).message; return; }
      const next = toUserLocation(position);
      if (!acceptLocation(next) || !next) {
        routeAbort?.abort();
        walkingRoute.value=null;emit('route',null);emit('location',null);renderRoute();
        return;
      }
      emit('location', next);
      locationMessage.value = permission.precise ? 'Your location is updating.' : 'Approximate location only. Enable precise location for a better pin.';
      renderLocation();
      void updateRoute();
    });
    if (disposed || session !== generation) await Geolocation.clearWatch({ id }).catch(() => {});
    else watchId = id;
  } catch (error) {
    if (!disposed && session === generation) locationMessage.value = toLocationError(error).message;
  }
}

async function retryMap() {
  map?.remove(); map = undefined; userMarker = undefined; mapReady.value = false; fittedUser = false;
  const key = String(import.meta.env.VITE_MAPTILER_API_KEY ?? '').trim();
  if (!key) { mapMessage.value = 'Satellite map is not configured yet.'; return; }
  mapMessage.value = 'Loading satellite map…';
  try {
    const [module, worker] = await Promise.all([import('maplibre-gl'), import('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url')]);
    if (disposed || !container.value) return;
    library = module;
    module.setWorkerUrl(worker.default);
    const center: [number, number] = target.value ? [target.value.longitude, target.value.latitude] : fix.value ? [fix.value.longitude, fix.value.latitude] : [0, 0];
    map = new module.Map({ container: container.value, style: `https://api.maptiler.com/maps/hybrid-v4/style.json?key=${encodeURIComponent(key)}`, center, zoom: target.value || fix.value ? 17 : 1, attributionControl: { compact: false } });
    map.addControl(new module.NavigationControl({ showCompass: true }), 'top-right');
    map.addControl({
      onAdd() {
        const link = document.createElement('a');
        link.className = 'maplibregl-ctrl'; link.href = 'https://www.maptiler.com/';
        link.target = '_blank'; link.rel = 'noopener noreferrer';
        const logo = document.createElement('img');
        logo.src = 'https://api.maptiler.com/resources/logo.svg'; logo.alt = 'MapTiler'; logo.width = 90;
        link.append(logo); return link;
      },
      onRemove() {},
    }, 'bottom-left');
    if (target.value) new module.Marker({ color: '#e34935' }).setLngLat([target.value.longitude, target.value.latitude]).setPopup(new module.Popup().setText(props.entrance.name)).addTo(map);
    map.on('load', () => { mapReady.value = true; mapMessage.value = ''; renderLocation(); renderRoute(); });
    map.on('error', () => { mapMessage.value = 'Some map imagery could not load. Check your connection or map access, then retry.'; });
    renderLocation();
  } catch {
    mapMessage.value = 'Satellite map could not start on this device. You can still start navigation.';
  }
}

watch(() => props.liveLocation, location => {
  if (!props.external) return;
  if (!location) { fix.value=null;userMarker?.remove();userMarker=undefined; }
  if (!acceptLocation(location ?? null)) return;
  locationMessage.value = location ? 'Location shared with camera guidance.' : 'Waiting for GPS.';
  renderLocation();
}, { immediate: true });
watch(() => props.liveRoute, route => {
  if (!props.external) return;
  walkingRoute.value = route ?? null;
  routeMessage.value = route ? (route.source === 'campus' ? 'Campus walking route.' : 'OpenStreetMap walking route; verify access on site.') : 'No walking route is available.';
  renderRoute();
}, { immediate: true });

watch(() => props.rawLocation, location => {
  if (props.external && location) acceptRawWarning(location);
}, { immediate: true });
function acceptRawWarning(location:UserLocation) {
  rawFix.value=location;
  if(location.accuracy>MAX_ACCEPTED_GPS_ACCURACY){locationMessage.value=`GPS accuracy is ±${Math.round(location.accuracy)} m. Waiting for a better location fix. Move to an open area and enable Precise Location.`;return false;}
  return true;
}
let referenceAbort: AbortController | undefined;
async function loadReferenceMap() {
  const controller = new AbortController(); referenceAbort = controller;
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const graph = await loadOutdoorNetwork(controller.signal);
    if (!disposed && !controller.signal.aborted) { referenceMap.value = graph.referenceMap ?? null; referenceVerified.value = graph.verified; }
  } catch { /* Reference image is optional; route errors are reported by the route session. */ }
  finally { clearTimeout(timeout); }
}
watch(fixStale, stale => { if(stale){renderLocation();routeAbort?.abort();if(!props.external){emit('location',null);walkingRoute.value=null;emit('route',null);renderRoute();}} });
onMounted(() => {
  freshnessClock=setInterval(()=>{now.value=Date.now();},1000);
  void loadReferenceMap();
  void retryMap(); if (!props.external) void locate();
  resize = new ResizeObserver(() => map?.resize());
  if (container.value) resize.observe(container.value);
  if (!props.external) void App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) { fix.value = null; fittedUser = false; userMarker?.remove(); userMarker = undefined; void locate(); }
    else { void stopLocation(); locationMessage.value = 'Location paused while app is in the background.'; }
  }).then(handle => { if (disposed) void handle.remove(); else appHandle = handle; });
});
onBeforeUnmount(() => { clearInterval(freshnessClock);referenceAbort?.abort(); disposed = true; void stopLocation(); void appHandle?.remove(); resize?.disconnect(); map?.remove(); });
defineExpose({ stopLocation });
</script>

<style scoped>
.map-preview { margin: 10px 12px; border-radius: 18px; overflow: hidden; background: white; color: #24435e; box-shadow: 0 8px 24px #102e5210; }
.map-heading { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; }
button { border-radius: 9px; padding: 9px 12px; background: #e8f1fb; color: #1d4ed8; font-weight: 600; }
button:disabled { opacity: .5; }
.school-map-canvas { overflow:auto; min-height:200px; background:#e8eff7; }
.school-map-frame { min-width:100%; }
.map-actions { flex-wrap:wrap; }
.fullscreen .school-map-canvas { flex:1; }
.map-canvas { height: clamp(250px, 38dvh, 420px); width: 100%; background: #dce5ed; }
p { margin: 8px 12px; font-size: 12px; line-height: 1.4; }
.legend { display: flex; align-items: center; gap: 7px; }
.user-dot { color: #2563eb; }.entrance-dot { color: #e34935; margin-left: 9px; }
.map-actions { display: flex; gap: 8px; padding: 0 12px; }
.map-note { padding-bottom: 10px; color: #60788e; }
.map-canvas :deep(.maplibregl-ctrl-attrib) { font-size: 9px; }
.fullscreen { margin: 0; height: 100%; border-radius: 0; display: flex; flex-direction: column; }
.fullscreen { position: relative; }
.fullscreen .map-heading { position: absolute; top: 10px; left: 12px; right: 52px; z-index: 2; border-radius: 12px; background: #fffffff2; box-shadow: 0 3px 14px #12263f26; }
.fullscreen .map-status { position: absolute; bottom: var(--preview-panel-height, 190px); left: 10px; right: 10px; z-index: 2; padding: 7px 0; border-radius: 12px; background: #fffffff2; max-height: 30%; overflow: auto; }
.route-credit { font-size: 10px; }
.fullscreen .map-canvas { flex: 1; min-height: 180px; height: auto; }
.fullscreen p { margin: 3px 12px; font-size: 11px; }
.fullscreen .map-note { display: none; }
.fullscreen .map-heading { padding: 6px 12px; }
.fullscreen .map-actions { padding: 3px 12px; }
.fullscreen.embedded { min-height:0; overflow:hidden; }
.fullscreen.embedded .map-status { position:relative;left:auto;right:auto;bottom:auto;flex:0 0 auto;max-height:38%;overflow-y:auto;border-radius:0; }
.fullscreen.embedded .map-heading { position:relative;top:auto;left:auto;right:auto;flex:0 0 auto; }
.fullscreen.embedded .map-canvas,.fullscreen.embedded .school-map-canvas { min-height:120px; }
</style>
