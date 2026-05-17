import { startTransition, useEffect, useState } from 'react'
import { authApi } from '@/api/auth'
import AuthPage from '@/pages/AuthPage'
import ToastProvider from '@/components/ToastProvider'
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
    return <div className="app-loading">Проверяем сессию...</div>
  }

  if (!currentUser) {
    return <AuthPage onAuthenticated={handleAuthenticated} />
  }

  return (
    <ToastProvider>
      <div className="app-shell">
        <header className="app-header">
          <div className="app-header__inner">
            <div className="app-brand">
              <div style={{ fontSize: '1.1rem', fontWeight: 950, color: 'var(--text)' }}>
                HelmGen
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Генерация и хранение Helm-чартов
              </div>
            </div>
            <div className="app-header__actions">
              <div className="app-user">
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
                className="app-theme-toggle"
                aria-label="Переключить тему"
              >
                <span aria-hidden="true" style={{ fontSize: '0.95rem', lineHeight: 1 }}>
                  {theme === 'dark' ? '◐' : '◑'}
                </span>
                <span>{theme === 'dark' ? 'Dark' : 'Light'}</span>
              </button>

              <nav className="app-nav" aria-label="Основные разделы">
                <button
                  type="button"
                  onClick={() => setView('generator')}
                  className={view === 'generator' ? 'app-nav__button is-active' : 'app-nav__button'}
                >
                  Генератор
                </button>
                <button
                  type="button"
                  onClick={() => setView('ops')}
                  className={view === 'ops' ? 'app-nav__button is-active' : 'app-nav__button'}
                >
                  Развёртывание
                </button>
                <button
                  type="button"
                  onClick={() => setView('history')}
                  className={view === 'history' ? 'app-nav__button is-active' : 'app-nav__button'}
                >
                  История
                </button>
              </nav>

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
    </ToastProvider>
  )
}
