<script setup>
import { ref, onMounted } from 'vue'
import api from '../services/api'

const reservations = ref([])
const loading = ref(true)
const statusFilter = ref('')

const badges = {
  pending: 'Pendiente',
  confirmed: 'Confirmada',
  completed: 'Completada',
  refunded: 'Reembolsada',
  cancelled: 'Cancelada',
}

async function loadReservations() {
  loading.value = true
  try {
    const params = statusFilter.value ? { status: statusFilter.value } : {}
    const res = await api.reservations.list(params)
    reservations.value = res.data.reservations
  } catch {} finally {
    loading.value = false
  }
}

onMounted(loadReservations)
</script>

<template>
  <div class="reservations-page">
    <div class="page-header">
      <h1>Mis Reservaciones</h1>
      <select v-model="statusFilter" @change="loadReservations">
        <option value="">Todas</option>
        <option value="pending">Pendientes</option>
        <option value="confirmed">Confirmadas</option>
        <option value="completed">Completadas</option>
        <option value="refunded">Reembolsadas</option>
        <option value="cancelled">Canceladas</option>
      </select>
    </div>

    <div v-if="loading" class="loading">Cargando...</div>
    <div v-else-if="reservations.length === 0" class="empty">No tienes reservaciones.</div>
    <div v-else class="reservation-list">
      <div v-for="r in reservations" :key="r.id" class="reservation-card">
        <div class="res-header">
          <h3>{{ r.destination }}</h3>
          <span class="status-badge" :class="r.status">{{ badges[r.status] || r.status }}</span>
        </div>
        <div class="res-dates">{{ r.start_date }} — {{ r.end_date }}</div>
        <div class="res-meta">
          <span>Total: ${{ Number(r.total_price).toLocaleString() }}</span>
          <span>Depósito: ${{ Number(r.deposit_amount).toLocaleString() }}</span>
        </div>
        <div class="res-footer">
          <span class="res-id">ID: {{ r.id.slice(0, 8) }}...</span>
          <span class="res-created">{{ new Date(r.created_at).toLocaleDateString() }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.reservations-page { max-width: 800px; margin: 0 auto; padding: 2rem; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; flex-wrap: wrap; gap: 1rem; }
.page-header h1 { margin: 0; color: #1a1a2e; }
.page-header select {
  padding: 0.5rem 0.75rem;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 0.9rem;
  outline: none;
}
.reservation-list { display: flex; flex-direction: column; gap: 1rem; }
.reservation-card {
  background: #fff;
  border-radius: 12px;
  padding: 1.25rem;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}
.res-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.3rem; }
.res-header h3 { margin: 0; color: #1a1a2e; }
.status-badge {
  padding: 0.2rem 0.6rem;
  border-radius: 12px;
  font-size: 0.8rem;
  font-weight: 600;
}
.pending { background: #fff3e0; color: #e65100; }
.confirmed { background: #e3f2fd; color: #1565c0; }
.completed { background: #e8f5e9; color: #2e7d32; }
.refunded { background: #fce4ec; color: #c62828; }
.cancelled { background: #f5f5f5; color: #616161; }
.res-dates { color: #666; font-size: 0.9rem; margin-bottom: 0.5rem; }
.res-meta { display: flex; gap: 1.5rem; font-size: 0.9rem; color: #444; margin-bottom: 0.5rem; }
.res-footer { display: flex; justify-content: space-between; font-size: 0.8rem; color: #999; }
.loading, .empty { text-align: center; padding: 3rem; color: #888; }
</style>
