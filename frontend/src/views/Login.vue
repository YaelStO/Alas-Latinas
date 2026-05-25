<script setup>
import { ref, watch, onMounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useRouter } from 'vue-router'
import { canUsePlatformBiometric } from '../services/biometric'
import api from '../services/api'

const auth = useAuthStore()
const router = useRouter()
const email = ref('')
const password = ref('')
const error = ref('')
const googleLoading = ref(false)
const biometricLoading = ref(false)
const biometricAvailable = ref(false)
const hasBiometric = ref(false)
const userRegistered = ref(false)
const checkingBio = ref(false)

async function handleLogin() {
  error.value = ''
  try {
    await auth.login({ email: email.value, password: password.value })
    router.push('/')
  } catch (e) {
    error.value = e.response?.data?.error || 'Error al iniciar sesión'
  }
}

async function handleBiometricLogin() {
  error.value = ''
  if (!email.value) {
    error.value = 'Ingresa tu email para usar biometría'
    return
  }
  if (!hasBiometric.value) {
    error.value = 'Primero activa huella/Face ID en el Dashboard (inicia sesión con contraseña).'
    return
  }
  biometricLoading.value = true
  try {
    await auth.biometricLogin(email.value)
    router.push('/')
  } catch (e) {
    error.value = e.response?.data?.error || e.message || 'Error con biometría'
  } finally {
    biometricLoading.value = false
  }
}

async function checkBiometricForEmail() {
  if (!email.value || !email.value.includes('@')) {
    hasBiometric.value = false
    userRegistered.value = false
    return
  }
  checkingBio.value = true
  try {
    const res = await api.auth.biometricCheck(email.value)
    userRegistered.value = res.data.registered
    hasBiometric.value = res.data.has_biometric
  } catch {
    hasBiometric.value = false
    userRegistered.value = false
  } finally {
    checkingBio.value = false
  }
}

watch(email, () => {
  checkBiometricForEmail()
})

async function handleGoogleCredential(response) {
  error.value = ''
  googleLoading.value = true
  try {
    await auth.googleLogin({ credential: response.credential })
    router.push('/')
  } catch (e) {
    error.value = e.response?.data?.error || 'Error al iniciar sesión con Google'
  } finally {
    googleLoading.value = false
  }
}

function renderGoogleButton() {
  const el = document.getElementById('google-signin-btn')
  if (el && window.google?.accounts?.id) {
    window.google.accounts.id.renderButton(el, {
      type: 'standard',
      shape: 'rectangular',
      theme: 'outline',
      text: 'signin_with',
      size: 'large',
      width: 336,
    })
  }
}

onMounted(async () => {
  biometricAvailable.value = await canUsePlatformBiometric()
  if (window.google?.accounts?.id) {
    window.google.accounts.id.initialize({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
      callback: handleGoogleCredential,
      cancel_on_tap_outside: false,
    })
    renderGoogleButton()
  }
})
</script>

