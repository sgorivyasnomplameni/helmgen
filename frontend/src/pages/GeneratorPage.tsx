import { useDeferredValue, useRef, useState } from 'react'
import type { ChartConfig, WorkloadType, ServiceType, YamlTab } from '@/types/generator'
import WorkloadCard from '@/components/WorkloadCard'
import ToggleSwitch from '@/components/ToggleSwitch'
import RecommendationsBlock from '@/components/RecommendationsBlock'
import {
  chartsApi,
  type ChartValidationResult,
  extractApiErrorMessage,
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
  security: {
    hostNetwork: false,
    podSecurityContext: {
      runAsNonRoot: true,
      runAsUser: null,
    },
    containerSecurityContext: {
      privileged: false,
      allowPrivilegeEscalation: false,
      readOnlyRootFilesystem: true,
      capabilitiesDropAll: true,
    },
  },
}

const WORKLOAD_TYPES: WorkloadType[] = ['Deployment', 'StatefulSet', 'DaemonSet']
const SERVICE_TYPES: ServiceType[] = ['ClusterIP', 'NodePort', 'LoadBalancer']
const PREVIEW_TABS: YamlTab[] = ['deployment.yaml', 'service.yaml', 'ingress.yaml', 'Chart.yaml']

type WorkspaceSection = 'preview' | 'lint'

interface DemoScenario {
  id: string
  title: string
  summary: string
  goal: string
  expected: string
  highlights: string[]
  config: ChartConfig
}

