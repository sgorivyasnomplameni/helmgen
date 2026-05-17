import { useEffect, useState } from 'react'
import { chartsApi } from '@/api/charts'
import Button from '@/components/Button'
import CodeBlock from '@/components/CodeBlock'
import StatusPill from '@/components/StatusPill'
import type { ChartConfig, YamlTab } from '@/types/generator'
import {
  generateChartYaml,
  generateDeploymentYaml,
  generateIngressYaml,
  generateServiceYaml,
} from '@/utils/yamlGenerator'

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
    case 'service.yaml': return generateServiceYaml(config)
    case 'ingress.yaml': return generateIngressYaml(config)
    case 'Chart.yaml': return generateChartYaml(config)
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
  const [expanded, setExpanded] = useState(false)

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
        background: 'var(--surface-base)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '1rem',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: expanded ? '760px' : '560px',
        boxShadow: 'var(--shadow)',
      }}
    >
      <div
        style={{
          padding: '1rem 1.1rem 0.9rem',
          background: 'var(--surface-base)',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.85rem', marginBottom: '0.9rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'grid', gap: '0.32rem' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.77rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Результат
            </span>
            <div style={{ color: 'var(--text)', fontSize: '1rem', fontWeight: 800 }}>
              Предпросмотр манифеста
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', lineHeight: 1.5 }}>
              Проверяй структуру файлов chart до lint и deploy. Неактивные вкладки означают, что сущность ещё не включена в конфигурацию.
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <Button type="button" tone={copied ? 'success' : 'secondary'} size="sm" onClick={handleCopy}>
              {copied ? 'Скопировано' : 'Скопировать'}
            </Button>
            {chartId && (
              <Button type="button" tone="secondary" size="sm" onClick={handleDownload} title={`Скачать ${chartName}-${chartVersion}.tgz`}>
                Скачать
              </Button>
            )}
            <Button type="button" tone="ghost" size="sm" onClick={() => setExpanded(prev => !prev)}>
              {expanded ? 'Свернуть' : 'Развернуть'}
            </Button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.35rem', overflowX: 'auto', alignItems: 'center' }}>
          {ALL_TABS.map(tab => {
            const disabled = isTabDisabled(tab, config)
            const active = activeTab === tab
            return (
              <button
                key={tab}
                onClick={() => !disabled && setActiveTab(tab)}
                disabled={disabled}
                style={{
                  padding: '0.42rem 0.72rem',
                  fontSize: '0.74rem',
                  fontFamily: 'monospace',
                  border: active ? '1px solid color-mix(in srgb, var(--accent) 30%, transparent)' : '1px solid var(--border-subtle)',
                  borderRadius: '999px',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  background: active ? 'var(--accent-soft)' : 'var(--surface-elevated)',
                  color: disabled ? 'var(--text-muted)' : active ? 'var(--accent-contrast)' : 'var(--text-soft)',
                  whiteSpace: 'nowrap',
                  opacity: disabled ? 0.5 : 1,
                }}
              >
                {tab}{disabled ? ' · не создан' : ''}
              </button>
            )
          })}
          <StatusPill tone="dark" style={{ marginLeft: 'auto', flexShrink: 0 }}>
            YAML
          </StatusPill>
        </div>
      </div>

      <div
        style={{
          flex: 1,
          background: 'var(--surface-muted)',
          padding: '1rem',
          overflow: 'auto',
        }}
      >
        <CodeBlock minHeight={expanded ? 640 : 440} style={{ whiteSpace: 'pre' }}>
          {content}
        </CodeBlock>
      </div>
    </div>
  )
}
