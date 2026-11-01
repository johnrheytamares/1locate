import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { decideAccess, type AccessMeta } from '@/router/access';
import { useSession } from '@/stores/session';
import AppLayout from '@/components/AppLayout.vue';

declare module 'vue-router' {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface RouteMeta extends AccessMeta {}
}

const ROLE_RECHECK_MS = 60_000;

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { public: true },
  },
  {
    path: '/access-denied',
    name: 'access-denied',
    component: () => import('@/views/AccessDeniedView.vue'),
    meta: { signedIn: true },
  },
  {
    path: '/',
    component: AppLayout,
    meta: { requires: 'content' },
    children: [
      { path: '', name: 'dashboard', component: () => import('@/views/DashboardView.vue'), meta: { requires: 'content' } },
      { path: 'buildings', name: 'buildings', component: () => import('@/views/BuildingsView.vue'), meta: { requires: 'content' } },
      { path: 'floors', name: 'floors', component: () => import('@/views/FloorsView.vue'), meta: { requires: 'content' } },
      { path: 'rooms', name: 'rooms', component: () => import('@/views/RoomsView.vue'), meta: { requires: 'content' } },
      { path: 'destinations', name: 'destinations', component: () => import('@/views/DestinationsView.vue'), meta: { requires: 'content' } },
      { path: 'roles', name: 'roles', component: () => import('@/views/RolesView.vue'), meta: { requires: 'admin' } },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(async (to) => {
  const session = useSession();
  await session.init();
  if (!to.meta.public) await session.refreshRoleIfStale(ROLE_RECHECK_MS);
  const decision = decideAccess(to.meta, session.state, to.fullPath);
  return decision.allow ? true : decision.redirect;
});