const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: 'landing',
    title: 'Публичный веб-сервис',
    summary: 'Deployable-сценарий внешнего HTTP-сервиса с Ingress и двумя репликами.',
    goal: 'Показывает базовый production-подобный веб-сервис с реальным публичным образом.',
    expected: 'После генерации проверьте, что chart проходит lint почти без предупреждений, создаёт Service + Ingress и может быть развёрнут в minikube.',
    highlights: ['Deployment', '2 реплики', 'Ingress', 'Secure'],
    config: {
      appName: 'landing-page',
      version: '0.3.0',
      image: 'nginx',
      imageTag: '1.27.0',
      replicas: 2,
      containerPort: 80,
      workloadType: 'Deployment',
      service: { enabled: true, port: 80, type: 'ClusterIP' },
      ingress: { enabled: true, host: 'landing.demo.local', path: '/' },
      resources: {
        enabled: true,
        requests: { cpu: '100m', memory: '128Mi' },
        limits: { cpu: '300m', memory: '256Mi' },
      },
      security: {
        hostNetwork: false,
        podSecurityContext: { runAsNonRoot: true, runAsUser: null },
        containerSecurityContext: {
          privileged: false,
          allowPrivilegeEscalation: false,
          readOnlyRootFilesystem: true,
          capabilitiesDropAll: true,
        },
      },
    },
  },
  {
    id: 'api',
    title: 'Масштабируемый API',
    summary: 'Deployable-сервис с несколькими репликами, NodePort и зафиксированными ресурсами.',
    goal: 'Показывает API-подобный сценарий на публичном образе, который реально можно развернуть.',
    expected: 'После проверки рекомендации должны быть минимальными, а deploy не должен упираться ни в безопасность, ни в недоступный image.',
    highlights: ['Deployment', '4 реплики', 'NodePort', 'Secure'],
    config: {
      appName: 'orders-api',
      version: '1.4.2',
      image: 'traefik/whoami',
      imageTag: 'v1.10.3',
      replicas: 4,
      containerPort: 80,
      workloadType: 'Deployment',
      service: { enabled: true, port: 80, type: 'NodePort' },
      ingress: { enabled: false, host: 'orders.demo.local', path: '/' },
      resources: {
        enabled: true,
        requests: { cpu: '250m', memory: '256Mi' },
        limits: { cpu: '1000m', memory: '768Mi' },
      },
      security: {
        hostNetwork: false,
        podSecurityContext: { runAsNonRoot: true, runAsUser: null },
        containerSecurityContext: {
          privileged: false,
          allowPrivilegeEscalation: false,
          readOnlyRootFilesystem: true,
          capabilitiesDropAll: true,
        },
      },
    },
  },
  {
    id: 'postgres',
    title: 'Stateful БД для dev/test',
    summary: 'Deployable StatefulSet с Redis и внутренним ClusterIP-сервисом.',
    goal: 'Показывает, чем stateful-нагрузка отличается от обычного Deployment, не упираясь в обязательные env для БД.',
    expected: 'Chart должен проходить базовые security-проверки, а deploy должен проходить на публичном образе.',
    highlights: ['StatefulSet', '1 реплика', 'ClusterIP', 'Secure'],
    config: {
      appName: 'redis-cache',
      version: '7.4.0',
      image: 'redis',
      imageTag: '7.4.8',
      replicas: 1,
      containerPort: 6379,
      workloadType: 'StatefulSet',
      service: { enabled: true, port: 6379, type: 'ClusterIP' },
      ingress: { enabled: false, host: 'redis.demo.local', path: '/' },
      resources: {
        enabled: true,
        requests: { cpu: '300m', memory: '512Mi' },
        limits: { cpu: '1200m', memory: '1Gi' },
      },
      security: {
        hostNetwork: false,
        podSecurityContext: { runAsNonRoot: true, runAsUser: null },
        containerSecurityContext: {
          privileged: false,
          allowPrivilegeEscalation: false,
          readOnlyRootFilesystem: true,
          capabilitiesDropAll: true,
        },
      },
    },
  },
  {
    id: 'agent',
    title: 'Node-агент мониторинга',
    summary: 'Deployable DaemonSet для exporter, который запускается на каждой ноде.',
    goal: 'Показывает сценарий, где replicas не управляют числом pod, а Service часто не нужен.',
    expected: 'После генерации проверьте, что chart не зависит от replicas, не создаёт лишний Service и проходит security-проверки без замечаний.',
    highlights: ['DaemonSet', 'Без Service', 'На каждой ноде', 'Secure'],
    config: {
      appName: 'node-exporter',
      version: '0.8.0',
      image: 'prom/node-exporter',
      imageTag: 'v1.8.1',
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
      security: {
        hostNetwork: false,
        podSecurityContext: { runAsNonRoot: true, runAsUser: 65534 },
        containerSecurityContext: {
          privileged: false,
          allowPrivilegeEscalation: false,
          readOnlyRootFilesystem: true,
          capabilitiesDropAll: true,
        },
      },
    },
  },
  {
    id: 'risky',
    title: 'Рискованная конфигурация',
    summary: 'Антипример на реальном образе: deployable, но с плохими архитектурными решениями.',
    goal: 'Показывает, как система реагирует на слабые решения, не упираясь в несуществующий image.',
    expected: 'Ожидайте несколько замечаний: latest, одна реплика, Ingress без Service, отсутствие limits и небезопасные security-параметры.',
    highlights: ['latest', '1 реплика', 'Insecure', 'Warnings'],
    config: {
      appName: 'legacy-admin',
      version: '0.1.0',
      image: 'nginx',
      imageTag: 'latest',
      replicas: 1,
      containerPort: 80,
      workloadType: 'Deployment',
      service: { enabled: false, port: 80, type: 'ClusterIP' },
      ingress: { enabled: true, host: 'legacy.demo.local', path: '/' },
      resources: {
        enabled: false,
        requests: { cpu: '100m', memory: '128Mi' },
        limits: { cpu: '500m', memory: '512Mi' },
      },
      security: {
        hostNetwork: true,
        podSecurityContext: { runAsNonRoot: false, runAsUser: null },
        containerSecurityContext: {
          privileged: true,
          allowPrivilegeEscalation: true,
          readOnlyRootFilesystem: false,
          capabilitiesDropAll: false,
        },
      },
    },
  },
]

const card: React.CSSProperties = {
  background: 'var(--panel)',
  borderRadius: '0.875rem',
  padding: '1.5rem',
  boxShadow: 'var(--shadow)',
  border: '1px solid var(--border)',
}

