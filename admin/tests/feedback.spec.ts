import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { filterFeedback, paginate, stars, summarize } from '@/lib/feedback';
import type { NavigationFeedback } from '@/types';
import { fakeClient } from './helpers/fake-supabase';

const mocks = vi.hoisted(() => ({ listNavigationFeedback: vi.fn() }));

function row(overrides: Partial<NavigationFeedback> = {}): NavigationFeedback {
  return {
    id: crypto.randomUUID(),
    session_id: crypto.randomUUID(),
    user_id: null,
    destination_id: 'it-building',
    destination_name: 'IT Building',
    rating: 5,
    comment: 'Accurate navigation',
    created_at: '2026-11-05T08:00:00Z',
    ...overrides,
  };
}

describe('feedback helpers', () => {
  const items = [
    row({ rating: 5, created_at: '2026-11-03T08:00:00Z' }),
    row({ rating: 2, destination_name: 'Room 204', comment: 'Incorrect room location', created_at: '2026-11-05T08:00:00Z' }),
    row({ rating: 1, destination_name: 'Library', comment: null, created_at: '2026-11-04T08:00:00Z' }),
    row({ rating: 4, destination_name: 'Cashier', comment: 'GPS drifted near the gate', created_at: '2026-11-01T08:00:00Z' }),
  ];

  test('summarizes totals, average, five-star and low ratings', () => {
    expect(summarize(items)).toEqual({ total: 4, average: 3, fiveStar: 1, low: 2 });
    expect(summarize([])).toEqual({ total: 0, average: null, fiveStar: 0, low: 0 });
  });

  test('searches destination and comment, filters ratings, and sorts by date', () => {
    expect(filterFeedback(items, { search: 'room', rating: '', sort: 'newest' }).map((item) => item.destination_name)).toEqual(['Room 204']);
    expect(filterFeedback(items, { search: 'gps', rating: '', sort: 'newest' }).map((item) => item.destination_name)).toEqual(['Cashier']);
    expect(filterFeedback(items, { search: '', rating: 'low', sort: 'newest' }).map((item) => item.rating)).toEqual([2, 1]);
    expect(filterFeedback(items, { search: '', rating: '5', sort: 'newest' })).toHaveLength(1);
    expect(filterFeedback(items, { search: '', rating: '', sort: 'oldest' }).map((item) => item.destination_name))
      .toEqual(['Cashier', 'IT Building', 'Library', 'Room 204']);
  });

  test('paginates and clamps out-of-range pages', () => {
    const many = Array.from({ length: 23 }, () => row());
    expect(paginate(many, 3, 10)).toMatchObject({ page: 3, pages: 3, first: 21, last: 23, total: 23 });
    expect(paginate(many, 9, 10).page).toBe(3);
    expect(paginate([], 1, 10)).toMatchObject({ page: 1, pages: 1, first: 0, last: 0 });
  });

  test('renders star strings', () => {
    expect(stars(5)).toBe('★★★★★');
    expect(stars(2)).toBe('★★☆☆☆');
  });
});

describe('listNavigationFeedback', () => {
  test('reads navigation_feedback newest first', async () => {
    const { listNavigationFeedback } = await vi.importActual<typeof import('@/services/feedback')>('@/services/feedback');
    const { client, calls } = fakeClient(() => ({ data: [row()] }));
    await expect(listNavigationFeedback(client)).resolves.toHaveLength(1);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ table: 'navigation_feedback', action: 'select' });
  });
});

describe('Navigation Feedback screen', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock('@/services/feedback', () => mocks);
    mocks.listNavigationFeedback.mockReset();
  });

  async function mountView() {
    const { default: FeedbackView } = await import('@/views/FeedbackView.vue');
    const wrapper = mount(FeedbackView);
    await flushPromises();
    return wrapper;
  }

  test('shows summary cards and the feedback table', async () => {
    mocks.listNavigationFeedback.mockResolvedValue([
      row({ rating: 5 }),
      row({ rating: 2, destination_name: 'Room 204', comment: 'Incorrect room location' }),
    ]);
    const wrapper = await mountView();
    expect(wrapper.find('[data-test="stat-total"]').text()).toBe('2');
    expect(wrapper.find('[data-test="stat-average"]').text()).toBe('3.5');
    expect(wrapper.find('[data-test="stat-five"]').text()).toBe('1');
    expect(wrapper.find('[data-test="stat-low"]').text()).toBe('1');
    expect(wrapper.findAll('[data-test="feedback-row"]')).toHaveLength(2);
  });

  test('filters by rating and opens the details modal', async () => {
    mocks.listNavigationFeedback.mockResolvedValue([
      row({ rating: 5 }),
      row({ rating: 2, destination_name: 'Room 204', comment: 'Incorrect room location' }),
    ]);
    const wrapper = await mountView();
    await wrapper.find('[data-test="filter-rating"]').setValue('low');
    const rows = wrapper.findAll('[data-test="feedback-row"]');
    expect(rows).toHaveLength(1);
    await rows[0].find('[data-test="view"]').trigger('click');
    expect(wrapper.find('[data-test="detail-destination"]').text()).toBe('Room 204');
    expect(wrapper.find('[data-test="detail-comment"]').text()).toBe('Incorrect room location');
    await wrapper.find('[data-test="detail-close"]').trigger('click');
    expect(wrapper.find('[data-test="detail"]').exists()).toBe(false);
  });

  test('pages through more than ten entries', async () => {
    mocks.listNavigationFeedback.mockResolvedValue(Array.from({ length: 12 }, () => row()));
    const wrapper = await mountView();
    expect(wrapper.findAll('[data-test="feedback-row"]')).toHaveLength(10);
    await wrapper.find('[data-test="next"]').trigger('click');
    expect(wrapper.findAll('[data-test="feedback-row"]')).toHaveLength(2);
    expect(wrapper.find('[data-test="page-info"]').text()).toContain('11–12 of 12');
  });

  test('shows permission errors from Supabase', async () => {
    mocks.listNavigationFeedback.mockRejectedValue({ code: '42501', message: 'permission denied for table navigation_feedback' });
    const wrapper = await mountView();
    expect(wrapper.find('[data-test="page-error"]').text()).toMatch(/don't have permission/);
  });

  test('explains when no feedback exists yet', async () => {
    mocks.listNavigationFeedback.mockResolvedValue([]);
    const wrapper = await mountView();
    expect(wrapper.find('[data-test="empty"]').text()).toContain('No feedback has been submitted yet');
  });
});
