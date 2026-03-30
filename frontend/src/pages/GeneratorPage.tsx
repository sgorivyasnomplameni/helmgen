import { useEffect, useRef, useState } from 'react'
import type { ChartConfig, WorkloadType, ServiceType } from '@/types/generator'
import WorkloadCard from '@/components/WorkloadCard'
import ToggleSwitch from '@/components/ToggleSwitch'
import YamlPreview from '@/components/YamlPreview'
import RecommendationsBlock from '@/components/RecommendationsBlock'
import {
  chartsApi,
  type ChartDryRunResult,
  type ChartTemplateResult,
  type ChartValidationResult,
} from '@/api/charts'
import { generateValuesYaml } from '@/utils/yamlGenerator'

const DEFAULT_CONFIG: ChartConfig = {
  appName: '',
  version: '0.1.0',
  image: 'nginx',
  imageTag: 'latest',
  replicas: 1,
  containerPort: 80,
  workloadType: 'Deployment',
  service: { enabled: true, port: 80, type: 'ClusterIP' },
  ingress: { enabled: false, host: 'myapp.example.com', path: '/' },
  resources: {
    enabled: false,
    requests: { cpu: '100m', memory: '128Mi' },
    limits: { cpu: '500m', memory: '512Mi' },
  },
}

const WORKLOAD_TYPES: WorkloadType[] = ['Deployment', 'StatefulSet', 'DaemonSet']
const SERVICE_TYPES: ServiceType[] = ['ClusterIP', 'NodePort', 'LoadBalancer']

interface DemoScenario {
  id: string
  title: string
  summary: string
  highlights: string[]
  config: ChartConfig
}

const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: 'landing',
    title: 'Публичный лендинг',
    summary: 'Простой Deployment с LoadBalancer и Ingress для внешнего доступа.',
    highlights: ['Deployment', 'LoadBalancer', 'Ingress'],
    config: {
      appName: 'landing-page',
      version: '0.3.0',
      image: 'nginx',
      imageTag: '1.27.0',
      replicas: 2,
      containerPort: 80,
      workloadType: 'Deployment',
      service: { enabled: true, port: 80, type: 'LoadBalancer' },
      ingress: { enabled: true, host: 'landing.demo.local', path: '/' },
      resources: {
        enabled: true,
        requests: { cpu: '100m', memory: '128Mi' },
        limits: { cpu: '300m', memory: '256Mi' },
      },
    },
  },
  {
    id: 'api',
    title: 'Scalable API',
    summary: 'API-сервис с несколькими репликами, NodePort и жёсткими лимитами.',
    highlights: ['Deployment', '4 replicas', 'NodePort'],
    config: {
      appName: 'orders-api',
      version: '1.4.2',
      image: 'company/orders-api',
      imageTag: '2.8.1',
      replicas: 4,
      containerPort: 8080,
      workloadType: 'Deployment',
      service: { enabled: true, port: 8080, type: 'NodePort' },
      ingress: { enabled: false, host: 'orders.demo.local', path: '/' },
      resources: {
        enabled: true,
        requests: { cpu: '250m', memory: '256Mi' },
        limits: { cpu: '1000m', memory: '768Mi' },
      },
    },
  },
  {
    id: 'postgres',
    title: 'Stateful база',
    summary: 'StatefulSet для БД с внутренним сервисом ClusterIP.',
    highlights: ['StatefulSet', 'ClusterIP', 'Persistent workload'],
    config: {
      appName: 'postgres-db',
      version: '12.1.0',
      image: 'postgres',
      imageTag: '16.4',
      replicas: 1,
      containerPort: 5432,
      workloadType: 'StatefulSet',
      service: { enabled: true, port: 5432, type: 'ClusterIP' },
      ingress: { enabled: false, host: 'postgres.demo.local', path: '/' },
      resources: {
        enabled: true,
        requests: { cpu: '300m', memory: '512Mi' },
        limits: { cpu: '1200m', memory: '1Gi' },
      },
    },
  },
  {
    id: 'agent',
    title: 'Node агент',
    summary: 'DaemonSet для логгера или мониторинга на каждой ноде кластера.',
    highlights: ['DaemonSet', 'No replicas', 'Internal only'],
    config: {
      appName: 'node-exporter',
      version: '0.8.0',
      image: 'prom/node-exporter',
      imageTag: '1.8.1',
      replicas: 1,
      containerPort: 9100,
      workloadType: 'DaemonSet',
      service: { enabled: false, port: 9100, type: 'ClusterIP' },
      ingress: { enabled: false, host: 'agent.demo.local', path: '/' },
      resources: {
        enabled: true,
        requests: { cpu: '80m', memory: '64Mi' },
        limits: { cpu: '200m', memory: '128Mi' },
      },
    },
  },
  {
    id: 'risky',
    title: 'Антипример для рекомендаций',
    summary: 'Небезопасная конфигурация, чтобы увидеть предупреждения системы.',
    highlights: ['latest tag', '1 replica', 'No limits'],
    config: {
      appName: 'legacy-admin',
      version: '0.1.0',
      image: 'legacy/admin-panel',
      imageTag: 'latest',
      replicas: 1,
      containerPort: 3000,
      workloadType: 'Deployment',
      service: { enabled: false, port: 3000, type: 'ClusterIP' },
      ingress: { enabled: true, host: 'legacy.demo.local', path: '/' },
      resources: {
        enabled: false,
        requests: { cpu: '100m', memory: '128Mi' },
        limits: { cpu: '500m', memory: '512Mi' },
      },
    },
  },
]

