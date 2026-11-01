import { flushPromises, mount } from '@vue/test-utils';
import { computed, reactive } from 'vue';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Building, UserRoleRecord } from '@/types';
import { BUILDING_ID, OTHER_USER_ID, USER_ID } from './helpers/fake-supabase';

const mocks = vi.hoisted(() => ({
  listRoles: vi.fn(),
  grantRole: vi.fn(),
  changeRole: vi.fn(),
  removeRole: vi.fn(),
  listBuildings: vi.fn(),
  buildingDependents: vi.fn(),
  deleteBuilding: vi.fn(),
  createBuilding: vi.fn(),
  updateBuilding: vi.fn(),
}));

vi.mock('@/services/campus', () => mocks);

vi.mock('@/stores/session', () => {
  const state = reactive({ status: 'signed-in', userId: 'a0000000-0000-4000-8000-000000000001', email: 'admin@example.com', role: 'admin', roleError: null });
  return {
    useSession: () => ({
      state,
      isAdmin: computed(() => state.role === 'admin'),
      canManageContent: computed(() => true),
      onCleared: () => () => undefined,
    }),
  };
});

const { default: RolesView } = await import('@/views/RolesView.vue');
const { default: BuildingsView } = await import('@/views/BuildingsView.vue');

function role(userId: string, value: 'admin' | 'editor'): UserRoleRecord {
  return { user_id: userId, role: value, granted_by: null, created_at: '2026-10-31T00:00:00Z', updated_at: '2026-10-31T00:00:00Z' };
}

function building(overrides: Partial<Building> = {}): Building {
  return {
    id: BUILDING_ID, code: 'ADMIN', name: 'Administration Building', description: null, entrance_name: null,
    entrance_lat: null, entrance_lng: null, arrival_radius: 10, is_active: false, sort_order: 0, created_at: '', updated_at: '',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Role Management screen', () => {
  beforeEach(() => {
    mocks.listRoles.mockResolvedValue([role(USER_ID, 'admin'), role(OTHER_USER_ID, 'editor')]);
  });

  test('your own row has no role controls', async () => {
    const wrapper = mount(RolesView);
    await flushPromises();
    const rows = wrapper.findAll('[data-test="role-row"]');
    expect(rows).toHaveLength(2);
    expect(rows[0].find('[data-test="self-badge"]').exists()).toBe(true);
    expect(rows[0].find('[data-test="role-select"]').exists()).toBe(false);
    expect(rows[0].find('[data-test="role-remove"]').exists()).toBe(false);
    expect(rows[1].find('[data-test="role-select"]').exists()).toBe(true);
  });

  test('granting a role to yourself is refused before any request', async () => {
    const wrapper = mount(RolesView);
    await flushPromises();
    await wrapper.find('[data-test="grant-user"]').setValue(USER_ID);
    await wrapper.find('[data-test="grant-form"]').trigger('submit');
    expect(wrapper.find('[data-test="error-userId"]').text()).toMatch(/own role/);
    expect(mocks.grantRole).not.toHaveBeenCalled();
  });

  test('changing another user role sends the request and shows denials', async () => {
    mocks.changeRole.mockRejectedValue({ code: '42501', message: 'permission denied for table user_roles' });
    const wrapper = mount(RolesView);
    await flushPromises();
    await wrapper.find('[data-test="role-select"]').setValue('admin');
    await wrapper.find('[data-test="role-save"]').trigger('click');
    await flushPromises();
    expect(mocks.changeRole).toHaveBeenCalledWith(OTHER_USER_ID, 'admin', USER_ID);
    expect(wrapper.find('[data-test="page-error"]').text()).toMatch(/don't have permission/);
    expect((wrapper.find('[data-test="role-select"]').element as HTMLSelectElement).value).toBe('editor');
  });
});

describe('Buildings screen', () => {
  test('explains why a building cannot be deleted', async () => {
    mocks.listBuildings.mockResolvedValue([building()]);
    mocks.buildingDependents.mockResolvedValue({ floors: 2, rooms: 1, photos: 0 });
    const wrapper = mount(BuildingsView);
    await flushPromises();
    await wrapper.find('[data-test="delete"]').trigger('click');
    await flushPromises();
    const blocked = wrapper.find('[data-test="delete-blocked"]');
    expect(blocked.text()).toContain('2 floor(s)');
    expect(blocked.text()).toContain('1 room(s)');
    expect(blocked.text()).not.toContain('photo');
    await wrapper.find('[data-test="confirm-ok"]').trigger('click');
    expect(mocks.deleteBuilding).not.toHaveBeenCalled();
  });

  test('shows field errors and does not save invalid coordinates', async () => {
    mocks.listBuildings.mockResolvedValue([]);
    const wrapper = mount(BuildingsView);
    await flushPromises();
    expect(wrapper.find('[data-test="empty"]').exists()).toBe(true);
    await wrapper.find('[data-test="new-building"]').trigger('click');
    await wrapper.find('[data-test="code"]').setValue('ADMIN');
    await wrapper.find('[data-test="name"]').setValue('Administration Building');
    await wrapper.find('[data-test="lat"]').setValue('13.41');
    await wrapper.find('[data-test="building-form"]').trigger('submit');
    expect(wrapper.find('[data-test="error-entranceLng"]').text()).toMatch(/both latitude and longitude/);
    expect(mocks.createBuilding).not.toHaveBeenCalled();
  });
});
