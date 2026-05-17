import type { CSSProperties, ReactNode } from 'react'

type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'dark'

interface Props {
  children: ReactNode
  tone?: Tone
  style?: CSSProperties
}

const toneStyles: Record<Tone, CSSProperties> = {
  neutral: {
    background: 'var(--surface-muted)',
    color: 'var(--text-soft)',
    border: '1px solid var(--border-subtle)',
  },
  accent: {
    background: 'var(--accent-soft)',
    color: 'var(--accent-contrast)',
    border: '1px solid color-mix(in srgb, var(--accent) 28%, transparent)',
  },
  success: {
    background: 'var(--success-soft)',
    color: 'var(--success)',
    border: '1px solid color-mix(in srgb, var(--success) 28%, transparent)',
  },
  warning: {
    background: 'var(--warning-soft)',
    color: 'var(--warning)',
    border: '1px solid color-mix(in srgb, var(--warning) 28%, transparent)',
  },
  danger: {
    background: 'var(--danger-soft)',
    color: 'var(--danger)',
    border: '1px solid color-mix(in srgb, var(--danger) 28%, transparent)',
  },
  dark: {
    background: 'var(--code-surface)',
    color: 'var(--code-text)',
    border: '1px solid var(--code-border)',
  },
}

export default function StatusPill({ children, tone = 'neutral', style }: Props) {
  return (
    <span
      style={{
        ...toneStyles[tone],
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.35rem',
        padding: '0.34rem 0.62rem',
        borderRadius: '999px',
        fontSize: '0.74rem',
        fontWeight: 800,
        lineHeight: 1.15,
        letterSpacing: '0.01em',
        ...style,
      }}
    >
      {children}
    </span>
  )
}