const card: React.CSSProperties = {
  background: 'white',
  borderRadius: '0.875rem',
  padding: '1.5rem',
  boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
  border: '1px solid #f1f5f9',
}

const fieldLabel: React.CSSProperties = {
  display: 'block',
  fontSize: '0.78rem',
  fontWeight: 600,
  color: '#64748b',
  marginBottom: '0.375rem',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

const input: React.CSSProperties = {
  width: '100%',
  padding: '0.55rem 0.75rem',
  border: '1px solid #e2e8f0',
  borderRadius: '0.5rem',
  fontSize: '0.875rem',
  outline: 'none',
  color: '#1e293b',
  background: 'white',
  boxSizing: 'border-box',
}

const sectionTitle: React.CSSProperties = {
  fontSize: '1rem',
  fontWeight: 700,
  color: '#1e293b',
  marginBottom: '1.25rem',
}

const divider: React.CSSProperties = {
  border: 'none',
  borderTop: '1px solid #f1f5f9',
  margin: '1.25rem 0',
}

const primaryButton: React.CSSProperties = {
  border: 'none',
  borderRadius: '0.75rem',
  fontWeight: 700,
  fontSize: '0.96rem',
  padding: '0.875rem 1rem',
  cursor: 'pointer',
  transition: 'all 0.2s',
}

const stepChipBase: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.45rem',
  padding: '0.45rem 0.7rem',
  borderRadius: '999px',
  fontSize: '0.76rem',
  fontWeight: 700,
}

function summarizeDryRunError(errors: string[]): string | null {
  const clusterError = errors.find(error => error.includes('Kubernetes cluster unreachable'))
  if (clusterError) {
    return 'Kubernetes-кластер сейчас недоступен. Dry-run deploy требует активного kube-context.'
  }

  return errors[0] ?? null
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={fieldLabel}>{label}</label>
      {children}
    </div>
  )
}

function Grid2({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
      {children}
    </div>
  )
}

