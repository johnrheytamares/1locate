import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  client: null as null | Record<string, unknown>,
}));

vi.mock('@/services/supabase', () => {
  mocks.client = {
    auth: { getSession: () => Promise.resolve({ data: { session: null } }) },
    from: (table: string) => ({ insert: (payload: unknown) => mocks.insert(table, payload) }),
  };
  return {
    get supabase() { return mocks.client; },
    isSupabaseConfigured: true,
  };
});

const service = await import('@/services/navigation-feedback.service');
const { default: ArrivalFeedbackModal } = await import('@/components/navigation/ArrivalFeedbackModal.vue');

const draft = (overrides = {}) => ({
  sessionId: '11111111-1111-4111-8111-111111111111',
  destinationId: 'registrar',
  destinationName: 'Registrar Office',
  rating: 5 as const,
  comment: '  Accurate navigation  ',
  ...overrides,
});

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => value });
}

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => { data.delete(key); },
    setItem: (key, value) => { data.set(key, String(value)); },
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  setOnline(true);
  mocks.insert.mockReset();
  mocks.insert.mockResolvedValue({ error: null });
});

afterEach(() => {
  setOnline(true);
  vi.unstubAllGlobals();
});

describe('navigation feedback service', () => {
  test('saves rating and trimmed comment to navigation_feedback', async () => {
    await expect(service.submitNavigationFeedback(draft())).resolves.toBe('saved');
    expect(mocks.insert).toHaveBeenCalledWith('navigation_feedback', {
      session_id: '11111111-1111-4111-8111-111111111111',
      user_id: null,
      destination_id: 'registrar',
      destination_name: 'Registrar Office',
      rating: 5,
      comment: 'Accurate navigation',
    });
  });

  test('an empty comment is stored as null', async () => {
    await service.submitNavigationFeedback(draft({ comment: '   ' }));
    expect(mocks.insert.mock.calls[0][1]).toMatchObject({ comment: null });
  });

  test('a repeated submission for the same session is treated as already saved', async () => {
    mocks.insert.mockResolvedValue({ error: { code: '23505', message: 'duplicate key value violates unique constraint "navigation_feedback_session_id_key"' } });
    await expect(service.submitNavigationFeedback(draft())).resolves.toBe('duplicate');
    expect(service.loadQueuedFeedback()).toEqual([]);
  });

  test('offline feedback is queued locally and uploaded when back online', async () => {
    setOnline(false);
    await expect(service.submitNavigationFeedback(draft())).resolves.toBe('queued');
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(service.loadQueuedFeedback()).toHaveLength(1);

    setOnline(true);
    await service.flushQueuedFeedback();
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(service.loadQueuedFeedback()).toEqual([]);
  });

  test('a network failure while online queues the feedback instead of losing it', async () => {
    mocks.insert.mockResolvedValue({ error: { message: 'TypeError: Failed to fetch' } });
    await expect(service.submitNavigationFeedback(draft())).resolves.toBe('queued');
    expect(service.loadQueuedFeedback()).toHaveLength(1);
  });

  test('queued items stay queued while the network is still down', async () => {
    setOnline(false);
    await service.submitNavigationFeedback(draft());
    setOnline(true);
    mocks.insert.mockResolvedValue({ error: { message: 'Failed to fetch' } });
    await service.flushQueuedFeedback();
    expect(service.loadQueuedFeedback()).toHaveLength(1);
  });

  test('database errors are reported, not queued', async () => {
    mocks.insert.mockResolvedValue({ error: { code: '42501', message: 'new row violates row-level security policy' } });
    await expect(service.submitNavigationFeedback(draft())).rejects.toBeTruthy();
    expect(service.loadQueuedFeedback()).toEqual([]);
  });

  test('session IDs are UUIDs', () => {
    expect(service.createSessionId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });
});

describe('Arrival feedback modal', () => {
  const props = {
    isOpen: true,
    sessionId: '22222222-2222-4222-8222-222222222222',
    destinationId: 'library',
    destinationName: 'Library',
  };

  test('shows the arrival title and keeps Submit disabled until a rating is chosen', async () => {
    const wrapper = mount(ArrivalFeedbackModal, { props });
    expect(wrapper.text()).toContain("You've Arrived! 🎉");
    expect(wrapper.text()).toContain('How was your navigation experience?');
    const submit = wrapper.find('[data-test="submit-feedback"]');
    expect(submit.attributes('disabled')).toBeDefined();

    await wrapper.find('[data-test="rating-4"]').trigger('click');
    expect(submit.attributes('disabled')).toBeUndefined();
    expect(wrapper.find('[data-test="rating-label"]').text()).toBe('4 Stars – Good');
    expect(wrapper.findAll('.star.selected')).toHaveLength(4);
  });

  test('submits once and closes with a success message', async () => {
    const wrapper = mount(ArrivalFeedbackModal, { props });
    await wrapper.find('[data-test="rating-2"]').trigger('click');
    await wrapper.find('[data-test="feedback-comment"]').setValue('Wrong room information');
    await wrapper.find('form').trigger('submit');
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.insert.mock.calls[0][1]).toMatchObject({ rating: 2, comment: 'Wrong room information', destination_name: 'Library' });
    expect(wrapper.emitted('close')?.[0]).toEqual([service.FEEDBACK_SAVED_MESSAGE]);
  });

  test('Maybe Later closes without submitting or showing an error', async () => {
    const wrapper = mount(ArrivalFeedbackModal, { props });
    await wrapper.find('[data-test="maybe-later"]').trigger('click');
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(wrapper.emitted('close')?.[0]).toEqual([]);
    expect(wrapper.find('[data-test="feedback-error"]').exists()).toBe(false);
  });

  test('a database error keeps the modal open with a readable message', async () => {
    mocks.insert.mockResolvedValue({ error: { code: '42501', message: 'permission denied' } });
    const wrapper = mount(ArrivalFeedbackModal, { props });
    await wrapper.find('[data-test="rating-3"]').trigger('click');
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(wrapper.find('[data-test="feedback-error"]').text()).toBe(service.FEEDBACK_ERROR_MESSAGE);
    expect(wrapper.emitted('close')).toBeUndefined();
  });

  test('renders nothing while closed', () => {
    const wrapper = mount(ArrivalFeedbackModal, { props: { ...props, isOpen: false } });
    expect(wrapper.find('[data-test="arrival-feedback"]').exists()).toBe(false);
  });
});
