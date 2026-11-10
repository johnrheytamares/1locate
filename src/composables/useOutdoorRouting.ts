import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';
import type { OutdoorState } from '@/services/outdoor-navigation.service';
import { fetchOutdoorRoute, type OutdoorWalkingRoute } from '@/services/outdoor-route.service';
import { outdoorRouteProgress, type RouteProgress } from '@/services/outdoor-progress.service';
import { headingOffset } from '@/services/navigation.service';

/** One cancellable route session shared by the camera and map. No requests per compass update. */
export function useOutdoorRouting(state: Ref<OutdoorState>, active: Ref<boolean>, heading: Ref<number | null>, headingUpdatedAt?: Ref<number>) {
  const route = ref<OutdoorWalkingRoute | null>(null);
  const progress = ref<RouteProgress | null>(null);
  const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const error = ref('');
  const now = ref(Date.now());
  const headingAt = headingUpdatedAt ?? ref(0);
  let clock: ReturnType<typeof setInterval> | undefined;
  let controller: AbortController | null = null;
  let lastRequest = -Infinity, lastFix = -Infinity, outside = 0, lastOutsideAt = -Infinity;
  let targetKey = '';
  onMounted(() => { clock = setInterval(() => { now.value = Date.now(); }, 1000); });
  watch(heading, value => { if (!headingUpdatedAt && value != null && Number.isFinite(value)) headingAt.value = Date.now(); }, { immediate: true });
  const gpsUsable = computed(() => {
    const fix = state.value.location, raw = state.value.raw ?? fix;
    return active.value && !!fix && !!raw && Number.isFinite(raw.accuracy) && raw.accuracy >= 0
      && raw.accuracy <= 20 && fix.accuracy <= 20 && !state.value.lastRejectReason
      && now.value - fix.timestamp <= 15000 && fix.timestamp <= now.value + 5000;
  });
  const headingUsable = computed(() => heading.value != null && Number.isFinite(heading.value) && now.value - headingAt.value <= 15000);
  const onPath = computed(() => progress.value != null && progress.value.offPath <= Math.max(12, state.value.location?.accuracy ?? 0));
  const canGuide = computed(() => gpsUsable.value && headingUsable.value && onPath.value && status.value === 'ready' && (progress.value?.remaining ?? 0) > 3);
  const offset = computed(() => canGuide.value ? headingOffset(heading.value, progress.value!.bearing) : null);
  const direction = computed<'left' | 'right' | 'straight'>(() => offset.value != null && Math.abs(offset.value) > 25 ? (offset.value > 0 ? 'right' : 'left') : 'straight');
  const message = computed(() => {
    if (!active.value) return 'Outdoor guidance paused.';
    if (!gpsUsable.value) return 'Waiting for a fresh GPS fix with accuracy within 20 m. Follow the map and check your surroundings.';
    if (status.value === 'loading') return route.value ? 'Recalculating the walking route…' : 'Finding a walking route…';
    if (status.value === 'error') return error.value;
    if (!route.value || !progress.value) return 'Walking route unavailable. Retry routing or use the map.';
    if (!onPath.value) return 'You appear away from the mapped walkway. Checking GPS before rerouting.';
    if (progress.value.remaining <= 3) return 'Mapped path ends here. Check the entrance sign and confirm when you are there.';
    if (!headingUsable.value) return 'Phone direction is unavailable or stale. Use the highlighted map path; arrows are paused.';
    if (direction.value !== 'straight') return `Turn ${direction.value} to face the walking path`;
    const nextTurn = route.value.instructions?.find(turn => turn.index > progress.value!.segment && turn.direction !== 'straight');
    return nextTurn ? `Follow the walking path. At the marked checkpoint, turn ${nextTurn.direction}.` : 'Follow the walking path toward the entrance';
  });
  async function plan(force = false) {
    now.value = Date.now();
    if (!gpsUsable.value || !state.value.target || state.value.arrived || controller) return;
    if (!force && Date.now() - lastRequest < 20000) return;
    lastRequest = Date.now();
    const request = new AbortController(); controller = request;
    status.value = 'loading'; error.value = '';
    const target = state.value.target, start = state.value.location!;
    const timeout = setTimeout(() => request.abort(), 12000);
    try {
      const result = await fetchOutdoorRoute(start, target, request.signal);
      if (request !== controller || request.signal.aborted || !active.value) return;
      route.value = result;
      progress.value = outdoorRouteProgress(result, state.value.location!);
      outside = 0; status.value = 'ready';
    } catch (reason) {
      if (controller === request && active.value) {
        status.value = 'error'; route.value = null; progress.value = null;
        error.value = reason instanceof Error && reason.name !== 'AbortError' ? reason.message : 'Walking route request timed out. Retry routing.';
      }
    } finally {
      clearTimeout(timeout);
      if (controller === request) controller = null;
    }
  }
  function cancel() { controller?.abort(); controller = null; }
  watch([active, () => state.value.target], () => {
    const key = state.value.target ? `${state.value.target.networkId || ''}:${state.value.target.endpointId || ''}:${state.value.target.latitude},${state.value.target.longitude}` : '';
    if (!active.value || key !== targetKey) {
      cancel(); route.value = null; progress.value = null; status.value = 'idle';
      outside = 0; lastFix = -Infinity; lastRequest = -Infinity; targetKey = key;
    }
    if (active.value) void plan();
  }, { immediate: true });
  watch(() => state.value.location, fix => {
    now.value = Date.now();
    if (!active.value || !fix || !gpsUsable.value || fix.timestamp === lastFix) return;
    lastFix = fix.timestamp;
    if (!route.value) { void plan(); return; }
    progress.value = outdoorRouteProgress(route.value, fix, progress.value?.along ?? 0);
    if (progress.value.offPath > Math.max(25, fix.accuracy * 2)) {
      if (fix.timestamp - lastOutsideAt >= 2000) { outside++; lastOutsideAt = fix.timestamp; }
      if (outside >= 3) void plan();
    } else { outside = 0; lastOutsideAt = -Infinity; }
  });
  onBeforeUnmount(() => { cancel(); if (clock) clearInterval(clock); });
  return { route, progress, status, message, canGuide, offset, direction, retry: () => plan(true) };
}
