import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '../services/api'

export const usePackagesStore = defineStore('packages', () => {
  const packages = ref([])
  const currentPackage = ref(null)
  const loading = ref(false)

  async function fetchPackages(params = {}) {
    loading.value = true
    try {
      const res = await api.packages.list(params)
      packages.value = res.data.packages
    } finally {
      loading.value = false
    }
  }

  async function fetchPackage(id) {
    loading.value = true
    try {
      const res = await api.packages.get(id)
      currentPackage.value = res.data.package
      return res.data.package
    } finally {
      loading.value = false
    }
  }

  async function createPackage(data) {
    const res = await api.packages.create(data)
    return res.data.package
  }

  return { packages, currentPackage, loading, fetchPackages, fetchPackage, createPackage }
})
