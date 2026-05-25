<script setup>
import { ref, onMounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import api from '../services/api'
import { canUsePlatformBiometric } from '../services/biometric'

const auth = useAuthStore()
const loyaltyPoints = ref(0)
const stats = ref({ total: 0, confirmed: 0, completed: 0, pending: 0 })
const biometricStatus = ref({ enabled: false, devices: [] })
const biometricAvailable = ref(false)
const bioLoading = ref(false)
const bioError = ref('')
const bioSuccess = ref('')

async function loadBiometricStatus() {
  try {
    const res = await api.auth.biometricStatus()
    biometricStatus.value = res.data
  } catch {
    biometricStatus.value = { enabled: false, devices: [] }
  }
}

async function enableBiometric() {
  bioError.value = ''
  bioSuccess.value = ''
  bioLoading.value = true
  try {
    await auth.registerBiometric('Huella / Face ID')
    bioSuccess.value = 'Biometría activada correctamente.'
    await loadBiometricStatus()
  } catch (e) {
    bioError.value = e.response?.data?.error || e.message || 'No se pudo activar la biometría'
  } finally {
    bioLoading.value = false
  }
}

async function removeBiometric(credentialId) {
  bioError.value = ''
  try {
    await api.auth.biometricRemove(credentialId)
    bioSuccess.value = 'Dispositivo eliminado.'
    await loadBiometricStatus()
  } catch (e) {
    bioError.value = e.response?.data?.error || 'Error al eliminar'
  }
}

onMounted(async () => {
  biometricAvailable.value = await canUsePlatformBiometric()
  await loadBiometricStatus()
  try {
    const [loyaltyRes, reservationsRes] = await Promise.all([
      api.loyalty.get(),
      api.reservations.list(),
    ])
    loyaltyPoints.value = loyaltyRes.data.loyalty_points
    const reservations = reservationsRes.data.reservations
    stats.value.total = reservations.length
    stats.value.confirmed = reservations.filter((r) => r.status === 'confirmed').length
    stats.value.completed = reservations.filter((r) => r.status === 'completed').length
    stats.value.pending = reservations.filter((r) => r.status === 'pending').length
  } catch {}
})
</script>

<template>
  <div class="dashboard-page">
    <div class="page-header">
      <h1>Dashboard</h1>
    </div>

    <div class="welcome-card">
      <h2>Bienvenido, {{ auth.user?.name }}</h2>
      <p>{{ auth.user?.email }}</p>
      <p v-if="auth.user?.stellar_address" class="stellar-addr">Stellar: {{ auth.user.stellar_address }}</p>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <span class="stat-value">{{ loyaltyPoints }}</span>
        <span class="stat-label">Puntos de Lealtad</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{{ stats.total }}</span>
        <span class="stat-label">Total Reservas</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{{ stats.pending }}</span>
        <span class="stat-label">Pendientes</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{{ stats.confirmed }}</span>
        <span class="stat-label">Confirmadas</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{{ stats.completed }}</span>
        <span class="stat-label">Completadas</span>
      </div>
    </div>

    <div v-if="biometricAvailable" class="biometric-card">
      <h3>🔐 Autenticación biométrica</h3>
      <p class="bio-desc">Huella dactilar, Face ID o Windows Hello para iniciar sesión sin contraseña.</p>
      <template v-if="biometricStatus.enabled">
        <p class="bio-on">Biometría activa en {{ biometricStatus.devices.length }} dispositivo(s)</p>
        <ul class="device-list">
          <li v-for="d in biometricStatus.devices" :key="d.id">
            <span>{{ d.device_name }} — {{ new Date(d.created_at).toLocaleDateString() }}</span>
            <button type="button" class="btn-remove" @click="removeBiometric(d.id)">Eliminar</button>
          </li>
        </ul>
        <button type="button" class="btn-bio" :disabled="bioLoading" @click="enableBiometric">
          Añadir otro dispositivo
        </button>
      </template>
      <template v-else>
        <button type="button" class="btn-bio" :disabled="bioLoading" @click="enableBiometric">
          {{ bioLoading ? 'Configurando...' : 'Activar huella / Face ID' }}
        </button>
      </template>
      <p v-if="bioError" class="bio-err">{{ bioError }}</p>
      <p v-if="bioSuccess" class="bio-ok">{{ bioSuccess }}</p>
    </div>

    <div class="quick-actions">
      <h3>Acciones Rápidas</h3>
      <div class="actions-grid">
        <router-link to="/packages" class="action-card">🔍 Explorar Paquetes</router-link>
        <router-link to="/reservations" class="action-card">📋 Mis Reservas</router-link>
        <router-link to="/favorites" class="action-card">❤️ Favoritos</router-link>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard-page { max-width: 900px; margin: 0 auto; padding: 2rem; }
.page-header h1 { margin: 0 0 1.5rem; color: #1a1a2e; }
.welcome-card {
  background: linear-gradient(135deg, #1a1a2e, #0f3460);
  color: #fff;
  padding: 1.5rem 2rem;
  border-radius: 12px;
  margin-bottom: 2rem;
}
.welcome-card h2 { margin: 0 0 0.3rem; }
.welcome-card p { margin: 0; color: #aaa; }
.stellar-addr { font-size: 0.85rem; color: #4fc3f7 !important; margin-top: 0.5rem !important; word-break: break-all; }
.stats-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
.stat-card {
  background: #fff;
  border-radius: 12px;
  padding: 1.25rem;
  text-align: center;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}
.stat-value { display: block; font-size: 2rem; font-weight: 700; color: #1a1a2e; }
.stat-label { display: block; font-size: 0.85rem; color: #888; margin-top: 0.3rem; }
.quick-actions h3 { color: #1a1a2e; margin: 0 0 1rem; }
.actions-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem; }
.action-card {
  background: #fff;
  padding: 1.5rem;
  border-radius: 12px;
  text-decoration: none;
  color: #1a1a2e;
  font-weight: 500;
  text-align: center;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  transition: transform 0.2s;
}
.action-card:hover { transform: translateY(-2px); }
.biometric-card {
  background: #fff;
  border-radius: 12px;
  padding: 1.5rem;
  margin-bottom: 2rem;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}
.biometric-card h3 { margin: 0 0 0.5rem; color: #1a1a2e; }
.bio-desc { color: #666; font-size: 0.9rem; margin: 0 0 1rem; }
.bio-on { color: #2e7d32; font-weight: 500; margin: 0 0 0.75rem; }
.device-list { list-style: none; padding: 0; margin: 0 0 1rem; }
.device-list li {
  display: flex; justify-content: space-between; align-items: center;
  padding: 0.5rem 0; border-bottom: 1px solid #eee; font-size: 0.9rem;
}
.btn-remove {
  background: none; border: 1px solid #ef5350; color: #ef5350;
  padding: 0.25rem 0.5rem; border-radius: 6px; cursor: pointer; font-size: 0.8rem;
}
.btn-bio {
  padding: 0.65rem 1.25rem;
  background: #1a1a2e;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
}
.btn-bio:disabled { opacity: 0.6; }
.bio-err { color: #ef5350; font-size: 0.9rem; margin: 0.5rem 0 0; }
.bio-ok { color: #2e7d32; font-size: 0.9rem; margin: 0.5rem 0 0; }
</style>
