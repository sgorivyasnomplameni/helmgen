import { useState, useEffect } from 'react'
import type { ChartConfig, YamlTab } from '@/types/generator'
import {
  generateDeploymentYaml,
  generateServiceYaml,
  generateIngressYaml,
  generateChartYaml,
} from '@/utils/yamlGenerator'
import { chartsApi } from '@/api/charts'

interface Props {
  config: ChartConfig
  chartId?: number
  chartName?: string
  chartVersion?: string
}

const ALL_TABS: YamlTab[] = ['deployment.yaml', 'service.yaml', 'ingress.yaml', 'Chart.yaml']

function getContent(tab: YamlTab, config: ChartConfig): string {
  switch (tab) {
    case 'deployment.yaml': return generateDeploymentYaml(config)
    case 'service.yaml':    return generateServiceYaml(config)
    case 'ingress.yaml':    return generateIngressYaml(config)
    case 'Chart.yaml':      return generateChartYaml(config)
  }
}

function isTabDisabled(tab: YamlTab, config: ChartConfig): boolean {
  if (tab === 'service.yaml') return !config.service.enabled
  if (tab === 'ingress.yaml') return !config.ingress.enabled
  return false
}

export default function YamlPreview({ config, chartId, chartName, chartVersion }: Props) {
  const [activeTab, setActiveTab] = useState<YamlTab>('deployment.yaml')
  const [copied, setCopied] = useState(false)

  const handleDownload = () => {
    if (!chartId) return
    void chartsApi.download(chartId, `${chartName ?? 'chart'}-${chartVersion ?? '0.1.0'}.tgz`)
  }

  useEffect(() => {
    if (isTabDisabled(activeTab, config)) {
      setActiveTab('deployment.yaml')
    }
  }, [config.service.enabled, config.ingress.enabled, activeTab])

  const content = getContent(activeTab, config)

  const handleCopy = () => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div
      style={{
        background: 'var(--surface-elevated)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '1rem',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: '600px',
        boxShadow: 'var(--shadow)',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '1rem 1.25rem 0',
          background: 'var(--surface-elevated)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Предпросмотр YAML
          </span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
          {chartId && (
            <button
              onClick={handleDownload}
              title={`Скачать ${chartName}-${chartVersion}.tgz`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                background: 'var(--accent-soft)',
                color: 'var(--accent-contrast)',
                border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)',
                borderRadius: '0.375rem',
                padding: '0.3rem 0.7rem',
                fontSize: '0.75rem',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 9h-4V3H9v6H5l7 7 7-7zm-8 2V5h2v6h1.17L12 13.17 9.83 11H11zm-6 7h14v2H5v-2z" />
              </svg>
              Скачать .tgz
            </button>
          )}
          <button
            onClick={handleCopy}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                background: copied ? 'var(--success-soft)' : 'var(--surface-muted)',
                color: copied ? 'var(--success)' : 'var(--text-muted)',
                border: copied
                  ? '1px solid color-mix(in srgb, var(--success) 35%, transparent)'
                  : '1px solid var(--border-subtle)',
                borderRadius: '0.375rem',
                padding: '0.3rem 0.7rem',
                fontSize: '0.75rem',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {copied ? (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                </svg>
                Скопировано
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" />
                </svg>
                Копировать
              </>
            )}
          </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0.125rem', overflowX: 'auto' }}>
          {ALL_TABS.map(tab => {
            const disabled = isTabDisabled(tab, config)
            const active = activeTab === tab
            return (
              <button
                key={tab}
                onClick={() => !disabled && setActiveTab(tab)}
                disabled={disabled}
                style={{
                  padding: '0.5rem 0.875rem',
                  fontSize: '0.75rem',
                  fontFamily: 'monospace',
                  border: 'none',
                  borderRadius: '0.375rem 0.375rem 0 0',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  background: active ? 'var(--surface-muted)' : 'transparent',
                  color: disabled ? 'var(--text-muted)' : active ? 'var(--text)' : 'var(--text-muted)',
                  borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
                  transition: 'all 0.15s',
                  whiteSpace: 'nowrap',
                  opacity: disabled ? 0.45 : 1,
                }}
              >
                {tab}
              </button>
            )
          })}
        </div>
      </div>

      {/* Code area */}
      <div
        style={{
          flex: 1,
          background: 'var(--code-surface)',
          padding: '1.25rem',
          overflow: 'auto',
        }}
      >
        <pre
          style={{
            margin: 0,
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
            fontSize: '0.78rem',
            lineHeight: 1.7,
            color: 'var(--code-text)',
            whiteSpace: 'pre',
          }}
        >
          {content}
        </pre>
      </div>
    </div>
  )
}
