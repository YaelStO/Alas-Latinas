import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '../services/api'

export const useAuthStore = defineStore('auth', () => {
  const user = ref(JSON.parse(localStorage.getItem('user') || 'null'))
  const token = ref(localStorage.getItem('token') || '')

  const isAuthenticated = computed(() => !!token.value)
  const isAdmin = computed(() => user.value?.email?.endsWith('@admin.com') ?? false)

  function setSession(userData, tokenValue) {
    user.value = userData
    token.value = tokenValue
    localStorage.setItem('user', JSON.stringify(userData))
    localStorage.setItem('token', tokenValue)
  }

  async function register(data) {
    const res = await api.auth.register(data)
    setSession(res.data.user, res.data.token)
    return res.data
  }

  async function login(data) {
    const res = await api.auth.login(data)
    setSession(res.data.user, res.data.token)
    return res.data
  }

  async function googleLogin(data) {
    const res = await api.auth.google(data)
    setSession(res.data.user, res.data.token)
    return res.data
  }

  function logout() {
    user.value = null
    token.value = ''
    localStorage.removeItem('user')
    localStorage.removeItem('token')
  }

  return { user, token, isAuthenticated, isAdmin, register, login, googleLogin, logout }
})
