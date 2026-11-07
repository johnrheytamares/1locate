import { flushPromises, mount } from '@vue/test-utils';
import { onMounted } from 'vue';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { DESTINATIONS } from '@/data/destinations';
import type { Destination } from '@/models/navigation';

const ROOM_ID = '30000000-0000-4000-8000-000000000001';
const PHOTO = `${ROOM_ID}/40000000-0000-4000-8000-000000000001.jpg`;

const mocks = vi.hoisted(() => ({
  routeId: 'registrar',
  canGoBack: false,
  push: vi.fn(),
  back: vi.fn(),
  navigate: vi.fn(),
  fetchDestinations: vi.fn(),
  getDestinationImageUrls: vi.fn(),
}));

vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRoute: () => ({ params: { id: mocks.routeId } }),
}));

vi.mock('@ionic/vue', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ionic/vue')>()),
  useIonRouter: () => ({
    push: mocks.push,
    back: mocks.back,
    navigate: mocks.navigate,
    canGoBack: () => mocks.canGoBack,
  }),
  onIonViewWillEnter: (callback: () => void) => onMounted(callback),
}));

vi.mock('@/services/destination-repository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/destination-repository')>()),
  fetchDestinations: mocks.fetchDestinations,
  getDestinationImageUrls: mocks.getDestinationImageUrls,
}));

const { default: ConfirmDestinationPage } = await import('@/views/ConfirmDestinationPage.vue');
const { getSelectedDestination, selectDestination, setDestinationCatalog } = await import('@/services/navigation.service');

const roomDestination: Destination = {
  ...DESTINATIONS[0],
  type: 'office',
  details: {
    roomId: ROOM_ID,
    buildingId: null,
    floorName: 'Ground Floor',
    floorLevel: 1,
    roomNumber: 'A-101',
    description: 'Enrollment records and transcripts.',
    images: [{ bucket: 'room-photos', storagePath: PHOTO, caption: 'Front desk' }],
  },
};

async function mountPage(id: string) {
  mocks.routeId = id;
  const wrapper = mount(ConfirmDestinationPage, { global: { stubs: { IonBackButton: true, DestinationMapPreview: true } } });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  mocks.canGoBack = false;
  mocks.fetchDestinations.mockResolvedValue({
    destinations: [roomDestination, ...DESTINATIONS.slice(1)],
    source: 'supabase',
    failed: false,
  });
  mocks.getDestinationImageUrls.mockResolvedValue([
    { url: 'https://example.test/front-desk.jpg', caption: 'Front desk' },
  ]);
});

afterEach(() => {
  selectDestination('__none__');
  vi.clearAllMocks();
});

describe('Confirm Destination screen', () => {
  test('shows room details and photos from the live catalog', async () => {
    const wrapper = await mountPage('registrar');
    expect(wrapper.find('[data-test="name"]').text()).toBe('Registrar Office');
    expect(wrapper.text()).toContain('Office');
    expect(wrapper.find('[data-test="building"]').text()).toBe('Administration Building');
    expect(wrapper.find('[data-test="floor"]').text()).toBe('Ground Floor');
    expect(wrapper.find('[data-test="room-number"]').text()).toBe('A-101');
    expect(wrapper.find('[data-test="description"]').text()).toContain('transcripts');
    expect(wrapper.find('figure.photo img').attributes('src')).toBe('https://example.test/front-desk.jpg');
    expect(wrapper.find('[data-test="placeholder"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Live campus data');
    expect(mocks.getDestinationImageUrls).toHaveBeenCalledWith(roomDestination.details!.images);
  });

  test('opening the screen does not select the destination', async () => {
    await mountPage('registrar');
    expect(getSelectedDestination()).toBeNull();
  });

  test('View on Map opens the mandatory map preview without selecting a navigation session', async () => {
    const wrapper = await mountPage('registrar');
    await wrapper.find('[data-test="start"]').trigger('click');
    await flushPromises();
    expect(getSelectedDestination()).toBeNull();
    expect(mocks.push).toHaveBeenCalledWith('/destinations/registrar/preview');
  });

  test('shows a placeholder and hides empty fields for a destination without details', async () => {
    const wrapper = await mountPage('library');
    expect(wrapper.find('[data-test="placeholder"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="floor"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="room-number"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="description"]').exists()).toBe(false);
    expect(mocks.getDestinationImageUrls).not.toHaveBeenCalled();
  });

  test('shows the placeholder when photos cannot be loaded', async () => {
    mocks.getDestinationImageUrls.mockResolvedValue([]);
    const wrapper = await mountPage('registrar');
    expect(wrapper.find('[data-test="placeholder"]').exists()).toBe(true);
  });

  test('Back leaves the selection unchanged', async () => {
    setDestinationCatalog([roomDestination, ...DESTINATIONS.slice(1)]);
    selectDestination('library');
    mocks.canGoBack = true;
    const wrapper = await mountPage('registrar');
    await wrapper.find('[data-test="back"]').trigger('click');
    expect(mocks.back).toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(getSelectedDestination()?.id).toBe('library');
  });

  test('Back returns to the picker when there is no history', async () => {
    const wrapper = await mountPage('registrar');
    await wrapper.find('[data-test="back"]').trigger('click');
    expect(mocks.navigate).toHaveBeenCalledWith('/destinations', 'back', 'replace');
  });

  test('an unknown destination shows a not-found message', async () => {
    const wrapper = await mountPage('does-not-exist');
    expect(wrapper.find('[data-test="missing"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="start"]').exists()).toBe(false);
    expect(getSelectedDestination()).toBeNull();
  });
});
