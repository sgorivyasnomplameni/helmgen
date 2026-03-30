import { memo, startTransition, useEffect, useRef, useState } from 'react'
import type { ChartConfig } from '@/types/generator'
import { chartsApi } from '@/api/charts'

interface Props {
  config: ChartConfig
  variant?: 'default' | 'sidebar'
}

const WarningIcon = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="var(--warning)"
    style={{ flexShrink: 0, marginTop: '1px' }}
  >
    <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
  </svg>
)

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--success)">
    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
  </svg>
)

function RecommendationsBlock({ config, variant = 'default' }: Props) {
  const [recommendations, setRecommendations] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestRef = useRef(0)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)

    timerRef.current = setTimeout(async () => {
      const requestId = ++requestRef.current
      setLoading(true)
      try {
        const data = await chartsApi.recommendations({
          replicas: config.replicas,
          workload_type: config.workloadType,
          service_enabled: config.service.enabled,
          service_type: config.service.type,
          resource_limits: config.resources.enabled,
          image_tag: config.imageTag,
          ingress_enabled: config.ingress.enabled,
        })
        if (requestRef.current === requestId) {
          startTransition(() => {
            setRecommendations(data)
          })
        }
      } catch {
        // Backend unavailable — silently keep previous recommendations
      } finally {
        if (requestRef.current === requestId) {
          setLoading(false)
        }
      }
    }, 700)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [
    config.replicas,
    config.workloadType,
    config.service.enabled,
    config.service.type,
    config.resources.enabled,
    config.imageTag,
    config.ingress.enabled,
  ])

  const warningCount = recommendations.length
  const readinessLabel =
    warningCount === 0 ? 'Готово' : warningCount <= 2 ? 'Проверить' : 'Риски'
  const readinessColor =
    warningCount === 0 ? 'var(--success)' : warningCount <= 2 ? 'var(--text-soft)' : 'var(--warning)'
  const readinessBackground =
    warningCount === 0 ? 'var(--success-soft)' : warningCount <= 2 ? 'var(--panel-strong)' : 'color-mix(in srgb, var(--warning-soft) 65%, var(--panel) 35%)'

  if (variant === 'sidebar') {
    return (
      <div
        style={{
          background: 'linear-gradient(180deg, color-mix(in srgb, var(--panel) 88%, transparent) 0%, var(--panel-muted) 100%)',
          border: '1px solid var(--border)',
          borderRadius: '1rem',
          padding: '1rem',
          boxShadow: 'var(--shadow)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '1rem' }}>
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Аудит
            </div>
            <div style={{ marginTop: '0.3rem', fontSize: '1rem', fontWeight: 800, color: 'var(--text)' }}>
              Рекомендации системы
            </div>
          </div>
          <span
            style={{
              fontSize: '0.72rem',
              color: 'var(--warning)',
              whiteSpace: 'nowrap',
              visibility: loading ? 'visible' : 'hidden',
            }}
          >
              обновление...
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.7rem', marginBottom: '0.95rem' }}>
          <div
            style={{
              padding: '0.8rem',
              borderRadius: '0.85rem',
              background: 'var(--panel-strong)',
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Замечаний
            </div>
            <div style={{ marginTop: '0.35rem', fontSize: '1.45rem', fontWeight: 800, color: 'var(--text)' }}>
              {warningCount}
            </div>
          </div>
          <div
            style={{
              padding: '0.8rem',
              borderRadius: '0.85rem',
              background: readinessBackground,
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: readinessColor, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Статус
            </div>
            <div style={{ marginTop: '0.35rem', fontSize: '1.05rem', fontWeight: 800, color: readinessColor }}>
              {readinessLabel}
            </div>
          </div>
        </div>

        <div
          style={{
            minHeight: '280px',
            display: 'grid',
            gap: '0.65rem',
            alignContent: 'start',
          }}
        >
          {recommendations.length === 0 && !loading ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.6rem',
                padding: '0.8rem',
                borderRadius: '0.85rem',
                background: 'var(--success-soft)',
                border: '1px solid var(--border)',
              }}
            >
              <CheckIcon />
                <div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--success)' }}>
                    Критичных замечаний нет
                  </div>
                  <div style={{ marginTop: '0.18rem', fontSize: '0.76rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    Можно продолжать работу с chart.
                  </div>
                </div>
              </div>
          ) : (
            recommendations.slice(0, 4).map((rec, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.65rem',
                  padding: '0.8rem',
                  borderRadius: '0.85rem',
                  background: 'var(--panel-strong)',
                  border: '1px solid var(--border)',
                  boxShadow: 'inset 2px 0 0 color-mix(in srgb, var(--warning) 80%, transparent)',
                }}
              >
                <WarningIcon />
                <div>
                  <div style={{ fontSize: '0.74rem', fontWeight: 800, color: 'var(--warning)', marginBottom: '0.2rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {i === 0 ? 'Главное' : `Замечание ${i + 1}`}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-soft)', lineHeight: 1.5 }}>
                    {rec}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, var(--panel-muted) 0%, var(--panel) 100%)',
        border: '1px solid var(--border)',
        borderRadius: '0.95rem',
        padding: '1.35rem',
        boxShadow: 'var(--shadow)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', marginBottom: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#d97706">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
            </svg>
            <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text)' }}>
              Архитектурные рекомендации
            </span>
          </div>
        </div>
        {loading && (
          <span style={{ fontSize: '0.72rem', color: 'var(--warning)', marginTop: '0.15rem' }}>
            обновление...
          </span>
        )}
      </div>

      {recommendations.length === 0 && !loading ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.65rem',
            padding: '0.9rem 1rem',
            borderRadius: '0.85rem',
            background: 'var(--success-soft)',
            border: '1px solid var(--border)',
          }}
        >
          <CheckIcon />
          <div>
            <div style={{ fontSize: '0.84rem', fontWeight: 800, color: 'var(--success)' }}>
              Конфигурация выглядит хорошо
            </div>
            <div style={{ marginTop: '0.2rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Критичных архитектурных замечаний по текущим параметрам не найдено.
            </div>
          </div>
        </div>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: '0.7rem' }}>
          {recommendations.map((rec, i) => (
            <li
              key={i}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.7rem',
                padding: '0.9rem 1rem',
                borderRadius: '0.85rem',
                background: 'var(--warning-soft)',
                border: '1px solid var(--border)',
              }}
            >
              <WarningIcon />
              <div>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--warning)', marginBottom: '0.15rem' }}>
                  Рекомендация {i + 1}
                </div>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-soft)', lineHeight: 1.55 }}>
                  {rec}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function arePropsEqual(prev: Props, next: Props) {
  return (
    prev.variant === next.variant &&
    prev.config.appName === next.config.appName &&
    prev.config.version === next.config.version &&
    prev.config.image === next.config.image &&
    prev.config.imageTag === next.config.imageTag &&
    prev.config.replicas === next.config.replicas &&
    prev.config.containerPort === next.config.containerPort &&
    prev.config.workloadType === next.config.workloadType &&
    prev.config.service.enabled === next.config.service.enabled &&
    prev.config.service.port === next.config.service.port &&
    prev.config.service.type === next.config.service.type &&
    prev.config.ingress.enabled === next.config.ingress.enabled &&
    prev.config.ingress.host === next.config.ingress.host &&
    prev.config.ingress.path === next.config.ingress.path &&
    prev.config.resources.enabled === next.config.resources.enabled &&
    prev.config.resources.requests.cpu === next.config.resources.requests.cpu &&
    prev.config.resources.requests.memory === next.config.resources.requests.memory &&
    prev.config.resources.limits.cpu === next.config.resources.limits.cpu &&
    prev.config.resources.limits.memory === next.config.resources.limits.memory
  )
}

export default memo(RecommendationsBlock, arePropsEqual)
