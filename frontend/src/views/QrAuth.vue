<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { canUsePlatformBiometric } from '../services/biometric'
import api from '../services/api'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const sessionId = ref('')
const email = ref('')
const pin = ref('')
const error = ref('')
const step = ref('select')
const biometricAvailable = ref(false)
const loading = ref(false)
const status = ref('')
const successMsg = ref('')

onMounted(async () => {
  sessionId.value = route.query.session
  if (!sessionId.value) {
    error.value = 'No se proporcionó un código QR válido'
    status.value = 'error'
    return
  }
  biometricAvailable.value = await canUsePlatformBiometric()
  if (auth.isAuthenticated) {
    email.value = auth.user?.email || ''
    await approveSession()
  }
})

async function approveSession() {
  loading.value = true
  error.value = ''
  try {
    const res = await api.auth.qrApprove({ sessionId: sessionId.value })
    status.value = 'approved'
    successMsg.value = `Acceso aprobado como ${res.data.user || auth.user?.email}`
    setTimeout(() => router.push('/dashboard'), 2000)
  } catch (e) {
    error.value = e.response?.data?.error || 'Error al aprobar el acceso QR'
    status.value = 'error'
  } finally {
    loading.value = false
  }
}

async function handleBiometricLogin() {
  if (!email.value) {
    error.value = 'Ingresa tu correo electrónico'
    return
  }
  loading.value = true
  error.value = ''
  try {
    const { loginWithBiometric } = await import('../services/biometric')
    const res = await loginWithBiometric(api, email.value)
    auth.setSession(res.data.user, res.data.token)
    await approveSession()
  } catch (e) {
    error.value = e.response?.data?.error || e.message || 'Error de autenticación biométrica'
  } finally {
    loading.value = false
  }
}

async function handlePinLogin() {
  if (!email.value || !pin.value) {
    error.value = 'Ingresa tu correo y PIN'
    return
  }
  loading.value = true
  error.value = ''
  try {
    const res = await api.auth.pinLogin({ email: email.value, pin: pin.value })
    auth.setSession(res.data.user, res.data.token)
    await approveSession()
  } catch (e) {
    error.value = e.response?.data?.error || 'PIN incorrecto'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="qr-auth-page">
    <div class="qr-auth-card">
      <h2>Autenticación QR</h2>
      <p class="auth-sub">Aprueba el acceso desde tu ordenador</p>

      <div v-if="!sessionId" class="status-error">
        <p>{{ error }}</p>
      </div>

      <div v-else-if="status === 'approved'" class="status-approved">
        <div class="check-icon">✓</div>
        <p>{{ successMsg }}</p>
        <p class="redirect-msg">Redirigiendo...</p>
      </div>

      <div v-else-if="status === 'error'" class="status-error">
        <p>{{ error }}</p>
        <button type="button" class="btn-retry" @click="step = 'select'; status = ''; error = ''">Intentar de nuevo</button>
      </div>

      <div v-else-if="step === 'select'" class="auth-step">
        <div class="field">
          <label>Correo electrónico</label>
          <input v-model="email" type="email" placeholder="tu@email.com" required />
        </div>
        <p v-if="error" class="error-msg">{{ error }}</p>
        <div class="method-list">
          <button
            v-if="biometricAvailable"
            type="button"
            class="btn-method"
            :disabled="loading || !email"
            @click="handleBiometricLogin"
          >
            <span class="method-icon">🔐</span>
            <span class="method-text">{{ loading ? 'Autenticando...' : 'Huella / Face ID' }}</span>
          </button>
          <button
            type="button"
            class="btn-method"
            :disabled="loading || !email"
            @click="step = 'pin'"
          >
            <span class="method-icon">#️⃣</span>
            <span class="method-text">PIN numérico</span>
          </button>
        </div>
      </div>

      <div v-else-if="step === 'pin'" class="auth-step">
        <div class="field">
          <label>Correo electrónico</label>
          <input v-model="email" type="email" placeholder="tu@email.com" required />
        </div>
        <div class="field">
          <label>PIN numérico</label>
          <input v-model="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" placeholder="••••" @keyup.enter="handlePinLogin" />
        </div>
        <p v-if="error" class="error-msg">{{ error }}</p>
        <button type="button" class="btn-primary" :disabled="loading || !email || !pin" @click="handlePinLogin">
          {{ loading ? 'Verificando...' : 'Aprobar con PIN' }}
        </button>
        <button type="button" class="btn-back" @click="step = 'select'; error = ''">Atrás</button>
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
  box-shadow: 0 4px 20px rgba(0,0,0,0.08); text-align: center; max-width: 400px; width: 100%;
}
.qr-auth-card h2 { margin: 0 0 0.3rem; color: #1a1a2e; }
.auth-sub { color: #888; margin: 0 0 1.5rem; font-size: 0.9rem; }
.check-icon {
  width: 60px; height: 60px; background: #2e7d32; color: #fff;
  border-radius: 50%; display: flex; align-items: center; justify-content: center;
  font-size: 2rem; margin: 0 auto 1rem;
}
.redirect-msg { font-size: 0.85rem; color: #888; margin-top: 1rem; }
.status-approved p { color: #2e7d32; font-weight: 500; }
.status-error p { color: #ef5350; }
.field { margin-bottom: 1rem; text-align: left; }
.field label { display: block; margin-bottom: 0.3rem; font-weight: 500; color: #333; font-size: 0.9rem; }
.field input {
  width: 100%; padding: 0.7rem; border: 1px solid #ddd; border-radius: 8px;
  font-size: 1rem; outline: none; box-sizing: border-box;
}
.field input:focus { border-color: #4fc3f7; }
.error-msg { color: #ef5350; font-size: 0.9rem; margin: 0 0 1rem; }
.method-list { display: flex; flex-direction: column; gap: 0.75rem; margin-top: 1rem; }
.btn-method {
  display: flex; align-items: center; gap: 0.75rem; width: 100%;
  padding: 1rem; border: 1px solid #ddd; border-radius: 12px;
  background: #fff; cursor: pointer; transition: all 0.2s; font-size: 1rem;
}
.btn-method:hover:not(:disabled) { border-color: #4fc3f7; background: #f0f9ff; }
.btn-method:disabled { opacity: 0.5; cursor: not-allowed; }
.method-icon { font-size: 1.5rem; }
.method-text { font-weight: 500; color: #1a1a2e; }
.btn-primary {
  width: 100%; padding: 0.75rem; background: #4fc3f7; color: #1a1a2e;
  border: none; border-radius: 8px; font-size: 1rem; font-weight: 600; cursor: pointer;
}
.btn-primary:hover { background: #29b6f6; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-back {
  margin-top: 0.75rem; background: none; border: 1px solid #ddd; color: #666;
  padding: 0.6rem 1.5rem; border-radius: 8px; cursor: pointer; font-size: 0.9rem;
}
.btn-retry {
  margin-top: 0.75rem; padding: 0.6rem 1.5rem; background: #1a1a2e; color: #fff;
  border: none; border-radius: 8px; cursor: pointer;
}
</style>
