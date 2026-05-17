import { useDeferredValue, useEffect, useRef, useState } from 'react'
import Button from '@/components/Button'
import type { ChartConfig, WorkloadType, ServiceType } from '@/types/generator'
import WorkloadCard from '@/components/WorkloadCard'
import ToggleSwitch from '@/components/ToggleSwitch'
import RecommendationsBlock from '@/components/RecommendationsBlock'
import { FormField, ResponsiveGrid } from '@/components/FormLayout'
import { useToast } from '@/components/ToastProvider'
import YamlPreview from '@/components/YamlPreview'
import {
  chartsApi,
  type ChartValidationResult,
  extractApiErrorMessage,
} from '@/api/charts'
import { projectsApi } from '@/api/projects'
import type { Project } from '@/types/project'
import {
  generateValuesYaml,
} from '@/utils/yamlGenerator'

const DEFAULT_CONFIG: ChartConfig = {
  appName: '',
  version: '0.1.0',
  image: 'nginxinc/nginx-unprivileged',
  imageTag: '1.27.5-alpine',
  replicas: 1,
  containerPort: 8080,
  workloadType: 'Deployment',
  service: { enabled: true, port: 8080, type: 'ClusterIP' },
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
    goal: 'Показывает базовый production-подобный веб-сервис на unprivileged-образе, который реально можно развернуть в кластере.',
    expected: 'После генерации проверьте, что chart проходит lint почти без предупреждений, создаёт Service + Ingress и может быть развёрнут в minikube.',
    highlights: ['Deployment', '2 реплики', 'Ingress', 'Secure'],
    config: {
      appName: 'landing-page',
      version: '0.3.0',
      image: 'nginxinc/nginx-unprivileged',
      imageTag: '1.27.5-alpine',
      replicas: 2,
      containerPort: 8080,
      workloadType: 'Deployment',
      service: { enabled: true, port: 8080, type: 'ClusterIP' },
      ingress: { enabled: true, host: 'landing.demo.local', path: '/' },
      resources: {
        enabled: true,
        requests: { cpu: '100m', memory: '128Mi' },
        limits: { cpu: '300m', memory: '256Mi' },
      },
      security: {
        hostNetwork: false,
        podSecurityContext: { runAsNonRoot: true, runAsUser: 101 },
        containerSecurityContext: {
          privileged: false,
          allowPrivilegeEscalation: false,
          readOnlyRootFilesystem: false,
          capabilitiesDropAll: true,
        },
      },
    },
  },
  {
    id: 'api',
    title: 'Масштабируемый API',
    summary: 'Deployable-сервис с несколькими репликами, NodePort и зафиксированными ресурсами.',
    goal: 'Показывает масштабируемый HTTP/API-подобный сценарий на unprivileged-образе, который реально стартует под текущими ограничениями.',
    expected: 'После проверки рекомендации должны быть минимальными, а deploy не должен упираться ни в безопасность, ни в недоступный image.',
    highlights: ['Deployment', '4 реплики', 'NodePort', 'Secure'],
    config: {
      appName: 'orders-api',
      version: '1.4.2',
      image: 'nginxinc/nginx-unprivileged',
      imageTag: '1.27.5-alpine',
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
      security: {
        hostNetwork: false,
        podSecurityContext: { runAsNonRoot: true, runAsUser: 101 },
        containerSecurityContext: {
          privileged: false,
          allowPrivilegeEscalation: false,
          readOnlyRootFilesystem: false,
          capabilitiesDropAll: true,
        },
      },
    },
  },
  {
    id: 'postgres',
    title: 'Stateful БД для dev/test',
    summary: 'Deployable StatefulSet с Redis и внутренним ClusterIP-сервисом.',
    goal: 'Показывает, чем stateful-нагрузка отличается от обычного Deployment, сохраняя практичный профиль для dev/test.',
    expected: 'Chart должен проходить lint, а deploy не должен упираться в root-образ или несуществующий тег. Для dev/test допустимо одно предупреждение про writable filesystem.',
    highlights: ['StatefulSet', '1 реплика', 'ClusterIP', 'Dev/Test'],
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
        podSecurityContext: { runAsNonRoot: true, runAsUser: 999 },
        containerSecurityContext: {
          privileged: false,
          allowPrivilegeEscalation: false,
          readOnlyRootFilesystem: false,
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
  background: 'var(--surface-base)',
  borderRadius: '0.875rem',
  padding: '1rem 1.05rem',
  boxShadow: 'var(--shadow)',
  border: '1px solid var(--border-subtle)',
  animation: 'fadeUp 0.32s ease',
}

const input: React.CSSProperties = {
  width: '100%',
  padding: '0.55rem 0.75rem',
  borderRadius: '0.5rem',
  fontSize: '0.875rem',
  outline: 'none',
  color: 'var(--text)',
  background: 'var(--surface-elevated)',
  border: '1px solid var(--border-subtle)',
  boxSizing: 'border-box',
}

const sectionTitle: React.CSSProperties = {
  fontSize: '1rem',
  fontWeight: 700,
  color: 'var(--text)',
  marginBottom: '0.25rem',
}

const sectionHint: React.CSSProperties = {
  margin: '0 0 0.75rem',
  fontSize: '0.82rem',
  color: 'var(--text-muted)',
  lineHeight: 1.5,
}

const nestedPanel: React.CSSProperties = {
  marginTop: '0.8rem',
  padding: '0.8rem 0.85rem',
  borderRadius: '0.8rem',
  background: 'var(--surface-elevated)',
  border: '1px solid var(--border-subtle)',
}

const capabilityPanel: React.CSSProperties = {
  padding: '0.9rem 0.95rem',
  borderRadius: '0.95rem',
  background: 'linear-gradient(180deg, color-mix(in srgb, var(--surface-base) 96%, white 4%) 0%, var(--surface-base) 100%)',
  border: '1px solid var(--border-subtle)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.65)',
  display: 'grid',
  gap: '0.75rem',
}

const divider: React.CSSProperties = {
  border: 'none',
  borderTop: '1px solid var(--border-subtle)',
  margin: '1rem 0',
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
  'projectId' | 'appName' | 'version' | 'image' | 'imageTag' | 'containerPort' | 'servicePort' | 'ingressHost' | 'ingressPath',
  string
>>

interface GeneratorPageProps {
  onChartReady?: (chartId: number) => void
  onOpenOps?: () => void
}

export default function GeneratorPage({ onChartReady, onOpenOps }: GeneratorPageProps) {
  const formCardRef = useRef<HTMLDivElement | null>(null)
  const workflowCardRef = useRef<HTMLDivElement | null>(null)
  const advancedCardRef = useRef<HTMLDivElement | null>(null)
  const scenariosRef = useRef<HTMLDivElement | null>(null)
  const { showToast } = useToast()
  const [config, setConfig] = useState<ChartConfig>(DEFAULT_CONFIG)
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)
  const [newProjectName, setNewProjectName] = useState('')
  const [isLoadingProjects, setIsLoadingProjects] = useState(true)
  const [isCreatingProject, setIsCreatingProject] = useState(false)
  const [formErrors, setFormErrors] = useState<FormErrors>({})
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [generatedChartId, setGeneratedChartId] = useState<number | null>(null)
  const [isDraftDirty, setIsDraftDirty] = useState(false)
  const [validation, setValidation] = useState<ChartValidationResult | null>(null)
  const [isValidating, setIsValidating] = useState(false)
  const [, setActionNote] = useState<{ tone: 'neutral' | 'success' | 'error'; text: string } | null>(null)
  const [workspaceSection, setWorkspaceSection] = useState<WorkspaceSection>('preview')
  const [previewDrawerOpen, setPreviewDrawerOpen] = useState(false)
  const [previewWide, setPreviewWide] = useState(false)
  const [showScenarios, setShowScenarios] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const deferredConfig = useDeferredValue(config)

  useEffect(() => {
    if (!previewDrawerOpen) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setPreviewDrawerOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [previewDrawerOpen])

  useEffect(() => {
    if (!showScenarios) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setShowScenarios(false)
      }
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target
      if (scenariosRef.current && target instanceof Node && !scenariosRef.current.contains(target)) {
        setShowScenarios(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('mousedown', handlePointerDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('mousedown', handlePointerDown)
    }
  }, [showScenarios])

  useEffect(() => {
    let cancelled = false

    async function loadProjects() {
      setIsLoadingProjects(true)
      try {
        const data = await projectsApi.list()
        if (cancelled) return
        setProjects(data)
        setSelectedProjectId(prev => prev ?? data[0]?.id ?? null)
      } catch (error) {
        if (cancelled) return
        setActionNote({
          tone: 'error',
          text: extractApiErrorMessage(error, 'Не удалось загрузить список проектов.'),
        })
      } finally {
        if (!cancelled) {
          setIsLoadingProjects(false)
        }
      }
    }

    void loadProjects()
    return () => {
      cancelled = true
    }
  }, [])

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
    setShowAdvanced(true)
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
    setShowAdvanced(true)
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
    setShowAdvanced(true)
    setConfig(prev => ({ ...prev, resources: { ...prev.resources, [k]: v } }))
  }

  function setResourcesNested(group: 'requests' | 'limits', key: 'cpu' | 'memory', value: string) {
    resetGenerationState()
    setShowAdvanced(true)
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
    setShowAdvanced(true)
    setShowScenarios(false)
    setConfig(scenario.config)
  }

  function validateConfig(): FormErrors {
    const errors: FormErrors = {}

    if (!selectedProjectId) {
      errors.projectId = 'Выберите проект или создайте новый.'
    }

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

  async function handleCreateProject() {
    const trimmedName = newProjectName.trim()
    if (!trimmedName) {
      setFormErrors(prev => ({ ...prev, projectId: 'Укажите название нового проекта.' }))
      return
    }

    setIsCreatingProject(true)
    try {
      const project = await projectsApi.create({
        name: trimmedName,
        description: `Проект для Helm-чартов ${trimmedName}`,
      })
      setProjects(prev => [project, ...prev])
      setSelectedProjectId(project.id)
      setNewProjectName('')
      setFormErrors(prev => {
        const next = { ...prev }
        delete next.projectId
        return next
      })
      setActionNote({
        tone: 'success',
        text: `Проект ${project.name} создан. Теперь chart будет сохранён внутри него.`,
      })
      showToast(`Проект ${project.name} создан`, 'success')
    } catch (error) {
      const message = extractApiErrorMessage(error, 'Не удалось создать проект.')
      setActionNote({
        tone: 'error',
        text: message,
      })
      showToast(message, 'error')
    } finally {
      setIsCreatingProject(false)
    }
  }

  function handleDownload() {
    if (!generatedChartId) return
    void chartsApi.download(generatedChartId, `${config.appName}-${config.version}.tgz`)
  }

  function handleSaveTemplate() {
    window.localStorage.setItem(
      'helmgen-saved-template',
      JSON.stringify({
        selectedProjectId,
        config,
        savedAt: Date.now(),
      }),
    )
    setActionNote({
      tone: 'success',
      text: 'Шаблон сохранён локально в браузере. Его можно использовать как черновик для следующей сессии.',
    })
    showToast('Шаблон сохранён локально', 'success')
  }

  async function handleGenerate() {
    const errors = validateConfig()
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      showToast('Исправьте ошибки в форме перед генерацией', 'error')
      return
    }

    setFormErrors({})
    setStatus('loading')
    setActionNote({ tone: 'neutral', text: 'Собираем Helm-чарт и сохраняем его в истории...' })
    setValidation(null)
    setWorkspaceSection('preview')

    try {
      const payload = {
        project_id: selectedProjectId ?? undefined,
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
      showToast(`Чарт ${generatedChart.name} собран`, 'success')
    } catch (error) {
      const message = extractApiErrorMessage(error, 'Не удалось собрать chart. Проверьте состояние backend и попробуйте снова.')
      setStatus('error')
      setActionNote({
        tone: 'error',
        text: message,
      })
      showToast(message, 'error')
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
      showToast(result.summary, result.valid ? 'success' : 'error')
    } catch (error) {
      setValidation({
        valid: false,
        errors: ['Не удалось выполнить проверку чарта'],
        warnings: [],
        checks: [],
        engine: 'builtin',
        summary: 'Проверка завершилась с ошибкой запроса',
      })
      const message = extractApiErrorMessage(error, 'Не удалось выполнить проверку чарта.')
      setActionNote({
        tone: 'error',
        text: message,
      })
      showToast(message, 'error')
    } finally {
      setIsValidating(false)
    }
  }

  const configLooksReady = Boolean(
    config.appName.trim()
      && config.version.trim()
      && config.image.trim()
      && config.imageTag.trim()
      && Object.keys(validateConfig()).length === 0,
  )
  const canUseBuiltArtifact = Boolean(generatedChartId && !isDraftDirty)
  const hasAdvancedOverrides =
    config.workloadType !== DEFAULT_CONFIG.workloadType
    || config.service.type !== DEFAULT_CONFIG.service.type
    || !config.service.enabled
    || config.ingress.enabled
    || config.resources.enabled
  const advancedSummary = [
    config.workloadType !== DEFAULT_CONFIG.workloadType ? config.workloadType : null,
    !config.service.enabled ? 'без Service' : config.service.type !== DEFAULT_CONFIG.service.type ? config.service.type : null,
    config.ingress.enabled ? 'Ingress включен' : null,
    config.resources.enabled ? 'есть ресурсы' : null,
  ].filter(Boolean) as string[]

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
  const primaryToolbarAction = toolbarActions.find(action => action.primary) ?? toolbarActions[0]
  const secondaryToolbarActions = toolbarActions.filter(action => !action.primary)
  const workspaceSummary = Object.keys(formErrors).length > 0
    ? 'Исправьте ошибки формы.'
    : isDraftDirty
      ? 'Конфигурация изменилась. Обновите chart.'
      : validation?.valid
        ? 'Проверка пройдена. Можно переходить к deploy.'
        : generatedChartId
          ? 'Чарт собран. Следующий шаг: проверка.'
          : 'Заполните форму и соберите chart.'
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
      onClick: () => {
        setWorkspaceSection('preview')
        setPreviewDrawerOpen(true)
      },
    },
    {
      key: 'lint',
      label: 'Проверка',
      state: validation?.valid ? 'Пройдена' : 'Ожидает',
      done: Boolean(validation?.valid),
      active: Boolean(canUseBuiltArtifact && !validation?.valid),
      disabled: !canUseBuiltArtifact,
      onClick: () => {
        setWorkspaceSection('lint')
        setPreviewDrawerOpen(true)
      },
    },
  ]
  const selectedScenario =
    DEMO_SCENARIOS.find(
      scenario =>
        config.appName === scenario.config.appName &&
        config.workloadType === scenario.config.workloadType &&
        config.imageTag === scenario.config.imageTag,
    ) ?? null
  const networkingSummary = [
    config.service.enabled ? `Service ${config.service.type}` : 'Без Service',
    config.ingress.enabled ? 'Ingress включен' : 'Без Ingress',
  ]
  const resourcesSummary = config.resources.enabled
    ? [
        `Запросы ${config.resources.requests.cpu || 'n/a'} / ${config.resources.requests.memory || 'n/a'}`,
        `Лимиты ${config.resources.limits.cpu || 'n/a'} / ${config.resources.limits.memory || 'n/a'}`,
      ]
    : ['Ресурсы по умолчанию']
  const securitySummary = [
    config.security.podSecurityContext.runAsNonRoot ? 'Без root' : 'Root разрешён',
    config.security.containerSecurityContext.readOnlyRootFilesystem ? 'ФС только для чтения' : 'ФС на запись',
    config.security.containerSecurityContext.privileged ? 'Привилегированный режим' : 'Без привилегий',
    config.security.hostNetwork ? 'Сеть хоста' : 'Сеть Pod',
  ]

  return (
    <>
    <div className="generator-shell">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div
          ref={scenariosRef}
          style={{
            ...card,
            padding: '0.8rem 0.95rem',
            border: '1px solid var(--border-subtle)',
            background: 'var(--surface-base)',
            position: 'relative',
            overflow: 'visible',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.9rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0, flex: '1 1 420px' }}>
              <div style={{ fontSize: '0.73rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Быстрый старт
              </div>
              <div style={{ marginTop: '0.18rem', fontSize: '0.92rem', fontWeight: 800, color: 'var(--text)' }}>
                {selectedScenario ? selectedScenario.title : 'Чистая конфигурация'}
              </div>
              <div style={{ marginTop: '0.16rem', fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                {selectedScenario ? selectedScenario.summary : 'Начни с пустой формы или быстро примени готовый сценарий.'}
              </div>
              <div style={{ marginTop: '0.3rem', display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                {(selectedScenario ? selectedScenario.highlights : ['Без пресета', 'Ручная настройка']).slice(0, 3).map(item => (
                  <span
                    key={item}
                    style={{
                      padding: '0.22rem 0.45rem',
                      borderRadius: '999px',
                      background: 'var(--surface-elevated)',
                      color: 'var(--text-soft)',
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <Button
                type="button"
                tone="secondary"
                size="sm"
                onClick={() => {
                  resetGenerationState()
                  setConfig(DEFAULT_CONFIG)
                }}
              >
                Сбросить
              </Button>
              <Button type="button" tone="secondary" size="sm" onClick={() => setShowScenarios(prev => !prev)} style={{ boxShadow: 'none' }}>
                {showScenarios ? 'Закрыть' : 'Выбрать сценарий'}
              </Button>
            </div>
          </div>

          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 0.55rem)',
              right: '0.95rem',
              width: 'min(760px, calc(100vw - 4rem))',
              padding: showScenarios ? '0.8rem' : '0',
              borderRadius: '1rem',
              border: showScenarios ? '1px solid var(--border-subtle)' : '1px solid transparent',
              background: 'var(--surface-base)',
              boxShadow: showScenarios ? 'var(--shadow-soft)' : 'none',
              display: 'grid',
              gap: '0.65rem',
              maxHeight: showScenarios ? '520px' : '0',
              opacity: showScenarios ? 1 : 0,
              overflow: 'hidden',
              pointerEvents: showScenarios ? 'auto' : 'none',
              transform: showScenarios ? 'translateY(0)' : 'translateY(-6px)',
              transition: 'max-height 0.28s ease, opacity 0.22s ease, transform 0.22s ease, padding 0.22s ease, border-color 0.22s ease, box-shadow 0.22s ease',
              zIndex: 20,
            }}
          >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', paddingBottom: '0.2rem' }}>
                <div>
                  <div style={{ fontSize: '0.84rem', fontWeight: 800, color: 'var(--text)' }}>Стартовые сценарии</div>
                  <div style={{ marginTop: '0.15rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Примени готовую конфигурацию и доработай её в форме.
                  </div>
                </div>
                <Button type="button" tone="secondary" size="sm" onClick={() => setShowScenarios(false)} style={{ boxShadow: 'none' }}>
                  Закрыть
                </Button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.55rem' }}>
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
                        border: `1px solid ${selected ? 'color-mix(in srgb, var(--accent) 45%, var(--border-subtle) 55%)' : 'var(--border-subtle)'}`,
                        background: selected ? 'color-mix(in srgb, var(--accent-soft) 48%, var(--surface-elevated) 52%)' : 'var(--surface-elevated)',
                        borderRadius: '0.8rem',
                        padding: '0.75rem 0.8rem',
                        cursor: 'pointer',
                        display: 'grid',
                        gap: '0.4rem',
                        transition: 'transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease, background 0.18s ease',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text)' }}>{scenario.title}</div>
                        <div style={{ marginTop: '0.18rem', fontSize: '0.74rem', lineHeight: 1.4, color: 'var(--text-muted)' }}>
                          {scenario.summary}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignSelf: 'end' }}>
                        {scenario.highlights.slice(0, 3).map(item => (
                          <span
                            key={item}
                            style={{
                              padding: '0.26rem 0.48rem',
                              borderRadius: '999px',
                              background: 'var(--surface-contrast)',
                              color: 'var(--text-soft)',
                              fontSize: '0.68rem',
                              fontWeight: 700,
                            }}
                          >
                            {item}
                          </span>
                        ))}
                        {scenario.highlights.length > 3 && (
                          <span
                            style={{
                              padding: '0.26rem 0.48rem',
                              borderRadius: '999px',
                              background: 'var(--surface-muted)',
                              color: 'var(--text-muted)',
                              fontSize: '0.68rem',
                              fontWeight: 700,
                            }}
                          >
                            +{scenario.highlights.length - 3}
                          </span>
                        )}
                      </div>

                      <div style={{ fontSize: '0.73rem', color: 'var(--accent-contrast)', fontWeight: 700 }}>
                        Применить
                      </div>
                    </button>
                  )
                })}
              </div>
          </div>
        </div>

        <div
          ref={workflowCardRef}
          style={{
            ...card,
            padding: '0.9rem 0.95rem',
            display: 'grid',
            gap: '0.75rem',
            background: 'var(--surface-base)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '0.76rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Рабочая область
              </div>
              <div style={{ marginTop: '0.18rem', fontSize: '1rem', fontWeight: 800, color: 'var(--text)' }}>Поток работы</div>
            </div>
            <div style={{ display: 'flex', gap: '0.55rem', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
              <Button
                type="button"
                tone="secondary"
                size="sm"
                onClick={() => {
                  resetGenerationState()
                  setFormErrors({})
                  setShowAdvanced(false)
                  setConfig(DEFAULT_CONFIG)
                }}
              >
                Сбросить
              </Button>
              <Button type="button" tone="secondary" size="sm" onClick={handleSaveTemplate}>
                Сохранить шаблон
              </Button>
              <Button
                type="button"
                tone={primaryToolbarAction.tone === 'success' ? 'success' : 'primary'}
                size="sm"
                onClick={primaryToolbarAction.onClick}
                disabled={primaryToolbarAction.disabled}
                style={{ borderRadius: '999px' }}
              >
                {primaryToolbarAction.key === 'generate'
                  ? (isDraftDirty ? 'Обновить chart' : 'Собрать chart')
                  : primaryToolbarAction.key === 'validate'
                    ? 'Проверить chart'
                    : primaryToolbarAction.label}
              </Button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ ...stepChipBase, background: Object.keys(formErrors).length > 0 ? 'var(--danger-soft)' : isDraftDirty ? 'var(--warning-soft)' : validation?.valid ? 'var(--success-soft)' : 'var(--surface-muted)', color: Object.keys(formErrors).length > 0 ? 'var(--danger)' : isDraftDirty ? 'var(--warning)' : validation?.valid ? 'var(--success)' : 'var(--text-soft)', border: '1px solid var(--border-subtle)' }}>
              {workspaceSummary}
            </span>
            {generatedChartId && (
              <span style={{ ...stepChipBase, background: 'var(--surface-elevated)', color: 'var(--text-soft)', border: '1px solid var(--border-subtle)' }}>
                ID chart #{generatedChartId}
              </span>
            )}
          </div>

          <div className="workflow-steps">
            {progressItems.map(item => (
              <button
                key={item.key}
                type="button"
                onClick={item.onClick}
                disabled={item.disabled}
                style={{
                  padding: '0.72rem 0.78rem',
                  borderRadius: '0.85rem',
                  border: `1px solid ${item.done ? 'color-mix(in srgb, var(--success) 30%, var(--border-subtle) 70%)' : item.active ? 'color-mix(in srgb, var(--accent) 30%, var(--border-subtle) 70%)' : 'var(--border-subtle)'}`,
                  background: item.done ? 'color-mix(in srgb, var(--success-soft) 55%, var(--surface-elevated) 45%)' : item.active ? 'var(--surface-elevated)' : 'var(--surface-base)',
                  cursor: item.disabled ? 'not-allowed' : 'pointer',
                  opacity: item.disabled ? 0.55 : 1,
                  textAlign: 'left',
                  boxShadow: item.active ? 'var(--shadow)' : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span
                    style={{
                      width: '1.8rem',
                      height: '1.8rem',
                      borderRadius: '999px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: item.done ? 'var(--success-soft)' : item.active ? 'var(--accent-soft)' : 'var(--surface-muted)',
                      color: item.done ? 'var(--success)' : item.active ? 'var(--accent-contrast)' : 'var(--text-muted)',
                      border: `1px solid ${item.done ? 'color-mix(in srgb, var(--success) 30%, transparent)' : item.active ? 'color-mix(in srgb, var(--accent) 30%, transparent)' : 'var(--border-subtle)'}`,
                      fontSize: '0.76rem',
                      fontWeight: 800,
                      flexShrink: 0,
                    }}
                  >
                    {item.done ? '✓' : item.key === 'config' ? '1' : item.key === 'chart' ? '2' : '3'}
                  </span>
                  <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text)' }}>{item.label}</span>
                </div>
                <div style={{ marginTop: '0.32rem', fontSize: '0.73rem', color: item.done ? 'var(--success)' : item.active ? 'var(--accent-contrast)' : 'var(--text-muted)' }}>
                  {item.state}
                </div>
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.8rem', flexWrap: 'wrap', alignItems: 'center', paddingTop: '0.2rem', borderTop: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', minWidth: 0 }}>
              <span style={{ ...stepChipBase, background: generatedChartId ? 'var(--success-soft)' : 'var(--surface-muted)', color: generatedChartId ? 'var(--success)' : 'var(--text-soft)', border: '1px solid var(--border-subtle)' }}>
                {generatedChartId ? 'Манифест готов' : 'Манифест ещё не собран'}
              </span>
              <span style={{ ...stepChipBase, background: validation?.valid ? 'var(--success-soft)' : validation ? 'var(--danger-soft)' : 'var(--surface-muted)', color: validation?.valid ? 'var(--success)' : validation ? 'var(--danger)' : 'var(--text-soft)', border: '1px solid var(--border-subtle)' }}>
                {validation ? (validation.valid ? 'Проверка пройдена' : 'Проверка с ошибками') : 'Проверка не запускалась'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <Button
                type="button"
                tone="secondary"
                size="sm"
                onClick={() => {
                  setWorkspaceSection('preview')
                  setPreviewDrawerOpen(true)
                }}
              >
                Смотреть манифест
              </Button>
              {secondaryToolbarActions.slice(0, 1).map(action => (
                <Button
                  key={action.key}
                  type="button"
                  tone={action.tone === 'success' ? 'success' : 'secondary'}
                  size="sm"
                  onClick={action.onClick}
                  disabled={action.disabled}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 760px', display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: '0' }}>
            <div ref={formCardRef} style={card}>
              <p style={sectionTitle}>Основные параметры</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                <div style={{ ...nestedPanel, marginTop: 0, display: 'grid', gap: '0.7rem' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Идентичность chart
                  </div>
                  <ResponsiveGrid>
                    <FormField label="Проект">
                      <div>
                        <select
                          style={{
                            ...input,
                            border: formErrors.projectId ? '1px solid var(--danger)' : input.border,
                          }}
                          value={selectedProjectId ?? ''}
                          onChange={event => {
                            const raw = event.target.value
                            setSelectedProjectId(raw ? Number(raw) : null)
                            setFormErrors(prev => {
                              const next = { ...prev }
                              delete next.projectId
                              return next
                            })
                          }}
                          disabled={isLoadingProjects}
                        >
                          <option value="">
                            {isLoadingProjects ? 'Загружаем проекты...' : 'Выберите проект'}
                          </option>
                          {projects.map(project => (
                            <option key={project.id} value={project.id}>
                              {project.name}
                            </option>
                          ))}
                        </select>
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.45rem' }}>
                          <input
                            style={input}
                            placeholder="Новый проект, например orders-platform"
                            value={newProjectName}
                            onChange={event => setNewProjectName(event.target.value)}
                          />
                          <Button type="button" tone="secondary" onClick={() => void handleCreateProject()} disabled={isCreatingProject} style={{ whiteSpace: 'nowrap' }}>
                            {isCreatingProject ? 'Создание...' : 'Создать'}
                          </Button>
                        </div>
                        {formErrors.projectId && (
                          <div style={{ marginTop: '0.45rem', fontSize: '0.78rem', color: 'var(--danger)' }}>
                            {formErrors.projectId}
                          </div>
                        )}
                      </div>
                    </FormField>
                    <FormField label="Название приложения">
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
                    </FormField>
                    <FormField label="Версия чарта">
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
                    </FormField>
                  </ResponsiveGrid>
                </div>

                <div style={{ ...nestedPanel, marginTop: 0, display: 'grid', gap: '0.7rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Контейнер и запуск
                    </div>
                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                      <span style={{ ...stepChipBase, padding: '0.34rem 0.58rem', background: 'var(--surface-base)', color: 'var(--text-soft)', border: '1px solid var(--border-subtle)' }}>
                        {config.workloadType}
                      </span>
                      <span style={{ ...stepChipBase, padding: '0.34rem 0.58rem', background: 'var(--surface-base)', color: 'var(--text-soft)', border: '1px solid var(--border-subtle)' }}>
                        Порт {config.containerPort}
                      </span>
                    </div>
                  </div>
                  <ResponsiveGrid>
                    <FormField label="Docker образ">
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
                    </FormField>
                    <FormField label="Тег образа">
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
                    </FormField>
                  </ResponsiveGrid>
                  <ResponsiveGrid>
                    <FormField label="Количество реплик">
                      <input
                        style={{ ...input, opacity: config.workloadType === 'DaemonSet' ? 0.4 : 1 }}
                        type="number"
                        min={1}
                        value={config.replicas}
                        disabled={config.workloadType === 'DaemonSet'}
                        onChange={e => set('replicas', Math.max(1, Number(e.target.value)))}
                      />
                    </FormField>
                    <FormField label="Порт контейнера">
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
                    </FormField>
                  </ResponsiveGrid>
                </div>
              </div>
            </div>

            <div ref={advancedCardRef} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div>
                  <p style={sectionTitle}>Продвинутые настройки</p>
                </div>
                <Button type="button" tone="secondary" size="sm" onClick={() => setShowAdvanced(prev => !prev)}>
                  {showAdvanced ? 'Скрыть настройки' : hasAdvancedOverrides ? 'Изменить настройки' : 'Показать настройки'}
                </Button>
              </div>

              <div style={{ marginTop: '-0.1rem' }}>
                {advancedSummary.length > 0 ? (
                  <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                    {advancedSummary.map(item => (
                      <span
                        key={item}
                        style={{
                          padding: '0.28rem 0.55rem',
                          borderRadius: '999px',
                          background: 'var(--accent-soft)',
                          color: 'var(--accent-contrast)',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                        }}
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.35 }}>
                    Используются значения по умолчанию.
                  </div>
                )}
              </div>

              {showAdvanced && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginTop: '0.85rem' }}>
                  <div style={{ ...capabilityPanel, marginTop: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Режим
                        </div>
                        <p style={{ ...sectionTitle, marginBottom: '0.1rem' }}>Тип workload</p>
                        <p style={{ ...sectionHint, marginBottom: 0 }}>Определи модель запуска chart: без состояния, stateful или агент на каждой ноде.</p>
                      </div>
                      <span style={{ ...stepChipBase, padding: '0.34rem 0.58rem', background: 'var(--surface-base)', color: 'var(--text-soft)', border: '1px solid var(--border-subtle)' }}>
                        {config.workloadType}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                      {WORKLOAD_TYPES.map(type => (
                        <WorkloadCard
                          key={type}
                          type={type}
                          selected={config.workloadType === type}
                          onSelect={() => {
                            setShowAdvanced(true)
                            set('workloadType', type)
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  <div style={{ ...capabilityPanel, marginTop: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Режим
                        </div>
                        <p style={{ ...sectionTitle, marginBottom: '0.1rem' }}>Сеть</p>
                        <p style={{ ...sectionHint, marginBottom: 0 }}>Включай только те сетевые сущности, которые реально нужны приложению.</p>
                      </div>
                      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                        {networkingSummary.map(item => (
                          <span key={item} style={{ ...stepChipBase, padding: '0.34rem 0.58rem', background: 'var(--surface-base)', color: 'var(--text-soft)', border: '1px solid var(--border-subtle)' }}>
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div>
                      <ToggleSwitch checked={config.service.enabled} onChange={v => setService('enabled', v)} label="Service" />
                      {config.service.enabled && (
                        <div style={{ ...nestedPanel, display: 'flex', gap: '0.85rem', flexWrap: 'wrap' }}>
                          <FormField label="Порт">
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
                          </FormField>
                          <div style={{ flex: 1, minWidth: '240px' }}>
                            <label className="form-field__label">Тип Service</label>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                              {SERVICE_TYPES.map(t => (
                                <button
                                  key={t}
                                  type="button"
                                  onClick={() => setService('type', t)}
                                  style={{
                                    flex: '1 1 120px',
                                    padding: '0.5rem',
                                    border: `2px solid ${config.service.type === t ? 'var(--accent)' : 'var(--border-subtle)'}`,
                                borderRadius: '0.5rem',
                                background: config.service.type === t ? 'var(--accent-soft)' : 'var(--surface-elevated)',
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
                    <div style={nestedPanel}>
                      <ResponsiveGrid>
                        <FormField label="Хост">
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
                        </FormField>
                        <FormField label="Путь">
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
                        </FormField>
                      </ResponsiveGrid>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ ...capabilityPanel, marginTop: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Режим
                    </div>
                    <p style={{ ...sectionTitle, marginBottom: '0.1rem' }}>Ресурсы</p>
                    <p style={{ ...sectionHint, marginBottom: 0 }}>Requests и limits помогают сделать workload предсказуемым при проверке и deploy.</p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                    {resourcesSummary.map(item => (
                      <span key={item} style={{ ...stepChipBase, padding: '0.34rem 0.58rem', background: 'var(--surface-base)', color: 'var(--text-soft)', border: '1px solid var(--border-subtle)' }}>
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
                <ToggleSwitch checked={config.resources.enabled} onChange={v => setResources('enabled', v)} label="Лимиты ресурсов" />
                {config.resources.enabled && (
                  <div style={{ ...nestedPanel, display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                    <div>
                      <p style={{ margin: '0 0 0.75rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>REQUESTS</p>
                      <ResponsiveGrid>
                        <FormField label="CPU">
                          <input style={input} placeholder="100m" value={config.resources.requests.cpu} onChange={e => setResourcesNested('requests', 'cpu', e.target.value)} />
                        </FormField>
                        <FormField label="Memory">
                          <input style={input} placeholder="128Mi" value={config.resources.requests.memory} onChange={e => setResourcesNested('requests', 'memory', e.target.value)} />
                        </FormField>
                      </ResponsiveGrid>
                    </div>
                    <div>
                      <p style={{ margin: '0 0 0.75rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>LIMITS</p>
                      <ResponsiveGrid>
                        <FormField label="CPU">
                          <input style={input} placeholder="500m" value={config.resources.limits.cpu} onChange={e => setResourcesNested('limits', 'cpu', e.target.value)} />
                        </FormField>
                        <FormField label="Memory">
                          <input style={input} placeholder="512Mi" value={config.resources.limits.memory} onChange={e => setResourcesNested('limits', 'memory', e.target.value)} />
                        </FormField>
                      </ResponsiveGrid>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ ...capabilityPanel, marginTop: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Режим
                    </div>
                    <p style={{ ...sectionTitle, marginBottom: '0.1rem' }}>Профиль безопасности</p>
                    <p style={{ ...sectionHint, marginBottom: 0 }}>Профиль безопасности пока формируется из выбранного сценария и текущих значений chart.</p>
                  </div>
                  <span style={{ ...stepChipBase, padding: '0.34rem 0.58rem', background: config.security.containerSecurityContext.privileged ? 'var(--danger-soft)' : 'var(--success-soft)', color: config.security.containerSecurityContext.privileged ? 'var(--danger)' : 'var(--success)', border: '1px solid var(--border-subtle)' }}>
                    {config.security.containerSecurityContext.privileged ? 'Есть риск' : 'Усилено'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  {securitySummary.map(item => (
                    <span key={item} style={{ ...stepChipBase, padding: '0.34rem 0.58rem', background: 'var(--surface-base)', color: 'var(--text-soft)', border: '1px solid var(--border-subtle)' }}>
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
          </div>
          <aside
            style={{
              flex: '0 0 320px',
              width: '320px',
              maxWidth: '100%',
              position: 'sticky',
              top: '1rem',
              alignSelf: 'flex-start',
            }}
          >
            <RecommendationsBlock config={deferredConfig} variant="sidebar" />
          </aside>
        </div>
      </div>
    </div>

    {previewDrawerOpen && (
      <div
            style={{
              position: 'fixed',
          inset: 0,
          zIndex: 50,
          display: 'flex',
          justifyContent: 'flex-end',
          background: 'rgba(15, 23, 42, 0.42)',
          backdropFilter: 'blur(6px)',
        }}
        onClick={() => setPreviewDrawerOpen(false)}
      >
        <div
          style={{
            width: previewWide ? 'min(1440px, calc(100vw - 1rem))' : 'min(1120px, calc(100vw - 2rem))',
            height: '100vh',
            background: 'var(--surface-muted)',
            borderLeft: '1px solid var(--border-subtle)',
            boxShadow: '-18px 0 42px rgba(15, 23, 42, 0.18)',
            padding: '0.9rem',
            overflow: 'auto',
            boxSizing: 'border-box',
            display: 'grid',
            alignContent: 'start',
            gap: '0.9rem',
            animation: 'fadeUp 0.24s ease',
          }}
          onClick={event => event.stopPropagation()}
        >
          <div
            style={{
              ...card,
              padding: '0.95rem 1rem',
              display: 'grid',
              gap: '0.75rem',
              background: 'var(--surface-base)',
              position: 'sticky',
              top: 0,
              zIndex: 2,
              backdropFilter: 'blur(12px)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.76rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  Рабочая область
                </div>
                <div style={{ marginTop: '0.24rem', color: 'var(--text)', fontSize: '1.08rem', fontWeight: 900 }}>
                  {workspaceSection === 'preview' ? 'Предпросмотр манифеста' : 'Результат проверки chart'}
                </div>
                <div style={{ marginTop: '0.28rem', color: 'var(--text-muted)', fontSize: '0.84rem', lineHeight: 1.55, maxWidth: '760px' }}>
                  Это режим просмотра: изменения вносятся через форму, а здесь удобно читать результат.
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.55rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <div style={{ display: 'flex', gap: '0.35rem', overflowX: 'auto' }}>
                  {([
                    ['preview', 'Манифест'],
                    ['lint', 'Проверка'],
                  ] as Array<[WorkspaceSection, string]>).map(([tab, label]) => {
                    const active = workspaceSection === tab
                    return (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setWorkspaceSection(tab)}
                        style={{
                          padding: '0.5rem 0.8rem',
                          fontSize: '0.76rem',
                          fontWeight: 800,
                          border: `1px solid ${active ? 'color-mix(in srgb, var(--accent) 24%, transparent)' : 'var(--border-subtle)'}`,
                          borderRadius: '999px',
                          cursor: 'pointer',
                          background: active ? 'var(--accent-soft)' : 'color-mix(in srgb, var(--surface-elevated) 76%, white 24%)',
                          color: active ? 'var(--accent-contrast)' : 'var(--text-soft)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
                <Button type="button" tone="secondary" size="sm" onClick={() => setPreviewWide(prev => !prev)}>
                  {previewWide ? 'Обычная ширина' : 'Шире'}
                </Button>
                <Button type="button" tone="ghost" size="sm" onClick={() => setPreviewDrawerOpen(false)}>
                  Закрыть
                </Button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
              <span style={{ ...stepChipBase, background: generatedChartId ? 'var(--success-soft)' : 'var(--surface-muted)', color: generatedChartId ? 'var(--success)' : 'var(--text-soft)', border: '1px solid var(--border-subtle)' }}>
                {generatedChartId ? 'Чарт собран' : 'Чарт ещё не собран'}
              </span>
              <span style={{ ...stepChipBase, background: validation?.valid ? 'var(--success-soft)' : validation ? 'var(--danger-soft)' : 'var(--surface-muted)', color: validation?.valid ? 'var(--success)' : validation ? 'var(--danger)' : 'var(--text-soft)', border: '1px solid var(--border-subtle)' }}>
                {validation ? (validation.valid ? 'Проверка пройдена' : 'Проверка с ошибками') : 'Проверка ещё не запускалась'}
              </span>
            </div>
          </div>

          {workspaceSection === 'preview' && (
            <YamlPreview
              config={deferredConfig}
              chartId={generatedChartId ?? undefined}
              chartName={config.appName || 'chart'}
              chartVersion={config.version}
              drawerMode
            />
          )}

          {workspaceSection === 'lint' && (
            <div
              style={{
                background: 'linear-gradient(180deg, color-mix(in srgb, var(--surface-base) 94%, white 6%) 0%, var(--surface-base) 100%)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '1.15rem',
                padding: '1rem 1.05rem',
                boxShadow: '0 18px 42px rgba(15, 23, 42, 0.12)',
                minHeight: 'calc(100vh - 220px)',
              }}
            >
              <div style={{ marginBottom: '1rem', position: 'sticky', top: '5.95rem', zIndex: 1, paddingBottom: '0.7rem', background: 'linear-gradient(180deg, color-mix(in srgb, var(--surface-base) 94%, white 6%) 0%, color-mix(in srgb, var(--surface-base) 92%, transparent 8%) 100%)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', marginBottom: '0.45rem' }}>
                  <div style={{ color: 'var(--text)', fontSize: '1rem', fontWeight: 800 }}>Результат проверки</div>
                  <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                    <span style={{ ...stepChipBase, background: 'var(--surface-muted)', color: 'var(--text-soft)', border: '1px solid var(--border-subtle)' }}>{validation?.engine === 'helm lint' ? 'helm lint' : validation?.engine === 'helm_lint' ? 'helm lint' : 'встроенная проверка'}</span>
                    <span style={{ ...stepChipBase, background: validation?.valid ? 'var(--success-soft)' : validation ? 'var(--danger-soft)' : 'var(--surface-muted)', color: validation?.valid ? 'var(--success)' : validation ? 'var(--danger)' : 'var(--text-soft)', border: '1px solid var(--border-subtle)' }}>{validation ? (validation.valid ? 'Прошло' : 'Ошибка') : 'Ожидает'}</span>
                  </div>
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.84rem' }}>
                  {validation?.summary || 'После проверки здесь появится итог helm lint и встроенной валидации.'}
                </div>
              </div>

              {!validation ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.84rem' }}>Результат проверки появится после запуска проверки.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {validation.errors.length > 0 && (
                    <div>
                      <div style={{ color: 'var(--danger)', fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.45rem' }}>Ошибки</div>
                      <ul style={{ margin: 0, paddingLeft: '1.1rem', color: 'var(--text-soft)' }}>
                        {validation.errors.map(item => <li key={item} style={{ marginBottom: '0.35rem' }}>{item}</li>)}
                      </ul>
                    </div>
                  )}

                  {validation.warnings.length > 0 && (
                    <div>
                      <div style={{ color: 'var(--warning)', fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.45rem' }}>Предупреждения</div>
                      <ul style={{ margin: 0, paddingLeft: '1.1rem', color: 'var(--text-soft)' }}>
                        {validation.warnings.map(item => <li key={item} style={{ marginBottom: '0.35rem' }}>{item}</li>)}
                      </ul>
                    </div>
                  )}

                  <div>
                    <div style={{ color: 'var(--success)', fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.45rem' }}>Успешные проверки</div>
                    <ul style={{ margin: 0, paddingLeft: '1.1rem', color: 'var(--text-soft)' }}>
                      {validation.checks.map(item => <li key={item} style={{ marginBottom: '0.35rem' }}>{item}</li>)}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    )}
    </>
  )
}
