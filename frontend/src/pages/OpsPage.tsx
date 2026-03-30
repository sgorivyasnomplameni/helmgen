import { useEffect, useState } from 'react'
import { chartsApi, type ChartDryRunResult, type ChartTemplateResult } from '@/api/charts'
import type { Chart } from '@/types/chart'

type OpsTab = 'template' | 'dry-run'

interface Props {
  activeChartId: number | null
  active?: boolean
  onOpenGenerator?: () => void
}

const pageShell: React.CSSProperties = {
  maxWidth: '1480px',
  margin: '0 auto',
  padding: '1.5rem',
}

const card: React.CSSProperties = {
  background: 'var(--panel)',
  borderRadius: '1rem',
  border: '1px solid var(--border)',
  boxShadow: 'var(--shadow)',
}

const actionButton: React.CSSProperties = {
  borderRadius: '0.75rem',
  padding: '0.82rem 1rem',
  fontSize: '0.92rem',
  fontWeight: 700,
  cursor: 'pointer',
}

function summarizeDryRunError(errors: string[]): string | null {
  const clusterError = errors.find(error => error.includes('Kubernetes cluster unreachable'))
  if (clusterError) {
    return 'Kubernetes-кластер недоступен. Dry-run deploy требует активного kube-context.'
  }

  return errors[0] ?? null
}

