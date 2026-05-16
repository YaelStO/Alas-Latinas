<script setup>
defineProps({
  pkg: { type: Object, required: true },
})
</script>

<template>
  <div class="package-card">
    <div class="card-image" :style="{ backgroundImage: pkg.image_url ? `url(${pkg.image_url})` : 'none' }">
      <div v-if="!pkg.image_url" class="card-image-placeholder">{{ pkg.destination.charAt(0) }}</div>
      <span class="card-price">${{ Number(pkg.price).toLocaleString() }}</span>
      <span v-if="!pkg.is_active" class="card-inactive">Inactivo</span>
    </div>
    <div class="card-body">
      <h3 class="card-title">{{ pkg.destination }}</h3>
      <p class="card-dates">{{ pkg.start_date }} — {{ pkg.end_date }}</p>
      <p v-if="pkg.description" class="card-desc">{{ pkg.description.slice(0, 100) }}{{ pkg.description.length > 100 ? '...' : '' }}</p>
      <div class="card-meta">
        <span>{{ pkg.available_slots }}/{{ pkg.capacity }} disponibles</span>
        <span>Depósito {{ pkg.deposit_percent }}%</span>
      </div>
      <router-link :to="`/packages/${pkg.id}`" class="card-btn">Ver Detalle</router-link>
    </div>
  </div>
</template>

<style scoped>
.package-card {
  background: #fff;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
  transition: transform 0.2s, box-shadow 0.2s;
}
.package-card:hover { transform: translateY(-4px); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12); }
.card-image {
  height: 180px;
  background-size: cover;
  background-position: center;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #e0e0e0;
}
.card-image-placeholder {
  font-size: 3rem;
  font-weight: 700;
  color: #999;
}
.card-price {
  position: absolute;
  top: 12px;
  right: 12px;
  background: #1a1a2e;
  color: #fff;
  padding: 0.3rem 0.7rem;
  border-radius: 20px;
  font-size: 0.9rem;
  font-weight: 600;
}
.card-inactive {
  position: absolute;
  top: 12px;
  left: 12px;
  background: #ef5350;
  color: #fff;
  padding: 0.2rem 0.6rem;
  border-radius: 4px;
  font-size: 0.8rem;
}
.card-body { padding: 1rem; }
.card-title { margin: 0 0 0.3rem; font-size: 1.15rem; color: #1a1a2e; }
.card-dates { color: #666; font-size: 0.85rem; margin: 0 0 0.5rem; }
.card-desc { color: #555; font-size: 0.9rem; margin: 0 0 0.75rem; line-height: 1.4; }
.card-meta {
  display: flex;
  justify-content: space-between;
  font-size: 0.8rem;
  color: #888;
  margin-bottom: 0.75rem;
}
.card-btn {
  display: block;
  text-align: center;
  background: #4fc3f7;
  color: #1a1a2e;
  text-decoration: none;
  padding: 0.6rem;
  border-radius: 8px;
  font-weight: 600;
  transition: background 0.2s;
}
.card-btn:hover { background: #29b6f6; }
</style>
