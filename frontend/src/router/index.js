import { createRouter, createWebHistory } from 'vue-router'
import Home from '../views/Home.vue'
import Login from '../views/Login.vue'
import Register from '../views/Register.vue'
import Packages from '../views/Packages.vue'
import PackageDetail from '../views/PackageDetail.vue'
import MyReservations from '../views/MyReservations.vue'
import Favorites from '../views/Favorites.vue'
import Dashboard from '../views/Dashboard.vue'
import AdminDashboard from '../views/admin/AdminDashboard.vue'
import AdminPackages from '../views/admin/AdminPackages.vue'
import AdminReservations from '../views/admin/AdminReservations.vue'
import AdminUsers from '../views/admin/AdminUsers.vue'

const routes = [
  { path: '/', name: 'Home', component: Home },
  { path: '/login', name: 'Login', component: Login },
  { path: '/register', name: 'Register', component: Register },
  { path: '/packages', name: 'Packages', component: Packages },
  { path: '/packages/:id', name: 'PackageDetail', component: PackageDetail },
  { path: '/reservations', name: 'MyReservations', component: MyReservations, meta: { requiresAuth: true } },
  { path: '/favorites', name: 'Favorites', component: Favorites, meta: { requiresAuth: true } },
  { path: '/dashboard', name: 'Dashboard', component: Dashboard, meta: { requiresAuth: true } },
  { path: '/admin', name: 'AdminDashboard', component: AdminDashboard, meta: { requiresAuth: true, requiresAdmin: true } },
  { path: '/admin/packages', name: 'AdminPackages', component: AdminPackages, meta: { requiresAuth: true, requiresAdmin: true } },
  { path: '/admin/reservations', name: 'AdminReservations', component: AdminReservations, meta: { requiresAuth: true, requiresAdmin: true } },
  { path: '/admin/users', name: 'AdminUsers', component: AdminUsers, meta: { requiresAuth: true, requiresAdmin: true } },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('token')
  const user = JSON.parse(localStorage.getItem('user') || 'null')
  if (to.meta.requiresAuth && !token) {
    next('/login')
  } else if (to.meta.requiresAdmin && (!user || !user.email?.endsWith('@admin.com'))) {
    next('/')
  } else {
    next()
  }
})

export default router
