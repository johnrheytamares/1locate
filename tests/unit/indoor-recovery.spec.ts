import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { TURN_ALIGNMENT_HOLD_MS, type NavigationSnapshot } from '@/models/navigation';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  heading: null as null | ((value: number) => void),
  gps: null as null | { state: { value: Record<string, unknown> } },
  speak: vi.fn(),
  stopSpeech: vi.fn(),
  devTools: true,
  gpsSource: 'simulated' as 'simulated' | 'real',
}));

vi.mock('@/components/DestinationMapPreview.vue', () => ({ default: { template: '<div>Outdoor map reference</div>' } }));

vi.mock('@/config/dev-tools', () => ({
  get SHOW_DEV_TOOLS() {
    return mocks.devTools;
  },
}));

vi.mock('@/services/tts.service', () => ({
  createTtsSpeaker: () => ({ speak: mocks.speak, stop: mocks.stopSpeech }),
}));

vi.mock('@ionic/vue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ionic/vue')>();
  const { onBeforeUnmount, onMounted } = await import('vue');
  return {
    ...actual,
    useIonRouter: () => ({ replace: mocks.replace, push: vi.fn(), back: vi.fn(), navigate: vi.fn(), canGoBack: () => false }),
    onIonViewDidEnter: (callback: () => void) => onMounted(callback),
    onIonViewWillLeave: (callback: () => void) => onBeforeUnmount(callback),
  };
});

vi.mock('@capacitor/app', () => ({
  App: { addListener: vi.fn(() => Promise.resolve({ remove: vi.fn() })) },
}));

vi.mock('@/services/camera.service', () => ({
  startRearPreview: vi.fn(() => Promise.resolve()),
  stopRearPreview: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/services/orientation.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/orientation.service')>()),
  watchHeading: (callback: (value: number) => void) => {
    mocks.heading = callback;
    return () => {};
  },
}));

vi.mock('@/composables/useOutdoorGps', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/composables/useOutdoorGps')>();
  const { ref } = await import('vue');
  const { createOutdoorState } = await import('@/services/outdoor-navigation.service');
  return {
    ...actual,
    useOutdoorGps: () => {
      const gps = {
        source: ref(mocks.gpsSource),
        status: ref('tracking'),
        message: ref(''),
        precise: ref(true),
        state: ref(createOutdoorState(null)),
        simulatedAccuracy: ref(5),
        start: vi.fn(),
        resume: vi.fn(),
        pause: vi.fn(),
        stop: vi.fn(),
        reset: vi.fn(),
        allowLocation: vi.fn(),
        setSource: vi.fn(),
        placeTestTarget: vi.fn(),
        simulateWalk: vi.fn(),
        toggleSimulatedAccuracy: vi.fn(),
        hasSurveyedTarget: () => false,
      };
      mocks.gps = gps as unknown as { state: { value: Record<string, unknown> } };
      return gps;
    },
  };
});

const { IonAlert } = await import('@ionic/vue');
const { default: ARNavigationPage } = await import('@/views/ARNavigationPage.vue');
const {
  CALIBRATION_INSTRUCTION,
  PAUSED_INSTRUCTION,
  advanceInstruction,
  clearSelectedDestination,
  completeCurrentTurn,
  currentStepIndex,
  getSelectedDestination,
  guideArrows,
  jumpToRightTurn,
  loadSelectedRoute,
  moveForward,
  navigationInstruction,
  pauseNavigation,
  restartFromEntrance,
  resumeNavigation,
  selectDestination,
  setForwardHeading,
  updateRouteProgress,
} = await import('@/services/navigation.service');

/** Registrar route (3 m straight, 2 m right, 2 m straight), calibrated and 2 m in. */
function walkedRoute(): NavigationSnapshot {
  selectDestination('registrar');
  const route = loadSelectedRoute();
  if (!route) throw new Error('registrar route missing');
  return updateRouteProgress(setForwardHeading(route, 90), 2);
}

afterEach(() => {
  clearSelectedDestination();
  vi.clearAllMocks();
  mocks.devTools = true;
  mocks.gpsSource = 'simulated';
});

