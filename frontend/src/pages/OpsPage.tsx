import { useEffect, useState } from 'react'
import AuditList from '@/components/AuditList'
import { auditApi } from '@/api/audit'
import {
  chartsApi,
  type ChartDeployResult,
  type ChartDryRunResult,
  type ChartMonitoringResult,
  type ChartReleaseHistoryResult,
  type ChartReleaseStatusResult,
  type ChartRollbackResult,
  type ChartTemplateResult,
  type ChartUninstallResult,
  type ClusterStatusResult,
  extractApiErrorMessage,
} from '@/api/charts'
import type { AuditEvent } from '@/types/audit'
import type { Chart } from '@/types/chart'

type OpsTab = 'template' | 'dry-run' | 'deploy' | 'monitoring' | 'rollback' | 'uninstall'
type OperationKey = OpsTab | 'release-status' | 'release-history'

interface OperationRuntime {
  key: OperationKey
  label: string
  startedAt: number
}

interface LastOperationState {
  key: OperationKey
  label: string
  status: 'success' | 'error'
  finishedAt: number
  summary: string
}

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

function Spinner({ label = 'Загрузка' }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.65rem',
        color: '#e2e8f0',
        fontSize: '0.86rem',
        fontWeight: 700,
      }}
    >
      <span
        style={{
          width: '0.9rem',
          height: '0.9rem',
          borderRadius: '999px',
          border: '2px solid rgba(148, 163, 184, 0.35)',
          borderTopColor: '#60a5fa',
          display: 'inline-block',
          animation: 'spin 0.8s linear infinite',
        }}
      />
      {label}
    </div>
  )
}

function summarizeDryRunError(errors: string[]): string | null {
  const clusterError = errors.find(error => error.includes('Kubernetes cluster unreachable'))
  if (clusterError) {
    return 'Kubernetes-кластер недоступен. Dry-run требует активного kube-context.'
  }

  return errors[0] ?? null
}

function summarizeClusterError(errors: string[]): string | null {
  const clusterError = errors.find(error => error.includes('Kubernetes'))
  if (clusterError) {
    return 'Backend не может подключиться к Kubernetes API. Dry-run, deploy и удаление release сейчас недоступны.'
  }

  return errors[0] ?? null
}

function hydrateTemplateResult(chart: Chart): ChartTemplateResult | null {
  if (!chart.template_status) return null
  return {
    success: chart.template_status === 'passed',
    rendered_manifests: '',
    errors: chart.template_status === 'failed' && chart.template_summary ? [chart.template_summary] : [],
    warnings: [],
    engine: 'helm_template',
    summary: chart.template_summary || 'Состояние рендера загружено из истории chart.',
  }
}

function hydrateDryRunResult(chart: Chart): ChartDryRunResult | null {
  if (!chart.dry_run_status) return null
  return {
    success: chart.dry_run_status === 'passed',
    output: chart.dry_run_output || '',
    errors: chart.dry_run_status === 'failed' && chart.dry_run_summary ? [chart.dry_run_summary] : [],
    warnings: [],
    engine: 'helm_dry_run',
    summary: chart.dry_run_summary || 'Состояние dry-run загружено из истории chart.',
  }
}

function hydrateDeployResult(chart: Chart): ChartDeployResult | null {
  if (!chart.deploy_status || chart.deploy_status === 'removed' || chart.deploy_status === 'remove_failed') return null
  return {
    success: chart.deploy_status === 'passed',
    release_name: chart.deployed_release_name || chart.name,
    namespace: chart.deployed_namespace || 'default',
    output: chart.deploy_output || '',
    errors: chart.deploy_status === 'failed' && chart.deploy_summary ? [chart.deploy_summary] : [],
    warnings: [],
    status: chart.deploy_status === 'passed' ? 'deployed' : 'failed',
    engine: 'helm_deploy',
    summary: chart.deploy_summary || 'Состояние развёртывания загружено из истории chart.',
  }
}

function hydrateUninstallResult(chart: Chart): ChartUninstallResult | null {
  if (!chart.deploy_status || (chart.deploy_status !== 'removed' && chart.deploy_status !== 'remove_failed')) return null
  return {
    success: chart.deploy_status === 'removed',
    release_name: chart.deployed_release_name || chart.name,
    namespace: chart.deployed_namespace || 'default',
    output: chart.deploy_output || '',
    errors: chart.deploy_status === 'remove_failed' && chart.deploy_summary ? [chart.deploy_summary] : [],
    warnings: [],
    engine: 'helm_uninstall',
    summary: chart.deploy_summary || 'Состояние удаления release загружено из истории chart.',
  }
}

