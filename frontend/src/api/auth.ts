import axios from 'axios'
import type { AuthResponse, AuthUser, LoginPayload, RegisterPayload } from '@/types/auth'
import { clearStoredSession, getStoredToken } from '@/utils/auth'

const authApiClient = axios.create({
  baseURL: '/api',
  timeout: 15000,
})

authApiClient.interceptors.request.use(config => {
  const token = getStoredToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

authApiClient.interceptors.response.use(
  response => response,
  error => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      clearStoredSession()
    }
    return Promise.reject(error)
  },
)

export function extractAuthErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    if (error.code === 'ECONNABORTED') {
      return 'Сервер отвечает слишком долго. Попробуйте ещё раз.'
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
      return 'Не удалось связаться с backend. Проверьте, что API запущен.'
    }
  }

  return fallback
}

export const authApi = {
  register: (payload: RegisterPayload) =>
    authApiClient.post<AuthResponse>('/auth/register', payload).then(r => r.data),

  login: (payload: LoginPayload) =>
    authApiClient.post<AuthResponse>('/auth/login', payload).then(r => r.data),

  me: () => authApiClient.get<AuthUser>('/auth/me', { timeout: 10000 }).then(r => r.data),
}
