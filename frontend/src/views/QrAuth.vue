<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '../services/api'

const route = useRoute()
const router = useRouter()
const status = ref('pending')
const error = ref('')

onMounted(async () => {
  const sessionId = route.query.session
  if (!sessionId) {
    error.value = 'No se proporcionó un código QR válido'
    return
  }
  try {
    const res = await api.auth.qrApprove({ sessionId })
    status.value = 'approved'
    setTimeout(() => router.push('/dashboard'), 1500)
  } catch (e) {
    error.value = e.response?.data?.error || 'Error al aprobar el acceso QR'
    status.value = 'error'
  }
})
</script>

<template>
  <div class="qr-auth-page">
    <div class="qr-auth-card">
      <h2>Autenticación QR</h2>
      <div v-if="status === 'approved'" class="status-approved">
        <div class="check-icon">✓</div>
        <p>Acceso aprobado correctamente</p>
        <p class="redirect-msg">Redirigiendo al Dashboard...</p>
      </div>
      <div v-else-if="error" class="status-error">
        <p>{{ error }}</p>
      </div>
      <div v-else class="status-pending">
        <div class="spinner"></div>
        <p>Aprobando acceso...</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.qr-auth-page {
  display: flex; justify-content: center; align-items: center;
  min-height: calc(100vh - 64px); background: #f5f5f5;
}
.qr-auth-card {
  background: #fff; padding: 2.5rem; border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.08); text-align: center; max-width: 400px;
}
.qr-auth-card h2 { margin: 0 0 1.5rem; color: #1a1a2e; }
.check-icon {
  width: 60px; height: 60px; background: #2e7d32; color: #fff;
  border-radius: 50%; display: flex; align-items: center; justify-content: center;
  font-size: 2rem; margin: 0 auto 1rem;
}
.redirect-msg { font-size: 0.85rem; color: #888; margin-top: 1rem; }
.spinner {
  width: 40px; height: 40px; border: 3px solid #ddd;
  border-top-color: #4fc3f7; border-radius: 50%;
  animation: spin 0.6s linear infinite; margin: 0 auto 1rem;
}
@keyframes spin { to { transform: rotate(360deg); } }
.status-approved p { color: #2e7d32; font-weight: 500; }
.status-error p { color: #ef5350; }
.status-pending p { color: #555; }
</style>
