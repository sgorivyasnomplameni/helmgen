import { useCallback, useEffect, useState } from 'react'
import AuditList from '@/components/AuditList'
import Button from '@/components/Button'
import OperationStatePanel from '@/components/OperationStatePanel'
import StatusPill from '@/components/StatusPill'
import { useToast } from '@/components/ToastProvider'
import { auditApi } from '@/api/audit'
import { chartsApi, extractApiErrorMessage } from '@/api/charts'
import { projectsApi } from '@/api/projects'
import type { AuditEvent } from '@/types/audit'
import type { Chart } from '@/types/chart'
import type { Project } from '@/types/project'

const pageShell: React.CSSProperties = {
  maxWidth: '1200px',
  margin: '0 auto',
}

const card: React.CSSProperties = {
  background: 'var(--surface-base)',
  borderRadius: '1rem',
  border: '1px solid var(--border-subtle)',
  boxShadow: 'var(--shadow)',
  animation: 'fadeUp 0.3s ease',
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

function formatLifecycleStatus(value: string): string {
  switch (value) {
    case 'draft':
      return 'Черновик'
    case 'generated':
      return 'Сгенерирован'
    case 'validated':
      return 'Проверен'
    case 'templated':
      return 'Отрендерен'
    case 'dry_run_ready':
      return 'Dry-run пройден'
    case 'deployed':
      return 'Развернут'
    case 'undeployed':
      return 'Release удалён'
    default:
      return value
  }
}

interface Props {
  active?: boolean
  onOpenOps?: (chartId: number) => void
}

export default function HistoryPage({ active = true, onOpenOps }: Props) {
  const { showToast } = useToast()
  const [charts, setCharts] = useState<Chart[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [recentEvents, setRecentEvents] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [actionNote, setActionNote] = useState<{ tone: 'neutral' | 'success' | 'error'; text: string } | null>(null)

  const loadCharts = useCallback(async () => {
    setLoading(true)
    setError(null)
    setActionNote({ tone: 'neutral', text: 'Загружаем историю Helm-чартов...' })
    try {
      const [data, events, loadedProjects] = await Promise.all([
        chartsApi.list(),
        auditApi.recent(8),
        projectsApi.list(),
      ])
      setCharts(data)
      setRecentEvents(events)
      setProjects(loadedProjects)
      setActionNote({
        tone: 'success',
        text: data.length > 0 ? `История обновлена: ${data.length} chart(ов).` : 'История загружена. Пока записей нет.',
      })
      showToast('История обновлена', 'success')
    } catch (error) {
      const message = extractApiErrorMessage(error, 'Не удалось загрузить историю чартов')
      setError(message)
      setActionNote({
        tone: 'error',
        text: message,
      })
      showToast(message, 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    if (active) {
      void loadCharts()
    }
  }, [active, loadCharts])

  async function handleDelete(chartId: number) {
    if (confirmDeleteId !== chartId) {
      setConfirmDeleteId(chartId)
      setActionNote({
        tone: 'neutral',
        text: 'Нажмите “Удалить” ещё раз, чтобы подтвердить удаление chart из истории.',
      })
      return
    }

    setDeletingId(chartId)
    setError(null)
    setActionNote({ tone: 'neutral', text: 'Удаляем chart из истории...' })
    try {
      await chartsApi.delete(chartId)
      setCharts(prev => prev.filter(chart => chart.id !== chartId))
      setConfirmDeleteId(null)
      const events = await auditApi.recent(8)
      setRecentEvents(events)
      setActionNote({ tone: 'success', text: 'Chart удалён из истории.' })
      showToast('Chart удалён из истории', 'success')
    } catch (error) {
      const message = extractApiErrorMessage(error, 'Не удалось удалить чарт')
      setError(message)
      setActionNote({ tone: 'error', text: message })
      showToast(message, 'error')
    } finally {
      setDeletingId(null)
    }
  }

  function handleDownload(chartId: number, name: string, version: string) {
    void chartsApi.download(chartId, `${name}-${version}.tgz`)
  }

  const projectNameById = new Map(projects.map(project => [project.id, project.name]))

  return (
    <div className="page-shell" style={pageShell}>
      <div style={{ ...card, marginBottom: '1rem', padding: '1rem 1.1rem', background: 'var(--surface-base)' }}>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Архив и действия
        </div>
        <h1 style={{ margin: '0.3rem 0 0', fontSize: '1.7rem', fontWeight: 900, color: 'var(--text)' }}>
          История чартов
        </h1>
        <p style={{ margin: '0.35rem 0 0', color: 'var(--text-soft)', fontSize: '0.9rem', maxWidth: '760px', lineHeight: 1.5 }}>
          Архив ранее собранных chart с быстрым скачиванием, переходом к проверке и понятным статусом последнего состояния.
        </p>
      </div>

      <div className="history-layout">
        <div style={{ ...card, padding: '0.9rem' }}>
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
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Всего записей
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text)' }}>
              {charts.length}
            </div>
          </div>
          <Button type="button" tone="secondary" size="sm" onClick={() => void loadCharts()} disabled={loading}>
            {loading ? 'Обновление...' : 'Обновить'}
          </Button>
        </div>

        {error && (
          <div
            style={{
              marginBottom: '1rem',
              padding: '0.85rem 1rem',
              borderRadius: '0.8rem',
              background: 'var(--danger-soft)',
              color: 'var(--danger)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            {error}
          </div>
        )}

        {actionNote && (
          <div style={{ marginBottom: '1rem' }}>
            <OperationStatePanel
              state={loading || deletingId !== null ? 'running' : actionNote.tone === 'success' ? 'success' : actionNote.tone === 'error' ? 'error' : 'idle'}
              title="Состояние истории"
              message={actionNote.text}
              meta={deletingId !== null ? 'Удаляем chart и обновляем журнал действий.' : 'История сохраняет собранные chart и быстрые переходы к развёртыванию.'}
            />
          </div>
        )}

        {loading ? (
          <div style={{ padding: '1.5rem', color: 'var(--text-muted)', textAlign: 'center' }}>
            Загружаем историю...
          </div>
        ) : charts.length === 0 ? (
          <div
            style={{
              padding: '2rem',
              borderRadius: '0.9rem',
              background: 'var(--surface-muted)',
              border: '1px dashed var(--border-strong)',
              textAlign: 'center',
              color: 'var(--text-muted)',
            }}
          >
            История пока пустая. Сгенерируйте первый Helm-чарт на вкладке генератора.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '0.9rem' }}>
            {charts.map(chart => {
              const isGenerated = Boolean(chart.generated_yaml)
              const isDeployed = chart.deploy_status === 'passed'
              const hasDryRun = Boolean(chart.dry_run_status)
              return (
                <div
                  key={chart.id}
                  className="history-chart-card"
                  data-testid="history-chart-item"
                  data-chart-name={chart.name}
                  style={{
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '0.9rem',
                    padding: '0.9rem 0.95rem',
                    display: 'grid',
                    gap: '0.85rem',
                    alignItems: 'center',
                    background: 'var(--surface-base)',
                    transition: 'transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                      <div style={{ fontSize: '1.08rem', fontWeight: 900, color: 'var(--text)' }}>
                        {chart.name}
                      </div>
                      <StatusPill tone={isGenerated ? 'success' : 'warning'}>
                        {formatLifecycleStatus(chart.lifecycle_status || (isGenerated ? 'generated' : 'draft'))}
                      </StatusPill>
                      {isDeployed && (
                        <StatusPill tone="accent">
                          {chart.deployed_namespace || 'default'} / {chart.deployed_release_name || chart.name}
                        </StatusPill>
                      )}
                    </div>
                    <div style={{ marginTop: '0.28rem', color: 'var(--text-soft)', fontSize: '0.84rem' }}>
                      {chart.description || 'Описание не указано'}
                    </div>
                    <div style={{ marginTop: '0.6rem', display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                      <StatusPill tone="neutral">Проект: {chart.project_id ? (projectNameById.get(chart.project_id) || `#${chart.project_id}`) : 'Без проекта'}</StatusPill>
                      <StatusPill tone="neutral">Chart {chart.chart_version}</StatusPill>
                      <StatusPill tone="neutral">App {chart.app_version}</StatusPill>
                      {chart.validation_status && (
                        <StatusPill tone={chart.validation_status === 'passed' ? 'success' : 'danger'}>
                          Lint: {chart.validation_status === 'passed' ? 'ok' : 'ошибка'}
                        </StatusPill>
                      )}
                      {hasDryRun && (
                        <StatusPill tone={chart.dry_run_status === 'passed' ? 'success' : 'warning'}>
                          Dry-run: {chart.dry_run_status === 'passed' ? 'ok' : 'ошибка'}
                        </StatusPill>
                      )}
                    </div>
                    <div style={{ marginTop: '0.55rem', display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                      <StatusPill tone="neutral">Создан: {formatDate(chart.created_at)}</StatusPill>
                      {chart.deployed_at && <StatusPill tone="neutral">Deploy: {formatDate(chart.deployed_at)}</StatusPill>}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', alignSelf: 'start' }}>
                    {onOpenOps && (
                      <Button type="button" tone="secondary" size="sm" disabled={!isGenerated} onClick={() => onOpenOps(chart.id)}>
                        Развёртывание
                      </Button>
                    )}
                    <Button type="button" tone="primary" size="sm" disabled={!isGenerated} onClick={() => handleDownload(chart.id, chart.name, chart.chart_version)}>
                      Скачать
                    </Button>
                    <Button type="button" tone="danger" size="sm" onClick={() => void handleDelete(chart.id)} disabled={deletingId === chart.id}>
                      {deletingId === chart.id ? 'Удаление...' : confirmDeleteId === chart.id ? 'Подтвердить удаление' : 'Удалить'}
                    </Button>
                    {confirmDeleteId === chart.id && deletingId !== chart.id && (
                      <Button type="button" tone="ghost" size="sm" onClick={() => setConfirmDeleteId(null)}>
                        Отмена
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        </div>

        <AuditList
          title="Последние действия"
          events={recentEvents}
          emptyText="После генерации, проверки и развёртывания здесь появится краткий журнал действий."
        />
      </div>
    </div>
  )
}
