import type { AuthUser } from '@/types/auth'

const TOKEN_KEY = 'helmgen-token'
const USER_KEY = 'helmgen-user'

export function getStoredToken(): string | null {
  return window.localStorage.getItem(TOKEN_KEY)
}

export function setStoredToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token)
}

export function clearStoredToken(): void {
  window.localStorage.removeItem(TOKEN_KEY)
}

export function getStoredUser(): AuthUser | null {
  const raw = window.localStorage.getItem(USER_KEY)
  if (!raw) return null

  try {
    return JSON.parse(raw) as AuthUser
  } catch {
    window.localStorage.removeItem(USER_KEY)
    return null
  }
}

export function setStoredUser(user: AuthUser): void {
  window.localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function clearStoredUser(): void {
  window.localStorage.removeItem(USER_KEY)
}

export function clearStoredSession(): void {
  clearStoredToken()
  clearStoredUser()
  window.dispatchEvent(new Event('helmgen:auth-cleared'))
}