describe('indoor route progress', () => {
  test('does not move before Set Forward', () => {
    selectDestination('registrar');
    const route = loadSelectedRoute()!;
    expect(updateRouteProgress(route, 2).walkedMeters).toBe(0);
    expect(advanceInstruction(route).walkedMeters).toBe(0);
    expect(navigationInstruction(route, 0)).toBe('Turn right ahead');
  });
});

describe('"I lost my way"', () => {
  test('pauses indoor progress without moving the user on the route', () => {
    const walked = walkedRoute();
    const paused = pauseNavigation(walked);

    expect(paused.paused).toBe(true);
    expect(paused.walkedMeters).toBe(2);
    expect(currentStepIndex(paused)).toBe(currentStepIndex(walked));
    expect(navigationInstruction(paused, 90)).toBe(PAUSED_INSTRUCTION);
    expect(guideArrows(paused)).toEqual([]);

    expect(updateRouteProgress(paused, 5)).toBe(paused);
    expect(moveForward(paused, 1)).toBe(paused);
    expect(advanceInstruction(paused)).toBe(paused);
    expect(jumpToRightTurn(paused)).toBe(paused);
    expect(completeCurrentTurn(paused)).toBe(paused);
    expect(setForwardHeading(paused, 200)).toBe(paused);
  });

  test('does nothing after arrival', () => {
    const arrived = updateRouteProgress(completeCurrentTurn(updateRouteProgress(walkedRoute(), 10)), 10);
    expect(navigationInstruction(arrived)).toBe('Route distance complete. Look for the Registrar Office sign.');
    expect(pauseNavigation(arrived).paused).toBe(false);
  });

  test('resuming keeps the route position and calibration', () => {
    const walked = walkedRoute();
    const resumed = resumeNavigation(pauseNavigation(walked));

    expect(resumed.paused).toBe(false);
    expect(resumed.walkedMeters).toBe(walked.walkedMeters);
    expect(resumed.forwardHeading).toBe(walked.forwardHeading);
    expect(navigationInstruction(resumed, 90)).toBe(navigationInstruction(walked, 90));
    expect(updateRouteProgress(resumed, 1).walkedMeters).toBe(3);
  });

  test('restarting needs entrance confirmation, then resets progress and Set Forward', () => {
    const paused = pauseNavigation(walkedRoute());

    expect(restartFromEntrance(paused, false)).toBe(paused);

    const restarted = restartFromEntrance(paused, true);
    expect(restarted.walkedMeters).toBe(0);
    expect(restarted.forwardHeading).toBeNull();
    expect(restarted.paused).toBe(false);
    expect(restarted.destinationId).toBe('registrar');
    expect(navigationInstruction(restarted, 90)).toBe('Turn right ahead');
    expect(updateRouteProgress(restarted, 2).walkedMeters).toBe(0);
    expect(updateRouteProgress(setForwardHeading(restarted, 10), 2).walkedMeters).toBe(2);
  });

  test('changing destinations clears the previous navigation state', () => {
    pauseNavigation(walkedRoute());
    clearSelectedDestination();
    expect(getSelectedDestination()).toBeNull();
    expect(loadSelectedRoute()).toBeNull();

    selectDestination('library');
    const next = loadSelectedRoute()!;
    expect(next.destinationId).toBe('library');
    expect(next.walkedMeters).toBe(0);
    expect(next.forwardHeading).toBeNull();
    expect(next.paused).toBe(false);
  });
});

