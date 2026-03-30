import { useState, useEffect, useRef } from 'react'
import type { ChartConfig } from '@/types/generator'
import { chartsApi } from '@/api/charts'

interface Props {
  config: ChartConfig
}

const WarningIcon = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="#d97706"
    style={{ flexShrink: 0, marginTop: '1px' }}
  >
    <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
  </svg>
)

export default function RecommendationsBlock({ config }: Props) {
  const [recommendations, setRecommendations] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)

    timerRef.current = setTimeout(async () => {
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
        setRecommendations(data)
      } catch {
        // Backend unavailable — silently keep previous recommendations
      } finally {
        setLoading(false)
      }
    }, 500)

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

  return (
    <div
      style={{
        background: '#fffbeb',
        border: '1px solid #fde68a',
        borderRadius: '0.75rem',
        padding: '1.25rem',
        transition: 'opacity 0.2s',
        opacity: loading ? 0.6 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.875rem' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="#d97706">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
        </svg>
        <span style={{ fontWeight: 700, fontSize: '0.875rem', color: '#92400e' }}>
          Рекомендации системы
        </span>
        {loading && (
          <span style={{ fontSize: '0.72rem', color: '#b45309', marginLeft: 'auto' }}>
            обновление...
          </span>
        )}
      </div>

      {recommendations.length === 0 && !loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="#16a34a">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
          </svg>
          <span style={{ fontSize: '0.82rem', color: '#166534' }}>
            Конфигурация выглядит хорошо
          </span>
        </div>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {recommendations.map((rec, i) => (
            <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
              <WarningIcon />
              <span style={{ fontSize: '0.82rem', color: '#78350f', lineHeight: 1.5 }}>
                {rec}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
