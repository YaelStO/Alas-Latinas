<script setup>
import { ref } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useRouter } from 'vue-router'

const auth = useAuthStore()
const router = useRouter()
const email = ref('')
const password = ref('')
const error = ref('')

async function handleLogin() {
  error.value = ''
  try {
    await auth.login({ email: email.value, password: password.value })
    router.push('/')
  } catch (e) {
    error.value = e.response?.data?.error || 'Error al iniciar sesión'
  }
}
</script>

<template>
  <div class="auth-page">
    <div class="auth-card">
      <h2>Iniciar Sesión</h2>
      <p class="auth-sub">Accede a tu cuenta para gestionar tus reservas</p>
      <form @submit.prevent="handleLogin">
        <div class="field">
          <label>Email</label>
          <input v-model="email" type="email" placeholder="tu@email.com" required />
        </div>
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
