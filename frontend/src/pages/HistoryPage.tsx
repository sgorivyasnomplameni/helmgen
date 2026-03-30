import { useEffect, useState } from 'react'
import { chartsApi } from '@/api/charts'
import type { Chart } from '@/types/chart'

const pageShell: React.CSSProperties = {
  maxWidth: '1200px',
  margin: '0 auto',
  padding: '1.5rem',
}

const card: React.CSSProperties = {
  background: 'white',
  borderRadius: '1rem',
  border: '1px solid #e2e8f0',
  boxShadow: '0 10px 30px rgba(15, 23, 42, 0.06)',
}

const actionButton: React.CSSProperties = {
  border: 'none',
  borderRadius: '0.6rem',
  padding: '0.65rem 0.9rem',
  fontSize: '0.82rem',
  fontWeight: 700,
  cursor: 'pointer',
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function HistoryPage() {
  const [charts, setCharts] = useState<Chart[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  async function loadCharts() {
    setLoading(true)
    setError(null)
    try {
      const data = await chartsApi.list()
      setCharts(data)
    } catch {
      setError('Не удалось загрузить историю чартов')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadCharts()
  }, [])

  async function handleDelete(chartId: number) {
    setDeletingId(chartId)
    try {
      await chartsApi.delete(chartId)
      setCharts(prev => prev.filter(chart => chart.id !== chartId))
    } catch {
      setError('Не удалось удалить чарт')
    } finally {
      setDeletingId(null)
    }
  }

  function handleDownload(chartId: number, name: string, version: string) {
    const a = document.createElement('a')
    a.href = chartsApi.downloadUrl(chartId)
    a.download = `${name}-${version}.tgz`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <div style={pageShell}>
      <div style={{ marginBottom: '1.25rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.7rem', fontWeight: 800, color: '#0f172a' }}>
          История чартов
        </h1>
        <p style={{ margin: '0.35rem 0 0', color: '#64748b', fontSize: '0.95rem' }}>
          Здесь собраны все сохранённые генерации HelmGen с быстрым скачиванием и очисткой.
        </p>
      </div>

      <div style={{ ...card, padding: '1rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '1rem',
            marginBottom: '1rem',
          }}
        >
          <div>
            <div style={{ fontSize: '0.82rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Всего записей
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a' }}>
              {charts.length}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadCharts()}
            disabled={loading}
            style={{
              ...actionButton,
              background: loading ? '#cbd5e1' : '#e2e8f0',
              color: '#0f172a',
            }}
          >
            {loading ? 'Обновление...' : 'Обновить'}
          </button>
        </div>

        {error && (
          <div
            style={{
              marginBottom: '1rem',
              padding: '0.85rem 1rem',
              borderRadius: '0.8rem',
              background: '#fef2f2',
              color: '#b91c1c',
              border: '1px solid #fecaca',
            }}
          >
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ padding: '1.5rem', color: '#64748b', textAlign: 'center' }}>
            Загружаем историю...
          </div>
        ) : charts.length === 0 ? (
          <div
            style={{
              padding: '2rem',
              borderRadius: '0.9rem',
              background: '#f8fafc',
              border: '1px dashed #cbd5e1',
              textAlign: 'center',
              color: '#64748b',
            }}
          >
            История пока пустая. Сгенерируйте первый Helm-чарт на вкладке генератора.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '0.9rem' }}>
            {charts.map(chart => {
              const isGenerated = Boolean(chart.generated_yaml)
              return (
                <div
                  key={chart.id}
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: '0.9rem',
                    padding: '1rem',
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1fr) auto',
                    gap: '1rem',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                      <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
                        {chart.name}
                      </div>
                      <span
                        style={{
                          padding: '0.25rem 0.55rem',
                          borderRadius: '999px',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          background: isGenerated ? '#dcfce7' : '#fef3c7',
                          color: isGenerated ? '#166534' : '#92400e',
                        }}
                      >
                        {isGenerated ? 'Сгенерирован' : 'Черновик'}
                      </span>
                    </div>
                    <div style={{ marginTop: '0.45rem', color: '#475569', fontSize: '0.88rem' }}>
                      {chart.description || 'Описание не указано'}
                    </div>
                    <div style={{ marginTop: '0.75rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', color: '#64748b', fontSize: '0.8rem' }}>
                      <span>Chart: {chart.chart_version}</span>
                      <span>App: {chart.app_version}</span>
                      <span>Создан: {formatDate(chart.created_at)}</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      disabled={!isGenerated}
                      onClick={() => handleDownload(chart.id, chart.name, chart.chart_version)}
                      style={{
                        ...actionButton,
                        background: isGenerated ? '#dbeafe' : '#e2e8f0',
                        color: isGenerated ? '#1d4ed8' : '#94a3b8',
                        cursor: isGenerated ? 'pointer' : 'not-allowed',
                      }}
                    >
                      Скачать
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(chart.id)}
                      disabled={deletingId === chart.id}
                      style={{
                        ...actionButton,
                        background: deletingId === chart.id ? '#fecaca' : '#fee2e2',
                        color: '#b91c1c',
                      }}
                    >
                      {deletingId === chart.id ? 'Удаление...' : 'Удалить'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
