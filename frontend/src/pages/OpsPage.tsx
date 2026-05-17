import { useEffect, useState } from 'react'
import AuditList from '@/components/AuditList'
import Button from '@/components/Button'
import CodeBlock from '@/components/CodeBlock'
import OperationStatePanel from '@/components/OperationStatePanel'
import StatusPill from '@/components/StatusPill'
import { useToast } from '@/components/ToastProvider'
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
  maxWidth: '1720px',
  margin: '0 auto',
}

const card: React.CSSProperties = {
  background: 'var(--surface-base)',
  borderRadius: '1rem',
  border: '1px solid var(--border-subtle)',
  boxShadow: 'var(--shadow)',
  animation: 'fadeUp 0.3s ease',
}

const actionButton: React.CSSProperties = {
  borderRadius: '0.82rem',
  padding: '0.78rem 1rem',
  fontSize: '0.88rem',
  fontWeight: 800,
  cursor: 'pointer',
}

const subtleButton: React.CSSProperties = {
  ...actionButton,
  border: '1px solid var(--border-subtle)',
  background: 'var(--surface-base)',
  color: 'var(--text-soft)',
}

const consoleCard: React.CSSProperties = {
  background: 'linear-gradient(180deg, color-mix(in srgb, var(--code-surface) 88%, #0f172a 12%) 0%, var(--code-bg) 100%)',
  borderRadius: '1rem',
  border: '1px solid color-mix(in srgb, var(--code-border) 72%, rgba(255,255,255,0.04) 28%)',
  boxShadow: '0 18px 40px rgba(15, 23, 42, 0.18)',
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
    return 'Kubernetes-кластер недоступен. Для client-side dry-run это обычно не критично, но chart может зависеть от cluster-specific данных.'
  }

  return errors[0] ?? null
}

