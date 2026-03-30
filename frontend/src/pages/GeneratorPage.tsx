import { useState } from 'react'
import type { ChartConfig, WorkloadType, ServiceType } from '@/types/generator'
import WorkloadCard from '@/components/WorkloadCard'
import ToggleSwitch from '@/components/ToggleSwitch'
import YamlPreview from '@/components/YamlPreview'
import RecommendationsBlock from '@/components/RecommendationsBlock'
import { chartsApi } from '@/api/charts'

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

  function set<K extends keyof ChartConfig>(key: K, value: ChartConfig[K]) {
    setConfig(prev => ({ ...prev, [key]: value }))
  }

  function setService<K extends keyof ChartConfig['service']>(k: K, v: ChartConfig['service'][K]) {
    setConfig(prev => ({ ...prev, service: { ...prev.service, [k]: v } }))
  }

  function setIngress<K extends keyof ChartConfig['ingress']>(k: K, v: ChartConfig['ingress'][K]) {
    setConfig(prev => ({ ...prev, ingress: { ...prev.ingress, [k]: v } }))
  }

  function setResources<K extends keyof ChartConfig['resources']>(k: K, v: ChartConfig['resources'][K]) {
    setConfig(prev => ({ ...prev, resources: { ...prev.resources, [k]: v } }))
  }

  function setResourcesNested(
    group: 'requests' | 'limits',
    key: 'cpu' | 'memory',
    value: string
  ) {
    setConfig(prev => ({
      ...prev,
      resources: {
        ...prev.resources,
        [group]: { ...prev.resources[group], [key]: value },
      },
    }))
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
    // If already generated — trigger download instead of re-generating
    if (status === 'success' && generatedChartId) {
      handleDownload()
      return
    }
    if (!config.appName.trim()) {
      alert('Введите название приложения')
      return
    }
    setStatus('loading')
    try {
      const chart = await chartsApi.create({
        name: config.appName,
        description: `Generated chart for ${config.appName}`,
        chart_version: config.version,
        app_version: config.imageTag,
      })
      await chartsApi.generate(chart.id)
      setGeneratedChartId(chart.id)
      setStatus('success')
    } catch {
      setStatus('error')
      setTimeout(() => setStatus('idle'), 3000)
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

        {/* ── Recommendations ── */}
        <RecommendationsBlock config={config} />

        {/* ── Generate / Download button ── */}
        <button
          type="button"
          onClick={handleGenerate}
          disabled={status === 'loading'}
          style={{
            width: '100%',
            padding: '0.875rem',
            background:
              status === 'success' ? '#16a34a' :
              status === 'error'   ? '#dc2626' :
              status === 'loading' ? '#93c5fd' :
              '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: '0.75rem',
            fontWeight: 700,
            fontSize: '1rem',
            cursor: status === 'loading' ? 'not-allowed' : 'pointer',
            transition: 'background 0.2s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.625rem',
          }}
        >
          {status === 'loading' && (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="white" style={{ animation: 'spin 1s linear infinite' }}>
              <path d="M12 4V2A10 10 0 0 0 2 12h2a8 8 0 0 1 8-8z" />
            </svg>
          )}
          {status === 'success' && (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
              <path d="M19 9h-4V3H9v6H5l7 7 7-7zm-8 2V5h2v6h1.17L12 13.17 9.83 11H11zm-6 7h14v2H5v-2z" />
            </svg>
          )}
          {status === 'success' ? `✓ Сгенерировано — Скачать архив` :
           status === 'error'   ? '✗ Ошибка сохранения — попробовать снова' :
           status === 'loading' ? 'Генерация...' :
           'Сгенерировать Helm-чарт'}
        </button>

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