<template>
  <div class="auth-page">
    <div class="auth-card">
      <h2>Iniciar Sesión</h2>
      <p class="auth-sub">Accede a tu cuenta para gestionar tus reservas</p>

      <div v-if="googleLoading" class="google-loading">
        <div class="spinner"></div>
        <span>Conectando con Google...</span>
      </div>
      <div v-else id="google-signin-btn" class="google-btn-wrapper"></div>

      <div class="divider"><span>o con email</span></div>

      <div class="field">
        <label>Email</label>
        <input v-model="email" type="email" placeholder="tu@email.com" required />
      </div>

      <!-- Biometría -->
      <div class="biometric-section">
        <template v-if="!biometricAvailable">
          <p class="bio-warn">
            Tu navegador o dispositivo no tiene huella/Face ID disponible.
            Usa Chrome o Edge con Windows Hello configurado, o un móvil con lector biométrico.
          </p>
        </template>
        <template v-else>
          <button
            type="button"
            class="btn-biometric"
            :disabled="biometricLoading || checkingBio || !email || !hasBiometric"
            @click="handleBiometricLogin"
          >
            <span v-if="biometricLoading">Verificando...</span>
            <span v-else-if="checkingBio">Comprobando...</span>
            <span v-else>🔐 Entrar con huella / Face ID</span>
          </button>
          <p v-if="email && !checkingBio && !userRegistered" class="bio-hint">
            Este email no está registrado. <router-link to="/register">Crea una cuenta</router-link> primero.
          </p>
          <p v-else-if="email && !checkingBio && userRegistered && !hasBiometric" class="bio-hint">
            Biometría no activada. Inicia sesión con contraseña → Dashboard → <strong>Activar huella / Face ID</strong>.
          </p>
          <p v-else-if="email && hasBiometric" class="bio-ok">
            ✓ Biometría disponible para este email
          </p>
        </template>
      </div>

      <div class="divider"><span>contraseña</span></div>

      <form @submit.prevent="handleLogin">
        <div class="field">
          <label>Contraseña</label>
          <input v-model="password" type="password" placeholder="••••••" required />
        </div>
        <p v-if="error" class="error">{{ error }}</p>
        <button type="submit" class="btn-primary">Entrar</button>
      </form>
      <p class="auth-footer">¿No tienes cuenta? <router-link to="/register">Regístrate</router-link></p>
    </div>
  </div>
</template>

<style scoped>
.auth-page {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: calc(100vh - 64px);
  background: #f5f5f5;
}
.auth-card {
  background: #fff;
  padding: 2.5rem;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
  width: 100%;
  max-width: 400px;
}
.auth-card h2 { margin: 0 0 0.3rem; color: #1a1a2e; }
.auth-sub { color: #888; margin: 0 0 1.5rem; font-size: 0.9rem; }
.google-btn-wrapper { display: flex; justify-content: center; margin-bottom: 0.5rem; }
.google-loading {
  display: flex; align-items: center; justify-content: center; gap: 0.5rem;
  padding: 0.75rem; color: #555; font-size: 0.9rem;
}
.spinner {
  width: 20px; height: 20px; border: 2px solid #ddd;
  border-top-color: #4fc3f7; border-radius: 50%; animation: spin 0.6s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.divider {
  display: flex; align-items: center; gap: 1rem; margin: 1.2rem 0;
  color: #bbb; font-size: 0.85rem;
}
.divider::before, .divider::after { content: ''; flex: 1; height: 1px; background: #e0e0e0; }
.biometric-section { margin: 0.5rem 0 1rem; }
.btn-biometric {
  width: 100%;
  padding: 0.75rem;
  background: #1a1a2e;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}
.btn-biometric:hover:not(:disabled) { background: #0f3460; }
.btn-biometric:disabled { opacity: 0.5; cursor: not-allowed; }
.bio-hint { font-size: 0.8rem; color: #888; margin: 0.5rem 0 0; text-align: center; line-height: 1.4; }
.bio-hint a { color: #4fc3f7; }
.bio-warn { font-size: 0.8rem; color: #e65100; background: #fff3e0; padding: 0.6rem; border-radius: 8px; margin: 0; line-height: 1.4; }
.bio-ok { font-size: 0.85rem; color: #2e7d32; margin: 0.5rem 0 0; text-align: center; }
.field { margin-bottom: 1rem; }
.field label { display: block; margin-bottom: 0.3rem; font-weight: 500; color: #333; font-size: 0.9rem; }
.field input {
  width: 100%;
  padding: 0.7rem;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 1rem;
  outline: none;
  box-sizing: border-box;
}
.field input:focus { border-color: #4fc3f7; }
.error { color: #ef5350; font-size: 0.9rem; margin: 0 0 1rem; }
.btn-primary {
  width: 100%;
  padding: 0.75rem;
  background: #4fc3f7;
  color: #1a1a2e;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}
.btn-primary:hover { background: #29b6f6; }
.auth-footer { text-align: center; margin-top: 1rem; color: #888; font-size: 0.9rem; }
.auth-footer a { color: #4fc3f7; text-decoration: none; font-weight: 500; }
</style>
