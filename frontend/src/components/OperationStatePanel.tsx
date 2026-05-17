import type { ReactNode } from 'react'

export type OperationState = 'idle' | 'running' | 'success' | 'error'

interface Props {
  state: OperationState
  title: string
  message: string
  meta?: ReactNode
}

export default function OperationStatePanel({ state, title, message, meta }: Props) {
  const tone =
    state === 'success'
      ? {
          background: 'var(--success-soft)',
          color: 'var(--success)',
          border: '1px solid color-mix(in srgb, var(--success) 28%, transparent)',
        }
      : state === 'error'
        ? {
            background: 'var(--danger-soft)',
            color: 'var(--danger)',
            border: '1px solid color-mix(in srgb, var(--danger) 28%, transparent)',
          }
        : state === 'running'
          ? {
              background: 'color-mix(in srgb, var(--accent) 8%, var(--surface-base) 92%)',
              color: 'var(--accent)',
              border: '1px solid color-mix(in srgb, var(--accent) 24%, transparent)',
            }
          : {
              background: 'var(--surface-elevated)',
              color: 'var(--text-soft)',
              border: '1px solid var(--border-subtle)',
          }

  return (
    <div
      style={{
        ...tone,
        padding: '0.95rem 1rem 0.95rem 1.1rem',
        borderRadius: '1rem',
        display: 'grid',
        gap: '0.42rem',
        position: 'relative',
        overflow: 'hidden',
        animation: 'fadeUp 0.28s ease',
        boxShadow: state === 'running' ? 'var(--shadow)' : 'none',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: '0 auto 0 0',
          width: '4px',
          background:
            state === 'success'
              ? 'var(--success)'
              : state === 'error'
                ? 'var(--danger)'
                : state === 'running'
                  ? 'var(--accent)'
                  : 'var(--border-strong)',
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
          <span
            aria-hidden="true"
            style={{
              width: '0.62rem',
              height: '0.62rem',
              borderRadius: '999px',
              background:
                state === 'success'
                  ? 'var(--success)'
                  : state === 'error'
                    ? 'var(--danger)'
                    : state === 'running'
                      ? 'var(--accent)'
                      : 'var(--border-strong)',
              animation: state === 'running' ? 'pulseGlow 1.8s infinite ease-out' : undefined,
            }}
          />
          <div style={{ fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {title}
          </div>
        </div>
        <div style={{ fontSize: '0.75rem', fontWeight: 800 }}>
          {state === 'idle' ? 'Ожидание' : state === 'running' ? 'В работе' : state === 'success' ? 'Готово' : 'Ошибка'}
        </div>
      </div>
      <div style={{ fontSize: '0.84rem', lineHeight: 1.55 }}>
        {message}
      </div>
      {meta ? (
        <div style={{ fontSize: '0.78rem', lineHeight: 1.45, color: 'var(--text-muted)' }}>
          {meta}
        </div>
      ) : null}
    </div>
  )
}
