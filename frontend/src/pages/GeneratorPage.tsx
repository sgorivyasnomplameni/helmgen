import { useState } from 'react'
import type { ChartConfig, WorkloadType, ServiceType, YamlTab } from '@/types/generator'
import WorkloadCard from '@/components/WorkloadCard'
import ToggleSwitch from '@/components/ToggleSwitch'
import RecommendationsBlock from '@/components/RecommendationsBlock'
import {
  chartsApi,
  type ChartDryRunResult,
  type ChartTemplateResult,
  type ChartValidationResult,
} from '@/api/charts'
import {
  generateChartYaml,
  generateDeploymentYaml,
  generateIngressYaml,
  generateServiceYaml,
  generateValuesYaml,
} from '@/utils/yamlGenerator'

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
const PREVIEW_TABS: YamlTab[] = ['deployment.yaml', 'service.yaml', 'ingress.yaml', 'Chart.yaml']

type WorkspaceSection = 'preview' | 'lint' | 'template' | 'dry-run'

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
    return 'Kubernetes-кластер недоступен. Dry-run deploy требует активного kube-context.'
  }

  return errors[0] ?? null
}

function getPreviewContent(tab: YamlTab, config: ChartConfig): string {
  switch (tab) {
    case 'deployment.yaml':
      return generateDeploymentYaml(config)
    case 'service.yaml':
      return generateServiceYaml(config)
    case 'ingress.yaml':
      return generateIngressYaml(config)
    case 'Chart.yaml':
      return generateChartYaml(config)
  }
}

