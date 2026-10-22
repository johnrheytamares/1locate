import { createRouter, createWebHistory } from '@ionic/vue-router';
import { RouteRecordRaw } from 'vue-router';
import HomePage from '../views/HomePage.vue'
import DestinationPickerPage from '../views/DestinationPickerPage.vue'
import ARNavigationPage from '../views/ARNavigationPage.vue'

const routes: Array<RouteRecordRaw> = [
  {
    path: '/',
    redirect: '/destinations'
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
