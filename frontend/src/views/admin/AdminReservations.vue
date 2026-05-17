<script setup>
import { ref, onMounted } from 'vue'
import api from '../../services/api'

const reservations = ref([])
const loading = ref(true)
const filter = ref('')
const actionLoading = ref(null)

const statusColors = {
  pending: '#f57c00', confirmed: '#1565c0', completed: '#2e7d32',
  refunded: '#6a1b9a', cancelled: '#888',
}

async function load() {
  try {
    const params = filter.value ? { status: filter.value } : {}
    const res = await api.admin.getReservations(params)
    reservations.value = res.data.reservations
  } catch {}
  loading.value = false
}

async function confirmPayment(id) {
  actionLoading.value = id
  try {
    await api.admin.confirmPayment({ reservation_id: id })
    await load()
  } catch {}
  actionLoading.value = null
}

async function confirmService(id) {
  actionLoading.value = id
  try {
    await api.admin.confirmService({ reservation_id: id })
    await load()
  } catch {}
  actionLoading.value = null
}

async function processRefund(id) {
  if (!confirm('¿Procesar reembolso para esta reserva?')) return
  actionLoading.value = id
  try {
    await api.admin.processRefund({ reservation_id: id })
    await load()
  } catch {}
  actionLoading.value = null
}

onMounted(load)
</script>

<template>
  <div class="admin-page">
    <div class="page-header">
      <h1>Gestionar Reservas</h1>
      <select v-model="filter" @change="load" class="filter-select">
        <option value="">Todas</option>
        <option value="pending">Pendientes</option>
        <option value="confirmed">Confirmadas</option>
        <option value="completed">Completadas</option>
        <option value="refunded">Reembolsadas</option>
        <option value="cancelled">Canceladas</option>
      </select>
    </div>

    <div v-if="loading" class="loading">Cargando...</div>
    <div v-else-if="reservations.length === 0" class="empty">No hay reservas</div>
    <div v-else class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Usuario</th><th>Destino</th><th>Fechas</th><th>Total</th><th>Estado</th><th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in reservations" :key="r.id">
            <td>
              <strong>{{ r.user_name }}</strong>
              <div class="small">{{ r.user_email }}</div>
            </td>
            <td>{{ r.destination }}</td>
            <td class="small">{{ r.start_date?.split('T')[0] }}</td>
            <td>${{ parseFloat(r.total_price).toFixed(2) }}</td>
            <td>
              <span class="status-badge" :style="{ background: statusColors[r.status] + '20', color: statusColors[r.status] }">
                {{ r.status }}
              </span>
            </td>
            <td class="actions">
              <button v-if="r.status === 'pending'" class="btn-sm success" :disabled="actionLoading === r.id" @click="confirmPayment(r.id)">
                Confirmar Pago
              </button>
              <button v-if="r.status === 'confirmed'" class="btn-sm primary" :disabled="actionLoading === r.id" @click="confirmService(r.id)">
                Completar Servicio
              </button>
              <button v-if="r.status === 'pending' || r.status === 'confirmed'" class="btn-sm danger" :disabled="actionLoading === r.id" @click="processRefund(r.id)">
                Reembolsar
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.admin-page { max-width: 1100px; margin: 0 auto; padding: 2rem; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
.page-header h1 { margin: 0; color: #1a1a2e; }
.filter-select { padding: 0.5rem; border: 1px solid #ddd; border-radius: 8px; font-size: 0.9rem; outline: none; }
.loading, .empty { text-align: center; color: #888; padding: 3rem; }
.table-wrapper { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.06); }
th { background: #1a1a2e; color: #fff; padding: 0.8rem 1rem; text-align: left; font-weight: 500; font-size: 0.9rem; }
td { padding: 0.8rem 1rem; border-bottom: 1px solid #f0f0f0; font-size: 0.9rem; }
.small { font-size: 0.8rem; color: #888; }
.status-badge { padding: 0.25rem 0.6rem; border-radius: 12px; font-size: 0.8rem; font-weight: 500; text-transform: capitalize; }
.actions { display: flex; gap: 0.4rem; flex-wrap: wrap; }
.btn-sm { padding: 0.35rem 0.7rem; border: 1px solid #ddd; border-radius: 6px; background: #fff; cursor: pointer; font-size: 0.8rem; transition: all 0.2s; }
.btn-sm:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-sm.primary { color: #1565c0; border-color: #1565c0; }
.btn-sm.primary:hover:not(:disabled) { background: #1565c0; color: #fff; }
.btn-sm.success { color: #2e7d32; border-color: #2e7d32; }
.btn-sm.success:hover:not(:disabled) { background: #2e7d32; color: #fff; }
.btn-sm.danger { color: #ef5350; border-color: #ef5350; }
.btn-sm.danger:hover:not(:disabled) { background: #ef5350; color: #fff; }
</style>