export default function OpsPage({ activeChartId, active = true, onOpenGenerator }: Props) {
  const [chart, setChart] = useState<Chart | null>(null)
  const [loadingChart, setLoadingChart] = useState(false)
  const [chartError, setChartError] = useState<string | null>(null)
  const [tab, setTab] = useState<OpsTab>('template')
  const [templateResult, setTemplateResult] = useState<ChartTemplateResult | null>(null)
  const [dryRunResult, setDryRunResult] = useState<ChartDryRunResult | null>(null)
  const [deployResult, setDeployResult] = useState<ChartDeployResult | null>(null)
  const [releaseStatusResult, setReleaseStatusResult] = useState<ChartReleaseStatusResult | null>(null)
  const [monitoringResult, setMonitoringResult] = useState<ChartMonitoringResult | null>(null)
  const [releaseHistoryResult, setReleaseHistoryResult] = useState<ChartReleaseHistoryResult | null>(null)
  const [rollbackResult, setRollbackResult] = useState<ChartRollbackResult | null>(null)
  const [uninstallResult, setUninstallResult] = useState<ChartUninstallResult | null>(null)
  const [currentOperation, setCurrentOperation] = useState<OperationRuntime | null>(null)
  const [lastOperation, setLastOperation] = useState<LastOperationState | null>(null)
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([])
  const [operationNow, setOperationNow] = useState(Date.now())
  const [namespace, setNamespace] = useState('helmgen-demo')
  const [releaseName, setReleaseName] = useState('')
  const [deployConfirmed, setDeployConfirmed] = useState(false)
  const [rollbackConfirmed, setRollbackConfirmed] = useState(false)
  const [rollbackRevision, setRollbackRevision] = useState('')
  const [clusterStatus, setClusterStatus] = useState<ClusterStatusResult | null>(null)
  const [isLoadingClusterStatus, setIsLoadingClusterStatus] = useState(false)

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
        const [data, events] = await Promise.all([chartsApi.get(chartId), auditApi.chart(chartId)])
        if (!cancelled) {
          setChart(data)
          setAuditEvents(events)
          setReleaseName(data.deployed_release_name || data.name)
          setNamespace(data.deployed_namespace || 'helmgen-demo')
          setTemplateResult(hydrateTemplateResult(data))
          setDryRunResult(hydrateDryRunResult(data))
          setDeployResult(hydrateDeployResult(data))
          setUninstallResult(hydrateUninstallResult(data))
        }
      } catch (error) {
        if (!cancelled) {
          setChartError(extractApiErrorMessage(error, 'Не удалось загрузить выбранный chart'))
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
    setChart(null)
    setTemplateResult(null)
    setDryRunResult(null)
    setDeployResult(null)
    setReleaseStatusResult(null)
    setMonitoringResult(null)
    setReleaseHistoryResult(null)
    setRollbackResult(null)
    setUninstallResult(null)
    setCurrentOperation(null)
    setLastOperation(null)
    setAuditEvents([])
    setDeployConfirmed(false)
    setRollbackConfirmed(false)
    setRollbackRevision('')
    setTab('template')
  }, [activeChartId])

  useEffect(() => {
    if (!currentOperation) return

    const timer = window.setInterval(() => {
      setOperationNow(Date.now())
    }, 1000)

    return () => window.clearInterval(timer)
  }, [currentOperation])

  useEffect(() => {
    if (!active) return

    let cancelled = false

    async function loadClusterStatus() {
      setIsLoadingClusterStatus(true)
      try {
        const data = await chartsApi.clusterStatus()
        if (!cancelled) {
          setClusterStatus(data)
        }
      } catch (error) {
        if (!cancelled) {
          setClusterStatus({
            helm_available: false,
            helm_binary: null,
            kubeconfig_path: '',
            kubeconfig_present: false,
            current_context: null,
            cluster_name: null,
            cluster_server: null,
            reachable: false,
            errors: [extractApiErrorMessage(error, 'Не удалось получить статус подключения к Kubernetes.')],
            warnings: [],
            summary: 'Статус подключения сейчас недоступен.',
          })
        }
      } finally {
        if (!cancelled) {
          setIsLoadingClusterStatus(false)
        }
      }
    }

    void loadClusterStatus()

    return () => {
      cancelled = true
    }
  }, [active])

  const clusterReady = Boolean(clusterStatus?.reachable)
  const clusterBlockingReason =
    summarizeClusterError(clusterStatus?.errors ?? []) ||
    (!clusterReady && clusterStatus ? clusterStatus.summary : null)
  const activeOperation = currentOperation?.key ?? null
  const activeOperationLabel =
    currentOperation?.label ?? null
  const activeOperationDetails =
    activeOperation === 'deploy'
      ? 'Backend отправил команду helm upgrade --install и ждёт ответ от Kubernetes.'
      : activeOperation === 'monitoring'
        ? 'Backend собирает статус release, Kubernetes-ресурсы и события namespace.'
      : activeOperation === 'release-history'
        ? 'Backend запрашивает список Helm-ревизий, доступных для отката.'
      : activeOperation === 'rollback'
        ? 'Backend выполняет helm rollback для выбранного release.'
      : activeOperation === 'release-status'
        ? 'Backend запрашивает актуальное состояние release через helm status.'
      : activeOperation === 'uninstall'
        ? 'Backend выполняет helm uninstall для выбранного release.'
        : activeOperation === 'dry-run'
          ? 'Проверяем, как chart будет развёрнут, без реального применения изменений.'
          : activeOperation === 'template'
        ? 'Готовим итоговые Kubernetes-манифесты через helm template.'
        : null
  const activeOperationSeconds = currentOperation ? Math.max(1, Math.floor((operationNow - currentOperation.startedAt) / 1000)) : 0
  const activeOperationExpectation =
    activeOperationSeconds >= 45
      ? 'Операция выполняется слишком долго. Обычно это значит, что Kubernetes отвечает медленно или команда зависла.'
      : activeOperationSeconds >= 20
        ? 'Операция идёт дольше обычного. Если время продолжит расти, стоит проверить состояние кластера и вывод Helm.'
        : 'Операция ещё в пределах нормального ожидания.'
  const activeOperationExpectationTone =
    activeOperationSeconds >= 45 ? 'var(--warning)' : activeOperationSeconds >= 20 ? 'var(--accent)' : 'var(--text-muted)'
  const isTemplating = activeOperation === 'template'
  const isDryRunning = activeOperation === 'dry-run'
  const isDeploying = activeOperation === 'deploy'
  const isMonitoring = activeOperation === 'monitoring'
  const isLoadingReleaseHistory = activeOperation === 'release-history'
  const isRollingBack = activeOperation === 'rollback'
  const isCheckingReleaseStatus = activeOperation === 'release-status'
  const isUninstalling = activeOperation === 'uninstall'
  const canDeploy = clusterReady && deployConfirmed && !isDeploying
  const canRollback = clusterReady && rollbackConfirmed && !isRollingBack

  function startOperation(key: OperationKey, label: string) {
    setCurrentOperation({ key, label, startedAt: Date.now() })
    setOperationNow(Date.now())
    setLastOperation(null)
  }

  function finishOperation(key: OperationKey, label: string, status: 'success' | 'error', summary: string) {
    setCurrentOperation(prev => (prev?.key === key ? null : prev))
    setLastOperation({
      key,
      label,
      status,
      finishedAt: Date.now(),
      summary,
    })
    if (activeChartId) {
      void auditApi.chart(activeChartId).then(setAuditEvents).catch(() => undefined)
    }
  }

  async function refreshClusterStatus() {
    setIsLoadingClusterStatus(true)
    try {
      const data = await chartsApi.clusterStatus()
      setClusterStatus(data)
    } finally {
      setIsLoadingClusterStatus(false)
    }
  }

  async function handleTemplate() {
    if (!activeChartId) return
    startOperation('template', 'Рендерим Kubernetes-манифесты')
    setTab('template')
    setTemplateResult(null)
    try {
      const result = await chartsApi.template(activeChartId)
      setTemplateResult(result)
      const updated = await chartsApi.get(activeChartId)
      setChart(updated)
      setUninstallResult(hydrateUninstallResult(updated))
      finishOperation('template', 'Рендер манифестов', result.success ? 'success' : 'error', result.summary)
    } catch (error) {
      const failedResult = {
        success: false,
        rendered_manifests: '',
        errors: [extractApiErrorMessage(error, 'Не удалось выполнить рендер манифестов')],
        warnings: [],
        engine: 'helm_template',
        summary: extractApiErrorMessage(error, 'Рендер завершился с ошибкой запроса'),
      }
      setTemplateResult(failedResult)
      finishOperation('template', 'Рендер манифестов', 'error', failedResult.summary)
    }
  }

  async function handleDryRunDeploy() {
    if (!activeChartId) return
    startOperation('dry-run', 'Запускаем dry-run проверку')
    setTab('dry-run')
    setDryRunResult(null)
    try {
      const result = await chartsApi.dryRunDeploy(activeChartId)
      setDryRunResult(result)
      const updated = await chartsApi.get(activeChartId)
      setChart(updated)
      setUninstallResult(hydrateUninstallResult(updated))
      finishOperation('dry-run', 'Dry-run проверка', result.success ? 'success' : 'error', result.summary)
    } catch (error) {
      const failedResult = {
        success: false,
        output: '',
        errors: [extractApiErrorMessage(error, 'Не удалось выполнить dry-run')],
        warnings: [],
        engine: 'helm_dry_run',
        summary: extractApiErrorMessage(error, 'Dry-run завершился с ошибкой запроса'),
      }
      setDryRunResult(failedResult)
      finishOperation('dry-run', 'Dry-run проверка', 'error', failedResult.summary)
    }
  }

  async function handleDeploy() {
    if (!activeChartId || !deployConfirmed) return
    startOperation('deploy', 'Выполняем развёртывание release')
    setTab('deploy')
    setDeployResult(null)
    try {
      const result = await chartsApi.deploy(activeChartId, {
        namespace: namespace.trim() || 'helmgen-demo',
        release_name: releaseName.trim() || undefined,
      })
      setDeployResult(result)
      const updated = await chartsApi.get(activeChartId)
      setChart(updated)
      setUninstallResult(hydrateUninstallResult(updated))
      finishOperation('deploy', 'Развёртывание release', result.success ? 'success' : 'error', result.summary)
    } catch (error) {
      const failedResult = {
        success: false,
        release_name: releaseName.trim() || chart?.name || 'release',
        namespace: namespace.trim() || 'helmgen-demo',
        output: '',
        errors: [extractApiErrorMessage(error, 'Не удалось выполнить развёртывание')],
        warnings: [],
        status: 'failed',
        engine: 'helm_deploy',
        summary: extractApiErrorMessage(error, 'Развёртывание завершилось с ошибкой запроса'),
      }
      setDeployResult(failedResult)
      finishOperation('deploy', 'Развёртывание release', 'error', failedResult.summary)
    } finally {
      setDeployConfirmed(false)
    }
  }

  async function handleReleaseStatus() {
    if (!activeChartId) return
    startOperation('release-status', 'Получаем статус release')
    setTab('deploy')
    setReleaseStatusResult(null)
    try {
      const result = await chartsApi.releaseStatus(activeChartId, {
        namespace: namespace.trim() || chart?.deployed_namespace || 'helmgen-demo',
        release_name: releaseName.trim() || chart?.deployed_release_name || chart?.name || undefined,
      })
      setReleaseStatusResult(result)
      const events = await auditApi.chart(activeChartId)
      setAuditEvents(events)
      finishOperation('release-status', 'Статус release', result.success ? 'success' : 'error', result.summary)
    } catch (error) {
      const failedResult = {
        success: false,
        release_name: releaseName.trim() || chart?.deployed_release_name || chart?.name || 'release',
        namespace: namespace.trim() || chart?.deployed_namespace || 'helmgen-demo',
        output: '',
        errors: [extractApiErrorMessage(error, 'Не удалось получить статус release')],
        warnings: [],
        status: 'unknown',
        engine: 'helm_status',
        summary: extractApiErrorMessage(error, 'Просмотр статуса release завершился с ошибкой запроса'),
      }
      setReleaseStatusResult(failedResult)
      finishOperation('release-status', 'Статус release', 'error', failedResult.summary)
    }
  }

  async function handleMonitoring() {
    if (!activeChartId) return
    startOperation('monitoring', 'Собираем мониторинг release')
    setTab('monitoring')
    setMonitoringResult(null)
    try {
      const result = await chartsApi.monitoring(activeChartId, {
        namespace: namespace.trim() || chart?.deployed_namespace || 'helmgen-demo',
        release_name: releaseName.trim() || chart?.deployed_release_name || chart?.name || undefined,
      })
      setMonitoringResult(result)
      const events = await auditApi.chart(activeChartId)
      setAuditEvents(events)
      finishOperation('monitoring', 'Мониторинг release', result.success ? 'success' : 'error', result.summary)
    } catch (error) {
      const failedResult = {
        success: false,
        release_name: releaseName.trim() || chart?.deployed_release_name || chart?.name || 'release',
        namespace: namespace.trim() || chart?.deployed_namespace || 'helmgen-demo',
        output: '',
        errors: [extractApiErrorMessage(error, 'Не удалось собрать мониторинг release')],
        warnings: [],
        status: 'unknown',
        engine: 'helm_status_kubectl',
        summary: extractApiErrorMessage(error, 'Мониторинг release завершился с ошибкой запроса'),
      }
      setMonitoringResult(failedResult)
      finishOperation('monitoring', 'Мониторинг release', 'error', failedResult.summary)
    }
  }

  async function handleReleaseHistory() {
    if (!activeChartId) return
    startOperation('release-history', 'Получаем историю Helm release')
    setTab('rollback')
    setReleaseHistoryResult(null)
    try {
      const result = await chartsApi.releaseHistory(activeChartId, {
        namespace: namespace.trim() || chart?.deployed_namespace || 'helmgen-demo',
        release_name: releaseName.trim() || chart?.deployed_release_name || chart?.name || undefined,
      })
      setReleaseHistoryResult(result)
      const events = await auditApi.chart(activeChartId)
      setAuditEvents(events)
      finishOperation('release-history', 'История Helm release', result.success ? 'success' : 'error', result.summary)
    } catch (error) {
      const failedResult = {
        success: false,
        release_name: releaseName.trim() || chart?.deployed_release_name || chart?.name || 'release',
        namespace: namespace.trim() || chart?.deployed_namespace || 'helmgen-demo',
        entries: [],
        output: '',
        errors: [extractApiErrorMessage(error, 'Не удалось получить историю Helm release')],
        warnings: [],
        engine: 'helm_history',
        summary: extractApiErrorMessage(error, 'Запрос истории Helm release завершился с ошибкой'),
      }
      setReleaseHistoryResult(failedResult)
      finishOperation('release-history', 'История Helm release', 'error', failedResult.summary)
    }
  }

  async function handleRollback() {
    if (!activeChartId || !rollbackConfirmed) return
    const parsedRevision = rollbackRevision.trim() ? Number(rollbackRevision.trim()) : undefined
    startOperation('rollback', 'Выполняем rollback release')
    setTab('rollback')
    setRollbackResult(null)
    try {
      const result = await chartsApi.rollback(activeChartId, {
        namespace: namespace.trim() || chart?.deployed_namespace || 'helmgen-demo',
        release_name: releaseName.trim() || chart?.deployed_release_name || chart?.name || undefined,
        revision: Number.isFinite(parsedRevision) ? parsedRevision : undefined,
      })
      setRollbackResult(result)
      const updated = await chartsApi.get(activeChartId)
      const events = await auditApi.chart(activeChartId)
      setChart(updated)
      setDeployResult(hydrateDeployResult(updated))
      setAuditEvents(events)
      finishOperation('rollback', 'Rollback release', result.success ? 'success' : 'error', result.summary)
    } catch (error) {
      const failedResult = {
        success: false,
        release_name: releaseName.trim() || chart?.deployed_release_name || chart?.name || 'release',
        namespace: namespace.trim() || chart?.deployed_namespace || 'helmgen-demo',
        revision: rollbackRevision.trim() ? Number(rollbackRevision.trim()) : null,
        output: '',
        errors: [extractApiErrorMessage(error, 'Не удалось выполнить rollback')],
        warnings: [],
        status: 'failed',
        engine: 'helm_rollback',
        summary: extractApiErrorMessage(error, 'Rollback завершился с ошибкой запроса'),
      }
      setRollbackResult(failedResult)
      finishOperation('rollback', 'Rollback release', 'error', failedResult.summary)
    } finally {
      setRollbackConfirmed(false)
    }
  }

  async function handleUninstall() {
    if (!activeChartId) return
    startOperation('uninstall', 'Удаляем release из кластера')
    setTab('uninstall')
    setUninstallResult(null)
    try {
      const result = await chartsApi.uninstall(activeChartId, {
        namespace: namespace.trim() || chart?.deployed_namespace || 'helmgen-demo',
        release_name: releaseName.trim() || chart?.deployed_release_name || chart?.name || undefined,
      })
      setUninstallResult(result)
      const updated = await chartsApi.get(activeChartId)
      setChart(updated)
      setDeployResult(hydrateDeployResult(updated))
      finishOperation('uninstall', 'Удаление release', result.success ? 'success' : 'error', result.summary)
    } catch (error) {
      const failedResult = {
        success: false,
        release_name: releaseName.trim() || chart?.deployed_release_name || chart?.name || 'release',
        namespace: namespace.trim() || chart?.deployed_namespace || 'helmgen-demo',
        output: '',
        errors: [extractApiErrorMessage(error, 'Не удалось удалить release')],
        warnings: [],
        engine: 'helm_uninstall',
        summary: extractApiErrorMessage(error, 'Удаление release завершилось с ошибкой запроса'),
      }
      setUninstallResult(failedResult)
      finishOperation('uninstall', 'Удаление release', 'error', failedResult.summary)
    }
  }

  function handleDownload() {
    if (!activeChartId || !chart) return
    void chartsApi.download(activeChartId, `${chart.name}-${chart.chart_version}.tgz`)
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
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      <div style={{ marginBottom: '1.25rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.7rem', fontWeight: 800, color: 'var(--text)' }}>
          Проверка и deploy
        </h1>
        {chart && (
          <div style={{ marginTop: '0.45rem', color: 'var(--text-muted)', fontSize: '0.92rem' }}>
            {chart.name} · Chart {chart.chart_version} · App {chart.app_version}
          </div>
        )}
      </div>

      {activeOperation && activeOperationLabel && (
        <div
          style={{
            ...card,
            marginBottom: '1rem',
            padding: '0.95rem 1.1rem',
            background: 'linear-gradient(180deg, color-mix(in srgb, var(--accent) 12%, var(--panel)) 0%, var(--panel) 100%)',
            border: '1px solid color-mix(in srgb, var(--accent) 32%, transparent)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <Spinner label={activeOperationLabel} />
            <span
              style={{
                padding: '0.42rem 0.72rem',
                borderRadius: '999px',
                background: 'color-mix(in srgb, var(--accent) 20%, transparent)',
                color: 'var(--accent)',
                fontSize: '0.74rem',
                fontWeight: 800,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              операция выполняется
            </span>
          </div>
          <div style={{ marginTop: '0.45rem', color: 'var(--accent)', fontSize: '0.8rem', fontWeight: 700 }}>
            Прошло: {activeOperationSeconds} сек.
          </div>
          {activeOperationDetails && (
            <div style={{ marginTop: '0.55rem', color: 'var(--text-muted)', fontSize: '0.84rem', lineHeight: 1.55 }}>
              {activeOperationDetails}
            </div>
          )}
          <div style={{ marginTop: '0.45rem', color: activeOperationExpectationTone, fontSize: '0.84rem', lineHeight: 1.55, fontWeight: 700 }}>
            {activeOperationExpectation}
          </div>
        </div>
      )}

      <div
        style={{
          ...card,
          padding: '1rem 1.15rem',
          marginBottom: '1.25rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
          flexWrap: 'wrap',
          background: 'linear-gradient(180deg, var(--panel) 0%, var(--panel-muted) 100%)',
        }}
      >
        <div>
          <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Текущий chart
          </div>
          <div style={{ marginTop: '0.28rem', fontSize: '1.05rem', fontWeight: 800, color: 'var(--text)' }}>
            {chart?.name ?? 'Не выбран'}
          </div>
          {chart && (
            <div style={{ marginTop: '0.28rem', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
              Chart {chart.chart_version} · App {chart.app_version}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => void handleDeploy()}
            disabled={!canDeploy}
            style={{
              ...actionButton,
              border: 'none',
              background: canDeploy ? 'var(--success)' : 'var(--panel-strong)',
              color: canDeploy ? 'white' : 'var(--text-muted)',
              cursor: canDeploy ? 'pointer' : 'not-allowed',
            }}
          >
            {isDeploying ? 'Развёртывание...' : 'Выполнить развёртывание'}
          </button>
          <button
            type="button"
            onClick={() => void handleUninstall()}
            disabled={isUninstalling || !clusterReady}
            style={{
              ...actionButton,
              border: '1px solid color-mix(in srgb, var(--danger) 35%, transparent)',
              background: isUninstalling || !clusterReady ? 'var(--panel-strong)' : 'var(--danger-soft)',
              color: isUninstalling || !clusterReady ? 'var(--text-muted)' : 'var(--danger)',
              cursor: isUninstalling || !clusterReady ? 'not-allowed' : 'pointer',
            }}
          >
            {isUninstalling ? 'Удаление...' : 'Удалить release'}
          </button>
          <button
            type="button"
            onClick={() => void handleReleaseStatus()}
            disabled={isCheckingReleaseStatus || !clusterReady}
            style={{
              ...actionButton,
              border: '1px solid var(--border)',
              background: 'var(--panel-strong)',
              color: isCheckingReleaseStatus || !clusterReady ? 'var(--text-muted)' : 'var(--text-soft)',
              cursor: isCheckingReleaseStatus || !clusterReady ? 'not-allowed' : 'pointer',
            }}
          >
            {isCheckingReleaseStatus ? 'Проверяем...' : 'Статус release'}
          </button>
          <button
            type="button"
            onClick={() => void handleMonitoring()}
            disabled={isMonitoring || !clusterReady}
            style={{
              ...actionButton,
              border: '1px solid var(--border)',
              background: 'var(--panel-strong)',
              color: isMonitoring || !clusterReady ? 'var(--text-muted)' : 'var(--text-soft)',
              cursor: isMonitoring || !clusterReady ? 'not-allowed' : 'pointer',
            }}
          >
            {isMonitoring ? 'Сбор...' : 'Мониторинг'}
          </button>
          <button
            type="button"
            onClick={() => void handleReleaseHistory()}
            disabled={isLoadingReleaseHistory || !clusterReady}
            style={{
              ...actionButton,
              border: '1px solid var(--border)',
              background: 'var(--panel-strong)',
              color: isLoadingReleaseHistory || !clusterReady ? 'var(--text-muted)' : 'var(--text-soft)',
              cursor: isLoadingReleaseHistory || !clusterReady ? 'not-allowed' : 'pointer',
            }}
          >
            {isLoadingReleaseHistory ? 'История...' : 'История Helm'}
          </button>
          <button
            type="button"
            onClick={() => void handleRollback()}
            disabled={!canRollback}
            style={{
              ...actionButton,
              border: '1px solid color-mix(in srgb, var(--warning) 35%, transparent)',
              background: canRollback ? 'var(--warning-soft)' : 'var(--panel-strong)',
              color: canRollback ? 'var(--warning)' : 'var(--text-muted)',
              cursor: canRollback ? 'pointer' : 'not-allowed',
            }}
          >
            {isRollingBack ? 'Откат...' : 'Откат release'}
          </button>
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
            disabled={isDryRunning || !clusterReady}
            style={{
              ...actionButton,
              border: '1px solid var(--border)',
              background: 'var(--panel-strong)',
              color: isDryRunning || !clusterReady ? 'var(--text-muted)' : 'var(--text-soft)',
              cursor: isDryRunning || !clusterReady ? 'not-allowed' : 'pointer',
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
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px minmax(0, 1fr)', gap: '1.25rem', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ ...card, padding: '1.15rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center' }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text)' }}>
                Подключение к Kubernetes
              </div>
              <button
                type="button"
                onClick={() => void refreshClusterStatus()}
                disabled={isLoadingClusterStatus}
                style={{
                  border: '1px solid var(--border)',
                  background: 'var(--panel-strong)',
                  color: 'var(--text-soft)',
                  borderRadius: '999px',
                  padding: '0.38rem 0.7rem',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  cursor: isLoadingClusterStatus ? 'not-allowed' : 'pointer',
                }}
              >
                {isLoadingClusterStatus ? 'Проверяем...' : 'Обновить'}
              </button>
            </div>

            <div style={{ marginTop: '0.85rem', display: 'grid', gap: '0.55rem' }}>
              <div style={{ color: clusterStatus?.helm_available ? 'var(--success)' : 'var(--warning)', fontWeight: 700 }}>
                Helm: {clusterStatus?.helm_available ? 'найден' : 'не найден'}
              </div>
              <div style={{ color: clusterStatus?.kubeconfig_present ? 'var(--success)' : 'var(--warning)', fontWeight: 700 }}>
                Kubeconfig: {clusterStatus?.kubeconfig_present ? 'найден' : 'не найден'}
              </div>
              <div style={{ color: clusterStatus?.current_context ? 'var(--text)' : 'var(--text-muted)', fontWeight: 700 }}>
                Context: {clusterStatus?.current_context || 'не определён'}
              </div>
              <div style={{ color: clusterStatus?.cluster_server ? 'var(--text)' : 'var(--text-muted)', fontWeight: 700, wordBreak: 'break-word' }}>
                API server: {clusterStatus?.cluster_server || 'не определён'}
              </div>
              <div style={{ color: clusterReady ? 'var(--success)' : 'var(--warning)', fontWeight: 800 }}>
                Кластер: {clusterReady ? 'доступен' : 'недоступен'}
              </div>
            </div>

            {clusterStatus?.summary && (
              <div
                style={{
                  marginTop: '0.9rem',
                  padding: '0.8rem 0.9rem',
                  borderRadius: '0.8rem',
                  background: clusterReady ? 'var(--success-soft)' : 'var(--warning-soft)',
                  border: `1px solid ${clusterReady ? 'color-mix(in srgb, var(--success) 30%, transparent)' : 'color-mix(in srgb, var(--warning) 30%, transparent)'}`,
                  color: clusterReady ? 'var(--success)' : 'var(--warning)',
                  fontSize: '0.82rem',
                  lineHeight: 1.5,
                  fontWeight: 700,
                }}
              >
                {clusterStatus.summary}
              </div>
            )}

            {!clusterReady && clusterBlockingReason && (
              <details style={{ marginTop: '0.8rem' }}>
                <summary style={{ cursor: 'pointer', color: 'var(--text-soft)', fontSize: '0.8rem', fontWeight: 700 }}>
                  Почему deploy недоступен
                </summary>
                <div style={{ marginTop: '0.65rem', color: 'var(--text-muted)', fontSize: '0.82rem', lineHeight: 1.6 }}>
                  {clusterBlockingReason}
                </div>
                {clusterStatus?.errors?.length ? (
                  <ul style={{ margin: '0.55rem 0 0', paddingLeft: '1rem', color: 'var(--warning)', fontSize: '0.8rem', lineHeight: 1.5 }}>
                    {clusterStatus.errors.map(item => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
              </details>
            )}
          </div>

          <div style={{ ...card, padding: '1.15rem' }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text)', marginBottom: '0.8rem' }}>
              Параметры развёртывания
            </div>
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              <label style={{ display: 'grid', gap: '0.35rem' }}>
                <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Namespace
                </span>
                <input
                  value={namespace}
                  onChange={e => setNamespace(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.75rem',
                    borderRadius: '0.65rem',
                    border: '1px solid var(--border)',
                    background: 'var(--panel-strong)',
                    color: 'var(--text)',
                    fontSize: '0.9rem',
                    boxSizing: 'border-box',
                  }}
                />
              </label>
              <label style={{ display: 'grid', gap: '0.35rem' }}>
                <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Имя release
                </span>
                <input
                  value={releaseName}
                  onChange={e => setReleaseName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.75rem',
                    borderRadius: '0.65rem',
                    border: '1px solid var(--border)',
                    background: 'var(--panel-strong)',
                    color: 'var(--text)',
                    fontSize: '0.9rem',
                    boxSizing: 'border-box',
                  }}
                />
              </label>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.65rem',
                  padding: '0.8rem',
                  borderRadius: '0.75rem',
                  border: '1px solid color-mix(in srgb, var(--warning) 35%, transparent)',
                  background: 'var(--warning-soft)',
                  color: 'var(--warning)',
                  fontSize: '0.82rem',
                  fontWeight: 800,
                  lineHeight: 1.45,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={deployConfirmed}
                  onChange={e => setDeployConfirmed(e.target.checked)}
                  style={{ width: '1rem', height: '1rem', marginTop: '0.12rem', flex: '0 0 auto' }}
                />
                <span>
                  Подтверждаю реальное развёртывание в выбранный Kubernetes namespace
                </span>
              </label>
              <label style={{ display: 'grid', gap: '0.35rem' }}>
                <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Ревизия для rollback
                </span>
                <input
                  value={rollbackRevision}
                  onChange={e => setRollbackRevision(e.target.value.replace(/[^\d]/g, ''))}
                  placeholder="Пусто = предыдущая"
                  inputMode="numeric"
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.75rem',
                    borderRadius: '0.65rem',
                    border: '1px solid var(--border)',
                    background: 'var(--panel-strong)',
                    color: 'var(--text)',
                    fontSize: '0.9rem',
                    boxSizing: 'border-box',
                  }}
                />
              </label>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.65rem',
                  padding: '0.8rem',
                  borderRadius: '0.75rem',
                  border: '1px solid color-mix(in srgb, var(--danger) 35%, transparent)',
                  background: 'var(--danger-soft)',
                  color: 'var(--danger)',
                  fontSize: '0.82rem',
                  fontWeight: 800,
                  lineHeight: 1.45,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={rollbackConfirmed}
                  onChange={e => setRollbackConfirmed(e.target.checked)}
                  style={{ width: '1rem', height: '1rem', marginTop: '0.12rem', flex: '0 0 auto' }}
                />
                <span>
                  Подтверждаю откат release в выбранном Kubernetes namespace
                </span>
              </label>
            </div>
          </div>

          <div style={{ ...card, padding: '1.15rem' }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text)' }}>
              Статус
            </div>
            <div style={{ marginTop: '0.8rem', display: 'grid', gap: '0.55rem' }}>
              <div style={{ color: isTemplating ? 'var(--accent)' : templateResult?.success ? 'var(--success)' : 'var(--text-muted)', fontWeight: 700 }}>
                Рендер: {isTemplating ? 'выполняется' : templateResult?.success ? 'готов' : 'ожидает'}
              </div>
              <div style={{ color: isDryRunning ? 'var(--accent)' : dryRunResult?.success ? 'var(--success)' : dryRunResult ? 'var(--warning)' : 'var(--text-muted)', fontWeight: 700 }}>
                Dry-run: {isDryRunning ? 'выполняется' : dryRunResult?.success ? 'успешен' : dryRunResult ? 'требует внимания' : 'не запускался'}
              </div>
              <div style={{ color: isDeploying ? 'var(--accent)' : deployResult?.success ? 'var(--success)' : deployResult ? 'var(--warning)' : 'var(--text-muted)', fontWeight: 700 }}>
                Развёртывание: {isDeploying ? 'выполняется' : deployResult?.success ? 'выполнено' : deployResult ? 'требует внимания' : 'не запускалось'}
              </div>
              <div style={{ color: isMonitoring ? 'var(--accent)' : monitoringResult?.success ? 'var(--success)' : monitoringResult ? 'var(--warning)' : 'var(--text-muted)', fontWeight: 700 }}>
                Мониторинг: {isMonitoring ? 'выполняется' : monitoringResult?.success ? 'получен' : monitoringResult ? 'требует внимания' : 'не запускался'}
              </div>
              <div style={{ color: isRollingBack ? 'var(--accent)' : rollbackResult?.success ? 'var(--success)' : rollbackResult ? 'var(--warning)' : 'var(--text-muted)', fontWeight: 700 }}>
                Rollback: {isRollingBack ? 'выполняется' : rollbackResult?.success ? 'выполнен' : rollbackResult ? 'требует внимания' : 'не запускался'}
              </div>
              <div style={{ color: isUninstalling ? 'var(--accent)' : uninstallResult?.success ? 'var(--success)' : uninstallResult ? 'var(--warning)' : 'var(--text-muted)', fontWeight: 700 }}>
                Удаление release: {isUninstalling ? 'выполняется' : uninstallResult?.success ? 'выполнено' : uninstallResult ? 'требует внимания' : 'не запускалось'}
              </div>
              {chartError && (
                <div style={{ color: 'var(--danger)', fontWeight: 700 }}>
                  {chartError}
                </div>
              )}
              {loadingChart && (
                <div style={{ color: 'var(--text-muted)', fontWeight: 700 }}>
                  Загружаем данные chart...
                </div>
              )}
              {clusterBlockingReason && (
                <div style={{ color: 'var(--warning)', fontWeight: 700, lineHeight: 1.5 }}>
                  Deploy и dry-run сейчас недоступны: backend не видит рабочий kube-context.
                </div>
              )}
            </div>
          </div>

          <div style={{ ...card, padding: '1.15rem' }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text)' }}>
              Последняя операция
            </div>
            {!lastOperation ? (
              <div style={{ marginTop: '0.8rem', color: 'var(--text-muted)', fontSize: '0.84rem', lineHeight: 1.6 }}>
                Здесь появится итог последнего действия: рендер, dry-run, deploy или удаление release.
              </div>
            ) : (
              <div style={{ marginTop: '0.8rem', display: 'grid', gap: '0.5rem' }}>
                <div style={{ color: lastOperation.status === 'success' ? 'var(--success)' : 'var(--warning)', fontWeight: 800 }}>
                  {lastOperation.label}: {lastOperation.status === 'success' ? 'успешно' : 'с ошибкой'}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                  {new Date(lastOperation.finishedAt).toLocaleTimeString('ru-RU')}
                </div>
                <div style={{ color: 'var(--text-soft)', fontSize: '0.84rem', lineHeight: 1.55 }}>
                  {lastOperation.summary}
                </div>
              </div>
            )}
          </div>

          <AuditList
            title="Журнал по chart"
            events={auditEvents}
            emptyText="После генерации, проверки и deploy здесь появится история действий по текущему chart."
          />
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
                ['deploy', 'Развёртывание'],
                ['monitoring', 'Мониторинг'],
                ['rollback', 'Rollback'],
                ['uninstall', 'Удаление'],
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
                        {isTemplating ? 'RUNNING' : templateResult ? (templateResult.success ? 'RENDERED' : 'FAILED') : 'WAITING'}
                      </span>
                    </div>
                  </div>
                <div style={{ color: '#94a3b8', fontSize: '0.84rem' }}>
                  {templateResult?.summary || 'После рендера здесь появятся итоговые Kubernetes-манифесты.'}
                </div>
              </div>

                {isTemplating ? (
                  <div
                    style={{
                      padding: '1rem',
                      borderRadius: '0.85rem',
                      background: 'rgba(15, 23, 42, 0.35)',
                      border: '1px solid rgba(96, 165, 250, 0.18)',
                    }}
                  >
                    <Spinner label="Рендерим манифесты через helm template..." />
                    <div style={{ marginTop: '0.7rem', color: '#94a3b8', fontSize: '0.84rem', lineHeight: 1.6 }}>
                      Когда рендер завершится, здесь появится итоговый YAML со всеми манифестами.
                    </div>
                  </div>
                ) : !templateResult ? (
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
                        {isDryRunning ? 'RUNNING' : dryRunResult ? (dryRunResult.success ? 'READY' : 'FAILED') : 'WAITING'}
                      </span>
                    </div>
                  </div>
                <div style={{ color: '#94a3b8', fontSize: '0.84rem' }}>
                  {dryRunResult?.summary || (clusterReady ? 'Dry-run покажет, готов ли chart к шагу развёртывания.' : 'Сначала нужен доступный Kubernetes-контекст на стороне backend.')}
                </div>
              </div>

                {isDryRunning ? (
                  <div
                    style={{
                      padding: '1rem',
                      borderRadius: '0.85rem',
                      background: 'rgba(15, 23, 42, 0.35)',
                      border: '1px solid rgba(168, 85, 247, 0.2)',
                    }}
                  >
                    <Spinner label="Запускаем dry-run проверку..." />
                    <div style={{ marginTop: '0.7rem', color: '#94a3b8', fontSize: '0.84rem', lineHeight: 1.6 }}>
                      Backend отправил helm-команду и ждёт ответ от Kubernetes. После завершения здесь появится итог и технический вывод.
                    </div>
                  </div>
                ) : !dryRunResult ? (
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
                          {dryRunResult.output || '# Dry-run не вернул вывод'}
                        </pre>
                      </div>
                    </details>
                  </>
                )}
              </div>
            )}

            {tab === 'deploy' && (
              <div>
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', marginBottom: '0.45rem' }}>
                    <div style={{ color: '#f8fafc', fontSize: '1rem', fontWeight: 800 }}>Развёртывание</div>
                    <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                      <span style={{ padding: '0.45rem 0.7rem', borderRadius: '999px', background: '#14532d', color: '#dcfce7', fontSize: '0.76rem', fontWeight: 700 }}>helm deploy</span>
                      <span style={{ padding: '0.45rem 0.7rem', borderRadius: '999px', background: deployResult?.success ? '#14532d' : deployResult ? '#7f1d1d' : '#334155', color: '#f8fafc', fontSize: '0.76rem', fontWeight: 700 }}>
                        {isDeploying ? 'RUNNING' : deployResult ? (deployResult.success ? 'DEPLOYED' : 'FAILED') : 'WAITING'}
                      </span>
                    </div>
                  </div>
                <div style={{ color: '#94a3b8', fontSize: '0.84rem' }}>
                  {deployResult?.summary || (clusterReady ? 'Развёртывание выполнит helm upgrade --install в указанный namespace.' : 'Backend пока не может подключиться к Kubernetes API, поэтому deploy недоступен.')}
                </div>
              </div>

                {isDeploying ? (
                  <div
                    style={{
                      padding: '1rem',
                      borderRadius: '0.85rem',
                      background: 'rgba(15, 23, 42, 0.35)',
                      border: '1px solid rgba(34, 197, 94, 0.2)',
                    }}
                  >
                    <Spinner label="Выполняем helm upgrade --install..." />
                    <div style={{ marginTop: '0.7rem', color: '#94a3b8', fontSize: '0.84rem', lineHeight: 1.6 }}>
                      Release <strong>{releaseName.trim() || chart?.name || 'release'}</strong> разворачивается в namespace <strong>{namespace.trim() || 'helmgen-demo'}</strong>.
                    </div>
                    <div style={{ marginTop: '0.45rem', color: '#94a3b8', fontSize: '0.82rem' }}>
                      Окно обновится автоматически, как только Helm вернёт результат.
                    </div>
                    <div style={{ marginTop: '0.7rem', color: activeOperationExpectationTone, fontSize: '0.83rem', lineHeight: 1.55, fontWeight: 700 }}>
                      {activeOperationExpectation}
                    </div>
                  </div>
                ) : !deployResult ? (
                  <div style={{ color: '#94a3b8', fontSize: '0.84rem' }}>Развёртывание ещё не запускалось.</div>
                ) : (
                  <>
                    <div
                      style={{
                        marginBottom: '1rem',
                        padding: '0.85rem 1rem',
                        borderRadius: '0.8rem',
                        background: deployResult.success ? '#14532d' : '#312e81',
                        border: `1px solid ${deployResult.success ? '#22c55e' : '#8b5cf6'}`,
                        color: deployResult.success ? '#dcfce7' : '#ddd6fe',
                        fontSize: '0.84rem',
                        lineHeight: 1.55,
                      }}
                    >
                      Release <strong>{deployResult.release_name}</strong> в namespace <strong>{deployResult.namespace}</strong>
                      {deployResult.success ? ' успешно развернут.' : ' не удалось развернуть.'}
                    </div>

                    <details open={!deployResult.success}>
                      <summary style={{ cursor: 'pointer', color: '#bbf7d0', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.85rem' }}>
                        Показать вывод развёртывания
                      </summary>
                      <div style={{ marginTop: '0.75rem' }}>
                        {deployResult.errors.length > 0 && (
                          <ul style={{ margin: '0 0 1rem', paddingLeft: '1.1rem', color: '#fecaca' }}>
                            {deployResult.errors.map(item => <li key={item} style={{ marginBottom: '0.35rem' }}>{item}</li>)}
                          </ul>
                        )}
                        <pre
                          style={{
                            margin: 0,
                            fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
                            fontSize: '0.78rem',
                            lineHeight: 1.7,
                            color: '#bbf7d0',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                          }}
                        >
                          {deployResult.output || '# Развёртывание не вернуло вывод'}
                        </pre>
                      </div>
                    </details>
                  </>
                )}

                <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid rgba(148, 163, 184, 0.18)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', marginBottom: '0.7rem' }}>
                    <div style={{ color: '#f8fafc', fontSize: '0.95rem', fontWeight: 800 }}>Статус release</div>
                    <span style={{ padding: '0.35rem 0.6rem', borderRadius: '999px', background: releaseStatusResult?.success ? '#14532d' : releaseStatusResult ? '#7f1d1d' : '#334155', color: '#f8fafc', fontSize: '0.72rem', fontWeight: 700 }}>
                      {isCheckingReleaseStatus ? 'RUNNING' : releaseStatusResult ? releaseStatusResult.status.toUpperCase() : 'WAITING'}
                    </span>
                  </div>

                  {isCheckingReleaseStatus ? (
                    <div
                      style={{
                        padding: '1rem',
                        borderRadius: '0.85rem',
                        background: 'rgba(15, 23, 42, 0.35)',
                        border: '1px solid rgba(96, 165, 250, 0.18)',
                      }}
                    >
                      <Spinner label="Получаем статус release..." />
                    </div>
                  ) : !releaseStatusResult ? (
                    <div style={{ color: '#94a3b8', fontSize: '0.84rem' }}>
                      Нажмите «Статус release», чтобы получить актуальные сведения из Kubernetes.
                    </div>
                  ) : (
                    <>
                      {releaseStatusResult.errors.length > 0 && (
                        <ul style={{ margin: '0 0 1rem', paddingLeft: '1.1rem', color: '#fecaca' }}>
                          {releaseStatusResult.errors.map(item => <li key={item} style={{ marginBottom: '0.35rem' }}>{item}</li>)}
                        </ul>
                      )}
                      <pre
                        style={{
                          margin: 0,
                          fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
                          fontSize: '0.78rem',
                          lineHeight: 1.7,
                          color: releaseStatusResult.success ? '#dbeafe' : '#fecaca',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                        }}
                      >
                        {releaseStatusResult.output || '# Helm status не вернул вывод'}
                      </pre>
                    </>
                  )}
                </div>
              </div>
            )}

            {tab === 'monitoring' && (
              <div>
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', marginBottom: '0.45rem' }}>
                    <div style={{ color: '#f8fafc', fontSize: '1rem', fontWeight: 800 }}>Мониторинг release</div>
                    <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                      <span style={{ padding: '0.45rem 0.7rem', borderRadius: '999px', background: '#1e3a5f', color: '#dbeafe', fontSize: '0.76rem', fontWeight: 700 }}>helm + kubectl</span>
                      <span style={{ padding: '0.45rem 0.7rem', borderRadius: '999px', background: monitoringResult?.success ? '#14532d' : monitoringResult ? '#7f1d1d' : '#334155', color: '#f8fafc', fontSize: '0.76rem', fontWeight: 700 }}>
                        {isMonitoring ? 'RUNNING' : monitoringResult ? (monitoringResult.success ? monitoringResult.status.toUpperCase() : 'FAILED') : 'WAITING'}
                      </span>
                    </div>
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: '0.84rem' }}>
                    {monitoringResult?.summary || 'Мониторинг собирает helm status, список Kubernetes-ресурсов release и последние события namespace.'}
                  </div>
                </div>

                {isMonitoring ? (
                  <div
                    style={{
                      padding: '1rem',
                      borderRadius: '0.85rem',
                      background: 'rgba(15, 23, 42, 0.35)',
                      border: '1px solid rgba(96, 165, 250, 0.18)',
                    }}
                  >
                    <Spinner label="Собираем состояние release..." />
                  </div>
                ) : !monitoringResult ? (
                  <div style={{ color: '#94a3b8', fontSize: '0.84rem' }}>Мониторинг ещё не запускался.</div>
                ) : (
                  <>
                    {monitoringResult.errors.length > 0 && (
                      <ul style={{ margin: '0 0 1rem', paddingLeft: '1.1rem', color: '#fecaca' }}>
                        {monitoringResult.errors.map(item => <li key={item} style={{ marginBottom: '0.35rem' }}>{item}</li>)}
                      </ul>
                    )}
                    {monitoringResult.warnings.length > 0 && (
                      <ul style={{ margin: '0 0 1rem', paddingLeft: '1.1rem', color: '#fde68a' }}>
                        {monitoringResult.warnings.map(item => <li key={item} style={{ marginBottom: '0.35rem' }}>{item}</li>)}
                      </ul>
                    )}
                    <pre
                      style={{
                        margin: 0,
                        fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
                        fontSize: '0.78rem',
                        lineHeight: 1.7,
                        color: monitoringResult.success ? '#dbeafe' : '#fecaca',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {monitoringResult.output || '# Мониторинг не вернул вывод'}
                    </pre>
                  </>
                )}
              </div>
            )}

            {tab === 'rollback' && (
              <div>
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', marginBottom: '0.45rem' }}>
                    <div style={{ color: '#f8fafc', fontSize: '1rem', fontWeight: 800 }}>Rollback release</div>
                    <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                      <span style={{ padding: '0.45rem 0.7rem', borderRadius: '999px', background: '#713f12', color: '#fef3c7', fontSize: '0.76rem', fontWeight: 700 }}>helm rollback</span>
                      <span style={{ padding: '0.45rem 0.7rem', borderRadius: '999px', background: rollbackResult?.success ? '#14532d' : rollbackResult ? '#7f1d1d' : '#334155', color: '#f8fafc', fontSize: '0.76rem', fontWeight: 700 }}>
                        {isRollingBack ? 'RUNNING' : rollbackResult ? (rollbackResult.success ? 'ROLLED BACK' : 'FAILED') : 'WAITING'}
                      </span>
                    </div>
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: '0.84rem' }}>
                    {rollbackResult?.summary || 'Rollback откатывает release к предыдущей или указанной ревизии Helm.'}
                  </div>
                </div>

                {isRollingBack ? (
                  <div
                    style={{
                      padding: '1rem',
                      borderRadius: '0.85rem',
                      background: 'rgba(15, 23, 42, 0.35)',
                      border: '1px solid rgba(245, 158, 11, 0.2)',
                    }}
                  >
                    <Spinner label="Выполняем helm rollback..." />
                  </div>
                ) : (
                  <>
                    <div
                      style={{
                        marginBottom: '1rem',
                        padding: '0.9rem 1rem',
                        borderRadius: '0.8rem',
                        background: 'rgba(15, 23, 42, 0.35)',
                        border: '1px solid rgba(148, 163, 184, 0.2)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ color: '#e2e8f0', fontSize: '0.88rem', fontWeight: 800 }}>
                          Доступные ревизии для rollback
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleReleaseHistory()}
                          disabled={isLoadingReleaseHistory || !clusterReady}
                          style={{
                            border: '1px solid rgba(148, 163, 184, 0.25)',
                            background: 'rgba(30, 41, 59, 0.85)',
                            color: isLoadingReleaseHistory ? '#64748b' : '#e2e8f0',
                            borderRadius: '999px',
                            padding: '0.4rem 0.7rem',
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            cursor: isLoadingReleaseHistory || !clusterReady ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {isLoadingReleaseHistory ? 'Обновляем...' : 'Обновить историю'}
                        </button>
                      </div>
                      <div style={{ marginTop: '0.45rem', color: '#94a3b8', fontSize: '0.82rem', lineHeight: 1.55 }}>
                        {releaseHistoryResult?.summary || 'Сначала загрузите Helm history, чтобы выбрать ревизию перед откатом.'}
                      </div>
                      {releaseHistoryResult?.errors.length ? (
                        <ul style={{ margin: '0.8rem 0 0', paddingLeft: '1.1rem', color: '#fecaca' }}>
                          {releaseHistoryResult.errors.map(item => <li key={item} style={{ marginBottom: '0.3rem' }}>{item}</li>)}
                        </ul>
                      ) : null}
                      {releaseHistoryResult?.warnings.length ? (
                        <ul style={{ margin: '0.8rem 0 0', paddingLeft: '1.1rem', color: '#fde68a' }}>
                          {releaseHistoryResult.warnings.map(item => <li key={item} style={{ marginBottom: '0.3rem' }}>{item}</li>)}
                        </ul>
                      ) : null}
                      {releaseHistoryResult?.entries.length ? (
                        <div style={{ marginTop: '0.9rem', display: 'grid', gap: '0.55rem' }}>
                          {releaseHistoryResult.entries.map(entry => (
                            <button
                              key={`${entry.revision}-${entry.updated ?? ''}`}
                              type="button"
                              onClick={() => setRollbackRevision(String(entry.revision))}
                              style={{
                                textAlign: 'left',
                                border: rollbackRevision.trim() === String(entry.revision) ? '1px solid #f59e0b' : '1px solid rgba(148, 163, 184, 0.15)',
                                background: rollbackRevision.trim() === String(entry.revision) ? 'rgba(245, 158, 11, 0.12)' : 'rgba(15, 23, 42, 0.5)',
                                borderRadius: '0.8rem',
                                padding: '0.75rem 0.85rem',
                                cursor: 'pointer',
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                                <span style={{ color: '#f8fafc', fontWeight: 800 }}>Revision {entry.revision}</span>
                                <span style={{ color: '#94a3b8', fontSize: '0.78rem' }}>{entry.status || 'unknown'}</span>
                              </div>
                              <div style={{ marginTop: '0.28rem', color: '#cbd5e1', fontSize: '0.8rem', lineHeight: 1.55 }}>
                                {entry.description || 'Описание ревизии не указано'}
                              </div>
                              <div style={{ marginTop: '0.28rem', color: '#94a3b8', fontSize: '0.76rem', lineHeight: 1.5 }}>
                                {entry.updated || 'Время не указано'}{entry.chart ? ` · ${entry.chart}` : ''}{entry.app_version ? ` · App ${entry.app_version}` : ''}
                              </div>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    {!rollbackResult ? (
                      <div style={{ color: '#94a3b8', fontSize: '0.84rem' }}>Rollback ещё не запускался. Для запуска нужно подтверждение слева.</div>
                    ) : (
                      <>
                        <div
                          style={{
                            marginBottom: '1rem',
                            padding: '0.85rem 1rem',
                            borderRadius: '0.8rem',
                            background: rollbackResult.success ? '#14532d' : '#312e81',
                            border: `1px solid ${rollbackResult.success ? '#22c55e' : '#8b5cf6'}`,
                            color: rollbackResult.success ? '#dcfce7' : '#ddd6fe',
                            fontSize: '0.84rem',
                            lineHeight: 1.55,
                          }}
                        >
                          Release <strong>{rollbackResult.release_name}</strong> в namespace <strong>{rollbackResult.namespace}</strong>
                          {rollbackResult.success ? ' успешно откатан.' : ' не удалось откатить.'}
                        </div>
                        {rollbackResult.errors.length > 0 && (
                          <ul style={{ margin: '0 0 1rem', paddingLeft: '1.1rem', color: '#fecaca' }}>
                            {rollbackResult.errors.map(item => <li key={item} style={{ marginBottom: '0.35rem' }}>{item}</li>)}
                          </ul>
                        )}
                        <pre
                          style={{
                            margin: 0,
                            fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
                            fontSize: '0.78rem',
                            lineHeight: 1.7,
                            color: rollbackResult.success ? '#fef3c7' : '#fecaca',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                          }}
                        >
                          {rollbackResult.output || '# Rollback не вернул вывод'}
                        </pre>
                      </>
                    )}
                  </>
                )}
              </div>
            )}

            {tab === 'uninstall' && (
              <div>
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', marginBottom: '0.45rem' }}>
                    <div style={{ color: '#f8fafc', fontSize: '1rem', fontWeight: 800 }}>Удаление release</div>
                    <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                      <span style={{ padding: '0.45rem 0.7rem', borderRadius: '999px', background: '#7f1d1d', color: '#fee2e2', fontSize: '0.76rem', fontWeight: 700 }}>helm uninstall</span>
                      <span style={{ padding: '0.45rem 0.7rem', borderRadius: '999px', background: uninstallResult?.success ? '#14532d' : uninstallResult ? '#7f1d1d' : '#334155', color: '#f8fafc', fontSize: '0.76rem', fontWeight: 700 }}>
                        {isUninstalling ? 'RUNNING' : uninstallResult ? (uninstallResult.success ? 'REMOVED' : 'FAILED') : 'WAITING'}
                      </span>
                    </div>
                  </div>
                <div style={{ color: '#94a3b8', fontSize: '0.84rem' }}>
                  {uninstallResult?.summary || 'Удаление release выполнит helm uninstall в указанный namespace.'}
                </div>
              </div>

                {isUninstalling ? (
                  <div
                    style={{
                      padding: '1rem',
                      borderRadius: '0.85rem',
                      background: 'rgba(15, 23, 42, 0.35)',
                      border: '1px solid rgba(248, 113, 113, 0.2)',
                    }}
                  >
                    <Spinner label="Удаляем release из кластера..." />
                    <div style={{ marginTop: '0.7rem', color: '#94a3b8', fontSize: '0.84rem', lineHeight: 1.6 }}>
                      Release <strong>{releaseName.trim() || chart?.deployed_release_name || chart?.name || 'release'}</strong> удаляется из namespace <strong>{namespace.trim() || chart?.deployed_namespace || 'helmgen-demo'}</strong>.
                    </div>
                  </div>
                ) : !uninstallResult ? (
                  <div style={{ color: '#94a3b8', fontSize: '0.84rem' }}>Удаление release ещё не запускалось.</div>
                ) : (
                  <>
                    <div
                      style={{
                        marginBottom: '1rem',
                        padding: '0.85rem 1rem',
                        borderRadius: '0.8rem',
                        background: uninstallResult.success ? '#14532d' : '#312e81',
                        border: `1px solid ${uninstallResult.success ? '#22c55e' : '#8b5cf6'}`,
                        color: uninstallResult.success ? '#dcfce7' : '#ddd6fe',
                        fontSize: '0.84rem',
                        lineHeight: 1.55,
                      }}
                    >
                      Release <strong>{uninstallResult.release_name}</strong> в namespace <strong>{uninstallResult.namespace}</strong>
                      {uninstallResult.success ? ' успешно удалён.' : ' не удалось удалить.'}
                    </div>

                    <details open={!uninstallResult.success}>
                      <summary style={{ cursor: 'pointer', color: '#fca5a5', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.85rem' }}>
                        Показать вывод удаления
                      </summary>
                      <div style={{ marginTop: '0.75rem' }}>
                        {uninstallResult.errors.length > 0 && (
                          <ul style={{ margin: '0 0 1rem', paddingLeft: '1.1rem', color: '#fecaca' }}>
                            {uninstallResult.errors.map(item => <li key={item} style={{ marginBottom: '0.35rem' }}>{item}</li>)}
                          </ul>
                        )}
                        <pre
                          style={{
                            margin: 0,
                            fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
                            fontSize: '0.78rem',
                            lineHeight: 1.7,
                            color: '#fecaca',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                          }}
                        >
                          {uninstallResult.output || '# Удаление release не вернуло вывод'}
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
