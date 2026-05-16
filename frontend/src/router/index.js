import { createRouter, createWebHistory } from 'vue-router'
import Home from '../views/Home.vue'
import Login from '../views/Login.vue'
import Register from '../views/Register.vue'
import Packages from '../views/Packages.vue'
import PackageDetail from '../views/PackageDetail.vue'
import MyReservations from '../views/MyReservations.vue'
import Favorites from '../views/Favorites.vue'
import Dashboard from '../views/Dashboard.vue'

const routes = [
  { path: '/', name: 'Home', component: Home },
  { path: '/login', name: 'Login', component: Login },
  { path: '/register', name: 'Register', component: Register },
  { path: '/packages', name: 'Packages', component: Packages },
  { path: '/packages/:id', name: 'PackageDetail', component: PackageDetail },
  { path: '/reservations', name: 'MyReservations', component: MyReservations, meta: { requiresAuth: true } },
  { path: '/favorites', name: 'Favorites', component: Favorites, meta: { requiresAuth: true } },
  { path: '/dashboard', name: 'Dashboard', component: Dashboard, meta: { requiresAuth: true } },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('token')
  if (to.meta.requiresAuth && !token) {
    next('/login')
  } else {
    next()
  }
})

export default router