describe('Camera Navigation recovery screen', () => {
  let wrapper: VueWrapper | null = null;

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
  });

  const instruction = () => wrapper!.find('.journey-instruction strong').text();
  const distance = () => wrapper!.find('[data-test="journey-distance"]').text();
  const button = (label: string) => {
    const found = wrapper!.findAll('ion-button').find((item) => item.text().trim() === label);
    if (!found) throw new Error(`button "${label}" not found`);
    return found;
  };

  async function reachEntrance() {
    selectDestination('registrar');
    wrapper = mount(ARNavigationPage, { global: { stubs: { IonBackButton: true, NavigationOverlay: true } } });
    await flushPromises();
    mocks.heading?.(90);
    mocks.gps!.state.value = { ...mocks.gps!.state.value, arrived: true };
    await flushPromises();
  }

  async function dismissEntrance(role: string) {
    const entrance = wrapper!.findAllComponents(IonAlert)[0];
    entrance.vm.$emit('didDismiss', new CustomEvent('ionAlertDidDismiss', { detail: { role } }));
    await flushPromises();
  }

  async function startIndoor() {
    await reachEntrance();
    await dismissEntrance('confirm');
    await button('Move Forward').trigger('click');
    await button('Move Forward').trigger('click');
  }

  test('the indoor route starts only after the user confirms the entrance', async () => {
    await reachEntrance();
    const alert = wrapper!.findAllComponents(IonAlert)[0];
    expect(alert.props('isOpen')).toBe(true);
    expect(alert.props('header')).toBe('Are you at Administration Building Entrance?');
    expect(alert.props('message')).toContain('cannot tell where you are inside');
    expect(wrapper!.find('[data-test="lost-way"]').exists()).toBe(false);

    await dismissEntrance('confirm');
    expect(instruction()).toBe('Turn right ahead');
    expect(wrapper!.find('[data-test="set-forward"]').exists()).toBe(false);
  });

  test('"I lost my way" pauses progress and explains the limitation', async () => {
    await startIndoor();
    expect(distance()).toContain('5 m');

    await wrapper!.find('[data-test="lost-way"]').trigger('click');
    expect(instruction()).toBe(PAUSED_INSTRUCTION);
    expect(wrapper!.find('[data-test="recovery"]').text()).toContain('cannot tell where you are inside the building');

    expect((wrapper!.find('[data-test="move-forward"]').element as unknown as { disabled: boolean }).disabled).not.toBe(true);
    await button('Next Step').trigger('click');
    expect(distance()).toContain('5 m');
  });

  test('Resume guidance continues from the same position', async () => {
    await startIndoor();
    await wrapper!.find('[data-test="lost-way"]').trigger('click');
    await wrapper!.find('[data-test="resume"]').trigger('click');

    expect(wrapper!.find('[data-test="recovery"]').exists()).toBe(false);
    expect(distance()).toContain('5 m');
    expect(instruction()).not.toBe(CALIBRATION_INSTRUCTION);
    await button('Move Forward').trigger('click');
    expect(distance()).toContain('4 m');
  });

  test('Restart from entrance needs confirmation, then resets progress and Set Forward', async () => {
    await startIndoor();
    await wrapper!.find('[data-test="lost-way"]').trigger('click');
    await wrapper!.find('[data-test="restart"]').trigger('click');
    expect(wrapper!.find('[data-test="restart-confirm"]').text()).toContain('Go back to Administration Building Entrance');

    await wrapper!.find('[data-test="cancel-restart"]').trigger('click');
    expect(wrapper!.find('[data-test="recovery"]').exists()).toBe(true);
    expect(distance()).toContain('5 m');

    await wrapper!.find('[data-test="restart"]').trigger('click');
    await wrapper!.find('[data-test="confirm-entrance"]').trigger('click');
    expect(distance()).toContain('7 m');
    expect(instruction()).toBe('Turn right ahead');
    await button('Move Forward').trigger('click');
    expect(distance()).toContain('6 m');
  });

  test('Choose another destination clears the selection and returns to the list', async () => {
    await startIndoor();
    await wrapper!.find('[data-test="lost-way"]').trigger('click');
    await wrapper!.find('[data-test="choose-another"]').trigger('click');

    expect(getSelectedDestination()).toBeNull();
    expect(mocks.replace).toHaveBeenCalledWith('/destinations');
  });

  test('declining the entrance prompt returns to the destination list', async () => {
    await reachEntrance();
    await dismissEntrance('cancel');
    expect(getSelectedDestination()).toBeNull();
    expect(mocks.replace).toHaveBeenCalledWith('/destinations');
  });
});

