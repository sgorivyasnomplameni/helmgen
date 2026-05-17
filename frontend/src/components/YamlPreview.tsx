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
  drawerMode?: boolean
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

export default function YamlPreview({ config, chartId, chartName, chartVersion, drawerMode = false }: Props) {
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
  }, [activeTab, config])

  const content = getContent(activeTab, config)

  const handleCopy = () => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div
      className={drawerMode ? 'yaml-preview yaml-preview--drawer' : 'yaml-preview'}
      style={{
        minHeight: expanded ? (drawerMode ? 'calc(100vh - 220px)' : '760px') : drawerMode ? 'calc(100vh - 260px)' : '560px',
      }}
    >
      <div
        className="yaml-preview__header"
      >
        <div className="yaml-preview__topline">
          <div className="yaml-preview__title-block">
            <span className="eyebrow">
              Результат
            </span>
            <div className="section-title">
              Предпросмотр манифеста
            </div>
            <div className="section-copy">
              Только просмотр YAML и результатов проверки перед deploy.
            </div>
            {drawerMode && (
              <div className="chip-row">
                <StatusPill tone="neutral">Только просмотр</StatusPill>
                <StatusPill tone={chartId ? 'success' : 'neutral'}>{chartId ? 'Чарт сохранён' : 'Локальный просмотр'}</StatusPill>
              </div>
            )}
          </div>

          <div className="action-row action-row--end">
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

        <div className="yaml-preview__tabs">
          {ALL_TABS.map(tab => {
            const disabled = isTabDisabled(tab, config)
            const active = activeTab === tab
            return (
              <button
                key={tab}
                onClick={() => !disabled && setActiveTab(tab)}
                disabled={disabled}
                className={`yaml-preview__tab${active ? ' is-active' : ''}`}
              >
                {tab}{disabled ? ' · не создан' : ''}
              </button>
            )
          })}
        </div>
      </div>

      <div className="yaml-preview__body">
        <div className="yaml-preview__meta">
          <div className="eyebrow">
            Только просмотр
          </div>
          <div className="muted-small">
            Изменения вносятся через форму слева
          </div>
        </div>
        <CodeBlock minHeight={expanded ? (drawerMode ? 760 : 640) : drawerMode ? 560 : 440} style={{ whiteSpace: 'pre', fontSize: drawerMode ? '0.84rem' : '0.8rem', lineHeight: drawerMode ? 1.78 : 1.72, cursor: 'default', userSelect: 'text' }}>
          {content}
        </CodeBlock>
      </div>
    </div>
  )
}
