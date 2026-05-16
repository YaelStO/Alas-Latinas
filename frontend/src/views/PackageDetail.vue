<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { usePackagesStore } from '../stores/packages'
import { useAuthStore } from '../stores/auth'
import api from '../services/api'

const route = useRoute()
const store = usePackagesStore()
const auth = useAuthStore()

const reviews = ref([])
const avgRating = ref(0)
const totalReviews = ref(0)
const isFavorite = ref(false)
const reserving = ref(false)
const reserveMsg = ref('')
const reviewForm = ref({ rating: 5, comment: '' })
const reviewMsg = ref('')

const pkg = computed(() => store.currentPackage)

async function loadPackage() {
  await store.fetchPackage(route.params.id)
  await loadReviews()
  if (auth.isAuthenticated) {
    await checkFavorite()
  }
}

async function loadReviews() {
  try {
    const res = await api.reviews.getByPackage(route.params.id)
    reviews.value = res.data.reviews
    avgRating.value = res.data.average_rating
    totalReviews.value = res.data.total
  } catch {}
}

async function checkFavorite() {
  try {
    const res = await api.favorites.list()
    isFavorite.value = res.data.favorites.some((f) => f.id === route.params.id)
  } catch {}
}

async function toggleFavorite() {
  try {
    if (isFavorite.value) {
      await api.favorites.remove(route.params.id)
      isFavorite.value = false
    } else {
      await api.favorites.add({ package_id: route.params.id })
      isFavorite.value = true
    }
  } catch {}
}

async function reserve() {
  reserving.value = true
  reserveMsg.value = ''
  try {
    await api.reservations.create({ package_id: route.params.id })
    reserveMsg.value = '¡Reservación creada con éxito!'
    await loadPackage()
  } catch (e) {
    reserveMsg.value = e.response?.data?.error || 'Error al reservar'
  } finally {
    reserving.value = false
  }
}

async function submitReview() {
  reviewMsg.value = ''
  try {
    await api.reviews.create({ package_id: route.params.id, ...reviewForm.value })
    reviewMsg.value = 'Reseña publicada'
    reviewForm.value.comment = ''
    await loadReviews()
  } catch (e) {
    reviewMsg.value = e.response?.data?.error || 'Error al publicar reseña'
  }
}

onMounted(loadPackage)
</script>

<template>
  <div v-if="pkg" class="detail-page">
    <div class="detail-header" :style="{ backgroundImage: pkg.image_url ? `url(${pkg.image_url})` : 'none' }">
      <div v-if="!pkg.image_url" class="header-placeholder">{{ pkg.destination }}</div>
    </div>

    <div class="detail-body">
      <div class="detail-main">
        <div class="detail-info">
          <h1>{{ pkg.destination }}</h1>
          <div class="detail-meta">
            <span>📅 {{ pkg.start_date }} — {{ pkg.end_date }}</span>
            <span>💰 ${{ Number(pkg.price).toLocaleString() }}</span>
            <span>📦 {{ pkg.available_slots }}/{{ pkg.capacity }} disponibles</span>
            <span>🔒 Depósito {{ pkg.deposit_percent }}%</span>
          </div>
          <p v-if="pkg.description" class="detail-desc">{{ pkg.description }}</p>

          <div v-if="auth.isAuthenticated" class="detail-actions">
            <button class="btn-primary" :disabled="reserving || pkg.available_slots <= 0" @click="reserve">
              {{ pkg.available_slots <= 0 ? 'Sin cupo' : reserving ? 'Reservando...' : 'Reservar Ahora' }}
            </button>
            <button class="btn-fav" @click="toggleFavorite">
              {{ isFavorite ? '❤️ Quitar de favoritos' : '🤍 Agregar a favoritos' }}
            </button>
          </div>
          <p v-if="reserveMsg" :class="reserveMsg.includes('éxito') ? 'msg-success' : 'msg-error'">{{ reserveMsg }}</p>

          <div class="reviews-section">
            <h2>Reseñas <span v-if="totalReviews">({{ avgRating }} ★ — {{ totalReviews }})</span></h2>
            <div v-if="reviews.length === 0" class="empty">No hay reseñas aún.</div>
            <div v-for="r in reviews" :key="r.created_at" class="review-item">
              <strong>{{ r.user_name }}</strong>
              <span class="review-rating">{{ '★'.repeat(r.rating) }}{{ '☆'.repeat(5 - r.rating) }}</span>
              <p v-if="r.comment">{{ r.comment }}</p>
            </div>

            <div v-if="auth.isAuthenticated" class="review-form">
              <h3>Escribe una reseña</h3>
              <select v-model.number="reviewForm.rating">
                <option :value="5">★★★★★</option>
                <option :value="4">★★★★☆</option>
                <option :value="3">★★★☆☆</option>
                <option :value="2">★★☆☆☆</option>
                <option :value="1">★☆☆☆☆</option>
              </select>
              <textarea v-model="reviewForm.comment" placeholder="Tu comentario (opcional)" rows="3"></textarea>
              <button class="btn-primary" @click="submitReview">Publicar Reseña</button>
              <p v-if="reviewMsg" :class="reviewMsg.includes('publicada') ? 'msg-success' : 'msg-error'">{{ reviewMsg }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div v-else class="loading-page">
    <p v-if="store.loading">Cargando...</p>
    <p v-else>Paquete no encontrado.</p>
  </div>
</template>

<style scoped>
.detail-header {
  height: 300px;
  background-size: cover;
  background-position: center;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #1a1a2e;
}
.header-placeholder {
  font-size: 3rem;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
}
.detail-body { max-width: 900px; margin: 0 auto; padding: 2rem; }
.detail-info h1 { margin: 0 0 1rem; color: #1a1a2e; font-size: 2rem; }
.detail-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 1.5rem;
  color: #555;
  font-size: 0.95rem;
}
.detail-desc { color: #444; line-height: 1.7; margin-bottom: 1.5rem; }
.detail-actions { display: flex; gap: 1rem; margin-bottom: 1rem; flex-wrap: wrap; }
.btn-primary {
  padding: 0.75rem 2rem;
  background: #4fc3f7;
  color: #1a1a2e;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary:hover:not(:disabled) { background: #29b6f6; }
.btn-fav {
  padding: 0.75rem 1.5rem;
  background: transparent;
  color: #e91e63;
  border: 1px solid #e91e63;
  border-radius: 8px;
  font-size: 0.95rem;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-fav:hover { background: #fce4ec; }
.msg-success { color: #2e7d32; font-weight: 500; }
.msg-error { color: #ef5350; font-weight: 500; }
.reviews-section { margin-top: 3rem; }
.reviews-section h2 { color: #1a1a2e; }
.reviews-section h2 span { font-size: 1rem; color: #888; }
.review-item {
  background: #f9f9f9;
  padding: 1rem;
  border-radius: 8px;
  margin-bottom: 0.75rem;
}
.review-rating { color: #f59e0b; margin-left: 0.5rem; }
.review-item p { margin: 0.3rem 0 0; color: #555; }
.review-form { margin-top: 2rem; }
.review-form select, .review-form textarea {
  width: 100%;
  padding: 0.6rem;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 0.95rem;
  margin-bottom: 0.75rem;
  outline: none;
  box-sizing: border-box;
}
.review-form select:focus, .review-form textarea:focus { border-color: #4fc3f7; }
.empty { color: #888; padding: 1rem 0; }
.loading-page { text-align: center; padding: 4rem; color: #888; }
</style>
