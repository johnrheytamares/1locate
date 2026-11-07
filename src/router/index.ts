import { createRouter, createWebHistory } from '@ionic/vue-router';
import { RouteRecordRaw } from 'vue-router';
import HomePage from '../views/HomePage.vue'
import DestinationPickerPage from '../views/DestinationPickerPage.vue'
import ConfirmDestinationPage from '../views/ConfirmDestinationPage.vue'
import ARNavigationPage from '../views/ARNavigationPage.vue'

const routes: Array<RouteRecordRaw> = [
  { path: '/destinations/:id/preview', name: 'NavigationPreview', component: () => import('../views/NavigationPreviewPage.vue') },
  { path: '/arrival', name: 'Arrival', component: () => import('../views/ArrivalPage.vue') },
  { path: '/indoor-map', name: 'IndoorMap', component: () => import('../views/IndoorMapPage.vue') },
  {
    path: '/',
    redirect: '/home'
  },
  {
    path: '/home',
    name: 'Home',
    component: HomePage
  },
  {
    path: '/destinations',
    name: 'Destinations',
    component: DestinationPickerPage
  },
  {
    path: '/destinations/:id',
    name: 'ConfirmDestination',
    component: ConfirmDestinationPage
  },
  {
    path: '/ar-navigation',
    name: 'ARNavigation',
    component: ARNavigationPage
  }
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
})

export default router
