import { memo, startTransition, useEffect, useRef, useState } from 'react'
import type { ChartConfig } from '@/types/generator'
import { chartsApi } from '@/api/charts'

interface Props {
  config: ChartConfig
  variant?: 'default' | 'sidebar' | 'compact'
  onApplyReplicasFix?: () => void
  onOpenResources?: () => void
  onOpenNetworking?: () => void
  onOpenAdvanced?: () => void
}

type RecommendationSeverity = 'critical' | 'warning' | 'note'

interface ParsedRecommendation {
  severity: RecommendationSeverity
  label: string
  message: string
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

function RecommendationsBlock({
  config,
  variant = 'default',
  onApplyReplicasFix,
  onOpenResources,
  onOpenNetworking,
  onOpenAdvanced,
}: Props) {
  const [recommendations, setRecommendations] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [refreshTick, setRefreshTick] = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pulseRef = useRef<ReturnType<typeof setTimeout> | null>(null)
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

  useEffect(() => {
    setRefreshTick(prev => prev + 1)
    if (pulseRef.current) clearTimeout(pulseRef.current)
    pulseRef.current = setTimeout(() => setRefreshTick(prev => prev), 240)

    return () => {
      if (pulseRef.current) clearTimeout(pulseRef.current)
    }
  }, [recommendations])

  const parsedRecommendations: ParsedRecommendation[] = recommendations.map(item => {
    if (item.startsWith('Критично:')) {
      return {
        severity: 'critical',
        label: 'Критично',
        message: item.replace('Критично:', '').trim(),
      }
    }

    if (item.startsWith('Внимание:')) {
      return {
        severity: 'warning',
        label: 'Внимание',
        message: item.replace('Внимание:', '').trim(),
      }
    }

    return {
      severity: 'note',
      label: 'Рекомендация',
      message: item.replace('Рекомендация:', '').trim(),
    }
  })

  const warningCount = parsedRecommendations.length
  const criticalCount = parsedRecommendations.filter(item => item.severity === 'critical').length
  const warningOnlyCount = parsedRecommendations.filter(item => item.severity === 'warning').length
  const noteCount = parsedRecommendations.filter(item => item.severity === 'note').length
  const hasCritical = criticalCount > 0
  const readinessScore = Math.max(0, 100 - criticalCount * 34 - warningOnlyCount * 18 - noteCount * 8)
  const readinessLabel =
    warningCount === 0 ? 'Готово' : hasCritical ? 'Нужны правки' : warningCount <= 2 ? 'Проверить' : 'Есть риски'
  const readinessColor =
    warningCount === 0 ? 'var(--success)' : hasCritical ? 'var(--danger)' : warningCount <= 2 ? 'var(--text-soft)' : 'var(--warning)'
  const readinessBackground =
    warningCount === 0
      ? 'var(--success-soft)'
      : hasCritical
        ? 'color-mix(in srgb, var(--danger) 8%, var(--surface-base) 92%)'
        : warningCount <= 2
          ? 'var(--surface-elevated)'
          : 'color-mix(in srgb, var(--warning) 8%, var(--surface-base) 92%)'

  const summaryLine = warningCount === 0
    ? 'Можно собирать chart.'
    : parsedRecommendations
      .slice(0, 2)
      .map(item => item.message)
      .join(' ')
  const auditProgress = hasCritical ? 22 : warningCount === 0 ? 100 : warningCount <= 2 ? 72 : 48
  const auditSummary = warningCount === 0
    ? 'Конфигурация выглядит устойчиво.'
    : hasCritical
      ? 'Есть блокирующие замечания. Исправь их перед сборкой.'
      : warningCount <= 2
        ? 'Есть несколько рисков, которые лучше поправить.'
        : 'Конфигурация требует доработки перед проверкой.'

  const quickActions = [
    (recommendations.some(item => item.includes('минимум 2 реплик')) || recommendations.some(item => item.includes('минимум 2 реплики')))
      && onApplyReplicasFix
      ? { key: 'replicas', label: '2 реплики', onClick: onApplyReplicasFix }
      : null,
    recommendations.some(item => item.includes('requests/limits')) && onOpenResources
      ? { key: 'resources', label: 'Включить ресурсы', onClick: onOpenResources }
      : null,
    recommendations.some(item => item.includes('Ingress')) && onOpenNetworking
      ? { key: 'networking', label: 'Открыть сеть', onClick: onOpenNetworking }
      : null,
    warningCount > 0 && onOpenAdvanced
      ? { key: 'advanced', label: 'Все рекомендации', onClick: onOpenAdvanced }
      : null,
  ].filter(Boolean) as Array<{ key: string; label: string; onClick: () => void }>

  if (variant === 'compact') {
    return (
      <div
        style={{
          display: 'grid',
          gap: '0.55rem',
          padding: '0.7rem 0.8rem',
          borderRadius: '0.9rem',
          background: 'var(--surface-elevated)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', gap: '0.75rem', alignItems: 'center' }}>
          <div
            style={{
              width: '2.3rem',
              height: '2.3rem',
              borderRadius: '0.8rem',
              display: 'grid',
              placeItems: 'center',
              background: readinessBackground,
              border: '1px solid var(--border-subtle)',
              color: readinessColor,
              fontSize: '0.76rem',
              fontWeight: 900,
            }}
          >
            {readinessScore}
          </div>

          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
              {warningCount === 0 ? <CheckIcon /> : <WarningIcon />}
              <span style={{ fontSize: '0.84rem', fontWeight: 800, color: 'var(--text)' }}>
                Рекомендации
              </span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                готовность {readinessScore}%
              </span>
            </div>
            <div style={{ marginTop: '0.18rem', fontSize: '0.78rem', color: 'var(--text-soft)', lineHeight: 1.35 }}>
              {summaryLine}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <span
              style={{
                padding: '0.28rem 0.52rem',
                borderRadius: '999px',
                fontSize: '0.7rem',
                fontWeight: 800,
                color: readinessColor,
                background: readinessBackground,
                border: '1px solid var(--border-subtle)',
              }}
            >
              {readinessLabel}
            </span>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
              {loading ? 'обновление...' : `${warningCount} пункт${warningCount === 1 ? '' : warningCount < 5 ? 'а' : 'ов'}`}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          {criticalCount > 0 && (
            <span style={{ padding: '0.26rem 0.5rem', borderRadius: '999px', background: 'var(--danger-soft)', color: 'var(--danger)', border: '1px solid color-mix(in srgb, var(--danger) 28%, transparent)', fontSize: '0.71rem', fontWeight: 800 }}>
              {criticalCount} критично
            </span>
          )}
          {warningOnlyCount > 0 && (
            <span style={{ padding: '0.26rem 0.5rem', borderRadius: '999px', background: 'var(--warning-soft)', color: 'var(--warning)', border: '1px solid color-mix(in srgb, var(--warning) 28%, transparent)', fontSize: '0.71rem', fontWeight: 800 }}>
              {warningOnlyCount} риск
            </span>
          )}
          {noteCount > 0 && (
            <span style={{ padding: '0.26rem 0.5rem', borderRadius: '999px', background: 'var(--accent-soft)', color: 'var(--accent-contrast)', border: '1px solid color-mix(in srgb, var(--accent) 28%, transparent)', fontSize: '0.71rem', fontWeight: 800 }}>
              {noteCount} совет
            </span>
          )}
        </div>

        {quickActions.length > 0 && (
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {quickActions.slice(0, 3).map(action => (
              <button
                key={action.key}
                type="button"
                onClick={action.onClick}
                style={{
                  padding: '0.42rem 0.68rem',
                  borderRadius: '999px',
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--surface-base)',
                  color: 'var(--text-soft)',
                  fontSize: '0.74rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}

        {warningCount > 0 && (
          <div style={{ display: 'grid', gap: '0.32rem' }}>
            <button
              type="button"
              onClick={() => setExpanded(prev => !prev)}
              style={{
                justifySelf: 'start',
                padding: 0,
                border: 'none',
                background: 'transparent',
                color: 'var(--text-muted)',
                fontSize: '0.74rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {expanded ? 'Скрыть детали' : 'Показать детали'}
            </button>
            {expanded && (
              <div style={{ display: 'grid', gap: '0.32rem' }}>
                {parsedRecommendations.map((rec, i) => (
                  <div
                    key={`${rec.label}-${i}`}
                    style={{
                      display: 'flex',
                      gap: '0.5rem',
                      alignItems: 'flex-start',
                      fontSize: '0.78rem',
                      lineHeight: 1.35,
                      color: 'var(--text-soft)',
                    }}
                  >
                    <span
                      style={{
                        marginTop: '0.12rem',
                        width: '0.38rem',
                        height: '0.38rem',
                        borderRadius: '999px',
                        flexShrink: 0,
                        background:
                          rec.severity === 'critical'
                            ? 'var(--danger)'
                            : rec.severity === 'warning'
                              ? 'var(--warning)'
                              : 'var(--accent)',
                      }}
                    />
                    <span>{rec.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  if (variant === 'sidebar') {
    const showSuccessState = parsedRecommendations.length === 0
    const topRecommendation = parsedRecommendations[0]

    return (
      <div
        style={{
          background: 'var(--surface-base)',
          border: '1px solid var(--border-subtle)',
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
              opacity: 0.75,
            }}
          >
            обновление...
          </span>
        </div>

        <div
          style={{
            padding: '0.85rem',
            borderRadius: '0.9rem',
            background: 'var(--surface-elevated)',
            border: '1px solid var(--border-subtle)',
            marginBottom: '0.8rem',
            display: 'grid',
            gap: '0.65rem',
            transition: 'border-color 0.22s ease, transform 0.22s ease, box-shadow 0.22s ease, opacity 0.22s ease',
            boxShadow: loading ? 'var(--shadow-soft)' : 'none',
            opacity: loading ? 0.94 : 1,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Статус аудита
              </div>
              <div style={{ marginTop: '0.22rem', fontSize: '1rem', fontWeight: 800, color: 'var(--text)' }}>
                {readinessLabel}
              </div>
            </div>
            <div
              style={{
                padding: '0.32rem 0.58rem',
                borderRadius: '999px',
                fontSize: '0.74rem',
                fontWeight: 800,
                color: readinessColor,
                background: readinessBackground,
                border: '1px solid var(--border-subtle)',
                whiteSpace: 'nowrap',
              }}
            >
              {warningCount === 0 ? '0 замечаний' : `${warningCount} ${warningCount === 1 ? 'замечание' : warningCount < 5 ? 'замечания' : 'замечаний'}`}
            </div>
          </div>

          <div
            style={{
              height: '0.45rem',
              borderRadius: '999px',
              background: 'var(--surface-contrast)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${auditProgress}%`,
                height: '100%',
                borderRadius: '999px',
                background: hasCritical
                  ? 'linear-gradient(90deg, var(--danger) 0%, color-mix(in srgb, var(--warning) 45%, var(--danger) 55%) 100%)'
                  : warningCount > 0
                    ? 'linear-gradient(90deg, var(--warning) 0%, color-mix(in srgb, var(--success) 25%, var(--warning) 75%) 100%)'
                    : 'linear-gradient(90deg, var(--success) 0%, color-mix(in srgb, var(--success) 55%, white 45%) 100%)',
                transition: 'width 0.32s ease',
              }}
            />
          </div>

          <div style={{ display: 'grid', gap: '0.4rem' }}>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-soft)', lineHeight: 1.45 }}>
              {auditSummary}
            </div>
            <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
              {criticalCount > 0 && (
                <span style={{ fontSize: '0.73rem', color: 'var(--danger)' }}>
                  {criticalCount} критично
                </span>
              )}
              {warningOnlyCount > 0 && (
                <span style={{ fontSize: '0.73rem', color: 'var(--warning)' }}>
                  {warningOnlyCount} риск
                </span>
              )}
              {noteCount > 0 && (
                <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>
                  {noteCount} совет
                </span>
              )}
              {loading && (
                <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>
                  обновляем...
                </span>
              )}
            </div>
          </div>
        </div>

        <div
          style={{
            minHeight: '140px',
            display: 'grid',
            gap: '0.55rem',
            alignContent: 'start',
            transition: 'opacity 0.22s ease, transform 0.22s ease',
            opacity: loading ? 0.9 : 1,
            transform: loading ? 'translateY(2px)' : 'translateY(0)',
          }}
        >
          <div
            style={{
              padding: '0.78rem 0.82rem',
              borderRadius: '0.85rem',
              background: showSuccessState ? 'var(--success-soft)' : 'var(--surface-elevated)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>
              Главное
            </div>
            <div style={{ fontSize: '0.8rem', color: showSuccessState ? 'var(--success)' : 'var(--text)', fontWeight: 800, lineHeight: 1.4 }}>
              {showSuccessState ? 'Критичных замечаний нет' : topRecommendation?.message}
            </div>
          </div>

          {quickActions.length > 0 && (
            <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginBottom: '0.1rem' }}>
              {quickActions.slice(0, 2).map(action => (
                <button
                  key={action.key}
                  type="button"
                  onClick={action.onClick}
                  style={{
                    padding: '0.42rem 0.68rem',
                    borderRadius: '999px',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--surface-elevated)',
                    color: 'var(--text-soft)',
                    fontSize: '0.74rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}

          {!showSuccessState && (
            <div
              key={`items-${refreshTick}`}
              style={{
                display: 'grid',
                gap: '0.55rem',
                animation: 'revealDown 180ms ease',
              }}
            >
            {parsedRecommendations.slice(1, 3).map((rec, i) => (
              <div
                key={`${rec.label}-${i}`}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.65rem',
                  padding: '0.72rem 0.78rem',
                  borderRadius: '0.85rem',
                  background: 'var(--surface-elevated)',
                  border: '1px solid var(--border-subtle)',
                  boxShadow: `inset 3px 0 0 ${
                    rec.severity === 'critical'
                      ? 'color-mix(in srgb, var(--danger) 65%, transparent)'
                      : rec.severity === 'warning'
                        ? 'color-mix(in srgb, var(--warning) 65%, transparent)'
                        : 'color-mix(in srgb, var(--accent) 55%, transparent)'
                  }`,
                }}
              >
                <WarningIcon />
                <div>
                  <div
                    style={{
                      fontSize: '0.74rem',
                      fontWeight: 800,
                      color:
                        rec.severity === 'critical'
                          ? 'var(--danger)'
                          : rec.severity === 'warning'
                            ? 'var(--warning)'
                            : 'var(--accent)',
                      marginBottom: '0.2rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    {rec.label}
                  </div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-soft)', lineHeight: 1.45 }}>
                    {rec.message}
                  </div>
                </div>
              </div>
            ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        background: 'var(--surface-base)',
        border: '1px solid var(--border-subtle)',
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

      {parsedRecommendations.length === 0 && !loading ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.65rem',
            padding: '0.9rem 1rem',
            borderRadius: '0.85rem',
            background: 'var(--success-soft)',
            border: '1px solid color-mix(in srgb, var(--success) 22%, var(--border-subtle) 78%)',
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
          {parsedRecommendations.map((rec, i) => (
            <li
              key={`${rec.label}-${i}`}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.7rem',
                padding: '0.9rem 1rem',
                borderRadius: '0.85rem',
                background: 'var(--surface-elevated)',
                border: '1px solid var(--border-subtle)',
                boxShadow: `inset 3px 0 0 ${
                  rec.severity === 'critical'
                    ? 'color-mix(in srgb, var(--danger) 65%, transparent)'
                    : rec.severity === 'warning'
                      ? 'color-mix(in srgb, var(--warning) 65%, transparent)'
                      : 'color-mix(in srgb, var(--accent) 55%, transparent)'
                }`,
              }}
            >
              <WarningIcon />
              <div>
                <div
                  style={{
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    color:
                      rec.severity === 'critical'
                        ? 'var(--danger)'
                        : rec.severity === 'warning'
                          ? 'var(--warning)'
                          : 'var(--accent)',
                    marginBottom: '0.15rem',
                  }}
                >
                  {rec.label}
                </div>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-soft)', lineHeight: 1.55 }}>
                  {rec.message}
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
    prev.config.resources.limits.memory === next.config.resources.limits.memory &&
    prev.onApplyReplicasFix === next.onApplyReplicasFix &&
    prev.onOpenResources === next.onOpenResources &&
    prev.onOpenNetworking === next.onOpenNetworking &&
    prev.onOpenAdvanced === next.onOpenAdvanced
  )
}

export default memo(RecommendationsBlock, arePropsEqual)
