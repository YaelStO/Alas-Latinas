<script setup>
import { ref, onMounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useRouter } from 'vue-router'
import { canUsePlatformBiometric } from '../services/biometric'

const auth = useAuthStore()
const router = useRouter()
const name = ref('')
const email = ref('')
const password = ref('')
const stellar_address = ref('')
const error = ref('')
const bioMsg = ref('')
const biometricAvailable = ref(false)

async function handleRegister() {
  error.value = ''
  bioMsg.value = ''
  try {
    await auth.register({
      name: name.value,
      email: email.value,
      password: password.value,
      stellar_address: stellar_address.value || undefined,
    })
    if (biometricAvailable.value) {
      try {
        await auth.registerBiometric('Huella / Face ID')
        bioMsg.value = 'Cuenta creada y biometría activada.'
      } catch {
        bioMsg.value = 'Cuenta creada. Activa la biometría en el Dashboard.'
      }
    }
    router.push('/dashboard')
  } catch (e) {
    error.value = e.response?.data?.error || 'Error al registrarse'
  }
}

onMounted(async () => {
  biometricAvailable.value = await canUsePlatformBiometric()
})
</script>

<template>
  <div class="auth-page">
    <div class="auth-card">
      <h2>Crear Cuenta</h2>
      <p class="auth-sub">Regístrate para comenzar a reservar</p>
      <p v-if="biometricAvailable" class="bio-info">🔐 Tras registrarte podrás activar huella o Face ID</p>
      <form @submit.prevent="handleRegister">
        <div class="field">
          <label>Nombre</label>
          <input v-model="name" type="text" placeholder="Tu nombre" required />
        </div>
        <div class="field">
          <label>Email</label>
          <input v-model="email" type="email" placeholder="tu@email.com" required />
        </div>
        <div class="field">
          <label>Contraseña</label>
          <input v-model="password" type="password" placeholder="Mínimo 6 caracteres" required />
        </div>
        <div class="field">
          <label>Dirección Stellar (opcional)</label>
          <input v-model="stellar_address" type="text" placeholder="G..." />
        </div>
        <p v-if="error" class="error">{{ error }}</p>
        <p v-if="bioMsg" class="bio-ok">{{ bioMsg }}</p>
        <button type="submit" class="btn-primary">Crear Cuenta</button>
      </form>
      <p class="auth-footer">¿Ya tienes cuenta? <router-link to="/login">Inicia sesión</router-link></p>
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
.auth-sub { color: #888; margin: 0 0 0.5rem; font-size: 0.9rem; }
.bio-info { color: #0f3460; font-size: 0.85rem; margin: 0 0 1.2rem; background: #e3f2fd; padding: 0.5rem 0.75rem; border-radius: 8px; }
.bio-ok { color: #2e7d32; font-size: 0.9rem; margin: 0 0 1rem; }
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