const fieldLabel: React.CSSProperties = {
  display: 'block',
  fontSize: '0.78rem',
  fontWeight: 600,
  color: 'var(--text-muted)',
  marginBottom: '0.375rem',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

const input: React.CSSProperties = {
  width: '100%',
  padding: '0.55rem 0.75rem',
  borderRadius: '0.5rem',
  fontSize: '0.875rem',
  outline: 'none',
  color: 'var(--text)',
  background: 'var(--panel-strong)',
  border: '1px solid var(--border)',
  boxSizing: 'border-box',
}

const sectionTitle: React.CSSProperties = {
  fontSize: '1rem',
  fontWeight: 700,
  color: 'var(--text)',
  marginBottom: '1.25rem',
}

const divider: React.CSSProperties = {
  border: 'none',
  borderTop: '1px solid var(--border)',
  margin: '1.25rem 0',
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

interface PrimaryActionConfig {
  key: string
  label: string
  onClick: () => void
  disabled: boolean
  loading: boolean
}

interface ActionButtonConfig {
  key: string
  label: string
  onClick: () => void
  disabled: boolean
  tone: 'neutral' | 'success' | 'accent'
}

type FormErrors = Partial<Record<
  'appName' | 'version' | 'image' | 'imageTag' | 'containerPort' | 'servicePort' | 'ingressHost' | 'ingressPath',
  string
>>

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

interface GeneratorPageProps {
  onChartReady?: (chartId: number) => void
  onOpenOps?: () => void
}

export default function GeneratorPage({ onChartReady, onOpenOps }: GeneratorPageProps) {
  const formCardRef = useRef<HTMLDivElement | null>(null)
  const [config, setConfig] = useState<ChartConfig>(DEFAULT_CONFIG)
  const [formErrors, setFormErrors] = useState<FormErrors>({})
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [generatedChartId, setGeneratedChartId] = useState<number | null>(null)
  const [isDraftDirty, setIsDraftDirty] = useState(false)
  const [validation, setValidation] = useState<ChartValidationResult | null>(null)
  const [isValidating, setIsValidating] = useState(false)
  const [actionNote, setActionNote] = useState<{ tone: 'neutral' | 'success' | 'error'; text: string } | null>(null)
  const [workspaceSection, setWorkspaceSection] = useState<WorkspaceSection>('preview')
  const [previewTab, setPreviewTab] = useState<YamlTab>('deployment.yaml')
  const [showScenarios, setShowScenarios] = useState(false)
  const deferredConfig = useDeferredValue(config)

  function resetGenerationState() {
    setStatus('idle')
    setActionNote(null)
    if (generatedChartId) {
      setIsDraftDirty(true)
    }
    setValidation(null)
    setWorkspaceSection('preview')
  }

  function set<K extends keyof ChartConfig>(key: K, value: ChartConfig[K]) {
    resetGenerationState()
    setFormErrors(prev => {
      const next = { ...prev }
      if (key === 'appName') delete next.appName
      if (key === 'version') delete next.version
      if (key === 'image') delete next.image
      if (key === 'imageTag') delete next.imageTag
      if (key === 'containerPort') delete next.containerPort
      return next
    })
    setConfig(prev => ({ ...prev, [key]: value }))
  }

  function setService<K extends keyof ChartConfig['service']>(k: K, v: ChartConfig['service'][K]) {
    resetGenerationState()
    if (k === 'port') {
      setFormErrors(prev => {
        const next = { ...prev }
        delete next.servicePort
        return next
      })
    }
    setConfig(prev => ({ ...prev, service: { ...prev.service, [k]: v } }))
  }

  function setIngress<K extends keyof ChartConfig['ingress']>(k: K, v: ChartConfig['ingress'][K]) {
    resetGenerationState()
    setFormErrors(prev => {
      const next = { ...prev }
      if (k === 'host') delete next.ingressHost
      if (k === 'path') delete next.ingressPath
      return next
    })
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
    setFormErrors({})
    setConfig(scenario.config)
  }

  function validateConfig(): FormErrors {
    const errors: FormErrors = {}

    if (!config.appName.trim()) {
      errors.appName = 'Укажите название приложения.'
    } else if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(config.appName.trim())) {
      errors.appName = 'Используйте только lowercase, цифры и дефисы.'
    }

    if (!config.version.trim()) {
      errors.version = 'Укажите версию чарта.'
    }

    if (!config.image.trim()) {
      errors.image = 'Укажите Docker-образ.'
    }

    if (!config.imageTag.trim()) {
      errors.imageTag = 'Укажите тег образа.'
    }

    if (!Number.isInteger(config.containerPort) || config.containerPort < 1 || config.containerPort > 65535) {
      errors.containerPort = 'Порт контейнера должен быть в диапазоне 1-65535.'
    }

    if (config.service.enabled && (!Number.isInteger(config.service.port) || config.service.port < 1 || config.service.port > 65535)) {
      errors.servicePort = 'Порт Service должен быть в диапазоне 1-65535.'
    }

    if (config.ingress.enabled) {
      if (!config.ingress.host.trim()) {
        errors.ingressHost = 'Укажите host для Ingress.'
      } else if (!/^[a-z0-9.-]+$/.test(config.ingress.host.trim())) {
        errors.ingressHost = 'Host должен содержать только lowercase, точки и дефисы.'
      }

      if (!config.ingress.path.trim()) {
        errors.ingressPath = 'Укажите path для Ingress.'
      } else if (!config.ingress.path.startsWith('/')) {
        errors.ingressPath = 'Path должен начинаться с /.'
      }
    }

    return errors
  }

  function handleDownload() {
    if (!generatedChartId) return
    void chartsApi.download(generatedChartId, `${config.appName}-${config.version}.tgz`)
  }

  async function handleGenerate() {
    const errors = validateConfig()
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      return
    }

    setFormErrors({})
    setStatus('loading')
    setActionNote({ tone: 'neutral', text: 'Собираем Helm-чарт и сохраняем его в истории...' })
    setValidation(null)
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
      setIsDraftDirty(false)
      onChartReady?.(generatedChart.id)
      setStatus('success')
      setActionNote({ tone: 'success', text: `Чарт ${generatedChart.name} успешно собран. Теперь его можно проверить или скачать.` })
    } catch (error) {
      setStatus('error')
      setActionNote({
        tone: 'error',
        text: extractApiErrorMessage(error, 'Не удалось собрать chart. Проверьте состояние backend и попробуйте снова.'),
      })
      window.setTimeout(() => setStatus('idle'), 3000)
    }
  }

  async function handleValidate() {
    if (!generatedChartId) return
    setIsValidating(true)
    setWorkspaceSection('lint')
    setActionNote({ tone: 'neutral', text: 'Запускаем helm lint для текущего chart...' })
    try {
      const result = await chartsApi.validate(generatedChartId)
      setValidation(result)
      setActionNote({
        tone: result.valid ? 'success' : 'error',
        text: result.summary,
      })
    } catch (error) {
      setValidation({
        valid: false,
        errors: ['Не удалось выполнить проверку чарта'],
        warnings: [],
        checks: [],
        engine: 'builtin',
        summary: 'Проверка завершилась с ошибкой запроса',
      })
      setActionNote({
        tone: 'error',
        text: extractApiErrorMessage(error, 'Не удалось выполнить проверку чарта.'),
      })
    } finally {
      setIsValidating(false)
    }
  }

  const latestResultSummary = validation
    ? validation.summary
    : isDraftDirty
      ? 'Конфигурация изменилась. Пересоберите chart, чтобы проверки и архив снова стали актуальными.'
      : generatedChartId
        ? 'Чарт готов к проверке, скачиванию или переходу в экран deploy.'
        : 'Заполните форму и запустите сборку.'

  const previewContent = getPreviewContent(previewTab, deferredConfig)
  const configLooksReady = Boolean(
    config.appName.trim()
      && config.version.trim()
      && config.image.trim()
      && config.imageTag.trim()
      && Object.keys(validateConfig()).length === 0,
  )
  const reviewReady = Boolean(validation?.valid)
  const canUseBuiltArtifact = Boolean(generatedChartId && !isDraftDirty)

  let primaryAction: PrimaryActionConfig = {
    key: 'generate',
    label: 'Сгенерировать',
    onClick: handleGenerate,
    disabled: status === 'loading',
    loading: status === 'loading',
  }

  if (generatedChartId && isDraftDirty) {
    primaryAction = {
      key: 'generate',
      label: 'Пересобрать',
      onClick: handleGenerate,
      disabled: status === 'loading',
      loading: status === 'loading',
    }
  }

  const secondaryActions: ActionButtonConfig[] = [
    ...(!validation?.valid && canUseBuiltArtifact
      ? [{
          key: 'validate',
          label: isValidating ? 'Проверка...' : 'Проверить',
          onClick: () => void handleValidate(),
          disabled: !canUseBuiltArtifact || isValidating || status === 'loading',
          tone: 'neutral' as const,
        }]
      : []),
    ...(canUseBuiltArtifact && onOpenOps
      ? [{
          key: 'ops',
          label: 'Проверка и deploy',
          onClick: onOpenOps,
          disabled: !canUseBuiltArtifact,
          tone: 'neutral' as const,
        }]
      : []),
    ...(canUseBuiltArtifact
      ? [{
          key: 'download',
          label: 'Скачать',
          onClick: handleDownload,
          disabled: !canUseBuiltArtifact,
          tone: 'success' as const,
        }]
      : []),
  ]

  if (canUseBuiltArtifact && !validation?.valid) {
    primaryAction = {
      key: 'validate',
      label: 'Проверить',
      onClick: () => void handleValidate(),
      disabled: !canUseBuiltArtifact || isValidating || status === 'loading',
      loading: isValidating,
    }
  }

  if (canUseBuiltArtifact && validation?.valid) {
    primaryAction = {
      key: 'download',
      label: 'Скачать',
      onClick: handleDownload,
      disabled: !canUseBuiltArtifact,
      loading: false,
    }
  }

  const visibleSecondaryActions = secondaryActions.filter(action => action.key !== primaryAction.key)
  const toolbarActions = [
    {
      key: primaryAction.key,
      label: primaryAction.loading ? `${primaryAction.label}...` : primaryAction.label,
      onClick: primaryAction.onClick,
      disabled: primaryAction.disabled,
      tone: primaryAction.key === 'download' ? ('success' as const) : ('accent' as const),
      primary: true,
    },
    ...visibleSecondaryActions.map(action => ({
      ...action,
      primary: false,
    })),
  ].sort((a, b) => {
    const order: Record<string, number> = {
      generate: 0,
      validate: 1,
      download: 2,
      ops: 3,
    }

    return order[a.key] - order[b.key]
  })

  const progressItems = [
    {
      key: 'config',
      label: 'Форма',
      state: configLooksReady ? 'Готово' : 'Заполнить',
      done: configLooksReady,
      active: !configLooksReady,
      disabled: false,
      onClick: () => formCardRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }),
    },
    {
      key: 'chart',
      label: 'Чарт',
      state: isDraftDirty ? 'Обновить' : generatedChartId ? 'Создан' : 'Собрать',
      done: Boolean(generatedChartId && !isDraftDirty),
      active: Boolean((configLooksReady && !generatedChartId) || isDraftDirty),
      disabled: false,
      onClick: () => setWorkspaceSection('preview'),
    },
    {
      key: 'lint',
      label: 'Проверка',
      state: validation?.valid ? 'Пройдена' : 'Ожидает',
      done: Boolean(validation?.valid),
      active: Boolean(canUseBuiltArtifact && !validation?.valid),
      disabled: !canUseBuiltArtifact,
      onClick: () => setWorkspaceSection('lint'),
    },
  ]

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '280px minmax(0, 1fr) 460px',
        gap: '1.5rem',
        alignItems: 'start',
        padding: '1.5rem',
        maxWidth: '1680px',
        margin: '0 auto',
      }}
    >
      <div style={{ position: 'sticky', top: '5.75rem' }}>
        <RecommendationsBlock config={deferredConfig} variant="sidebar" />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: 'var(--text)' }}>
            Генератор Helm-чартов
          </h1>
        </div>

        <div
          style={{
            ...card,
            padding: '0.95rem 1.1rem',
            border: '1px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.96rem', fontWeight: 800, color: 'var(--text)' }}>
                Тестовые сценарии
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => {
                  resetGenerationState()
                  setConfig(DEFAULT_CONFIG)
                }}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: '999px',
                  background: 'var(--panel-strong)',
                  color: 'var(--text-soft)',
                  fontWeight: 700,
                  fontSize: '0.78rem',
                  padding: '0.5rem 0.85rem',
                  cursor: 'pointer',
                }}
              >
                Сбросить
              </button>
              <button
                type="button"
                onClick={() => setShowScenarios(prev => !prev)}
                style={{
                  border: 'none',
                  borderRadius: '999px',
                  background: 'var(--accent-soft)',
                  color: 'var(--accent-contrast)',
                  fontWeight: 700,
                  fontSize: '0.78rem',
                  padding: '0.5rem 0.9rem',
                  cursor: 'pointer',
                }}
              >
                {showScenarios ? 'Скрыть' : 'Показать'}
              </button>
            </div>
          </div>

          {showScenarios && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', marginTop: '0.85rem' }}>
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
                      border: `1.5px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                      background: selected ? 'var(--accent-soft)' : 'var(--panel-strong)',
                      borderRadius: '0.8rem',
                      padding: '0.9rem',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.65rem',
                      boxShadow: selected ? 'var(--shadow)' : 'none',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text)' }}>{scenario.title}</div>
                      <div style={{ marginTop: '0.25rem', fontSize: '0.77rem', lineHeight: 1.45, color: 'var(--text-muted)' }}>{scenario.summary}</div>
                    </div>

                    <div style={{ display: 'grid', gap: '0.45rem' }}>
                      <div>
                        <div style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          Что показывает
                        </div>
                        <div style={{ marginTop: '0.15rem', fontSize: '0.75rem', lineHeight: 1.45, color: 'var(--text-soft)' }}>
                          {scenario.goal}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          Что проверить
                        </div>
                        <div style={{ marginTop: '0.15rem', fontSize: '0.75rem', lineHeight: 1.45, color: 'var(--text-soft)' }}>
                          {scenario.expected}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                      {scenario.highlights.map(item => (
                        <span
                          key={item}
                          style={{
                            padding: '0.28rem 0.5rem',
                            borderRadius: '999px',
                            background: 'var(--panel-contrast)',
                            color: 'var(--text-soft)',
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
          )}
        </div>

        <div
          style={{
            ...card,
            padding: '0.9rem 1rem',
            background: 'linear-gradient(180deg, var(--panel) 0%, var(--panel-muted) 100%)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', marginBottom: '0.9rem' }}>
            <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text)' }}>Этапы</div>
            <span style={{ ...stepChipBase, background: 'var(--panel-strong)', color: 'var(--text-soft)', border: '1px solid var(--border)' }}>
              {isDraftDirty
                ? 'Есть изменения'
                : reviewReady
                  ? 'Готов к скачиванию'
                  : generatedChartId
                    ? 'Чарт создан'
                    : 'Черновик'}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.6rem', width: '100%' }}>
              {progressItems.map(item => (
                <button
                  key={item.key}
                  type="button"
                  onClick={item.onClick}
                  disabled={item.disabled}
                  style={{
                    padding: '0.75rem 0.85rem',
                    borderRadius: '0.85rem',
                    border: `1px solid ${item.done ? 'var(--success)' : item.active ? 'var(--accent)' : 'var(--border)'}`,
                    background: item.active ? 'var(--panel-strong)' : 'var(--panel)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.65rem',
                    cursor: item.disabled ? 'not-allowed' : 'pointer',
                    opacity: item.disabled ? 0.55 : 1,
                    textAlign: 'left',
                  }}
                >
                  <span
                    style={{
                      width: '1.8rem',
                      height: '1.8rem',
                      borderRadius: '999px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: item.done ? 'var(--success-soft)' : item.active ? 'var(--accent-soft)' : 'var(--panel-strong)',
                      color: item.done ? 'var(--success)' : item.active ? 'var(--accent-contrast)' : 'var(--text-muted)',
                      border: `1px solid ${item.done ? 'color-mix(in srgb, var(--success) 45%, transparent)' : item.active ? 'color-mix(in srgb, var(--accent) 35%, transparent)' : 'var(--border)'}`,
                      fontSize: '0.76rem',
                      fontWeight: 800,
                      flexShrink: 0,
                    }}
                  >
                    {item.done ? '✓' : item.key === 'config' ? '1' : item.key === 'chart' ? '2' : '3'}
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: '0.18rem', minWidth: 0 }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text)' }}>{item.label}</span>
                    <span style={{ fontSize: '0.72rem', color: item.done ? 'var(--success)' : item.active ? 'var(--accent-contrast)' : 'var(--text-muted)' }}>
                      {item.state}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div
          style={{
            ...card,
            padding: '0.95rem 1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            background: 'linear-gradient(180deg, var(--panel) 0%, var(--panel-muted) 100%)',
          }}
        >
          <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text)' }}>Действия</div>
          <div style={{ display: 'grid', gap: '0.85rem' }}>
            <div>
              <div style={{ marginBottom: '0.55rem', fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Основное
              </div>
              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
                {toolbarActions.filter(action => action.primary).map(action => (
                  <button
                    key={action.key}
                    type="button"
                    onClick={action.onClick}
                    disabled={action.disabled}
                    style={{
                      borderRadius: '0.8rem',
                      padding: '0.9rem 1.15rem',
                      fontSize: '0.98rem',
                      fontWeight: 800,
                      cursor: action.disabled ? 'not-allowed' : 'pointer',
                      opacity: action.disabled ? 0.5 : 1,
                      minWidth: '220px',
                      background: action.tone === 'success' ? 'var(--success-soft)' : 'var(--accent)',
                      color: action.tone === 'success' ? 'var(--success)' : 'white',
                      border: action.tone === 'success'
                        ? '1px solid color-mix(in srgb, var(--success) 35%, transparent)'
                        : '1px solid color-mix(in srgb, var(--accent) 35%, transparent)',
                    }}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>

            {toolbarActions.filter(action => !action.primary).length > 0 && (
              <div>
                <div style={{ marginBottom: '0.55rem', fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Дальше
                </div>
                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  {toolbarActions.filter(action => !action.primary).map(action => (
                    <button
                      key={action.key}
                      type="button"
                      onClick={action.onClick}
                      disabled={action.disabled}
                      style={{
                        borderRadius: '0.75rem',
                        padding: '0.78rem 0.95rem',
                        fontSize: '0.9rem',
                        fontWeight: 700,
                        cursor: action.disabled ? 'not-allowed' : 'pointer',
                        opacity: action.disabled ? 0.5 : 1,
                        background: action.tone === 'success' ? 'var(--success-soft)' : 'var(--panel-strong)',
                        color: action.tone === 'success' ? 'var(--success)' : 'var(--text-soft)',
                        border: action.tone === 'success'
                          ? '1px solid color-mix(in srgb, var(--success) 35%, transparent)'
                          : '1px solid var(--border)',
                      }}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
            {generatedChartId && (
              <>
                <span
                  style={{
                    ...stepChipBase,
                    padding: '0.35rem 0.6rem',
                    background: 'var(--panel-strong)',
                    color: 'var(--text-soft)',
                    border: '1px solid var(--border)',
                  }}
                >
                  Deploy
                </span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Рендер и dry-run доступны на отдельной странице.
                </span>
              </>
            )}
            {isDraftDirty && (
              <span style={{ fontSize: '0.8rem', color: 'var(--warning)' }}>
                После правок нужен новый запуск сборки.
              </span>
            )}
          </div>

          <div
            style={{
              fontSize: '0.82rem',
              color: Object.keys(formErrors).length > 0 ? 'var(--danger)' : 'var(--text-muted)',
              lineHeight: 1.5,
            }}
          >
            {Object.keys(formErrors).length > 0
              ? 'Исправьте ошибки в форме, чтобы перейти к генерации Helm-чарта.'
              : latestResultSummary}
          </div>

          {actionNote && (
            <div
              style={{
                padding: '0.8rem 0.95rem',
                borderRadius: '0.8rem',
                background:
                  actionNote.tone === 'success'
                    ? 'var(--success-soft)'
                    : actionNote.tone === 'error'
                      ? 'var(--danger-soft)'
                      : 'var(--panel-strong)',
                color:
                  actionNote.tone === 'success'
                    ? 'var(--success)'
                    : actionNote.tone === 'error'
                      ? 'var(--danger)'
                      : 'var(--text-soft)',
                border:
                  actionNote.tone === 'success'
                    ? '1px solid color-mix(in srgb, var(--success) 30%, transparent)'
                    : actionNote.tone === 'error'
                      ? '1px solid color-mix(in srgb, var(--danger) 30%, transparent)'
                      : '1px solid var(--border)',
                fontSize: '0.84rem',
                lineHeight: 1.5,
                fontWeight: 600,
              }}
            >
              {actionNote.text}
            </div>
          )}
        </div>

        <div ref={formCardRef} style={card}>
          <p style={sectionTitle}>Основные параметры</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <Grid2>
              <Field label="Название приложения">
                <div>
                  <input
                    style={{
                      ...input,
                      border: formErrors.appName ? '1px solid var(--danger)' : input.border,
                    }}
                    placeholder="myapp"
                    value={config.appName}
                    onChange={e => set('appName', e.target.value)}
                  />
                  {formErrors.appName && (
                    <div style={{ marginTop: '0.45rem', fontSize: '0.78rem', color: 'var(--danger)' }}>
                      {formErrors.appName}
                    </div>
                  )}
                </div>
              </Field>
              <Field label="Версия чарта">
                <div>
                  <input
                    style={{ ...input, border: formErrors.version ? '1px solid var(--danger)' : input.border }}
                    placeholder="0.1.0"
                    value={config.version}
                    onChange={e => set('version', e.target.value)}
                  />
                  {formErrors.version && (
                    <div style={{ marginTop: '0.45rem', fontSize: '0.78rem', color: 'var(--danger)' }}>
                      {formErrors.version}
                    </div>
                  )}
                </div>
              </Field>
            </Grid2>
            <Grid2>
              <Field label="Docker образ">
                <div>
                  <input
                    style={{ ...input, border: formErrors.image ? '1px solid var(--danger)' : input.border }}
                    placeholder="nginx"
                    value={config.image}
                    onChange={e => set('image', e.target.value)}
                  />
                  {formErrors.image && (
                    <div style={{ marginTop: '0.45rem', fontSize: '0.78rem', color: 'var(--danger)' }}>
                      {formErrors.image}
                    </div>
                  )}
                </div>
              </Field>
              <Field label="Тег образа">
                <div>
                  <input
                    style={{ ...input, border: formErrors.imageTag ? '1px solid var(--danger)' : input.border }}
                    placeholder="latest"
                    value={config.imageTag}
                    onChange={e => set('imageTag', e.target.value)}
                  />
                  {formErrors.imageTag && (
                    <div style={{ marginTop: '0.45rem', fontSize: '0.78rem', color: 'var(--danger)' }}>
                      {formErrors.imageTag}
                    </div>
                  )}
                </div>
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
                <div>
                  <input
                    style={{ ...input, border: formErrors.containerPort ? '1px solid var(--danger)' : input.border }}
                    type="number"
                    min={1}
                    max={65535}
                    value={config.containerPort}
                    onChange={e => set('containerPort', Number(e.target.value))}
                  />
                  {formErrors.containerPort && (
                    <div style={{ marginTop: '0.45rem', fontSize: '0.78rem', color: 'var(--danger)' }}>
                      {formErrors.containerPort}
                    </div>
                  )}
                </div>
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
                  <div>
                    <input
                      style={{ ...input, width: '120px', border: formErrors.servicePort ? '1px solid var(--danger)' : input.border }}
                      type="number"
                      value={config.service.port}
                      onChange={e => setService('port', Number(e.target.value))}
                    />
                    {formErrors.servicePort && (
                      <div style={{ marginTop: '0.45rem', fontSize: '0.78rem', color: 'var(--danger)', maxWidth: '180px' }}>
                        {formErrors.servicePort}
                      </div>
                    )}
                  </div>
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
                          border: `2px solid ${config.service.type === t ? 'var(--accent)' : 'var(--border)'}`,
                          borderRadius: '0.5rem',
                          background: config.service.type === t ? 'var(--accent-soft)' : 'var(--panel-strong)',
                          color: config.service.type === t ? 'var(--accent-contrast)' : 'var(--text-muted)',
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
                    <div>
                      <input
                        style={{ ...input, border: formErrors.ingressHost ? '1px solid var(--danger)' : input.border }}
                        placeholder="myapp.example.com"
                        value={config.ingress.host}
                        onChange={e => setIngress('host', e.target.value)}
                      />
                      {formErrors.ingressHost && (
                        <div style={{ marginTop: '0.45rem', fontSize: '0.78rem', color: 'var(--danger)' }}>
                          {formErrors.ingressHost}
                        </div>
                      )}
                    </div>
                  </Field>
                  <Field label="Путь">
                    <div>
                      <input
                        style={{ ...input, border: formErrors.ingressPath ? '1px solid var(--danger)' : input.border }}
                        placeholder="/"
                        value={config.ingress.path}
                        onChange={e => setIngress('path', e.target.value)}
                      />
                      {formErrors.ingressPath && (
                        <div style={{ marginTop: '0.45rem', fontSize: '0.78rem', color: 'var(--danger)' }}>
                          {formErrors.ingressPath}
                        </div>
                      )}
                    </div>
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
                <p style={{ margin: '0 0 0.75rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>REQUESTS</p>
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
                <p style={{ margin: '0 0 0.75rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>LIMITS</p>
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

      </div>

      <div style={{ position: 'sticky', top: '5.75rem' }}>
        <div
          style={{
            background: 'var(--workspace-bg)',
            borderRadius: '1rem',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            minHeight: '760px',
            boxShadow: 'var(--shadow)',
            border: '1px solid var(--workspace-border)',
          }}
        >
          <div style={{ padding: '1rem 1.25rem 0', background: 'var(--workspace-bg)' }}>
            <div style={{ marginBottom: '0.85rem' }}>
              <div style={{ color: 'var(--workspace-muted)', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Результат
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.25rem', overflowX: 'auto', marginBottom: '0.5rem' }}>
              {([
                ['preview', 'Preview'],
                ['lint', 'Lint'],
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
                      background: active ? 'var(--workspace-surface)' : 'transparent',
                      color: active ? 'var(--workspace-text)' : 'var(--workspace-muted)',
                      borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{ flex: 1, background: 'var(--workspace-surface)', padding: '1rem', overflow: 'auto' }}>
            {workspaceSection === 'preview' && (
              <div>
                <div style={{ display: 'flex', gap: '0.35rem', overflowX: 'auto', marginBottom: '1rem' }}>
                  {PREVIEW_TABS.map(tab => {
                    const disabled = isPreviewTabDisabled(tab, deferredConfig)
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
                        background: active ? 'var(--accent)' : 'var(--workspace-surface-2)',
                        color: disabled ? '#51627d' : 'var(--workspace-text)',
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
                    color: 'var(--workspace-text)',
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
                  <div style={{ color: '#94a3b8', fontSize: '0.84rem' }}>Результат проверки появится после запуска проверки.</div>
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

          </div>
        </div>
      </div>
    </div>
  )
}
