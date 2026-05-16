import { startTransition, useEffect, useState } from 'react'
import { authApi } from '@/api/auth'
import AuthPage from '@/pages/AuthPage'
import GeneratorPage from '@/pages/GeneratorPage'
import HistoryPage from '@/pages/HistoryPage'
import OpsPage from '@/pages/OpsPage'
import type { AuthResponse, AuthUser } from '@/types/auth'
import { clearStoredSession, getStoredToken, getStoredUser, setStoredToken, setStoredUser } from '@/utils/auth'

type View = 'generator' | 'ops' | 'history'
type Theme = 'light' | 'dark'

export default function App() {
  const [view, setView] = useState<View>('generator')
  const [activeChartId, setActiveChartId] = useState<number | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => getStoredUser())
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = window.localStorage.getItem('helmgen-theme')
    return saved === 'dark' ? 'dark' : 'light'
  })

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem('helmgen-theme', theme)
  }, [theme])

  useEffect(() => {
    const token = getStoredToken()
    if (!token) {
      setCurrentUser(null)
      setAuthReady(true)
      return
    }

    void authApi
      .me()
      .then(user => {
        setStoredUser(user)
        setCurrentUser(user)
      })
      .catch(() => {
        clearStoredSession()
        setCurrentUser(null)
      })
      .finally(() => setAuthReady(true))
  }, [])

  useEffect(() => {
    function handleAuthCleared() {
      setCurrentUser(null)
      setActiveChartId(null)
      setView('generator')
    }

    window.addEventListener('helmgen:auth-cleared', handleAuthCleared)
    return () => window.removeEventListener('helmgen:auth-cleared', handleAuthCleared)
  }, [])

  function handleAuthenticated(payload: AuthResponse) {
    setStoredToken(payload.access_token)
    setStoredUser(payload.user)
    setCurrentUser(payload.user)
    setAuthReady(true)
    setView('generator')
  }

  function handleLogout() {
    clearStoredSession()
    setCurrentUser(null)
    setActiveChartId(null)
    setView('generator')
  }

  if (!authReady) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: 'var(--text-muted)' }}>
        Проверяем сессию...
      </div>
    )
  }

  if (!currentUser) {
    return <AuthPage onAuthenticated={handleAuthenticated} />
  }

  return (
    <div>
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          background: 'var(--bg-elevated)',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <div
          style={{
            maxWidth: '1680px',
            margin: '0 auto',
            padding: '0.8rem 1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
          }}
        >
          <div>
            <div style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--text)' }}>
              HelmGen
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Генерация и хранение Helm-чартов
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: 'var(--text)', fontSize: '0.9rem', fontWeight: 700 }}>
                {currentUser.full_name || currentUser.email}
              </div>
              <button
                type="button"
                onClick={handleLogout}
                style={{
                  marginTop: '0.1rem',
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  padding: 0,
                }}
              >
                Выйти
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                startTransition(() => {
                  setTheme(prev => (prev === 'dark' ? 'light' : 'dark'))
                })
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.55rem',
                padding: '0.55rem 0.85rem',
                borderRadius: '999px',
                border: '1px solid var(--border-subtle)',
                background: 'var(--surface-contrast)',
                color: 'var(--text-soft)',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: '0.95rem', lineHeight: 1 }}>
                {theme === 'dark' ? '◐' : '◑'}
              </span>
              <span>{theme === 'dark' ? 'Dark' : 'Light'}</span>
            </button>

            <div
              style={{
                display: 'inline-flex',
                gap: '0.1rem',
                border: '1px solid var(--border-subtle)',
                borderRadius: '999px',
                padding: '0.15rem',
                background: 'var(--surface-base)',
              }}
            >
              <button
                type="button"
                onClick={() => setView('generator')}
                style={{
                  border: 'none',
                  borderRadius: '999px',
                  padding: '0.55rem 0.95rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: view === 'generator' ? 'var(--surface-contrast)' : 'transparent',
                  color: view === 'generator' ? 'var(--text)' : 'var(--text-muted)',
                }}
              >
                Генератор
              </button>
              <button
                type="button"
                onClick={() => setView('ops')}
                style={{
                  border: 'none',
                  borderRadius: '999px',
                  padding: '0.55rem 0.95rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: view === 'ops' ? 'var(--surface-contrast)' : 'transparent',
                  color: view === 'ops' ? 'var(--text)' : 'var(--text-muted)',
                }}
              >
                Проверка и deploy
              </button>
            </div>

            <button
              type="button"
              onClick={() => setView('history')}
              style={{
                border: '1px solid var(--border-subtle)',
                borderRadius: '999px',
                padding: '0.55rem 0.95rem',
                fontWeight: 700,
                cursor: 'pointer',
                background: view === 'history' ? 'var(--surface-contrast)' : 'transparent',
                color: view === 'history' ? 'var(--text)' : 'var(--text-muted)',
              }}
            >
              История
            </button>
          </div>
        </div>
      </header>

      <div style={{ display: view === 'generator' ? 'block' : 'none' }}>
        <GeneratorPage
          onChartReady={chartId => setActiveChartId(chartId)}
          onOpenOps={() => setView('ops')}
        />
      </div>
      <div style={{ display: view === 'ops' ? 'block' : 'none' }}>
        <OpsPage
          active={view === 'ops'}
          activeChartId={activeChartId}
          onOpenGenerator={() => setView('generator')}
        />
      </div>
      <div style={{ display: view === 'history' ? 'block' : 'none' }}>
        <HistoryPage
          active={view === 'history'}
          onOpenOps={chartId => {
            setActiveChartId(chartId)
            setView('ops')
          }}
        />
      </div>
    </div>
  )
}
