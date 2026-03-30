import { useState } from 'react'
import GeneratorPage from '@/pages/GeneratorPage'
import HistoryPage from '@/pages/HistoryPage'

type View = 'generator' | 'history'

export default function App() {
  const [view, setView] = useState<View>('generator')

  return (
    <div>
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          backdropFilter: 'blur(16px)',
          background: 'rgba(241, 245, 249, 0.88)',
          borderBottom: '1px solid rgba(148, 163, 184, 0.2)',
        }}
      >
        <div
          style={{
            maxWidth: '1400px',
            margin: '0 auto',
            padding: '0.9rem 1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
          }}
        >
          <div>
            <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#0f172a' }}>
              HelmGen
            </div>
            <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
              Генерация и хранение Helm-чартов
            </div>
          </div>
          <div
            style={{
              display: 'inline-flex',
              padding: '0.25rem',
              background: '#e2e8f0',
              borderRadius: '999px',
              gap: '0.25rem',
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
                background: view === 'generator' ? '#0f172a' : 'transparent',
                color: view === 'generator' ? 'white' : '#334155',
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
                background: view === 'history' ? '#0f172a' : 'transparent',
                color: view === 'history' ? 'white' : '#334155',
              }}
            >
              История
            </button>
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