describe('Camera Navigation distance', () => {
  let wrapper: VueWrapper | null = null;

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
  });

  test('outdoors shows the rounded GPS distance to the entrance; indoors the remaining route', async () => {
    selectDestination('registrar');
    wrapper = mount(ARNavigationPage, { global: { stubs: { IonBackButton: true, NavigationOverlay: true } } });
    await flushPromises();
    mocks.gps!.state.value = {
      ...mocks.gps!.state.value,
      target: { name: 'Main Entrance', latitude: 80, longitude: 78, arrivalRadius: 10, source: 'surveyed' },
      location: { latitude: 13.41, longitude: 121.18, accuracy: 5, speed: null, timestamp: 1000 },
      distance: 7_721_222.6,
      bearing: 350,
    };
    await flushPromises();

    expect(wrapper.find('.journey-identity').text()).toContain('Building entrance');
    expect(wrapper.find('.journey-identity h2').text()).toBe('Main Entrance');
    expect(wrapper.find('[data-test="journey-distance"]').text()).toBe('Straight-line to entrance: 7721223 m');

    mocks.gps!.state.value = { ...mocks.gps!.state.value, arrived: true };
    await flushPromises();
    wrapper.findAllComponents(IonAlert)[0].vm.$emit(
      'didDismiss',
      new CustomEvent('ionAlertDidDismiss', { detail: { role: 'confirm' } }),
    );
    await flushPromises();
    expect(wrapper.find('[data-test="journey-distance"]').text()).toBe('Est. remaining: 7 m');
  });

  async function enterIndoorDev() {
    selectDestination('registrar');
    wrapper = mount(ARNavigationPage, { global: { stubs: { IonBackButton: true, NavigationOverlay: true } } });
    await flushPromises();
    mocks.heading?.(90);
    mocks.gps!.state.value = { ...mocks.gps!.state.value, arrived: true };
    await flushPromises();
    wrapper.findAllComponents(IonAlert)[0].vm.$emit(
      'didDismiss',
      new CustomEvent('ionAlertDidDismiss', { detail: { role: 'confirm' } }),
    );
    await flushPromises();
  }
  const moveForwardButton = () => wrapper!.find('[data-test="move-forward"]');
  const distance = () => wrapper!.find('[data-test="journey-distance"]').text();

  test('rotating the phone does not confirm an indoor junction; explicit turn confirmation preserves remaining distance', async () => {
    await enterIndoorDev();
    for (let index = 0; index < 3; index += 1) await moveForwardButton().trigger('click');
    expect(distance()).toBe('Est. remaining: 4 m');

    mocks.heading?.(180);
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, TURN_ALIGNMENT_HOLD_MS + 100));
    await flushPromises();
    expect(wrapper!.find('.journey-instruction strong').text()).toBe('Turn right ahead');
    await moveForwardButton().trigger('click');
    expect(distance()).toBe('Est. remaining: 4 m');
    const turn=wrapper!.findAll('ion-button').find(b=>b.text().trim()==='I completed the turn');
    expect(turn).toBeDefined();await turn!.trigger('click');
    expect(wrapper!.find('.journey-instruction strong').text()).toBe('Continue straight');
    expect(distance()).toBe('Est. remaining: 4 m');

    mocks.heading?.(90);
    await flushPromises();
    mocks.heading?.(180);
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, TURN_ALIGNMENT_HOLD_MS + 100));
    expect(distance()).toBe('Est. remaining: 4 m');

    await moveForwardButton().trigger('click');
    expect(distance()).toBe('Est. remaining: 3 m');
  });

  test('the estimated arrival alert does not claim the user is at the room', async () => {
    await enterIndoorDev();
    for (let index = 0; index < 3; index += 1) await moveForwardButton().trigger('click');
    mocks.heading?.(180);
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, TURN_ALIGNMENT_HOLD_MS + 100));
    await wrapper!.findAll('ion-button').find(b=>b.text().trim()==='I completed the turn')!.trigger('click');
    for (let index = 0; index < 4; index += 1) await moveForwardButton().trigger('click');
    await flushPromises();
    expect(wrapper!.findAllComponents(IonAlert).some(alert=>alert.props('isOpen')&&alert.props('header')==='TEST route complete')).toBe(false);
    await wrapper!.find('.route-complete ion-button').trigger('click');await flushPromises();
    const arrival = wrapper!.findAllComponents(IonAlert).find((alert) => alert.props('isOpen') && alert.props('header') === 'TEST route complete');
    expect(arrival).toBeDefined();
    expect(arrival!.props('message')).toContain('cannot confirm you are at the room');
    expect(arrival!.props('message')).not.toMatch(/you have reached/i);
    arrival!.vm.$emit('didDismiss', new CustomEvent('ionAlertDidDismiss', { detail: { role: 'confirm' } }));
    await flushPromises();
    expect(mocks.replace).toHaveBeenCalledWith('/destinations');
    const { getArrival } = await import('@/services/journey.service');
    expect(getArrival()).toBeNull();
  });

  test('the feedback popup appears once, only after the arrival message is dismissed', async () => {
    const { beginJourney } = await import('@/services/journey.service');
    beginJourney('registrar');
    mocks.gpsSource = 'real';
    await enterIndoorDev();
    const feedback = () => wrapper!.find('[data-test="arrival-feedback"]');
    expect(feedback().exists()).toBe(false);
    // Physical checkpoint confirmations are real progress; debug buttons mark a test journey.
    for (let index = 0; index < 3; index += 1) {
      const button = wrapper!.findAll('ion-button').find(item => item.text().trim() === 'Confirm checkpoint');
      expect(button).toBeDefined();
      await button!.trigger('click');
      const checkpoint = wrapper!.findAllComponents(IonAlert).find(alert => alert.props('header') === 'Confirm physical checkpoint');
      checkpoint!.vm.$emit('didDismiss', new CustomEvent('ionAlertDidDismiss', { detail: { role: 'confirm' } }));
      await flushPromises();
    }

    expect(feedback().exists()).toBe(false);
    expect(wrapper!.find('.route-complete').exists()).toBe(true);
    await wrapper!.find('.route-complete ion-button').trigger('click');await flushPromises();
    const arrival = wrapper!.findAllComponents(IonAlert).find((alert) => alert.props('isOpen') && alert.props('header') === 'Confirm destination')!;
    expect(arrival).toBeDefined();
    arrival.vm.$emit('didDismiss', new CustomEvent('ionAlertDidDismiss', { detail: { role: 'confirm' } }));
    await flushPromises();
    expect(feedback().exists()).toBe(true);
    expect(mocks.replace).not.toHaveBeenCalledWith('/destinations');

    await wrapper!.find('[data-test="maybe-later"]').trigger('click');
    await flushPromises();
    expect(feedback().exists()).toBe(false);
    expect(mocks.replace).toHaveBeenCalledWith('/arrival');

    arrival.vm.$emit('didDismiss', new CustomEvent('ionAlertDidDismiss', { detail: { role: 'confirm' } }));
    await flushPromises();
    expect(feedback().exists()).toBe(false);
  });

  test('no feedback popup while still navigating or after leaving early', async () => {
    await enterIndoorDev();
    for (let index = 0; index < 3; index += 1) await moveForwardButton().trigger('click');
    await flushPromises();
    expect(wrapper!.find('[data-test="arrival-feedback"]').exists()).toBe(false);
  });

  test('the debug panel shows walking diagnostics from motion samples during development', async () => {
    vi.stubGlobal('DeviceMotionEvent', class {});
    await enterIndoorDev();
    const panel = () => wrapper!.find('[data-test="walking-diagnostics"]').text();
    expect(panel()).toContain('Step Length: 0.70 m (default)');
    expect(panel()).toContain('Walking Blocked: no');
    expect(panel()).toContain('Arrival Trigger: estimated walked ≥ route length (not met)');

    const sample = (x: number) => {
      const event = new Event('devicemotion');
      Object.defineProperty(event, 'acceleration', { value: { x, y: 0, z: 0 } });
      Object.defineProperty(event, 'rotationRate', { value: { alpha: 5, beta: 10, gamma: 15 } });
      window.dispatchEvent(event);
    };
    const clock = vi.spyOn(performance, 'now');
    for (let step = 0; step < 4; step += 1) {
      clock.mockReturnValue(10_000 + step * 500); sample(0);clock.mockReturnValue(10_000 + step * 500+20); sample(2);
      clock.mockReturnValue(10_000 + step * 500 + 100); sample(0);
    }
    clock.mockRestore();
    await flushPromises();
    expect(panel()).toContain('Motion: listening · linear');
    expect(panel()).toContain('Rotation α/β/γ: 5, 10, 15 °/s');
    expect(panel()).toContain('Steps: 4 candidate · 4 accepted');
    expect(panel()).toContain('Walked: 2.80 m of 7 m');
    expect(distance()).toBe('Est. remaining: 4.2 m');

    mocks.heading?.(200);
    await flushPromises();
    expect(panel()).toContain('Walking Blocked: no');
    vi.unstubAllGlobals();
  });
});

