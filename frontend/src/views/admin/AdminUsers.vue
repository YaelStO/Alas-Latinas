<script setup>
import { ref, onMounted } from 'vue'
import api from '../../services/api'

const users = ref([])
const loading = ref(true)

onMounted(async () => {
  try {
    const res = await api.admin.getUsers()
    users.value = res.data.users
  } catch {}
  loading.value = false
})
</script>

<template>
  <div class="admin-page">
    <div class="page-header">
      <h1>Usuarios</h1>
    </div>

    <div v-if="loading" class="loading">Cargando...</div>
    <div v-else class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Nombre</th><th>Email</th><th>Stellar</th><th>Puntos</th><th>Reservas</th><th>Completadas</th><th>Registro</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in users" :key="u.id">
            <td><strong>{{ u.name }}</strong></td>
            <td>{{ u.email }}</td>
            <td class="small mono">{{ u.stellar_address || '—' }}</td>
            <td>{{ u.loyalty_points }}</td>
            <td>{{ u.total_reservations }}</td>
            <td>{{ u.completed_reservations }}</td>
            <td class="small">{{ u.created_at?.split('T')[0] }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.admin-page { max-width: 1100px; margin: 0 auto; padding: 2rem; }
.page-header { margin-bottom: 1.5rem; }
.page-header h1 { margin: 0; color: #1a1a2e; }
.loading { text-align: center; color: #888; padding: 3rem; }
.table-wrapper { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.06); }
th { background: #1a1a2e; color: #fff; padding: 0.8rem 1rem; text-align: left; font-weight: 500; font-size: 0.9rem; }
td { padding: 0.8rem 1rem; border-bottom: 1px solid #f0f0f0; font-size: 0.9rem; }
.small { font-size: 0.85rem; color: #888; }
.mono { font-family: monospace; font-size: 0.8rem; word-break: break-all; max-width: 200px; }
tr:hover { background: #fafafa; }
</style>
