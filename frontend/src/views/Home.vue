<script setup>
import { ref, onMounted } from 'vue'
import { usePackagesStore } from '../stores/packages'
import PackageCard from '../components/PackageCard.vue'

const store = usePackagesStore()
const search = ref('')

onMounted(() => store.fetchPackages({ active: 'true' }))

function handleSearch() {
  store.fetchPackages({ destination: search.value || undefined, active: 'true' })
}
</script>

<template>
  <div class="home">
    <section class="hero">
      <h1>Descubre tu próximo viaje</h1>
      <p>Reserva paquetes turísticos con la seguridad de la blockchain</p>
      <div class="search-box">
        <input v-model="search" type="text" placeholder="Buscar destino..." @keyup.enter="handleSearch" />
        <button @click="handleSearch">Buscar</button>
      </div>
    </section>

    <section class="section">
      <h2>Paquetes Destacados</h2>
      <div v-if="store.loading" class="loading">Cargando...</div>
      <div v-else-if="store.packages.length === 0" class="empty">No hay paquetes disponibles aún.</div>
      <div v-else class="packages-grid">
        <PackageCard v-for="pkg in store.packages" :key="pkg.id" :pkg="pkg" />
      </div>
    </section>
  </div>
</template>

<style scoped>
.hero {
  text-align: center;
  padding: 4rem 2rem;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  color: #fff;
}
.hero h1 { font-size: 2.5rem; margin: 0 0 0.5rem; }
.hero p { font-size: 1.1rem; color: #aaa; margin: 0 0 2rem; }
.search-box {
  display: flex;
  max-width: 500px;
  margin: 0 auto;
  gap: 0.5rem;
}
.search-box input {
  flex: 1;
  padding: 0.75rem 1rem;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  outline: none;
}
.search-box button {
  padding: 0.75rem 1.5rem;
  background: #4fc3f7;
  color: #1a1a2e;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}
.search-box button:hover { background: #29b6f6; }
.section { padding: 2rem; max-width: 1200px; margin: 0 auto; }
.section h2 { margin: 0 0 1.5rem; color: #1a1a2e; }
.packages-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1.5rem;
}
.loading, .empty { text-align: center; padding: 3rem; color: #888; }
</style>