describe('Camera Navigation in a release build', () => {
  let wrapper: VueWrapper | null = null;

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
  });

  async function mountRelease(gpsSource: 'simulated' | 'real' = 'real') {
    mocks.devTools = false;
    mocks.gpsSource = gpsSource;
    selectDestination('registrar');
    wrapper = mount(ARNavigationPage, { global: { stubs: { IonBackButton: true, NavigationOverlay: true } } });
    await flushPromises();
    mocks.heading?.(90);
    await flushPromises();
  }

  const texts = () => wrapper!.findAll('ion-button').map((item) => item.text().trim());

  test('hides the debug readout and simulated GPS controls', async () => {
    await mountRelease();
    expect(wrapper!.find('[data-test="debug"]').exists()).toBe(false);
    expect(wrapper!.text()).not.toContain('Debug');
    expect(texts()).not.toContain('Use Simulated GPS');
    expect(texts()).not.toContain('Place Test Target');
  });

  test('an entrance without surveyed GPS is confirmed by the user, never assumed', async () => {
    await mountRelease();
    expect(wrapper!.find('.wait-title').text()).toBe('Entrance location not set');
    expect(wrapper!.find('.wait-sub').text()).toContain('Walk to Administration Building Entrance');
    expect(wrapper!.find('[data-test="lost-way"]').exists()).toBe(false);

    await wrapper!.find('[data-test="at-entrance"]').trigger('click');
    await flushPromises();
    const alert = wrapper!.findAllComponents(IonAlert)[0];
    expect(alert.props('isOpen')).toBe(true);
    expect(alert.props('message')).toContain('cannot check this with GPS');
    expect(alert.props('message')).not.toContain('GPS shows you near');
    expect(wrapper!.find('[data-test="set-forward"]').exists()).toBe(false);

    alert.vm.$emit('didDismiss', new CustomEvent('ionAlertDidDismiss', { detail: { role: 'confirm' } }));
    await flushPromises();
    expect(wrapper!.find('[data-test="set-forward"]').exists()).toBe(false);
    expect(wrapper!.find('[data-test="lost-way"]').exists()).toBe(true);
  });

  test('camera denial keeps preparation incomplete and offers a map fallback', async () => {
    const { startRearPreview } = await import('@/services/camera.service');
    vi.mocked(startRearPreview).mockRejectedValueOnce(new Error('Camera permission was denied.'));
    await mountRelease();
    expect(wrapper!.text()).toContain('Preparing AR Navigation');
    expect(wrapper!.text()).toContain('Camera permission was denied.');
    expect(wrapper!.text()).not.toContain('Camera enabled');
    const fallback = wrapper!.findAll('ion-button').find(button => button.text() === 'Use Map Navigation');
    expect(fallback).toBeDefined();
    await fallback!.trigger('click'); await flushPromises();
    expect(wrapper!.find('.preparation').exists()).toBe(false);
    expect(wrapper!.text()).toContain('Outdoor map reference');
  });

  test('starts walking automatically and keeps only guide controls in release', async () => {
    vi.stubGlobal('DeviceMotionEvent', class {});
    await mountRelease();
    const { startRearPreview } = await import('@/services/camera.service');
    expect(startRearPreview).toHaveBeenCalled();
    await wrapper!.find('[data-test="at-entrance"]').trigger('click');
    await flushPromises();
    expect(startRearPreview).toHaveBeenCalled();
    wrapper!.findAllComponents(IonAlert)[0].vm.$emit(
      'didDismiss', new CustomEvent('ionAlertDidDismiss', { detail: { role: 'confirm' } }),
    );
    await flushPromises();
    expect(startRearPreview).toHaveBeenCalled();
    expect(wrapper!.find('[data-test="set-forward"]').exists()).toBe(false);
    expect(wrapper!.find('[data-test="move-forward"]').exists()).toBe(false);
    expect(wrapper!.find('.walking-calibration').exists()).toBe(false);
    expect(wrapper!.find('.instruction-banner').exists()).toBe(false);
    expect(texts()).not.toContain('Enable automatic walking');
    const sample = (x: number) => {
      const event = new Event('devicemotion');
      Object.defineProperty(event, 'acceleration', { value: { x, y: 0, z: 0 } });
      window.dispatchEvent(event);
    };
    const clock = vi.spyOn(performance, 'now');
    for (let step = 0; step < 4; step += 1) {
      clock.mockReturnValue(step * 500); sample(0);clock.mockReturnValue(step * 500+20); sample(2);
      clock.mockReturnValue(step * 500 + 100); sample(0);
    }
    clock.mockRestore();
    await flushPromises();
    expect(wrapper!.find('[data-test="journey-distance"]').text()).toBe('Est. remaining: 4.2 m');
    expect(wrapper!.find('[data-test="walking-diagnostics"]').exists()).toBe(false);
    expect(wrapper!.text()).not.toContain('Arrival Trigger');
    mocks.heading?.(180);
    await flushPromises();
    expect(wrapper!.find('.journey-instruction').text()).toContain('Turn right ahead');
    vi.unstubAllGlobals();
  });
});

