import axios from 'axios'
import type { AuditEvent } from '@/types/audit'
import { clearStoredSession, getStoredToken } from '@/utils/auth'

const auditApiClient = axios.create({
  baseURL: '/api',
  timeout: 15000,
})

auditApiClient.interceptors.request.use(config => {
  const token = getStoredToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

auditApiClient.interceptors.response.use(
  response => response,
  error => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      clearStoredSession()
    }
    return Promise.reject(error)
  },
)

export const auditApi = {
  recent: (limit = 20) =>
    auditApiClient.get<AuditEvent[]>('/audit/recent', { params: { limit } }).then(r => r.data),

  chart: (chartId: number) =>
    auditApiClient.get<AuditEvent[]>(`/charts/${chartId}/audit`, { timeout: 10000 }).then(r => r.data),
}
