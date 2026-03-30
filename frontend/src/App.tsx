import { startTransition, useEffect, useState } from 'react'
import GeneratorPage from '@/pages/GeneratorPage'
import HistoryPage from '@/pages/HistoryPage'

type View = 'generator' | 'history'
type Theme = 'light' | 'dark'

export default function App() {
  const [view, setView] = useState<View>('generator')
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = window.localStorage.getItem('helmgen-theme')
    return saved === 'dark' ? 'dark' : 'light'
  })

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem('helmgen-theme', theme)
  }, [theme])

  return (
    <div>
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          background: 'var(--bg-elevated)',
          borderBottom: '1px solid var(--workspace-border)',
        }}
      >
        <div
          style={{
            maxWidth: '1680px',
            margin: '0 auto',
            padding: '0.9rem 1.5rem',
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
                border: '1px solid var(--border)',
                background: 'var(--panel-contrast)',
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
                padding: '0.25rem',
                background: 'var(--panel-contrast)',
                borderRadius: '999px',
                gap: '0.25rem',
                border: '1px solid var(--border)',
              }}
            >
              <button
                type="button"
                onClick={() => setView('generator')}
                style={{
                  border: 'none',
                  borderRadius: '999px',
                  padding: '0.6rem 1rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: view === 'generator' ? 'var(--workspace-bg)' : 'transparent',
                  color: view === 'generator' ? 'var(--workspace-text)' : 'var(--text-soft)',
                }}
              >
                Генератор
              </button>
              <button
                type="button"
                onClick={() => setView('history')}
                style={{
                  border: 'none',
                  borderRadius: '999px',
                  padding: '0.6rem 1rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: view === 'history' ? 'var(--workspace-bg)' : 'transparent',
                  color: view === 'history' ? 'var(--workspace-text)' : 'var(--text-soft)',
                }}
              >
                История
              </button>
            </div>
          </div>
        </div>
      </header>

      <div style={{ display: view === 'generator' ? 'block' : 'none' }}>
        <GeneratorPage />
      </div>
      <div style={{ display: view === 'history' ? 'block' : 'none' }}>
        <HistoryPage active={view === 'history'} />
      </div>
    </div>
  )
}