describe('Camera Navigation voice guidance', () => {
  let wrapper: VueWrapper | null = null;

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
  });

  const spoken = () => mocks.speak.mock.calls.map((call) => call[0] as string);
  const button = (label: string) => {
    const found = wrapper!.findAll('ion-button').find((item) => item.text().trim() === label);
    if (!found) throw new Error(`button "${label}" not found`);
    return found;
  };

  async function enterIndoor(id = 'registrar') {
    selectDestination(id);
    wrapper = mount(ARNavigationPage, { global: { stubs: { IonBackButton: true, NavigationOverlay: true } } });
    await flushPromises();
    mocks.heading?.(90);
    mocks.gps!.state.value = { ...mocks.gps!.state.value, arrived: true };
    await flushPromises();
    const entrance = wrapper.findAllComponents(IonAlert)[0];
    entrance.vm.$emit('didDismiss', new CustomEvent('ionAlertDidDismiss', { detail: { role: 'confirm' } }));
    await flushPromises();
  }

  test('announces the entrance check, then starts guidance automatically', async () => {
    await enterIndoor();
    expect(spoken()).toContain(
      'You are near Administration Building Entrance. Start the indoor route only when you are standing at the entrance.',
    );
    expect(spoken().at(-1)).toBe('Turn right ahead.');
  });

  test('speaks straight-ahead instructions', async () => {
    await enterIndoor('library');
    await flushPromises();
    expect(spoken().at(-1)).toBe('Go straight ahead.');

    await button('Move Forward').trigger('click');
    await flushPromises();
    expect(spoken().at(-1)).toBe('Continue straight.');
  });

  test('speaks an upcoming turn once, however many steps it stays on screen', async () => {
    await enterIndoor();
    await button('Move Forward').trigger('click');
    await button('Move Forward').trigger('click');
    await flushPromises();
    expect(wrapper!.find('.journey-instruction strong').text()).toBe('Turn right ahead');
    expect(spoken().at(-1)).toBe('Turn right ahead.');
    expect(spoken().filter((text) => text === 'Turn right ahead.')).toHaveLength(1);
  });

  test('"I lost my way" is explained out loud', async () => {
    await enterIndoor();
    await wrapper!.find('[data-test="lost-way"]').trigger('click');
    await flushPromises();
    expect(spoken().at(-1)).toContain('1Locate cannot tell where you are inside the building');
  });

  test('the mute button silences guidance and is labeled for screen readers', async () => {
    await enterIndoor();
    const toggle = wrapper!.find('[data-test="voice-toggle"]');
    expect(toggle.attributes('aria-label')).toBe('Mute voice guidance');

    await toggle.trigger('click');
    expect(mocks.stopSpeech).toHaveBeenCalled();
    expect(wrapper!.find('[data-test="voice-toggle"]').attributes('aria-label')).toBe('Turn voice guidance on');

    const before = mocks.speak.mock.calls.length;
    mocks.heading?.(180);
    await flushPromises();
    expect(mocks.speak.mock.calls.length).toBe(before);

    await wrapper!.find('[data-test="voice-toggle"]').trigger('click');
  });

  test('leaving the screen stops speech', async () => {
    await enterIndoor();
    mocks.stopSpeech.mockClear();
    wrapper!.unmount();
    wrapper = null;
    expect(mocks.stopSpeech).toHaveBeenCalled();
  });
});
