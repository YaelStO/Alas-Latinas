<script setup>
import { ref, onMounted } from 'vue'
import api from '../../services/api'

const packages = ref([])
const loading = ref(true)
const showForm = ref(false)
const editingId = ref(null)
const form = ref({ destination: '', description: '', start_date: '', end_date: '', capacity: 10, price: '', deposit_percent: 20, image_url: '' })
const error = ref('')

async function loadPackages() {
  try {
    const res = await api.admin.getPackages()
    packages.value = res.data.packages
  } catch {}
  loading.value = false
}

function openCreate() {
  editingId.value = null
  form.value = { destination: '', description: '', start_date: '', end_date: '', capacity: 10, price: '', deposit_percent: 20, image_url: '' }
  showForm.value = true
  error.value = ''
}

function openEdit(pkg) {
  editingId.value = pkg.id
  form.value = {
    destination: pkg.destination,
    description: pkg.description || '',
    start_date: pkg.start_date?.split('T')[0] || '',
    end_date: pkg.end_date?.split('T')[0] || '',
    capacity: pkg.capacity,
    price: pkg.price,
    deposit_percent: pkg.deposit_percent,
    image_url: pkg.image_url || '',
  }
  showForm.value = true
  error.value = ''
}

async function handleSubmit() {
  error.value = ''
  try {
    if (editingId.value) {
      await api.admin.updatePackage(editingId.value, form.value)
    } else {
      await api.packages.create(form.value)
    }
    showForm.value = false
    await loadPackages()
  } catch (e) {
    error.value = e.response?.data?.error || 'Error al guardar'
  }
}

async function toggleActive(pkg) {
  if (pkg.is_active) {
    await api.admin.deletePackage(pkg.id)
  } else {
    await api.admin.updatePackage(pkg.id, { is_active: true })
  }
  await loadPackages()
}

onMounted(loadPackages)
</script>

<template>
  <div class="admin-page">
    <div class="page-header">
      <h1>Gestionar Paquetes</h1>
      <button class="btn-primary" @click="openCreate">+ Nuevo Paquete</button>
    </div>

    <div v-if="showForm" class="form-overlay" @click.self="showForm = false">
      <div class="form-card">
        <h3>{{ editingId ? 'Editar Paquete' : 'Crear Paquete' }}</h3>
        <form @submit.prevent="handleSubmit">
          <div class="field"><label>Destino</label><input v-model="form.destination" required /></div>
          <div class="field"><label>Descripción</label><textarea v-model="form.description" rows="3"></textarea></div>
          <div class="field-row">
            <div class="field"><label>Inicio</label><input v-model="form.start_date" type="date" required /></div>
            <div class="field"><label>Fin</label><input v-model="form.end_date" type="date" required /></div>
          </div>
          <div class="field-row">
            <div class="field"><label>Capacidad</label><input v-model="form.capacity" type="number" min="1" required /></div>
            <div class="field"><label>Precio (USD)</label><input v-model="form.price" type="number" step="0.01" min="0" required /></div>
          </div>
          <div class="field-row">
            <div class="field"><label>Depósito %</label><input v-model="form.deposit_percent" type="number" min="0" max="100" /></div>
            <div class="field"><label>URL Imagen</label><input v-model="form.image_url" placeholder="https://..." /></div>
          </div>
          <p v-if="error" class="error">{{ error }}</p>
          <div class="form-actions">
            <button type="button" class="btn-secondary" @click="showForm = false">Cancelar</button>
            <button type="submit" class="btn-primary">{{ editingId ? 'Guardar' : 'Crear' }}</button>
          </div>
        </form>
      </div>
    </div>

    <div v-if="loading" class="loading">Cargando...</div>
    <div v-else-if="packages.length === 0" class="empty">No hay paquetes aún</div>
    <div v-else class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Destino</th><th>Fechas</th><th>Capacidad</th><th>Precio</th><th>Reservas</th><th>Estado</th><th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="pkg in packages" :key="pkg.id" :class="{ inactive: !pkg.is_active }">
            <td><strong>{{ pkg.destination }}</strong></td>
            <td class="small">{{ pkg.start_date?.split('T')[0] }} — {{ pkg.end_date?.split('T')[0] }}</td>
            <td>{{ pkg.available_slots }}/{{ pkg.capacity }}</td>
            <td>${{ parseFloat(pkg.price).toFixed(2) }}</td>
            <td>{{ pkg.active_reservations || 0 }}</td>
            <td>
              <span :class="pkg.is_active ? 'badge-active' : 'badge-inactive'">
                {{ pkg.is_active ? 'Activo' : 'Inactivo' }}
              </span>
            </td>
            <td class="actions">
              <button class="btn-sm" @click="openEdit(pkg)">Editar</button>
              <button class="btn-sm danger" @click="toggleActive(pkg)">
                {{ pkg.is_active ? 'Desactivar' : 'Activar' }}
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
.loading, .empty { text-align: center; color: #888; padding: 3rem; }
.table-wrapper { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.06); }
th { background: #1a1a2e; color: #fff; padding: 0.8rem 1rem; text-align: left; font-weight: 500; font-size: 0.9rem; }
td { padding: 0.8rem 1rem; border-bottom: 1px solid #f0f0f0; font-size: 0.9rem; }
tr.inactive { opacity: 0.5; }
.small { font-size: 0.85rem; color: #888; }
.badge-active { background: #e8f5e9; color: #2e7d32; padding: 0.25rem 0.6rem; border-radius: 12px; font-size: 0.8rem; }
.badge-inactive { background: #fbe9e7; color: #c62828; padding: 0.25rem 0.6rem; border-radius: 12px; font-size: 0.8rem; }
.actions { display: flex; gap: 0.4rem; }
.btn-sm { padding: 0.35rem 0.7rem; border: 1px solid #ddd; border-radius: 6px; background: #fff; cursor: pointer; font-size: 0.8rem; transition: all 0.2s; }
.btn-sm:hover { background: #f5f5f5; }
.btn-sm.danger { color: #ef5350; border-color: #ef5350; }
.btn-sm.danger:hover { background: #ef5350; color: #fff; }
.btn-primary { padding: 0.6rem 1.2rem; background: #4fc3f7; color: #1a1a2e; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; }
.btn-primary:hover { background: #29b6f6; }
.btn-secondary { padding: 0.6rem 1.2rem; background: #f5f5f5; color: #333; border: 1px solid #ddd; border-radius: 8px; cursor: pointer; }
.form-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
.form-card { background: #fff; border-radius: 12px; padding: 2rem; width: 100%; max-width: 560px; max-height: 90vh; overflow-y: auto; }
.form-card h3 { margin: 0 0 1rem; color: #1a1a2e; }
.field { margin-bottom: 0.8rem; flex: 1; }
.field label { display: block; margin-bottom: 0.25rem; font-weight: 500; color: #333; font-size: 0.85rem; }
.field input, .field textarea { width: 100%; padding: 0.6rem; border: 1px solid #ddd; border-radius: 6px; font-size: 0.9rem; outline: none; box-sizing: border-box; }
.field input:focus, .field textarea:focus { border-color: #4fc3f7; }
.field-row { display: flex; gap: 1rem; }
.error { color: #ef5350; font-size: 0.9rem; }
.form-actions { display: flex; gap: 0.8rem; justify-content: flex-end; margin-top: 1rem; }
</style>
