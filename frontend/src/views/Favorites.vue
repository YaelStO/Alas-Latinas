<script setup>
import { ref, onMounted } from 'vue'
import api from '../services/api'
import PackageCard from '../components/PackageCard.vue'

const favorites = ref([])
const loading = ref(true)

async function loadFavorites() {
  loading.value = true
  try {
    const res = await api.favorites.list()
    favorites.value = res.data.favorites
  } catch {} finally {
    loading.value = false
  }
}

onMounted(loadFavorites)
</script>

<template>
  <div class="favorites-page">
    <div class="page-header">
      <h1>Mis Favoritos</h1>
    </div>

    <div v-if="loading" class="loading">Cargando...</div>
    <div v-else-if="favorites.length === 0" class="empty">No tienes favoritos aún.</div>
    <div v-else class="packages-grid">
      <PackageCard v-for="pkg in favorites" :key="pkg.id" :pkg="pkg" />
    </div>
  </div>
</template>

<style scoped>
.favorites-page { max-width: 1200px; margin: 0 auto; padding: 2rem; }
.page-header h1 { margin: 0 0 1.5rem; color: #1a1a2e; }
.packages-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1.5rem;
}
.loading, .empty { text-align: center; padding: 3rem; color: #888; }
</style>
