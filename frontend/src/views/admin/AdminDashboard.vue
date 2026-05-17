<script setup>
import { ref, onMounted } from 'vue'
import api from '../../services/api'

const stats = ref({ packages: 0, reservations: 0, users: 0, pending: 0 })

onMounted(async () => {
  try {
    const [pkgRes, resRes, userRes] = await Promise.all([
      api.admin.getPackages(),
      api.admin.getReservations(),
      api.admin.getUsers(),
    ])
    stats.value.packages = pkgRes.data.packages.length
    stats.value.reservations = resRes.data.reservations.length
    stats.value.users = userRes.data.users.length
    stats.value.pending = resRes.data.reservations.filter(r => r.status === 'pending').length
  } catch {}
})
</script>

<template>
  <div class="admin-page">
    <div class="page-header">
      <h1>Panel de Administración</h1>
      <p class="subtitle">Gestiona paquetes, reservas y usuarios</p>
    </div>

    <div class="stats-grid">
      <router-link to="/admin/packages" class="stat-card">
        <span class="stat-value">{{ stats.packages }}</span>
        <span class="stat-label">Paquetes</span>
      </router-link>
      <router-link to="/admin/reservations" class="stat-card">
        <span class="stat-value">{{ stats.reservations }}</span>
        <span class="stat-label">Reservas</span>
      </router-link>
      <router-link to="/admin/reservations" class="stat-card warn">
        <span class="stat-value">{{ stats.pending }}</span>
        <span class="stat-label">Pendientes</span>
      </router-link>
      <router-link to="/admin/users" class="stat-card">
        <span class="stat-value">{{ stats.users }}</span>
        <span class="stat-label">Usuarios</span>
      </router-link>
    </div>

    <div class="actions-grid">
      <router-link to="/admin/packages" class="action-card">
        <span class="action-icon">📦</span>
        <span class="action-title">Gestionar Paquetes</span>
        <span class="action-desc">Crear, editar y desactivar paquetes turísticos</span>
      </router-link>
      <router-link to="/admin/reservations" class="action-card">
        <span class="action-icon">📋</span>
        <span class="action-title">Gestionar Reservas</span>
        <span class="action-desc">Confirmar pagos, completar servicios y procesar reembolsos</span>
      </router-link>
      <router-link to="/admin/users" class="action-card">
        <span class="action-icon">👥</span>
        <span class="action-title">Usuarios</span>
        <span class="action-desc">Ver todos los usuarios registrados</span>
      </router-link>
    </div>
  </div>
</template>

<style scoped>
.admin-page { max-width: 1000px; margin: 0 auto; padding: 2rem; }
.page-header h1 { margin: 0; color: #1a1a2e; }
.subtitle { color: #888; margin: 0.3rem 0 2rem; font-size: 0.95rem; }
.stats-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
.stat-card {
  background: #fff; border-radius: 12px; padding: 1.5rem; text-align: center;
  box-shadow: 0 2px 12px rgba(0,0,0,0.06); text-decoration: none; display: block;
  transition: transform 0.2s;
}
.stat-card:hover { transform: translateY(-2px); }
.stat-card.warn .stat-value { color: #f57c00; }
.stat-value { display: block; font-size: 2rem; font-weight: 700; color: #1a1a2e; }
.stat-label { display: block; font-size: 0.85rem; color: #888; margin-top: 0.3rem; }
.actions-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; }
.action-card {
  background: #fff; border-radius: 12px; padding: 1.5rem;
  box-shadow: 0 2px 12px rgba(0,0,0,0.06); text-decoration: none; color: #333;
  transition: transform 0.2s;
}
.action-card:hover { transform: translateY(-2px); }
.action-icon { font-size: 2rem; display: block; margin-bottom: 0.5rem; }
.action-title { font-weight: 600; font-size: 1.1rem; color: #1a1a2e; display: block; margin-bottom: 0.3rem; }
.action-desc { font-size: 0.85rem; color: #888; }
</style>
