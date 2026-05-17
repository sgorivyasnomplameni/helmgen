import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

type ToastTone = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  tone: ToastTone
  message: string
}

interface ToastApi {
  showToast: (message: string, tone?: ToastTone) => void
}

const ToastContext = createContext<ToastApi | null>(null)

export function useToast() {
  const value = useContext(ToastContext)
  if (!value) {
    throw new Error('useToast must be used inside ToastProvider')
  }

  return value
}

export default function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const idRef = useRef(0)

  const showToast = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = ++idRef.current
    setItems(prev => [...prev, { id, tone, message }])
    window.setTimeout(() => {
      setItems(prev => prev.filter(item => item.id !== id))
    }, 3200)
  }, [])

  const value = useMemo(() => ({ showToast }), [showToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        style={{
          position: 'fixed',
          right: '1.25rem',
          bottom: '1.25rem',
          zIndex: 120,
          display: 'grid',
          gap: '0.65rem',
          maxWidth: '360px',
        }}
      >
        {items.map(item => (
          <div
            key={item.id}
            role="status"
            aria-live="polite"
            style={{
              padding: '0.9rem 1rem',
              borderRadius: '0.95rem',
              boxShadow: 'var(--shadow-soft)',
              border: '1px solid var(--border-subtle)',
              background:
                item.tone === 'success'
                  ? 'var(--success-soft)'
                  : item.tone === 'error'
                    ? 'var(--danger-soft)'
                    : 'var(--surface-elevated)',
              color:
                item.tone === 'success'
                  ? 'var(--success)'
                  : item.tone === 'error'
                    ? 'var(--danger)'
                    : 'var(--text)',
              fontSize: '0.84rem',
              fontWeight: 700,
              lineHeight: 1.45,
            }}
          >
            {item.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
