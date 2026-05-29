<script setup>
import { ref, onMounted } from 'vue'
import { usePackagesStore } from '../stores/packages'
import PackageCard from '../components/PackageCard.vue'

const store = usePackagesStore()
const destination = ref('')
const minPrice = ref('')
const maxPrice = ref('')

onMounted(() => store.fetchPackages())

function handleFilter() {
  store.fetchPackages({
    destination: destination.value || undefined,
    min_price: minPrice.value || undefined,
    max_price: maxPrice.value || undefined,
  })
}

function clearFilters() {
  destination.value = ''
  minPrice.value = ''
  maxPrice.value = ''
  store.fetchPackages()
}
</script>

<template>
  <div class="packages-page">
    <div class="page-header">
      <h1>Paquetes Turísticos</h1>
    </div>

    <div class="filters">
      <input v-model="destination" type="text" placeholder="Destino" @input="handleFilter" />
      <input v-model="minPrice" type="number" placeholder="Precio mín." @input="handleFilter" />
      <input v-model="maxPrice" type="number" placeholder="Precio máx." @input="handleFilter" />
      <button class="btn-clear" @click="clearFilters">Limpiar</button>
    </div>

    <div v-if="store.loading" class="loading">Cargando paquetes...</div>
    <div v-else-if="store.packages?.length === 0" class="empty">No se encontraron paquetes.</div>
    <div v-else class="packages-grid">
      <PackageCard v-for="pkg in store.packages" :key="pkg.id" :pkg="pkg" />
    </div>
  </div>
</template>

<style scoped>
.packages-page { max-width: 1200px; margin: 0 auto; padding: 2rem; }
.page-header h1 { margin: 0 0 1.5rem; color: #1a1a2e; }
.filters {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 2rem;
  flex-wrap: wrap;
}
.filters input {
  padding: 0.6rem 0.8rem;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 0.9rem;
  outline: none;
  flex: 1;
  min-width: 150px;
}
.filters input:focus { border-color: #4fc3f7; }
.btn-clear {
  padding: 0.6rem 1.2rem;
  background: transparent;
  color: #666;
  border: 1px solid #ddd;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.9rem;
}
.btn-clear:hover { background: #f5f5f5; }
.packages-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1.5rem;
}
.loading, .empty { text-align: center; padding: 3rem; color: #888; }
</style>
