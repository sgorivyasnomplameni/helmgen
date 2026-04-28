import axios from 'axios'
import type { Chart, ChartCreate, ChartUpdate } from '@/types/chart'
import { clearStoredSession, getStoredToken } from '@/utils/auth'

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
})

api.interceptors.request.use(config => {
  const token = getStoredToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  response => response,
  error => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      clearStoredSession()
    }
    return Promise.reject(error)
  },
)

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

export interface ChartDryRunResult {
  success: boolean
  output: string
  errors: string[]
  warnings: string[]
  engine: string
  summary: string
}

export interface ChartDeployRequest {
  namespace: string
  release_name?: string
}

export interface ChartDeployResult {
  success: boolean
  release_name: string
  namespace: string
  output: string
  errors: string[]
  warnings: string[]
  status: string
  engine: string
  summary: string
}

export interface ChartReleaseStatusResult {
  success: boolean
  release_name: string
  namespace: string
  output: string
  errors: string[]
  warnings: string[]
  status: string
  engine: string
  summary: string
}

export interface ChartMonitoringResult {
  success: boolean
  release_name: string
  namespace: string
  output: string
  errors: string[]
  warnings: string[]
  status: string
  engine: string
  summary: string
}

export interface ChartReleaseHistoryEntry {
  revision: number
  updated: string | null
  status: string | null
  chart: string | null
  app_version: string | null
  description: string | null
}

export interface ChartReleaseHistoryResult {
  success: boolean
  release_name: string
  namespace: string
  entries: ChartReleaseHistoryEntry[]
  output: string
  errors: string[]
  warnings: string[]
  engine: string
  summary: string
}

export interface ChartRollbackRequest {
  namespace: string
  release_name?: string
  revision?: number
}

export interface ChartRollbackResult {
  success: boolean
  release_name: string
  namespace: string
  revision: number | null
  output: string
  errors: string[]
  warnings: string[]
  status: string
  engine: string
  summary: string
}

export interface ChartUninstallRequest {
  namespace: string
  release_name?: string
}

export interface ChartUninstallResult {
  success: boolean
  release_name: string
  namespace: string
  output: string
  errors: string[]
  warnings: string[]
  engine: string
  summary: string
}

export interface ClusterStatusResult {
  helm_available: boolean
  helm_binary: string | null
  kubeconfig_path: string
  kubeconfig_present: boolean
  current_context: string | null
  cluster_name: string | null
  cluster_server: string | null
  reachable: boolean
  errors: string[]
  warnings: string[]
  summary: string
}

export function extractApiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    if (error.code === 'ECONNABORTED') {
      return 'Сервер отвечает слишком долго. Попробуйте ещё раз или проверьте состояние backend.'
    }

    const detail = error.response?.data

    if (typeof detail === 'string' && detail.trim()) {
      return detail
    }

    if (detail && typeof detail === 'object' && 'detail' in detail) {
      const message = (detail as { detail?: unknown }).detail
      if (typeof message === 'string' && message.trim()) {
        return message
      }
    }

    if (!error.response) {
      return 'Не удалось связаться с backend. Проверьте, что API запущен и доступен.'
    }
  }

  return fallback
}

export const chartsApi = {
  list: () => api.get<Chart[]>('/charts/', { timeout: 10000 }).then(r => r.data),

  get: (id: number) => api.get<Chart>(`/charts/${id}`, { timeout: 10000 }).then(r => r.data),

  create: (data: ChartCreate) =>
    api.post<Chart>('/charts/', data, { timeout: 15000 }).then(r => r.data),

  update: (id: number, data: ChartUpdate) =>
    api.patch<Chart>(`/charts/${id}`, data, { timeout: 15000 }).then(r => r.data),

  delete: (id: number) => api.delete(`/charts/${id}`, { timeout: 10000 }),

  generate: (id: number, values_yaml?: string) =>
    api.post<Chart>(`/charts/${id}/generate`, { values_yaml }, { timeout: 20000 }).then(r => r.data),

  validate: (id: number) =>
    api.post<ChartValidationResult>(`/charts/${id}/validate`, undefined, { timeout: 25000 }).then(r => r.data),

  template: (id: number) =>
    api.post<ChartTemplateResult>(`/charts/${id}/template`, undefined, { timeout: 30000 }).then(r => r.data),

  dryRunDeploy: (id: number) =>
    api.post<ChartDryRunResult>(`/charts/${id}/deploy/dry-run`, undefined, { timeout: 45000 }).then(r => r.data),

  deploy: (id: number, data: ChartDeployRequest) =>
    api.post<ChartDeployResult>(`/charts/${id}/deploy`, data, { timeout: 160000 }).then(r => r.data),

  releaseStatus: (id: number, data: ChartDeployRequest) =>
    api.get<ChartReleaseStatusResult>(`/charts/${id}/deploy/status`, {
      params: data,
      timeout: 50000,
    }).then(r => r.data),

  monitoring: (id: number, data: ChartDeployRequest) =>
    api.get<ChartMonitoringResult>(`/charts/${id}/deploy/monitoring`, {
      params: data,
      timeout: 70000,
    }).then(r => r.data),

  releaseHistory: (id: number, data: ChartDeployRequest) =>
    api.get<ChartReleaseHistoryResult>(`/charts/${id}/deploy/history`, {
      params: data,
      timeout: 50000,
    }).then(r => r.data),

  rollback: (id: number, data: ChartRollbackRequest) =>
    api.post<ChartRollbackResult>(`/charts/${id}/deploy/rollback`, data, { timeout: 140000 }).then(r => r.data),

  uninstall: (id: number, data: ChartUninstallRequest) =>
    api.post<ChartUninstallResult>(`/charts/${id}/deploy/uninstall`, data, { timeout: 110000 }).then(r => r.data),

  clusterStatus: () =>
    api.get<ClusterStatusResult>('/charts/cluster/status', { timeout: 10000 }).then(r => r.data),

  recommendations: (params: RecommendationParams) =>
    api.get<string[]>('/charts/recommendations', { params }).then(r => r.data),

  downloadUrl: (id: number) => `/api/charts/${id}/download`,

  download: async (id: number, filename: string) => {
    const response = await api.get<Blob>(`/charts/${id}/download`, {
      responseType: 'blob',
      timeout: 30000,
    })
    const url = window.URL.createObjectURL(response.data)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  },
}