export default function GeneratorPage() {
  const [config, setConfig] = useState<ChartConfig>(DEFAULT_CONFIG)
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [generatedChartId, setGeneratedChartId] = useState<number | null>(null)
  const [validation, setValidation] = useState<ChartValidationResult | null>(null)
  const [isValidating, setIsValidating] = useState(false)
  const [templateResult, setTemplateResult] = useState<ChartTemplateResult | null>(null)
  const [isTemplating, setIsTemplating] = useState(false)
  const [dryRunResult, setDryRunResult] = useState<ChartDryRunResult | null>(null)
  const [isDryRunning, setIsDryRunning] = useState(false)
  const validationRef = useRef<HTMLDivElement | null>(null)
  const templateRef = useRef<HTMLDivElement | null>(null)
  const dryRunRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (validation) {
      validationRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [validation])

  useEffect(() => {
    if (templateResult) {
      templateRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [templateResult])

  useEffect(() => {
    if (dryRunResult) {
      dryRunRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [dryRunResult])

  function resetGenerationState() {
    setStatus('idle')
    setGeneratedChartId(null)
    setValidation(null)
    setTemplateResult(null)
    setDryRunResult(null)
  }

  function set<K extends keyof ChartConfig>(key: K, value: ChartConfig[K]) {
    resetGenerationState()
    setConfig(prev => ({ ...prev, [key]: value }))
  }

  function setService<K extends keyof ChartConfig['service']>(k: K, v: ChartConfig['service'][K]) {
    resetGenerationState()
    setConfig(prev => ({ ...prev, service: { ...prev.service, [k]: v } }))
  }

  function setIngress<K extends keyof ChartConfig['ingress']>(k: K, v: ChartConfig['ingress'][K]) {
    resetGenerationState()
    setConfig(prev => ({ ...prev, ingress: { ...prev.ingress, [k]: v } }))
  }

  function setResources<K extends keyof ChartConfig['resources']>(k: K, v: ChartConfig['resources'][K]) {
    resetGenerationState()
    setConfig(prev => ({ ...prev, resources: { ...prev.resources, [k]: v } }))
  }

  function setResourcesNested(
    group: 'requests' | 'limits',
    key: 'cpu' | 'memory',
    value: string
  ) {
    resetGenerationState()
    setConfig(prev => ({
      ...prev,
      resources: {
        ...prev.resources,
        [group]: { ...prev.resources[group], [key]: value },
      },
    }))
  }

  function applyScenario(scenario: DemoScenario) {
    resetGenerationState()
    setConfig(scenario.config)
  }

  function handleDownload() {
    if (!generatedChartId) return
    const a = document.createElement('a')
    a.href = chartsApi.downloadUrl(generatedChartId)
    a.download = `${config.appName}-${config.version}.tgz`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  async function handleGenerate() {
    if (!config.appName.trim()) {
      alert('Введите название приложения')
      return
    }
    setStatus('loading')
    setValidation(null)
    setTemplateResult(null)
    setDryRunResult(null)
    try {
      const payload = {
        name: config.appName,
        description: `Generated chart for ${config.appName}`,
        chart_version: config.version,
        app_version: config.imageTag,
        values_yaml: generateValuesYaml(config),
      }
      const chart = generatedChartId
        ? await chartsApi.update(generatedChartId, payload)
        : await chartsApi.create(payload)
      const generatedChart = await chartsApi.generate(chart.id, payload.values_yaml)
      setGeneratedChartId(generatedChart.id)
      setStatus('success')
    } catch {
      setStatus('error')
      setTimeout(() => setStatus('idle'), 3000)
    }
  }

  async function handleValidate() {
    if (!generatedChartId) return
    setIsValidating(true)
    try {
      const result = await chartsApi.validate(generatedChartId)
      setValidation(result)
    } catch {
      setValidation({
        valid: false,
        errors: ['Не удалось выполнить проверку чарта'],
        warnings: [],
        checks: [],
        engine: 'builtin',
        summary: 'Проверка завершилась с ошибкой запроса',
      })
    } finally {
      setIsValidating(false)
    }
  }

  async function handleTemplate() {
    if (!generatedChartId) return
    setIsTemplating(true)
    try {
      const result = await chartsApi.template(generatedChartId)
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
    if (!generatedChartId) return
    setIsDryRunning(true)
    try {
      const result = await chartsApi.dryRunDeploy(generatedChartId)
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

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 480px',
        gap: '1.5rem',
        alignItems: 'start',
        padding: '1.5rem',
        maxWidth: '1400px',
        margin: '0 auto',
      }}
    >
      {/* ── LEFT COLUMN ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

        {/* Header */}
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: '#0f172a' }}>
            Генератор Helm-чартов
          </h1>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: '#64748b' }}>
            Настройте параметры и получите готовый Helm-чарт
          </p>
        </div>

        <div
          style={{
            ...card,
            position: 'sticky',
            top: '5.75rem',
            zIndex: 10,
            boxShadow: '0 18px 40px rgba(15, 23, 42, 0.08)',
            border: '1px solid #dbeafe',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', marginBottom: '1rem' }}>
            <div>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
                Рабочий пайплайн
              </div>
              <div style={{ marginTop: '0.25rem', fontSize: '0.84rem', color: '#64748b' }}>
                Состояние сохраняется при переходе в историю. После каждого шага экран автоматически прокрутится к новому результату.
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <span
                style={{
                  ...stepChipBase,
                  background: generatedChartId ? '#dbeafe' : '#e2e8f0',
                  color: generatedChartId ? '#1d4ed8' : '#64748b',
                }}
              >
                1. Generate
              </span>
              <span
                style={{
                  ...stepChipBase,
                  background: validation?.valid ? '#dcfce7' : validation ? '#fee2e2' : '#e2e8f0',
                  color: validation?.valid ? '#166534' : validation ? '#b91c1c' : '#64748b',
                }}
              >
                2. Lint
              </span>
              <span
                style={{
                  ...stepChipBase,
                  background: templateResult?.success ? '#dbeafe' : templateResult ? '#fee2e2' : '#e2e8f0',
                  color: templateResult?.success ? '#1d4ed8' : templateResult ? '#b91c1c' : '#64748b',
                }}
              >
                3. Template
              </span>
              <span
                style={{
                  ...stepChipBase,
                  background: dryRunResult?.success ? '#ede9fe' : dryRunResult ? '#fee2e2' : '#e2e8f0',
                  color: dryRunResult?.success ? '#6d28d9' : dryRunResult ? '#b91c1c' : '#64748b',
                }}
              >
                4. Dry-Run
              </span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.75rem' }}>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={status === 'loading'}
              style={{
                ...primaryButton,
                background: status === 'error' ? '#dc2626' : '#2563eb',
                color: 'white',
                cursor: status === 'loading' ? 'not-allowed' : 'pointer',
                opacity: status === 'loading' ? 0.75 : 1,
              }}
            >
              {status === 'loading' ? 'Генерация...' : 'Сгенерировать'}
            </button>

            <button
              type="button"
              onClick={() => void handleValidate()}
              disabled={!generatedChartId || isValidating || status === 'loading'}
              style={{
                ...primaryButton,
                background: validation?.valid ? '#16a34a' : '#f59e0b',
                color: 'white',
                cursor: !generatedChartId || isValidating || status === 'loading' ? 'not-allowed' : 'pointer',
                opacity: !generatedChartId || isValidating || status === 'loading' ? 0.55 : 1,
              }}
            >
              {isValidating ? 'Проверка...' : 'Проверить chart'}
            </button>

            <button
              type="button"
              onClick={() => void handleTemplate()}
              disabled={!generatedChartId || isTemplating || status === 'loading'}
              style={{
                ...primaryButton,
                background: templateResult?.success ? '#0f766e' : '#0ea5e9',
                color: 'white',
                cursor: !generatedChartId || isTemplating || status === 'loading' ? 'not-allowed' : 'pointer',
                opacity: !generatedChartId || isTemplating || status === 'loading' ? 0.55 : 1,
              }}
            >
              {isTemplating ? 'Рендер...' : 'Рендер манифестов'}
            </button>

            <button
              type="button"
              onClick={() => void handleDryRunDeploy()}
              disabled={!generatedChartId || isDryRunning || status === 'loading'}
              style={{
                ...primaryButton,
                background: dryRunResult?.success ? '#7c3aed' : '#8b5cf6',
                color: 'white',
                cursor: !generatedChartId || isDryRunning || status === 'loading' ? 'not-allowed' : 'pointer',
                opacity: !generatedChartId || isDryRunning || status === 'loading' ? 0.55 : 1,
              }}
            >
              {isDryRunning ? 'Dry-run...' : 'Dry-run deploy'}
            </button>

            <button
              type="button"
              onClick={handleDownload}
              disabled={!generatedChartId}
              style={{
                ...primaryButton,
                background: '#16a34a',
                color: 'white',
                cursor: !generatedChartId ? 'not-allowed' : 'pointer',
                opacity: !generatedChartId ? 0.55 : 1,
              }}
            >
              Скачать архив
            </button>
          </div>

          <div style={{ marginTop: '0.85rem', fontSize: '0.84rem', color: '#64748b' }}>
            {status === 'success' && 'Чарт успешно сгенерирован. Дальше можно последовательно пройти lint, template и dry-run deploy.'}
            {status === 'loading' && 'Идёт генерация Helm-чарта...'}
            {status === 'error' && 'Во время генерации возникла ошибка. Попробуйте снова.'}
            {status === 'idle' && 'Сначала сгенерируйте чарт, затем пройдите шаги проверки и подготовки к развёртыванию.'}
          </div>
        </div>

        <div
          style={{
            ...card,
            background: 'linear-gradient(135deg, #fff7ed 0%, #ffffff 45%, #eff6ff 100%)',
            border: '1px solid #fed7aa',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', marginBottom: '1rem' }}>
            <div>
              <p style={{ ...sectionTitle, marginBottom: '0.35rem' }}>Тестовые сценарии</p>
              <p style={{ margin: 0, fontSize: '0.86rem', color: '#7c2d12', lineHeight: 1.55 }}>
                Выберите готовый демо-кейс, чтобы мгновенно заполнить форму, посмотреть YAML и увидеть реакцию рекомендательной системы.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                resetGenerationState()
                setConfig(DEFAULT_CONFIG)
              }}
              style={{
                border: 'none',
                borderRadius: '999px',
                background: '#fff',
                color: '#9a3412',
                fontWeight: 700,
                fontSize: '0.78rem',
                padding: '0.55rem 0.9rem',
                cursor: 'pointer',
                boxShadow: '0 1px 3px rgba(15, 23, 42, 0.08)',
              }}
            >
              Сбросить форму
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.9rem' }}>
            {DEMO_SCENARIOS.map(scenario => {
              const selected = config.appName === scenario.config.appName
                && config.workloadType === scenario.config.workloadType
                && config.imageTag === scenario.config.imageTag

              return (
                <button
                  key={scenario.id}
                  type="button"
                  onClick={() => applyScenario(scenario)}
                  style={{
                    textAlign: 'left',
                    border: `1.5px solid ${selected ? '#fb923c' : '#fdba74'}`,
                    background: selected ? '#fff7ed' : 'rgba(255,255,255,0.88)',
                    borderRadius: '0.9rem',
                    padding: '1rem',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.8rem',
                    transition: 'transform 0.15s, box-shadow 0.15s',
                    boxShadow: selected ? '0 10px 24px rgba(249, 115, 22, 0.12)' : 'none',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#7c2d12' }}>
                      {scenario.title}
                    </div>
                    <div style={{ marginTop: '0.35rem', fontSize: '0.8rem', lineHeight: 1.5, color: '#9a3412' }}>
                      {scenario.summary}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                    {scenario.highlights.map(item => (
                      <span
                        key={item}
                        style={{
                          padding: '0.28rem 0.5rem',
                          borderRadius: '999px',
                          background: '#ffedd5',
                          color: '#c2410c',
                          fontSize: '0.7rem',
                          fontWeight: 700,
                        }}
                      >
                        {item}
                      </span>
                    ))}
                  </div>

                  <div style={{ fontSize: '0.76rem', color: '#78716c' }}>
                    {scenario.config.appName}:{' '}
                    {scenario.config.imageTag}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Recommendations ── */}
        <RecommendationsBlock config={config} />

        {validation && (
          <div
            ref={validationRef}
            style={{
              ...card,
              border: `1px solid ${validation.valid ? '#bbf7d0' : '#fecaca'}`,
              background: validation.valid ? '#f0fdf4' : '#fff7ed',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.9rem' }}>
              <div>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
                  Результат проверки
                </div>
                <div style={{ marginTop: '0.25rem', fontSize: '0.84rem', color: '#64748b' }}>
                  {validation.summary || 'Проверка структуры и параметров Helm-чарта'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <span
                  style={{
                    padding: '0.4rem 0.7rem',
                    borderRadius: '999px',
                    background: '#e2e8f0',
                    color: '#334155',
                    fontWeight: 800,
                    fontSize: '0.76rem',
                    textTransform: 'uppercase',
                  }}
                >
                  {validation.engine === 'helm_lint' ? 'helm lint' : 'builtin'}
                </span>
                <span
                  style={{
                    padding: '0.4rem 0.7rem',
                    borderRadius: '999px',
                    background: validation.valid ? '#dcfce7' : '#fee2e2',
                    color: validation.valid ? '#166534' : '#b91c1c',
                    fontWeight: 800,
                    fontSize: '0.76rem',
                  }}
                >
                  {validation.valid ? 'VALID' : 'INVALID'}
                </span>
              </div>
            </div>

            {validation.errors.length > 0 && (
              <div style={{ marginBottom: '0.85rem' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#b91c1c', marginBottom: '0.45rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Ошибки
                </div>
                <ul style={{ margin: 0, paddingLeft: '1.1rem', color: '#7f1d1d' }}>
                  {validation.errors.map(item => (
                    <li key={item} style={{ marginBottom: '0.35rem' }}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            {validation.warnings.length > 0 && (
              <div style={{ marginBottom: '0.85rem' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#b45309', marginBottom: '0.45rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Предупреждения
                </div>
                <ul style={{ margin: 0, paddingLeft: '1.1rem', color: '#92400e' }}>
                  {validation.warnings.map(item => (
                    <li key={item} style={{ marginBottom: '0.35rem' }}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#166534', marginBottom: '0.45rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Успешные проверки
              </div>
              <ul style={{ margin: 0, paddingLeft: '1.1rem', color: '#166534' }}>
                {validation.checks.map(item => (
                  <li key={item} style={{ marginBottom: '0.35rem' }}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {templateResult && (
          <div
            ref={templateRef}
            style={{
              ...card,
              border: `1px solid ${templateResult.success ? '#bfdbfe' : '#fecaca'}`,
              background: templateResult.success ? '#eff6ff' : '#fff7ed',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.9rem' }}>
              <div>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
                  Helm Template
                </div>
                <div style={{ marginTop: '0.25rem', fontSize: '0.84rem', color: '#64748b' }}>
                  {templateResult.summary || 'Итоговые Kubernetes-манифесты после рендера Helm chart'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <span
                  style={{
                    padding: '0.4rem 0.7rem',
                    borderRadius: '999px',
                    background: '#dbeafe',
                    color: '#1d4ed8',
                    fontWeight: 800,
                    fontSize: '0.76rem',
                    textTransform: 'uppercase',
                  }}
                >
                  {templateResult.engine.replace('_', ' ')}
                </span>
                <span
                  style={{
                    padding: '0.4rem 0.7rem',
                    borderRadius: '999px',
                    background: templateResult.success ? '#dcfce7' : '#fee2e2',
                    color: templateResult.success ? '#166534' : '#b91c1c',
                    fontWeight: 800,
                    fontSize: '0.76rem',
                  }}
                >
                  {templateResult.success ? 'RENDERED' : 'FAILED'}
                </span>
              </div>
            </div>

            {templateResult.errors.length > 0 && (
              <div style={{ marginBottom: '0.85rem' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#b91c1c', marginBottom: '0.45rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Ошибки рендера
                </div>
                <ul style={{ margin: 0, paddingLeft: '1.1rem', color: '#7f1d1d' }}>
                  {templateResult.errors.map(item => (
                    <li key={item} style={{ marginBottom: '0.35rem' }}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            {templateResult.warnings.length > 0 && (
              <div style={{ marginBottom: '0.85rem' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#b45309', marginBottom: '0.45rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Предупреждения
                </div>
                <ul style={{ margin: 0, paddingLeft: '1.1rem', color: '#92400e' }}>
                  {templateResult.warnings.map(item => (
                    <li key={item} style={{ marginBottom: '0.35rem' }}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#1d4ed8', marginBottom: '0.45rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Результат helm template
              </div>
              <div
                style={{
                  background: '#0f172a',
                  borderRadius: '0.85rem',
                  padding: '1rem',
                  maxHeight: '420px',
                  overflow: 'auto',
                }}
              >
                <pre
                  style={{
                    margin: 0,
                    color: '#dbeafe',
                    fontSize: '0.78rem',
                    lineHeight: 1.6,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
                  }}
                >
                  {templateResult.rendered_manifests || '# Helm template не вернул манифесты'}
                </pre>
              </div>
            </div>
          </div>
        )}

        {dryRunResult && (
          <div
            ref={dryRunRef}
            style={{
              ...card,
              border: `1px solid ${dryRunResult.success ? '#ddd6fe' : '#fecaca'}`,
              background: dryRunResult.success ? '#f5f3ff' : '#fff7ed',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.9rem' }}>
              <div>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
                  Dry-Run Deploy
                </div>
                <div style={{ marginTop: '0.25rem', fontSize: '0.84rem', color: '#64748b' }}>
                  {dryRunResult.summary || 'Проверка сценария развёртывания без применения в кластер'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <span
                  style={{
                    padding: '0.4rem 0.7rem',
                    borderRadius: '999px',
                    background: '#ede9fe',
                    color: '#6d28d9',
                    fontWeight: 800,
                    fontSize: '0.76rem',
                    textTransform: 'uppercase',
                  }}
                >
                  {dryRunResult.engine.replace('_', ' ')}
                </span>
                <span
                  style={{
                    padding: '0.4rem 0.7rem',
                    borderRadius: '999px',
                    background: dryRunResult.success ? '#dcfce7' : '#fee2e2',
                    color: dryRunResult.success ? '#166534' : '#b91c1c',
                    fontWeight: 800,
                    fontSize: '0.76rem',
                  }}
                >
                  {dryRunResult.success ? 'READY' : 'FAILED'}
                </span>
              </div>
            </div>

            {summarizeDryRunError(dryRunResult.errors) && (
              <div
                style={{
                  marginBottom: '0.85rem',
                  padding: '0.85rem 1rem',
                  borderRadius: '0.8rem',
                  background: '#fff',
                  border: '1px solid #fed7aa',
                  color: '#9a3412',
                  fontSize: '0.86rem',
                  lineHeight: 1.55,
                }}
              >
                {summarizeDryRunError(dryRunResult.errors)}
              </div>
            )}

            {dryRunResult.warnings.length > 0 && (
              <div style={{ marginBottom: '0.85rem' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#b45309', marginBottom: '0.45rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Предупреждения
                </div>
                <ul style={{ margin: 0, paddingLeft: '1.1rem', color: '#92400e' }}>
                  {dryRunResult.warnings.map(item => (
                    <li key={item} style={{ marginBottom: '0.35rem' }}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            <details>
              <summary
                style={{
                  cursor: 'pointer',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  color: '#6d28d9',
                  marginBottom: '0.85rem',
                }}
              >
                Показать технические детали dry-run
              </summary>
              <div style={{ marginTop: '0.75rem' }}>
                {dryRunResult.errors.length > 0 && (
                  <div style={{ marginBottom: '0.85rem' }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#b91c1c', marginBottom: '0.45rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Технические ошибки
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '1.1rem', color: '#7f1d1d' }}>
                      {dryRunResult.errors.map(item => (
                        <li key={item} style={{ marginBottom: '0.35rem' }}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#6d28d9', marginBottom: '0.45rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Вывод dry-run deploy
                  </div>
                  <div
                    style={{
                      background: '#1e1b4b',
                      borderRadius: '0.85rem',
                      padding: '1rem',
                      maxHeight: '420px',
                      overflow: 'auto',
                    }}
                  >
                    <pre
                      style={{
                        margin: 0,
                        color: '#e9d5ff',
                        fontSize: '0.78rem',
                        lineHeight: 1.6,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
                      }}
                    >
                      {dryRunResult.output || '# Dry-run deploy не вернул вывод'}
                    </pre>
                  </div>
                </div>
              </div>
            </details>
          </div>
        )}

        {/* ── Basic params ── */}
        <div style={card}>
          <p style={sectionTitle}>Основные параметры</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <Grid2>
              <Field label="Название приложения">
                <input
                  style={input}
                  placeholder="myapp"
                  value={config.appName}
                  onChange={e => set('appName', e.target.value)}
                />
              </Field>
              <Field label="Версия чарта">
                <input
                  style={input}
                  placeholder="0.1.0"
                  value={config.version}
                  onChange={e => set('version', e.target.value)}
                />
              </Field>
            </Grid2>
            <Grid2>
              <Field label="Docker образ">
                <input
                  style={input}
                  placeholder="nginx"
                  value={config.image}
                  onChange={e => set('image', e.target.value)}
                />
              </Field>
              <Field label="Тег образа">
                <input
                  style={input}
                  placeholder="latest"
                  value={config.imageTag}
                  onChange={e => set('imageTag', e.target.value)}
                />
              </Field>
            </Grid2>
            <Grid2>
              <Field label="Количество реплик">
                <input
                  style={{ ...input, opacity: config.workloadType === 'DaemonSet' ? 0.4 : 1 }}
                  type="number"
                  min={1}
                  value={config.replicas}
                  disabled={config.workloadType === 'DaemonSet'}
                  onChange={e => set('replicas', Math.max(1, Number(e.target.value)))}
                />
              </Field>
              <Field label="Порт контейнера">
                <input
                  style={input}
                  type="number"
                  min={1}
                  max={65535}
                  value={config.containerPort}
                  onChange={e => set('containerPort', Number(e.target.value))}
                />
              </Field>
            </Grid2>
          </div>
        </div>

        {/* ── Workload type ── */}
        <div style={card}>
          <p style={sectionTitle}>Тип Workload</p>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            {WORKLOAD_TYPES.map(type => (
              <WorkloadCard
                key={type}
                type={type}
                selected={config.workloadType === type}
                onSelect={() => set('workloadType', type)}
              />
            ))}
          </div>
        </div>

        {/* ── Network ── */}
        <div style={card}>
          <p style={sectionTitle}>Сетевые ресурсы</p>

          {/* Service */}
          <div>
            <ToggleSwitch
              checked={config.service.enabled}
              onChange={v => setService('enabled', v)}
              label="Service"
            />
            {config.service.enabled && (
              <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem' }}>
                <Field label="Порт">
                  <input
                    style={{ ...input, width: '120px' }}
                    type="number"
                    value={config.service.port}
                    onChange={e => setService('port', Number(e.target.value))}
                  />
                </Field>
                <div style={{ flex: 1 }}>
                  <label style={fieldLabel}>Тип Service</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {SERVICE_TYPES.map(t => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setService('type', t)}
                        style={{
                          flex: 1,
                          padding: '0.5rem',
                          border: `2px solid ${config.service.type === t ? '#3b82f6' : '#e2e8f0'}`,
                          borderRadius: '0.5rem',
                          background: config.service.type === t ? '#eff6ff' : 'white',
                          color: config.service.type === t ? '#2563eb' : '#64748b',
                          fontWeight: 600,
                          fontSize: '0.78rem',
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                        }}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <hr style={divider} />

          {/* Ingress */}
          <div>
            <ToggleSwitch
              checked={config.ingress.enabled}
              onChange={v => setIngress('enabled', v)}
              label="Ingress"
            />
            {config.ingress.enabled && (
              <div style={{ marginTop: '1rem' }}>
                <Grid2>
                  <Field label="Хост">
                    <input
                      style={input}
                      placeholder="myapp.example.com"
                      value={config.ingress.host}
                      onChange={e => setIngress('host', e.target.value)}
                    />
                  </Field>
                  <Field label="Путь">
                    <input
                      style={input}
                      placeholder="/"
                      value={config.ingress.path}
                      onChange={e => setIngress('path', e.target.value)}
                    />
                  </Field>
                </Grid2>
              </div>
            )}
          </div>
        </div>

        {/* ── Resource limits ── */}
        <div style={card}>
          <ToggleSwitch
            checked={config.resources.enabled}
            onChange={v => setResources('enabled', v)}
            label="Resource Limits"
          />
          {config.resources.enabled && (
            <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <p style={{ margin: '0 0 0.75rem', fontSize: '0.8rem', fontWeight: 600, color: '#64748b' }}>REQUESTS</p>
                <Grid2>
                  <Field label="CPU">
                    <input
                      style={input}
                      placeholder="100m"
                      value={config.resources.requests.cpu}
                      onChange={e => setResourcesNested('requests', 'cpu', e.target.value)}
                    />
                  </Field>
                  <Field label="Memory">
                    <input
                      style={input}
                      placeholder="128Mi"
                      value={config.resources.requests.memory}
                      onChange={e => setResourcesNested('requests', 'memory', e.target.value)}
                    />
                  </Field>
                </Grid2>
              </div>
              <div>
                <p style={{ margin: '0 0 0.75rem', fontSize: '0.8rem', fontWeight: 600, color: '#64748b' }}>LIMITS</p>
                <Grid2>
                  <Field label="CPU">
                    <input
                      style={input}
                      placeholder="500m"
                      value={config.resources.limits.cpu}
                      onChange={e => setResourcesNested('limits', 'cpu', e.target.value)}
                    />
                  </Field>
                  <Field label="Memory">
                    <input
                      style={input}
                      placeholder="512Mi"
                      value={config.resources.limits.memory}
                      onChange={e => setResourcesNested('limits', 'memory', e.target.value)}
                    />
                  </Field>
                </Grid2>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* ── RIGHT COLUMN ── */}
      <div style={{ position: 'sticky', top: '1.5rem' }}>
        <YamlPreview
          config={config}
          chartId={generatedChartId ?? undefined}
          chartName={config.appName || 'chart'}
          chartVersion={config.version}
        />
      </div>
    </div>
  )
}