function isPreviewTabDisabled(tab: YamlTab, config: ChartConfig): boolean {
  if (tab === 'service.yaml') return !config.service.enabled
  if (tab === 'ingress.yaml') return !config.ingress.enabled
  return false
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
  const [workspaceSection, setWorkspaceSection] = useState<WorkspaceSection>('preview')
  const [previewTab, setPreviewTab] = useState<YamlTab>('deployment.yaml')

  function resetGenerationState() {
    setStatus('idle')
    setGeneratedChartId(null)
    setValidation(null)
    setTemplateResult(null)
    setDryRunResult(null)
    setWorkspaceSection('preview')
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

  function setResourcesNested(group: 'requests' | 'limits', key: 'cpu' | 'memory', value: string) {
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
    setWorkspaceSection('preview')

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
    setWorkspaceSection('lint')
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
    setWorkspaceSection('template')
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
    setWorkspaceSection('dry-run')
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

  const latestResultSummary = dryRunResult
    ? summarizeDryRunError(dryRunResult.errors) ?? dryRunResult.summary
    : templateResult
      ? templateResult.summary
      : validation
        ? validation.summary
        : generatedChartId
          ? 'Chart готов к следующим шагам проверки и подготовки к развёртыванию.'
          : 'Результаты операций будут появляться во вкладках справа, без автоскролла по странице.'

  const previewContent = getPreviewContent(previewTab, config)

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 460px',
        gap: '1.5rem',
        alignItems: 'start',
        padding: '1.5rem',
        maxWidth: '1400px',
        margin: '0 auto',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
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
            border: '1px solid #dbeafe',
            boxShadow: '0 12px 30px rgba(15, 23, 42, 0.06)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', marginBottom: '1rem' }}>
            <div>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
                Рабочий пайплайн
              </div>
              <div style={{ marginTop: '0.25rem', fontSize: '0.84rem', color: '#64748b' }}>
                Последовательный сценарий: generate, lint, template, dry-run. При переходе в историю состояние формы не теряется.
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <span style={{ ...stepChipBase, background: generatedChartId ? '#dbeafe' : '#e2e8f0', color: generatedChartId ? '#1d4ed8' : '#64748b' }}>1. Generate</span>
              <span style={{ ...stepChipBase, background: validation?.valid ? '#dcfce7' : validation ? '#fee2e2' : '#e2e8f0', color: validation?.valid ? '#166534' : validation ? '#b91c1c' : '#64748b' }}>2. Lint</span>
              <span style={{ ...stepChipBase, background: templateResult?.success ? '#dbeafe' : templateResult ? '#fee2e2' : '#e2e8f0', color: templateResult?.success ? '#1d4ed8' : templateResult ? '#b91c1c' : '#64748b' }}>3. Template</span>
              <span style={{ ...stepChipBase, background: dryRunResult?.success ? '#ede9fe' : dryRunResult ? '#fee2e2' : '#e2e8f0', color: dryRunResult?.success ? '#6d28d9' : dryRunResult ? '#b91c1c' : '#64748b' }}>4. Dry-Run</span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: '0.75rem' }}>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={status === 'loading'}
              style={{ ...primaryButton, background: status === 'error' ? '#dc2626' : '#2563eb', color: 'white', cursor: status === 'loading' ? 'not-allowed' : 'pointer', opacity: status === 'loading' ? 0.75 : 1 }}
            >
              {status === 'loading' ? 'Генерация...' : 'Сгенерировать'}
            </button>
            <button
              type="button"
              onClick={() => void handleValidate()}
              disabled={!generatedChartId || isValidating || status === 'loading'}
              style={{ ...primaryButton, background: validation?.valid ? '#16a34a' : '#f59e0b', color: 'white', cursor: !generatedChartId || isValidating || status === 'loading' ? 'not-allowed' : 'pointer', opacity: !generatedChartId || isValidating || status === 'loading' ? 0.55 : 1 }}
            >
              {isValidating ? 'Проверка...' : 'Lint'}
            </button>
            <button
              type="button"
              onClick={() => void handleTemplate()}
              disabled={!generatedChartId || isTemplating || status === 'loading'}
              style={{ ...primaryButton, background: templateResult?.success ? '#0f766e' : '#0ea5e9', color: 'white', cursor: !generatedChartId || isTemplating || status === 'loading' ? 'not-allowed' : 'pointer', opacity: !generatedChartId || isTemplating || status === 'loading' ? 0.55 : 1 }}
            >
              {isTemplating ? 'Рендер...' : 'Template'}
            </button>
            <button
              type="button"
              onClick={() => void handleDryRunDeploy()}
              disabled={!generatedChartId || isDryRunning || status === 'loading'}
              style={{ ...primaryButton, background: dryRunResult?.success ? '#7c3aed' : '#8b5cf6', color: 'white', cursor: !generatedChartId || isDryRunning || status === 'loading' ? 'not-allowed' : 'pointer', opacity: !generatedChartId || isDryRunning || status === 'loading' ? 0.55 : 1 }}
            >
              {isDryRunning ? 'Dry-run...' : 'Dry-run'}
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={!generatedChartId}
              style={{ ...primaryButton, background: '#16a34a', color: 'white', cursor: !generatedChartId ? 'not-allowed' : 'pointer', opacity: !generatedChartId ? 0.55 : 1 }}
            >
              Скачать
            </button>
          </div>

          <div
            style={{
              marginTop: '0.95rem',
              padding: '0.85rem 1rem',
              borderRadius: '0.8rem',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              fontSize: '0.84rem',
              color: '#475569',
              lineHeight: 1.55,
            }}
          >
            {latestResultSummary}
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
                Выберите готовый демо-кейс, чтобы мгновенно заполнить форму и посмотреть результат справа.
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
              const selected =
                config.appName === scenario.config.appName &&
                config.workloadType === scenario.config.workloadType &&
                config.imageTag === scenario.config.imageTag

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
                    boxShadow: selected ? '0 10px 24px rgba(249, 115, 22, 0.12)' : 'none',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#7c2d12' }}>{scenario.title}</div>
                    <div style={{ marginTop: '0.35rem', fontSize: '0.8rem', lineHeight: 1.5, color: '#9a3412' }}>{scenario.summary}</div>
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
                </button>
              )
            })}
          </div>
        </div>

        <div style={card}>
          <p style={sectionTitle}>Основные параметры</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <Grid2>
              <Field label="Название приложения">
                <input style={input} placeholder="myapp" value={config.appName} onChange={e => set('appName', e.target.value)} />
              </Field>
              <Field label="Версия чарта">
                <input style={input} placeholder="0.1.0" value={config.version} onChange={e => set('version', e.target.value)} />
              </Field>
            </Grid2>
            <Grid2>
              <Field label="Docker образ">
                <input style={input} placeholder="nginx" value={config.image} onChange={e => set('image', e.target.value)} />
              </Field>
              <Field label="Тег образа">
                <input style={input} placeholder="latest" value={config.imageTag} onChange={e => set('imageTag', e.target.value)} />
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
                <input style={input} type="number" min={1} max={65535} value={config.containerPort} onChange={e => set('containerPort', Number(e.target.value))} />
              </Field>
            </Grid2>
          </div>
        </div>

        <div style={card}>
          <p style={sectionTitle}>Тип Workload</p>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            {WORKLOAD_TYPES.map(type => (
              <WorkloadCard key={type} type={type} selected={config.workloadType === type} onSelect={() => set('workloadType', type)} />
            ))}
          </div>
        </div>

        <div style={card}>
          <p style={sectionTitle}>Сетевые ресурсы</p>

          <div>
            <ToggleSwitch checked={config.service.enabled} onChange={v => setService('enabled', v)} label="Service" />
            {config.service.enabled && (
              <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem' }}>
                <Field label="Порт">
                  <input style={{ ...input, width: '120px' }} type="number" value={config.service.port} onChange={e => setService('port', Number(e.target.value))} />
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

          <div>
            <ToggleSwitch checked={config.ingress.enabled} onChange={v => setIngress('enabled', v)} label="Ingress" />
            {config.ingress.enabled && (
              <div style={{ marginTop: '1rem' }}>
                <Grid2>
                  <Field label="Хост">
                    <input style={input} placeholder="myapp.example.com" value={config.ingress.host} onChange={e => setIngress('host', e.target.value)} />
                  </Field>
                  <Field label="Путь">
                    <input style={input} placeholder="/" value={config.ingress.path} onChange={e => setIngress('path', e.target.value)} />
                  </Field>
                </Grid2>
              </div>
            )}
          </div>
        </div>

        <div style={card}>
          <ToggleSwitch checked={config.resources.enabled} onChange={v => setResources('enabled', v)} label="Resource Limits" />
          {config.resources.enabled && (
            <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <p style={{ margin: '0 0 0.75rem', fontSize: '0.8rem', fontWeight: 600, color: '#64748b' }}>REQUESTS</p>
                <Grid2>
                  <Field label="CPU">
                    <input style={input} placeholder="100m" value={config.resources.requests.cpu} onChange={e => setResourcesNested('requests', 'cpu', e.target.value)} />
                  </Field>
                  <Field label="Memory">
                    <input style={input} placeholder="128Mi" value={config.resources.requests.memory} onChange={e => setResourcesNested('requests', 'memory', e.target.value)} />
                  </Field>
                </Grid2>
              </div>
              <div>
                <p style={{ margin: '0 0 0.75rem', fontSize: '0.8rem', fontWeight: 600, color: '#64748b' }}>LIMITS</p>
                <Grid2>
                  <Field label="CPU">
                    <input style={input} placeholder="500m" value={config.resources.limits.cpu} onChange={e => setResourcesNested('limits', 'cpu', e.target.value)} />
                  </Field>
                  <Field label="Memory">
                    <input style={input} placeholder="512Mi" value={config.resources.limits.memory} onChange={e => setResourcesNested('limits', 'memory', e.target.value)} />
                  </Field>
                </Grid2>
              </div>
            </div>
          )}
        </div>

        <RecommendationsBlock config={config} />
      </div>

      <div style={{ position: 'sticky', top: '5.75rem' }}>
        <div
          style={{
            background: '#0f172a',
            borderRadius: '1rem',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            minHeight: '760px',
            boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
          }}
        >
          <div style={{ padding: '1rem 1.25rem 0', background: '#0f172a' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
              <div>
                <div style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  Рабочая панель
                </div>
                <div style={{ color: '#e2e8f0', fontSize: '0.88rem', marginTop: '0.2rem' }}>
                  Все результаты остаются здесь, без скролла по странице
                </div>
              </div>
              <button
                type="button"
                onClick={handleDownload}
                disabled={!generatedChartId}
                style={{
                  border: 'none',
                  borderRadius: '0.5rem',
                  padding: '0.45rem 0.75rem',
                  background: generatedChartId ? '#1d4ed8' : '#1e293b',
                  color: generatedChartId ? '#dbeafe' : '#64748b',
                  fontWeight: 700,
                  cursor: generatedChartId ? 'pointer' : 'not-allowed',
                }}
              >
                Скачать .tgz
              </button>
            </div>

            <div style={{ display: 'flex', gap: '0.25rem', overflowX: 'auto', marginBottom: '0.5rem' }}>
              {([
                ['preview', 'Preview'],
                ['lint', 'Lint'],
                ['template', 'Template'],
                ['dry-run', 'Dry-run'],
              ] as Array<[WorkspaceSection, string]>).map(([tab, label]) => {
                const active = workspaceSection === tab
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setWorkspaceSection(tab)}
                    style={{
                      padding: '0.55rem 0.9rem',
                      fontSize: '0.76rem',
                      fontWeight: 700,
                      border: 'none',
                      borderRadius: '0.5rem 0.5rem 0 0',
                      cursor: 'pointer',
                      background: active ? '#1e293b' : 'transparent',
                      color: active ? '#e2e8f0' : '#64748b',
                      borderBottom: active ? '2px solid #3b82f6' : '2px solid transparent',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{ flex: 1, background: '#1e293b', padding: '1rem', overflow: 'auto' }}>
            {workspaceSection === 'preview' && (
              <div>
                <div style={{ display: 'flex', gap: '0.35rem', overflowX: 'auto', marginBottom: '1rem' }}>
                  {PREVIEW_TABS.map(tab => {
                    const disabled = isPreviewTabDisabled(tab, config)
                    const active = previewTab === tab
                    return (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => !disabled && setPreviewTab(tab)}
                        disabled={disabled}
                        style={{
                          padding: '0.45rem 0.7rem',
                          fontSize: '0.74rem',
                          border: 'none',
                          borderRadius: '0.45rem',
                          background: active ? '#2563eb' : '#0f172a',
                          color: disabled ? '#475569' : '#e2e8f0',
                          cursor: disabled ? 'not-allowed' : 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {tab}
                      </button>
                    )
                  })}
                </div>
                <pre
                  style={{
                    margin: 0,
                    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
                    fontSize: '0.78rem',
                    lineHeight: 1.7,
                    color: '#e2e8f0',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {previewContent}
                </pre>
              </div>
            )}

            {workspaceSection === 'lint' && (
              <div>
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', marginBottom: '0.45rem' }}>
                    <div style={{ color: '#f8fafc', fontSize: '1rem', fontWeight: 800 }}>Результат проверки</div>
                    <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                      <span style={{ ...stepChipBase, background: '#334155', color: '#e2e8f0' }}>{validation?.engine === 'helm_lint' ? 'helm lint' : 'builtin'}</span>
                      <span style={{ ...stepChipBase, background: validation?.valid ? '#14532d' : validation ? '#7f1d1d' : '#334155', color: '#f8fafc' }}>{validation ? (validation.valid ? 'VALID' : 'INVALID') : 'WAITING'}</span>
                    </div>
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: '0.84rem' }}>
                    {validation?.summary || 'После проверки здесь появится итог helm lint и встроенной валидации.'}
                  </div>
                </div>

                {!validation ? (
                  <div style={{ color: '#94a3b8', fontSize: '0.84rem' }}>Пока нет результата lint. Нажми `Проверить chart` слева.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {validation.errors.length > 0 && (
                      <div>
                        <div style={{ color: '#fca5a5', fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.45rem' }}>Ошибки</div>
                        <ul style={{ margin: 0, paddingLeft: '1.1rem', color: '#fecaca' }}>
                          {validation.errors.map(item => <li key={item} style={{ marginBottom: '0.35rem' }}>{item}</li>)}
                        </ul>
                      </div>
                    )}

                    {validation.warnings.length > 0 && (
                      <div>
                        <div style={{ color: '#fcd34d', fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.45rem' }}>Предупреждения</div>
                        <ul style={{ margin: 0, paddingLeft: '1.1rem', color: '#fde68a' }}>
                          {validation.warnings.map(item => <li key={item} style={{ marginBottom: '0.35rem' }}>{item}</li>)}
                        </ul>
                      </div>
                    )}

                    <div>
                      <div style={{ color: '#86efac', fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.45rem' }}>Успешные проверки</div>
                      <ul style={{ margin: 0, paddingLeft: '1.1rem', color: '#bbf7d0' }}>
                        {validation.checks.map(item => <li key={item} style={{ marginBottom: '0.35rem' }}>{item}</li>)}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            )}

            {workspaceSection === 'template' && (
              <div>
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', marginBottom: '0.45rem' }}>
                    <div style={{ color: '#f8fafc', fontSize: '1rem', fontWeight: 800 }}>Helm Template</div>
                    <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                      <span style={{ ...stepChipBase, background: '#1e3a5f', color: '#dbeafe' }}>helm template</span>
                      <span style={{ ...stepChipBase, background: templateResult?.success ? '#14532d' : templateResult ? '#7f1d1d' : '#334155', color: '#f8fafc' }}>{templateResult ? (templateResult.success ? 'RENDERED' : 'FAILED') : 'WAITING'}</span>
                    </div>
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: '0.84rem' }}>
                    {templateResult?.summary || 'После рендера здесь появятся итоговые Kubernetes-манифесты.'}
                  </div>
                </div>

                {!templateResult ? (
                  <div style={{ color: '#94a3b8', fontSize: '0.84rem' }}>Пока нет результата template. Нажми `Template` слева.</div>
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

            {workspaceSection === 'dry-run' && (
              <div>
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', marginBottom: '0.45rem' }}>
                    <div style={{ color: '#f8fafc', fontSize: '1rem', fontWeight: 800 }}>Dry-Run Deploy</div>
                    <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                      <span style={{ ...stepChipBase, background: '#4c1d95', color: '#ede9fe' }}>helm dry-run</span>
                      <span style={{ ...stepChipBase, background: dryRunResult?.success ? '#14532d' : dryRunResult ? '#7f1d1d' : '#334155', color: '#f8fafc' }}>{dryRunResult ? (dryRunResult.success ? 'READY' : 'FAILED') : 'WAITING'}</span>
                    </div>
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: '0.84rem' }}>
                    {dryRunResult?.summary || 'Dry-run deploy покажет, готов ли chart к шагу развёртывания.'}
                  </div>
                </div>

                {!dryRunResult ? (
                  <div style={{ color: '#94a3b8', fontSize: '0.84rem' }}>Пока нет результата dry-run. Нажми `Dry-run` слева.</div>
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
