import type { CSSProperties, ReactNode } from 'react'

type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'dark'

interface Props {
  children: ReactNode
  tone?: Tone
  style?: CSSProperties
}

export default function StatusPill({ children, tone = 'neutral', style }: Props) {
  return (
    <span
      className={`status-pill status-pill--${tone}`}
      style={style}
    >
      {children}
    </span>
  )
}
