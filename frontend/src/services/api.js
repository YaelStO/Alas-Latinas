import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 || error.response?.status === 403) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  },
)

export default {
  auth: {
    register: (data) => api.post('/auth/register', data),
    login: (data) => api.post('/auth/login', data),
  },
  packages: {
    list: (params) => api.get('/packages', { params }),
    get: (id) => api.get(`/packages/${id}`),
    create: (data) => api.post('/packages', data),
  },
  reservations: {
    create: (data) => api.post('/reservations', data),
    list: (params) => api.get('/reservations', { params }),
    get: (id) => api.get(`/reservations/${id}`),
  },
  payments: {
    confirm: (data) => api.post('/payments/confirm', data),
  },
  refunds: {
    process: (data) => api.post('/refunds', data),
  },
  reviews: {
    create: (data) => api.post('/reviews', data),
    getByPackage: (packageId) => api.get(`/reviews/package/${packageId}`),
  },
  favorites: {
    add: (data) => api.post('/favorites', data),
    list: () => api.get('/favorites'),
    remove: (packageId) => api.delete(`/favorites/${packageId}`),
  },
  loyalty: {
    get: () => api.get('/loyalty'),
  },
  admin: {
    confirmService: (data) => api.post('/admin/confirm-service', data),
  },
}
