import axios from 'axios'
import type { Chart, ChartCreate, ChartUpdate } from '@/types/chart'

const api = axios.create({ baseURL: '/api' })

export interface RecommendationParams {
  replicas: number
  workload_type: string
  service_enabled: boolean
  service_type: string
  resource_limits: boolean
  image_tag: string
  ingress_enabled: boolean
}

export interface ChartValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  checks: string[]
  engine: string
  summary: string
}

export interface ChartTemplateResult {
  success: boolean
  rendered_manifests: string
  errors: string[]
  warnings: string[]
  engine: string
  summary: string
}

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

  validate: (id: number) =>
    api.post<ChartValidationResult>(`/charts/${id}/validate`).then(r => r.data),

  template: (id: number) =>
    api.post<ChartTemplateResult>(`/charts/${id}/template`).then(r => r.data),

  recommendations: (params: RecommendationParams) =>
    api.get<string[]>('/charts/recommendations', { params }).then(r => r.data),

  downloadUrl: (id: number) => `/api/charts/${id}/download`,
}
