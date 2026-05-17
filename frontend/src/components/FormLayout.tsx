import type { CSSProperties, ReactNode } from 'react'

interface FieldProps {
  label: string
  children: ReactNode
}

interface ResponsiveGridProps {
  children: ReactNode
  min?: number
}

export function FormField({ label, children }: FieldProps) {
  return (
    <div className="form-field">
      <label className="form-field__label">{label}</label>
      {children}
    </div>
  )
}

export function ResponsiveGrid({ children, min = 220 }: ResponsiveGridProps) {
  return (
    <div
      className="responsive-grid"
      style={{ '--grid-min': `${min}px` } as CSSProperties}
    >
      {children}
    </div>
  )
}
