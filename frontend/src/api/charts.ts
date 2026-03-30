import axios from 'axios'
import type { Chart, ChartCreate, ChartUpdate } from '@/types/chart'

const api = axios.create({ baseURL: '/api' })

export const chartsApi = {
  list: () => api.get<Chart[]>('/charts/').then(r => r.data),

  get: (id: number) => api.get<Chart>(`/charts/${id}`).then(r => r.data),

  create: (data: ChartCreate) =>
    api.post<Chart>('/charts/', data).then(r => r.data),

  update: (id: number, data: ChartUpdate) =>
    api.patch<Chart>(`/charts/${id}`, data).then(r => r.data),

  delete: (id: number) => api.delete(`/charts/${id}`),

  generate: (id: number, values_yaml?: string) =>
    api.post<Chart>(`/charts/${id}/generate`, { values_yaml }).then(r => r.data),
}
