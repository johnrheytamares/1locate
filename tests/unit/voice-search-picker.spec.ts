import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { onBeforeUnmount, onMounted } from 'vue';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { DESTINATIONS } from '@/data/destinations';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  listen: vi.fn(),
  stopListening: vi.fn(),
  speak: vi.fn(),
  stopSpeech: vi.fn(),
}));

vi.mock('@ionic/vue', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ionic/vue')>()),
  useIonRouter: () => ({ push: mocks.push, back: vi.fn(), navigate: vi.fn(), canGoBack: () => false }),
  onIonViewWillEnter: (callback: () => void) => onMounted(callback),
  onIonViewWillLeave: (callback: () => void) => onBeforeUnmount(callback),
}));

vi.mock('@/services/destination-repository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/destination-repository')>()),
  fetchDestinations: vi.fn(async () => ({ source: 'local', destinations: DESTINATIONS, failed: false })),
}));

vi.mock('@/services/speech-input.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/speech-input.service')>()),
  listenForDestination: mocks.listen,
  stopListening: mocks.stopListening,
}));

vi.mock('@/services/tts.service', () => ({
  createTtsSpeaker: () => ({ speak: mocks.speak, stop: mocks.stopSpeech }),
}));

const { default: DestinationPickerPage } = await import('@/views/DestinationPickerPage.vue');
const { SPEECH_MESSAGES } = await import('@/services/speech-input.service');

let wrapper: VueWrapper | null = null;

async function mountPicker() {
  wrapper = mount(DestinationPickerPage, { global: { stubs: { IonBackButton: true } } });
  await flushPromises();
  return wrapper;
}

async function speak(result: unknown) {
  mocks.listen.mockResolvedValueOnce(result);
  await wrapper!.find('[data-test="voice-search"]').trigger('click');
  await flushPromises();
}

const cardNames = () => wrapper!.findAll('.card h2').map((item) => item.text());
const status = () => wrapper!.find('[data-test="voice-status"]');

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.clearAllMocks();
});

describe('voice search on the destination list', () => {
  test('the microphone button is labeled for screen readers', async () => {
    await mountPicker();
    expect(wrapper!.find('[data-test="voice-search"]').attributes('aria-label')).toBe('Search by voice');
  });

  test('a clear match opens its confirm screen and never starts navigation by itself', async () => {
    await mountPicker();
    await speak({ ok: true, transcripts: ['Where is the registrar office'] });

    expect(mocks.push).toHaveBeenCalledWith('/destinations/registrar');
    expect(mocks.push).not.toHaveBeenCalledWith(expect.stringContaining('/navigate'));
    expect(mocks.speak).toHaveBeenLastCalledWith('Registrar Office. Review its details, then tap View on Map.');
  });

  test('several equal matches are listed for the user to pick', async () => {
    await mountPicker();
    await speak({ ok: true, transcripts: ['administration building'] });

    expect(mocks.push).not.toHaveBeenCalled();
    expect(cardNames().sort()).toEqual(['Cashier', 'Registrar Office']);
    expect(status().text()).toContain('I found 2 places');
    expect(mocks.speak).toHaveBeenLastCalledWith('I found Registrar Office or Cashier. Pick one from the list.');
  });

  test('typing after a voice search shows the full list again', async () => {
    await mountPicker();
    await speak({ ok: true, transcripts: ['administration building'] });
    await wrapper!.find('ion-searchbar').trigger('ionInput');

    expect(cardNames()).toHaveLength(DESTINATIONS.length);
  });

  test('an unknown place is reported without opening anything', async () => {
    await mountPicker();
    await speak({ ok: true, transcripts: ['cafeteria'] });

    expect(mocks.push).not.toHaveBeenCalled();
    expect(status().text()).toBe('No destination matches "cafeteria". Try again or type the name.');
    expect(cardNames()).toHaveLength(DESTINATIONS.length);
  });

  test('recognizer problems are explained on screen and out loud', async () => {
    await mountPicker();
    await speak({ ok: false, reason: 'denied', message: SPEECH_MESSAGES.denied });

    expect(status().text()).toBe(SPEECH_MESSAGES.denied);
    expect(mocks.speak).toHaveBeenLastCalledWith(SPEECH_MESSAGES.denied);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  test('ongoing speech stops before listening and the button waits while listening', async () => {
    await mountPicker();
    let finish: (value: unknown) => void = () => {};
    mocks.listen.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    await wrapper!.find('[data-test="voice-search"]').trigger('click');

    expect(mocks.stopSpeech).toHaveBeenCalled();
    expect(status().text()).toContain('Listening');
    expect(wrapper!.find('[data-test="voice-search"]').attributes('aria-label')).toBe('Listening');
    await wrapper!.find('[data-test="voice-search"]').trigger('click');
    expect(mocks.listen).toHaveBeenCalledTimes(1);

    finish({ ok: true, transcripts: ['library'] });
    await flushPromises();
    expect(mocks.push).toHaveBeenCalledWith('/destinations/library');
  });

  test('leaving the screen while listening stops the recognizer and ignores the late result', async () => {
    await mountPicker();
    let finish: (value: unknown) => void = () => {};
    mocks.listen.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    await wrapper!.find('[data-test="voice-search"]').trigger('click');

    wrapper!.unmount();
    wrapper = null;
    expect(mocks.stopListening).toHaveBeenCalled();
    finish({ ok: true, transcripts: ['library'] });
    await flushPromises();
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
