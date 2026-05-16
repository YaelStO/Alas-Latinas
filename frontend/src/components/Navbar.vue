<script setup>
import { useAuthStore } from '../stores/auth'
import { useRouter } from 'vue-router'

const auth = useAuthStore()
const router = useRouter()

function handleLogout() {
  auth.logout()
  router.push('/')
}
</script>

<template>
  <nav class="navbar">
    <div class="navbar-brand">
      <router-link to="/">
        <span class="brand-icon">🏝️</span>
        <span class="brand-text">Turismo Blockchain</span>
      </router-link>
    </div>
    <div class="navbar-links">
      <router-link to="/packages" class="nav-link">Paquetes</router-link>
      <template v-if="auth.isAuthenticated">
        <router-link to="/reservations" class="nav-link">Mis Reservas</router-link>
        <router-link to="/favorites" class="nav-link">Favoritos</router-link>
        <router-link to="/dashboard" class="nav-link">Dashboard</router-link>
        <span class="nav-user">{{ auth.user?.name }}</span>
        <button class="btn-logout" @click="handleLogout">Cerrar Sesión</button>
      </template>
      <template v-else>
        <router-link to="/login" class="nav-link">Iniciar Sesión</router-link>
        <router-link to="/register" class="nav-link btn-register">Registrarse</router-link>
      </template>
    </div>
  </nav>
</template>

<style scoped>
.navbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 2rem;
  height: 64px;
  background: #1a1a2e;
  color: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}
.navbar-brand a {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #fff;
  text-decoration: none;
  font-size: 1.2rem;
  font-weight: 700;
}
.brand-icon { font-size: 1.5rem; }
.navbar-links {
  display: flex;
  align-items: center;
  gap: 1rem;
}
.nav-link {
  color: #ccc;
  text-decoration: none;
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  transition: all 0.2s;
}
.nav-link:hover { color: #fff; background: rgba(255, 255, 255, 0.1); }
.router-link-exact-active { color: #4fc3f7; background: rgba(79, 195, 247, 0.1); }
.nav-user { color: #4fc3f7; font-weight: 500; }
.btn-logout {
  background: transparent;
  color: #ef5350;
  border: 1px solid #ef5350;
  padding: 0.4rem 0.8rem;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-logout:hover { background: #ef5350; color: #fff; }
.btn-register {
  background: #4fc3f7;
  color: #1a1a2e !important;
  font-weight: 600;
}
.btn-register:hover { background: #29b6f6; color: #1a1a2e !important; }
</style>