function summarizeClusterError(errors: string[]): string | null {
  const clusterError = errors.find(error => error.includes('Kubernetes'))
  if (clusterError) {
    return 'Backend не может подключиться к Kubernetes API. Реальный deploy-контур сейчас недоступен, но template и client-side dry-run всё ещё можно использовать.'
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
  const { showToast } = useToast()
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
  const canDryRun = !isDryRunning
  const canDeploy = clusterReady && deployConfirmed && !isDeploying
  const templateReady = Boolean(templateResult?.success)
  const dryRunReady = Boolean(dryRunResult?.success)
  const deploySucceeded = Boolean(deployResult?.success)
  const showDeployConfirmation = !deploySucceeded && (dryRunReady || tab === 'deploy')
  const showRollbackControls = tab === 'rollback'
  const showAdvancedOperations = deploySucceeded || Boolean(releaseStatusResult || monitoringResult || releaseHistoryResult || rollbackResult || uninstallResult)
  const visibleTabs: Array<[OpsTab, string]> = deploySucceeded
    ? [
        ['template', 'Рендер'],
        ['dry-run', 'Dry-run'],
        ['deploy', 'Deploy'],
        ['monitoring', 'Мониторинг'],
        ['rollback', 'Rollback'],
        ['uninstall', 'Удаление'],
      ]
    : [
        ['template', 'Рендер'],
        ['dry-run', 'Dry-run'],
        ['deploy', 'Deploy'],
      ]

  const primaryFlowAction =
    !templateReady
      ? {
          title: 'Шаг 1. Подготовить манифесты',
          description: 'Сначала собери итоговые Kubernetes-манифесты через helm template и проверь, что chart рендерится без ошибок.',
          label: isTemplating ? 'Рендер...' : 'Запустить рендер',
          onClick: () => void handleTemplate(),
          disabled: isTemplating,
          tone: 'accent' as const,
        }
      : !dryRunReady
        ? {
            title: 'Шаг 2. Выполнить dry-run',
            description: 'Дальше проверь release с текущими namespace и release name без реального применения изменений.',
            label: isDryRunning ? 'Dry-run...' : 'Запустить dry-run',
            onClick: () => void handleDryRunDeploy(),
            disabled: !canDryRun,
            tone: 'neutral' as const,
          }
        : !deploySucceeded
          ? clusterReady
            ? {
                title: 'Шаг 3. Выполнить deploy',
                description: 'Кластер доступен. Подтверди реальное развёртывание и запускай helm upgrade --install.',
                label: isDeploying ? 'Развёртывание...' : 'Развернуть release',
                onClick: () => void handleDeploy(),
                disabled: !canDeploy,
                tone: 'success' as const,
              }
            : {
                title: 'Шаг 3. Подготовить Kubernetes',
                description: 'Chart уже прошёл render и dry-run, но backend пока не видит рабочий Kubernetes context для реального deploy.',
                label: isLoadingClusterStatus ? 'Проверяем...' : 'Проверить Kubernetes',
                onClick: () => void refreshClusterStatus(),
                disabled: isLoadingClusterStatus,
                tone: 'warning' as const,
              }
          : {
              title: 'Deploy завершён',
              description: 'Release уже развернут. Теперь можно посмотреть статус, мониторинг, историю Helm или выполнить откат.',
              label: isMonitoring ? 'Собираем...' : 'Открыть мониторинг',
              onClick: () => void handleMonitoring(),
              disabled: isMonitoring || !clusterReady,
              tone: 'success' as const,
            }

  const primaryActionStyle =
    primaryFlowAction.tone === 'accent'
      ? { border: 'none', background: 'var(--accent)', color: 'white' }
      : primaryFlowAction.tone === 'success'
        ? { border: 'none', background: 'var(--success)', color: 'white' }
        : primaryFlowAction.tone === 'warning'
          ? {
              border: '1px solid color-mix(in srgb, var(--warning) 35%, transparent)',
              background: 'var(--warning-soft)',
              color: 'var(--warning)',
            }
          : {
              border: '1px solid var(--border-subtle)',
              background: 'var(--surface-elevated)',
              color: 'var(--text-soft)',
            }

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
    showToast(summary, status === 'success' ? 'success' : 'error')
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
      const result = await chartsApi.dryRunDeploy(activeChartId, {
        namespace: namespace.trim() || 'helmgen-preview',
        release_name: releaseName.trim() || undefined,
      })
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
      <div className="page-shell" style={pageShell}>
        <div style={{ ...card, padding: '1.4rem' }}>
          <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, color: 'var(--text)' }}>
            Проверка и deploy
          </h1>
          <div style={{ marginTop: '0.9rem', color: 'var(--text-muted)', fontSize: '0.95rem' }}>
            Сначала сгенерируйте chart на вкладке генератора или выберите его из истории.
          </div>
          {onOpenGenerator && (
            <Button type="button" tone="primary" style={{ marginTop: '1rem' }} onClick={onOpenGenerator}>
              Открыть генератор
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="page-shell" style={pageShell}>
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
        <div style={{ marginBottom: '1rem' }}>
          <OperationStatePanel
            state="running"
            title={activeOperationLabel}
            message={activeOperationDetails || 'Операция выполняется через backend Helm/Kubernetes.'}
            meta={`Прошло: ${activeOperationSeconds} сек. ${activeOperationExpectation}`}
          />
        </div>
      )}

      <div
        style={{
          ...card,
          padding: '1rem 1.1rem',
          marginBottom: '1rem',
          background: 'var(--surface-base)',
        }}
      >
        <div style={{ display: 'grid', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
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

            <div
              style={{
                padding: '0.45rem 0.75rem',
                borderRadius: '999px',
                background: deploySucceeded
                  ? 'var(--success-soft)'
                  : dryRunReady
                    ? 'var(--accent-soft)'
                    : templateReady
                      ? 'var(--surface-contrast)'
                      : 'var(--surface-elevated)',
                color: deploySucceeded
                  ? 'var(--success)'
                  : dryRunReady
                    ? 'var(--accent)'
                    : 'var(--text-soft)',
                fontSize: '0.76rem',
                fontWeight: 800,
              }}
            >
              {deploySucceeded
                ? 'Готово к post-deploy действиям'
                : dryRunReady
                  ? 'Готово к deploy'
                  : templateReady
                    ? 'Готово к dry-run'
                    : 'Начни с рендера'}
            </div>
          </div>

          <div
            style={{
              padding: '0.9rem',
              borderRadius: '0.95rem',
              border: '1px solid var(--border-subtle)',
              background: 'var(--surface-elevated)',
              display: 'grid',
              gap: '0.65rem',
            }}
          >
            <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text)' }}>
              {primaryFlowAction.title}
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.84rem', lineHeight: 1.55 }}>
              {primaryFlowAction.description}
            </div>
            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
              <Button
                type="button"
                tone={primaryFlowAction.tone === 'success' ? 'success' : primaryFlowAction.tone === 'accent' ? 'primary' : 'secondary'}
                onClick={primaryFlowAction.onClick}
                disabled={primaryFlowAction.disabled}
                style={{
                  ...(primaryFlowAction.tone === 'warning' ? primaryActionStyle : {}),
                  borderRadius: '999px',
                  animation: primaryFlowAction.disabled ? undefined : 'pulseGlow 2.8s ease-out infinite',
                }}
              >
                {primaryFlowAction.label}
              </Button>
              <Button type="button" tone="secondary" onClick={handleDownload}>
                Скачать .tgz
              </Button>
              {onOpenGenerator && (
                <Button type="button" tone="secondary" onClick={onOpenGenerator}>
                  Вернуться в генератор
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="ops-layout">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ ...card, padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center' }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text)' }}>
                Подключение к Kubernetes
              </div>
              <Button type="button" tone="secondary" size="sm" onClick={() => void refreshClusterStatus()} disabled={isLoadingClusterStatus}>
                {isLoadingClusterStatus ? 'Проверяем...' : 'Обновить'}
              </Button>
            </div>

            <div style={{ marginTop: '0.85rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              <StatusPill tone={clusterReady ? 'success' : 'warning'}>
                {clusterReady ? 'Кластер доступен' : 'Кластер недоступен'}
              </StatusPill>
              <StatusPill tone={clusterStatus?.helm_available ? 'success' : 'neutral'}>
                Helm {clusterStatus?.helm_available ? 'готов' : 'не найден'}
              </StatusPill>
              <StatusPill tone={clusterStatus?.current_context ? 'neutral' : 'warning'}>
                {clusterStatus?.current_context || 'Нет context'}
              </StatusPill>
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

            <details style={{ marginTop: '0.8rem' }}>
              <summary style={{ cursor: 'pointer', color: 'var(--text-soft)', fontSize: '0.8rem', fontWeight: 700 }}>
                Технические детали подключения
              </summary>
              <div style={{ marginTop: '0.65rem', display: 'grid', gap: '0.45rem', color: 'var(--text-muted)', fontSize: '0.82rem', lineHeight: 1.55 }}>
                <div>Kubeconfig: {clusterStatus?.kubeconfig_present ? 'найден' : 'не найден'}</div>
                <div>Context: {clusterStatus?.current_context || 'не определён'}</div>
                <div style={{ wordBreak: 'break-word' }}>API server: {clusterStatus?.cluster_server || 'не определён'}</div>
              </div>
            </details>

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

          <div style={{ ...card, padding: '1rem' }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text)', marginBottom: '0.35rem' }}>
              Параметры текущего шага
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
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--surface-elevated)',
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
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--surface-elevated)',
                    color: 'var(--text)',
                    fontSize: '0.9rem',
                    boxSizing: 'border-box',
                  }}
                />
              </label>

              {showDeployConfirmation && (
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.65rem',
                    padding: '0.75rem 0.8rem',
                    borderRadius: '0.75rem',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--surface-elevated)',
                    color: 'var(--text-soft)',
                    fontSize: '0.82rem',
                    fontWeight: 700,
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
              )}

              {showRollbackControls && (
                <>
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
                        border: '1px solid var(--border-subtle)',
                        background: 'var(--surface-elevated)',
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
                  <button
                    type="button"
                    onClick={() => void handleRollback()}
                    disabled={!clusterReady || !rollbackConfirmed || isRollingBack}
                    style={{
                      ...actionButton,
                      border: 'none',
                      background: 'var(--warning)',
                      color: '#1f2937',
                      opacity: !clusterReady || !rollbackConfirmed || isRollingBack ? 0.65 : 1,
                      cursor: !clusterReady || !rollbackConfirmed || isRollingBack ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {isRollingBack ? 'Выполняем rollback...' : 'Запустить rollback'}
                  </button>
                </>
              )}
            </div>
          </div>

          <div style={{ ...card, padding: '1rem' }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text)', marginBottom: '0.8rem' }}>
              Краткий прогресс
            </div>
            <div style={{ display: 'grid', gap: '0.65rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-soft)', fontSize: '0.84rem', fontWeight: 700 }}>1. Рендер манифестов</span>
                <span style={{ color: isTemplating ? 'var(--accent)' : templateResult?.success ? 'var(--success)' : 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 800 }}>
                  {isTemplating ? 'идёт' : templateResult?.success ? 'готово' : 'ожидает'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-soft)', fontSize: '0.84rem', fontWeight: 700 }}>2. Dry-run release</span>
                <span style={{ color: isDryRunning ? 'var(--accent)' : dryRunResult?.success ? 'var(--success)' : dryRunResult ? 'var(--warning)' : 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 800 }}>
                  {isDryRunning ? 'идёт' : dryRunResult?.success ? 'готово' : dryRunResult ? 'ошибка' : 'ожидает'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-soft)', fontSize: '0.84rem', fontWeight: 700 }}>3. Реальный deploy</span>
                <span style={{ color: isDeploying ? 'var(--accent)' : deployResult?.success ? 'var(--success)' : deployResult ? 'var(--warning)' : 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 800 }}>
                  {isDeploying ? 'идёт' : deployResult?.success ? 'готово' : deployResult ? 'ошибка' : 'ожидает'}
                </span>
              </div>
            </div>

            {(chartError || loadingChart || clusterBlockingReason) && (
              <div style={{ marginTop: '0.95rem', display: 'grid', gap: '0.55rem' }}>
                {chartError && (
                  <div style={{ color: 'var(--danger)', fontWeight: 700, fontSize: '0.82rem', lineHeight: 1.5 }}>
                    {chartError}
                  </div>
                )}
                {loadingChart && (
                  <div style={{ color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.82rem' }}>
                    Загружаем данные chart...
                  </div>
                )}
                {clusterBlockingReason && (
                  <div style={{ color: 'var(--warning)', fontWeight: 700, fontSize: '0.82rem', lineHeight: 1.5 }}>
                    Реальный deploy-контур сейчас недоступен, но template и client-side dry-run можно использовать дальше.
                  </div>
                )}
              </div>
            )}

            <div
              style={{
                marginTop: '0.95rem',
                paddingTop: '0.9rem',
                borderTop: '1px solid var(--border-subtle)',
              }}
            >
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Последняя операция
              </div>
              <div style={{ marginTop: '0.55rem' }}>
                <OperationStatePanel
                  state={!lastOperation ? 'idle' : lastOperation.status === 'success' ? 'success' : 'error'}
                  title={lastOperation?.label || 'Последняя операция'}
                  message={lastOperation?.summary || 'После первого действия здесь появится краткий итог.'}
                  meta={lastOperation ? new Date(lastOperation.finishedAt).toLocaleTimeString('ru-RU') : 'Пока операции не запускались.'}
                />
              </div>
            </div>
          </div>

          {showAdvancedOperations && (
            <div style={{ ...card, padding: '1.15rem' }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text)', marginBottom: '0.35rem' }}>
              Дополнительные действия
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.83rem', lineHeight: 1.55, marginBottom: '0.8rem' }}>
              Эти действия нужны уже после основного deploy или для восстановления release.
            </div>
            <div style={{ display: 'grid', gap: '0.55rem' }}>
              <button
                type="button"
                onClick={() => void handleReleaseStatus()}
                disabled={!clusterReady || isCheckingReleaseStatus}
                style={{ ...subtleButton, width: '100%', textAlign: 'left', opacity: !clusterReady || isCheckingReleaseStatus ? 0.65 : 1 }}
              >
                {isCheckingReleaseStatus ? 'Получаем статус release...' : 'Статус release'}
              </button>
              <button
                type="button"
                onClick={() => void handleMonitoring()}
                disabled={!clusterReady || isMonitoring}
                style={{ ...subtleButton, width: '100%', textAlign: 'left', opacity: !clusterReady || isMonitoring ? 0.65 : 1 }}
              >
                {isMonitoring ? 'Собираем мониторинг...' : 'Мониторинг release'}
              </button>
              <button
                type="button"
                onClick={() => void handleReleaseHistory()}
                disabled={!clusterReady || isLoadingReleaseHistory}
                style={{ ...subtleButton, width: '100%', textAlign: 'left', opacity: !clusterReady || isLoadingReleaseHistory ? 0.65 : 1 }}
              >
                {isLoadingReleaseHistory ? 'Получаем историю Helm...' : 'История Helm'}
              </button>
              <button
                type="button"
                onClick={() => setTab('rollback')}
                style={{ ...subtleButton, width: '100%', textAlign: 'left' }}
              >
                Подготовить rollback
              </button>
              <button
                type="button"
                onClick={() => void handleUninstall()}
                disabled={!clusterReady || isUninstalling}
                style={{
                  ...subtleButton,
                  width: '100%',
                  textAlign: 'left',
                  border: '1px solid color-mix(in srgb, var(--danger) 30%, transparent)',
                  background: 'var(--danger-soft)',
                  color: 'var(--danger)',
                  opacity: !clusterReady || isUninstalling ? 0.65 : 1,
                }}
              >
                {isUninstalling ? 'Удаляем release...' : 'Удалить release'}
              </button>
            </div>
            </div>
          )}
        </div>

        <div
          style={{
            ...consoleCard,
            minHeight: '720px',
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '1rem 1.25rem 0', background: 'linear-gradient(180deg, color-mix(in srgb, var(--code-surface) 82%, black 18%) 0%, color-mix(in srgb, var(--code-bg) 92%, black 8%) 100%)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
              <div>
                <div style={{ color: '#94a3b8', fontSize: '0.77rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  Инженерная консоль
                </div>
                <div style={{ marginTop: '0.22rem', color: '#f8fafc', fontSize: '1rem', fontWeight: 800 }}>
                  Helm / kubectl / release output
                </div>
              </div>
              <StatusPill tone="dark">helm / kubectl</StatusPill>
            </div>
            <div style={{ display: 'flex', gap: '0.25rem', overflowX: 'auto', marginBottom: '0.5rem' }}>
              {visibleTabs.map(([nextTab, label]) => {
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
                      border: `1px solid ${activeTab ? 'rgba(96, 165, 250, 0.32)' : 'rgba(148, 163, 184, 0.16)'}`,
                      borderRadius: '999px',
                      cursor: 'pointer',
                      background: activeTab ? 'rgba(37, 99, 235, 0.16)' : 'rgba(15, 23, 42, 0.12)',
                      color: activeTab ? '#eff6ff' : '#94a3b8',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{ background: 'transparent', padding: '1rem', minHeight: '640px' }}>
            {tab === 'template' && (
              <div style={{ display: 'grid', gap: '1rem' }}>
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', marginBottom: '0.45rem' }}>
                    <div style={{ color: '#f8fafc', fontSize: '1rem', fontWeight: 800 }}>Helm Template</div>
                    <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                      <StatusPill tone="accent">helm template</StatusPill>
                      <StatusPill tone={templateResult?.success ? 'success' : templateResult ? 'danger' : 'neutral'}>
                        {isTemplating ? 'В работе' : templateResult ? (templateResult.success ? 'Готово' : 'Ошибка') : 'Ожидает'}
                      </StatusPill>
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
                      background: 'var(--surface-muted)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <Spinner label="Рендерим манифесты через helm template..." />
                    <div style={{ marginTop: '0.7rem', color: 'var(--text-muted)', fontSize: '0.84rem', lineHeight: 1.6 }}>
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
                    <CodeBlock minHeight={360}>
                      {templateResult.rendered_manifests || '# Helm template не вернул манифесты'}
                    </CodeBlock>
                  </>
                )}
              </div>
            )}

            {tab === 'dry-run' && (
              <div style={{ display: 'grid', gap: '1rem' }}>
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', marginBottom: '0.45rem' }}>
                    <div style={{ color: '#f8fafc', fontSize: '1rem', fontWeight: 800 }}>Dry-Run Deploy</div>
                    <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                      <StatusPill tone="accent">helm dry-run</StatusPill>
                      <StatusPill tone={dryRunResult?.success ? 'success' : dryRunResult ? 'danger' : 'neutral'}>
                        {isDryRunning ? 'В работе' : dryRunResult ? (dryRunResult.success ? 'Готово' : 'Ошибка') : 'Ожидает'}
                      </StatusPill>
                    </div>
                  </div>
                <div style={{ color: '#94a3b8', fontSize: '0.84rem' }}>
                  {dryRunResult?.summary || 'Client-side dry-run проверит release с текущими namespace и release name до реального deploy.'}
                </div>
              </div>

                {isDryRunning ? (
                  <div
                    style={{
                      padding: '1rem',
                      borderRadius: '0.85rem',
                      background: 'var(--surface-muted)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <Spinner label="Запускаем dry-run проверку..." />
                    <div style={{ marginTop: '0.7rem', color: 'var(--text-muted)', fontSize: '0.84rem', lineHeight: 1.6 }}>
                      Backend выполняет client-side Helm dry-run с теми же параметрами release и namespace, которые будут использованы для реального deploy.
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
                          background: 'color-mix(in srgb, var(--accent) 10%, var(--surface-base) 90%)',
                          border: '1px solid color-mix(in srgb, var(--accent) 24%, var(--border-subtle) 76%)',
                          color: 'var(--text-soft)',
                          fontSize: '0.84rem',
                          lineHeight: 1.55,
                        }}
                      >
                        {summarizeDryRunError(dryRunResult.errors)}
                      </div>
                    )}

                    <details>
                      <summary style={{ cursor: 'pointer', color: 'var(--accent-contrast)', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.85rem' }}>
                        Показать технические детали
                      </summary>
                      <div style={{ marginTop: '0.75rem' }}>
                        {dryRunResult.errors.length > 0 && (
                          <ul style={{ margin: '0 0 1rem', paddingLeft: '1.1rem', color: 'var(--text-soft)' }}>
                            {dryRunResult.errors.map(item => <li key={item} style={{ marginBottom: '0.35rem' }}>{item}</li>)}
                          </ul>
                        )}
                        <CodeBlock minHeight={300}>
                          {dryRunResult.output || '# Dry-run не вернул вывод'}
                        </CodeBlock>
                      </div>
                    </details>
                  </>
                )}
              </div>
            )}

            {tab === 'deploy' && (
              <div style={{ display: 'grid', gap: '1rem' }}>
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', marginBottom: '0.45rem' }}>
                    <div style={{ color: '#f8fafc', fontSize: '1rem', fontWeight: 800 }}>Развёртывание</div>
                    <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                      <StatusPill tone="success">helm deploy</StatusPill>
                      <StatusPill tone={deployResult?.success ? 'success' : deployResult ? 'danger' : 'neutral'}>
                        {isDeploying ? 'В работе' : deployResult ? (deployResult.success ? 'Готово' : 'Ошибка') : 'Ожидает'}
                      </StatusPill>
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
                      background: 'var(--surface-muted)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <Spinner label="Выполняем helm upgrade --install..." />
                    <div style={{ marginTop: '0.7rem', color: 'var(--text-muted)', fontSize: '0.84rem', lineHeight: 1.6 }}>
                      Release <strong>{releaseName.trim() || chart?.name || 'release'}</strong> разворачивается в namespace <strong>{namespace.trim() || 'helmgen-demo'}</strong>.
                    </div>
                    <div style={{ marginTop: '0.45rem', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
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
                        background: deployResult.success ? 'var(--success-soft)' : 'color-mix(in srgb, var(--accent) 10%, var(--surface-base) 90%)',
                        border: `1px solid ${deployResult.success ? 'color-mix(in srgb, var(--success) 30%, transparent)' : 'color-mix(in srgb, var(--accent) 24%, var(--border-subtle) 76%)'}`,
                        color: deployResult.success ? 'var(--success)' : '#e2e8f0',
                        fontSize: '0.84rem',
                        lineHeight: 1.55,
                      }}
                    >
                      Release <strong>{deployResult.release_name}</strong> в namespace <strong>{deployResult.namespace}</strong>
                      {deployResult.success ? ' успешно развернут.' : ' не удалось развернуть.'}
                    </div>

                    <details open={!deployResult.success}>
                      <summary style={{ cursor: 'pointer', color: deployResult.success ? 'var(--success)' : 'var(--accent-contrast)', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.85rem' }}>
                        Показать вывод развёртывания
                      </summary>
                      <div style={{ marginTop: '0.75rem' }}>
                        {deployResult.errors.length > 0 && (
                          <ul style={{ margin: '0 0 1rem', paddingLeft: '1.1rem', color: '#fecaca' }}>
                            {deployResult.errors.map(item => <li key={item} style={{ marginBottom: '0.35rem' }}>{item}</li>)}
                          </ul>
                        )}
                        <CodeBlock minHeight={320}>
                          {deployResult.output || '# Развёртывание не вернуло вывод'}
                        </CodeBlock>
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
                      <CodeBlock minHeight={220} style={{ color: releaseStatusResult.success ? '#dbeafe' : '#fecaca' }}>
                        {releaseStatusResult.output || '# Helm status не вернул вывод'}
                      </CodeBlock>
                    </>
                  )}
                </div>
              </div>
            )}

            {tab === 'monitoring' && (
              <div style={{ display: 'grid', gap: '1rem' }}>
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
                    <CodeBlock minHeight={320} style={{ color: monitoringResult.success ? 'var(--code-text)' : '#fecaca' }}>
                      {monitoringResult.output || '# Мониторинг не вернул вывод'}
                    </CodeBlock>
                  </>
                )}
              </div>
            )}

            {tab === 'rollback' && (
              <div style={{ display: 'grid', gap: '1rem' }}>
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', marginBottom: '0.45rem' }}>
                    <div style={{ color: '#f8fafc', fontSize: '1rem', fontWeight: 800 }}>Rollback release</div>
                    <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                      <StatusPill tone="warning">helm rollback</StatusPill>
                      <StatusPill tone={rollbackResult?.success ? 'success' : rollbackResult ? 'danger' : 'neutral'}>
                        {isRollingBack ? 'RUNNING' : rollbackResult ? (rollbackResult.success ? 'ROLLED BACK' : 'FAILED') : 'WAITING'}
                      </StatusPill>
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
                        <div style={{ color: '#f8fafc', fontSize: '0.88rem', fontWeight: 800 }}>
                          Доступные ревизии для rollback
                        </div>
                        <Button type="button" tone="secondary" size="sm" onClick={() => void handleReleaseHistory()} disabled={isLoadingReleaseHistory || !clusterReady}>
                          {isLoadingReleaseHistory ? 'Обновляем...' : 'Обновить историю'}
                        </Button>
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
                        <CodeBlock minHeight={280} style={{ color: rollbackResult.success ? 'var(--code-text)' : '#fecaca' }}>
                          {rollbackResult.output || '# Rollback не вернул вывод'}
                        </CodeBlock>
                      </>
                    )}
                  </>
                )}
              </div>
            )}

            {tab === 'uninstall' && (
              <div style={{ display: 'grid', gap: '1rem' }}>
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', marginBottom: '0.45rem' }}>
                    <div style={{ color: '#f8fafc', fontSize: '1rem', fontWeight: 800 }}>Удаление release</div>
                    <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                      <StatusPill tone="danger">helm uninstall</StatusPill>
                      <StatusPill tone={uninstallResult?.success ? 'success' : uninstallResult ? 'danger' : 'neutral'}>
                        {isUninstalling ? 'RUNNING' : uninstallResult ? (uninstallResult.success ? 'REMOVED' : 'FAILED') : 'WAITING'}
                      </StatusPill>
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
                      <summary style={{ cursor: 'pointer', color: 'var(--danger)', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.85rem' }}>
                        Показать вывод удаления
                      </summary>
                      <div style={{ marginTop: '0.75rem' }}>
                        {uninstallResult.errors.length > 0 && (
                          <ul style={{ margin: '0 0 1rem', paddingLeft: '1.1rem', color: '#fecaca' }}>
                            {uninstallResult.errors.map(item => <li key={item} style={{ marginBottom: '0.35rem' }}>{item}</li>)}
                          </ul>
                        )}
                        <CodeBlock minHeight={280} style={{ color: '#fecaca' }}>
                          {uninstallResult.output || '# Удаление release не вернуло вывод'}
                        </CodeBlock>
                      </div>
                    </details>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <details style={{ marginTop: '1rem' }}>
        <summary style={{ cursor: 'pointer', color: 'var(--text-soft)', fontSize: '0.85rem', fontWeight: 700 }}>
          Журнал и аудит по chart
        </summary>
        <div style={{ marginTop: '0.85rem' }}>
          <AuditList
            title="Журнал по chart"
            events={auditEvents}
            emptyText="После генерации, проверки и deploy здесь появится история действий по текущему chart."
          />
        </div>
      </details>
    </div>
  )
}
