import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'

type ButtonTone = 'primary' | 'success' | 'secondary' | 'danger' | 'ghost'
type ButtonSize = 'sm' | 'md'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  tone?: ButtonTone
  size?: ButtonSize
  block?: boolean
}

const sizeStyles: Record<ButtonSize, CSSProperties> = {
  sm: {
    padding: '0.55rem 0.8rem',
    fontSize: '0.78rem',
    borderRadius: '0.7rem',
  },
  md: {
    padding: '0.78rem 1rem',
    fontSize: '0.9rem',
    borderRadius: '0.82rem',
  },
}

const toneStyles: Record<ButtonTone, CSSProperties> = {
  primary: {
    background: 'var(--accent)',
    color: '#fff',
    border: '1px solid var(--accent)',
    boxShadow: '0 8px 18px color-mix(in srgb, var(--accent) 18%, transparent)',
  },
  success: {
    background: 'var(--success)',
    color: '#fff',
    border: '1px solid var(--success)',
    boxShadow: '0 8px 18px color-mix(in srgb, var(--success) 18%, transparent)',
  },
  secondary: {
    background: 'var(--surface-elevated)',
    color: 'var(--text-soft)',
    border: '1px solid var(--border-subtle)',
  },
  danger: {
    background: 'var(--danger-soft)',
    color: 'var(--danger)',
    border: '1px solid color-mix(in srgb, var(--danger) 30%, transparent)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--text-soft)',
    border: '1px solid transparent',
  },
}

export default function Button({
  children,
  tone = 'secondary',
  size = 'md',
  block = false,
  disabled,
  style,
  ...props
}: Props) {
  return (
    <button
      {...props}
      disabled={disabled}
      style={{
        ...sizeStyles[size],
        ...toneStyles[tone],
        width: block ? '100%' : undefined,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.45rem',
        fontWeight: 800,
        lineHeight: 1.2,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.58 : 1,
        transition: 'background 0.18s ease, border-color 0.18s ease, color 0.18s ease, box-shadow 0.18s ease',
        ...style,
      }}
    >
      {children}
    </button>
  )
}
