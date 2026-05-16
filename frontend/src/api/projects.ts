import axios from 'axios'
import type { Project, ProjectCreate, ProjectUpdate } from '@/types/project'
import { clearStoredSession, getStoredToken } from '@/utils/auth'

const projectsApiClient = axios.create({
  baseURL: '/api',
  timeout: 15000,
})

projectsApiClient.interceptors.request.use(config => {
  const token = getStoredToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

projectsApiClient.interceptors.response.use(
  response => response,
  error => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      clearStoredSession()
    }
    return Promise.reject(error)
  },
)

export const projectsApi = {
  list: () => projectsApiClient.get<Project[]>('/projects/', { timeout: 10000 }).then(r => r.data),
  create: (data: ProjectCreate) =>
    projectsApiClient.post<Project>('/projects/', data, { timeout: 15000 }).then(r => r.data),
  update: (id: number, data: ProjectUpdate) =>
    projectsApiClient.patch<Project>(`/projects/${id}`, data, { timeout: 15000 }).then(r => r.data),
  delete: (id: number) =>
    projectsApiClient.delete(`/projects/${id}`, { timeout: 10000 }),
}
