import type { CSSProperties, ReactNode } from 'react'

interface Props {
  children: ReactNode
  minHeight?: number
  style?: CSSProperties
}

export default function CodeBlock({ children, minHeight, style }: Props) {
  return (
    <pre
      style={{
        margin: 0,
        padding: '1rem 1.05rem',
        borderRadius: '0.95rem',
        background: 'linear-gradient(180deg, var(--code-surface) 0%, color-mix(in srgb, var(--code-bg) 92%, black 8%) 100%)',
        border: '1px solid var(--code-border)',
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
        fontSize: '0.8rem',
        lineHeight: 1.72,
        color: 'var(--code-text)',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        minHeight,
        overflow: 'auto',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
        ...style,
      }}
    >
      {children}
    </pre>
  )
}