export default function OpsPage({ activeChartId, active = true, onOpenGenerator }: Props) {
  const [chart, setChart] = useState<Chart | null>(null)
  const [loadingChart, setLoadingChart] = useState(false)
  const [chartError, setChartError] = useState<string | null>(null)
  const [tab, setTab] = useState<OpsTab>('template')
  const [templateResult, setTemplateResult] = useState<ChartTemplateResult | null>(null)
  const [dryRunResult, setDryRunResult] = useState<ChartDryRunResult | null>(null)
  const [isTemplating, setIsTemplating] = useState(false)
  const [isDryRunning, setIsDryRunning] = useState(false)

  useEffect(() => {
    if (!active || !activeChartId) {
      return
    }

    const chartId = activeChartId
    let cancelled = false

    async function loadChart() {
      setLoadingChart(true)
      setChartError(null)
      try {
        const data = await chartsApi.get(chartId)
        if (!cancelled) {
          setChart(data)
        }
      } catch {
        if (!cancelled) {
          setChartError('Не удалось загрузить выбранный chart')
        }
      } finally {
        if (!cancelled) {
          setLoadingChart(false)
        }
      }
    }

    void loadChart()

    return () => {
      cancelled = true
    }
  }, [active, activeChartId])

  useEffect(() => {
    setTemplateResult(null)
    setDryRunResult(null)
    setTab('template')
  }, [activeChartId])

  async function handleTemplate() {
    if (!activeChartId) return
    setIsTemplating(true)
    setTab('template')
    try {
      const result = await chartsApi.template(activeChartId)
      setTemplateResult(result)
    } catch {
      setTemplateResult({
        success: false,
        rendered_manifests: '',
        errors: ['Не удалось выполнить рендер манифестов'],
        warnings: [],
        engine: 'helm_template',
        summary: 'Рендер завершился с ошибкой запроса',
      })
    } finally {
      setIsTemplating(false)
    }
  }

  async function handleDryRunDeploy() {
    if (!activeChartId) return
    setIsDryRunning(true)
    setTab('dry-run')
    try {
      const result = await chartsApi.dryRunDeploy(activeChartId)
      setDryRunResult(result)
    } catch {
      setDryRunResult({
        success: false,
        output: '',
        errors: ['Не удалось выполнить dry-run deploy'],
        warnings: [],
        engine: 'helm_dry_run',
        summary: 'Dry-run deploy завершился с ошибкой запроса',
      })
    } finally {
      setIsDryRunning(false)
    }
  }

  function handleDownload() {
    if (!activeChartId || !chart) return
    const a = document.createElement('a')
    a.href = chartsApi.downloadUrl(activeChartId)
    a.download = `${chart.name}-${chart.chart_version}.tgz`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  if (!activeChartId) {
    return (
      <div style={pageShell}>
        <div style={{ ...card, padding: '1.4rem' }}>
          <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, color: 'var(--text)' }}>
            Проверка и deploy
          </h1>
          <div style={{ marginTop: '0.9rem', color: 'var(--text-muted)', fontSize: '0.95rem' }}>
            Сначала сгенерируйте chart на вкладке генератора или выберите его из истории.
          </div>
          {onOpenGenerator && (
            <button
              type="button"
              onClick={onOpenGenerator}
              style={{
                ...actionButton,
                marginTop: '1rem',
                border: 'none',
                background: 'var(--accent)',
                color: 'white',
              }}
            >
              Открыть генератор
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={pageShell}>
      <div style={{ marginBottom: '1.25rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.7rem', fontWeight: 800, color: 'var(--text)' }}>
          Проверка и deploy
        </h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px minmax(0, 1fr)', gap: '1.25rem', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ ...card, padding: '1.15rem' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Выбранный chart
            </div>
            {loadingChart ? (
              <div style={{ marginTop: '0.8rem', color: 'var(--text-muted)' }}>Загружаем...</div>
            ) : chartError ? (
              <div style={{ marginTop: '0.8rem', color: 'var(--danger)' }}>{chartError}</div>
            ) : chart ? (
              <>
                <div style={{ marginTop: '0.55rem', fontSize: '1.1rem', fontWeight: 800, color: 'var(--text)' }}>{chart.name}</div>
                <div style={{ marginTop: '0.45rem', color: 'var(--text-soft)', fontSize: '0.88rem' }}>
                  Chart {chart.chart_version} · App {chart.app_version}
                </div>
                <div style={{ marginTop: '0.9rem', display: 'grid', gap: '0.55rem' }}>
                  <button
                    type="button"
                    onClick={() => void handleTemplate()}
                    disabled={isTemplating}
                    style={{
                      ...actionButton,
                      border: 'none',
                      background: 'var(--accent)',
                      color: 'white',
                    }}
                  >
                    {isTemplating ? 'Рендер...' : 'Рендер'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDryRunDeploy()}
                    disabled={isDryRunning}
                    style={{
                      ...actionButton,
                      border: '1px solid var(--border)',
                      background: 'var(--panel-strong)',
                      color: 'var(--text-soft)',
                    }}
                  >
                    {isDryRunning ? 'Dry-run...' : 'Dry-run'}
                  </button>
                  <button
                    type="button"
                    onClick={handleDownload}
                    style={{
                      ...actionButton,
                      border: '1px solid color-mix(in srgb, var(--success) 35%, transparent)',
                      background: 'var(--success-soft)',
                      color: 'var(--success)',
                    }}
                  >
                    Скачать .tgz
                  </button>
                </div>
              </>
            ) : null}
          </div>

          <div style={{ ...card, padding: '1.15rem' }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text)' }}>
              Статус
            </div>
            <div style={{ marginTop: '0.8rem', display: 'grid', gap: '0.55rem' }}>
              <div style={{ color: templateResult?.success ? 'var(--success)' : 'var(--text-muted)', fontWeight: 700 }}>
                Рендер: {templateResult?.success ? 'готов' : 'ожидает'}
              </div>
              <div style={{ color: dryRunResult?.success ? 'var(--success)' : dryRunResult ? 'var(--warning)' : 'var(--text-muted)', fontWeight: 700 }}>
                Dry-run: {dryRunResult?.success ? 'успешен' : dryRunResult ? 'требует внимания' : 'не запускался'}
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            background: 'var(--workspace-bg)',
            borderRadius: '1rem',
            border: '1px solid var(--workspace-border)',
            minHeight: '720px',
            overflow: 'hidden',
            boxShadow: 'var(--shadow)',
          }}
        >
          <div style={{ padding: '1rem 1.25rem 0', background: 'var(--workspace-bg)' }}>
            <div style={{ display: 'flex', gap: '0.25rem', overflowX: 'auto', marginBottom: '0.5rem' }}>
              {([
                ['template', 'Рендер'],
                ['dry-run', 'Dry-run'],
              ] as Array<[OpsTab, string]>).map(([nextTab, label]) => {
                const activeTab = tab === nextTab
                return (
                  <button
                    key={nextTab}
                    type="button"
                    onClick={() => setTab(nextTab)}
                    style={{
                      padding: '0.55rem 0.9rem',
                      fontSize: '0.76rem',
                      fontWeight: 700,
                      border: 'none',
                      borderRadius: '0.5rem 0.5rem 0 0',
                      cursor: 'pointer',
                      background: activeTab ? 'var(--workspace-surface)' : 'transparent',
                      color: activeTab ? 'var(--workspace-text)' : 'var(--workspace-muted)',
                      borderBottom: activeTab ? '2px solid var(--accent)' : '2px solid transparent',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{ background: 'var(--workspace-surface)', padding: '1rem', minHeight: '640px' }}>
            {tab === 'template' && (
              <div>
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', marginBottom: '0.45rem' }}>
                    <div style={{ color: '#f8fafc', fontSize: '1rem', fontWeight: 800 }}>Helm Template</div>
                    <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                      <span style={{ padding: '0.45rem 0.7rem', borderRadius: '999px', background: '#1e3a5f', color: '#dbeafe', fontSize: '0.76rem', fontWeight: 700 }}>helm template</span>
                      <span style={{ padding: '0.45rem 0.7rem', borderRadius: '999px', background: templateResult?.success ? '#14532d' : templateResult ? '#7f1d1d' : '#334155', color: '#f8fafc', fontSize: '0.76rem', fontWeight: 700 }}>
                        {templateResult ? (templateResult.success ? 'RENDERED' : 'FAILED') : 'WAITING'}
                      </span>
                    </div>
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: '0.84rem' }}>
                    {templateResult?.summary || 'После рендера здесь появятся итоговые Kubernetes-манифесты.'}
                  </div>
                </div>

                {!templateResult ? (
                  <div style={{ color: '#94a3b8', fontSize: '0.84rem' }}>Результат template пока пустой.</div>
                ) : (
                  <>
                    {templateResult.errors.length > 0 && (
                      <ul style={{ margin: '0 0 1rem', paddingLeft: '1.1rem', color: '#fecaca' }}>
                        {templateResult.errors.map(item => <li key={item} style={{ marginBottom: '0.35rem' }}>{item}</li>)}
                      </ul>
                    )}
                    <pre
                      style={{
                        margin: 0,
                        fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
                        fontSize: '0.78rem',
                        lineHeight: 1.7,
                        color: '#dbeafe',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {templateResult.rendered_manifests || '# Helm template не вернул манифесты'}
                    </pre>
                  </>
                )}
              </div>
            )}

            {tab === 'dry-run' && (
              <div>
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', marginBottom: '0.45rem' }}>
                    <div style={{ color: '#f8fafc', fontSize: '1rem', fontWeight: 800 }}>Dry-Run Deploy</div>
                    <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                      <span style={{ padding: '0.45rem 0.7rem', borderRadius: '999px', background: '#4c1d95', color: '#ede9fe', fontSize: '0.76rem', fontWeight: 700 }}>helm dry-run</span>
                      <span style={{ padding: '0.45rem 0.7rem', borderRadius: '999px', background: dryRunResult?.success ? '#14532d' : dryRunResult ? '#7f1d1d' : '#334155', color: '#f8fafc', fontSize: '0.76rem', fontWeight: 700 }}>
                        {dryRunResult ? (dryRunResult.success ? 'READY' : 'FAILED') : 'WAITING'}
                      </span>
                    </div>
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: '0.84rem' }}>
                    {dryRunResult?.summary || 'Dry-run deploy покажет, готов ли chart к шагу развёртывания.'}
                  </div>
                </div>

                {!dryRunResult ? (
                  <div style={{ color: '#94a3b8', fontSize: '0.84rem' }}>Результат dry-run пока пустой.</div>
                ) : (
                  <>
                    {summarizeDryRunError(dryRunResult.errors) && (
                      <div
                        style={{
                          marginBottom: '1rem',
                          padding: '0.85rem 1rem',
                          borderRadius: '0.8rem',
                          background: '#312e81',
                          border: '1px solid #8b5cf6',
                          color: '#ddd6fe',
                          fontSize: '0.84rem',
                          lineHeight: 1.55,
                        }}
                      >
                        {summarizeDryRunError(dryRunResult.errors)}
                      </div>
                    )}

                    <details>
                      <summary style={{ cursor: 'pointer', color: '#c4b5fd', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.85rem' }}>
                        Показать технические детали
                      </summary>
                      <div style={{ marginTop: '0.75rem' }}>
                        {dryRunResult.errors.length > 0 && (
                          <ul style={{ margin: '0 0 1rem', paddingLeft: '1.1rem', color: '#fecaca' }}>
                            {dryRunResult.errors.map(item => <li key={item} style={{ marginBottom: '0.35rem' }}>{item}</li>)}
                          </ul>
                        )}
                        <pre
                          style={{
                            margin: 0,
                            fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
                            fontSize: '0.78rem',
                            lineHeight: 1.7,
                            color: '#e9d5ff',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                          }}
                        >
                          {dryRunResult.output || '# Dry-run deploy не вернул вывод'}
                        </pre>
                      </div>
                    </details>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
