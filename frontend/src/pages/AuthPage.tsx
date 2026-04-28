import { useState, type CSSProperties, type FormEvent } from 'react'
import { authApi, extractAuthErrorMessage } from '@/api/auth'
import type { AuthResponse } from '@/types/auth'

type AuthMode = 'login' | 'register'

interface AuthPageProps {
  onAuthenticated: (payload: AuthResponse) => void
}

const shellStyle: CSSProperties = {
  minHeight: '100vh',
  background: 'var(--bg)',
  padding: '3rem 1.5rem',
}

const cardStyle: CSSProperties = {
  maxWidth: '460px',
  margin: '3rem auto 0',
  background: 'var(--panel)',
  border: '1px solid var(--border)',
  borderRadius: '1.25rem',
  padding: '1.4rem',
  boxShadow: 'var(--shadow-soft)',
}

const inputStyle: CSSProperties = {
  width: '100%',
  background: 'var(--input-bg)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: '0.8rem',
  padding: '0.85rem 0.95rem',
  fontSize: '0.98rem',
}

export default function AuthPage({ onAuthenticated }: AuthPageProps) {
  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setMessage(null)

    try {
      const payload =
        mode === 'register'
          ? await authApi.register({ email, password, full_name: fullName.trim() || undefined })
          : await authApi.login({ email, password })
      setMessage({
        tone: 'success',
        text: mode === 'register' ? 'Аккаунт создан. Входим в систему...' : 'Вход выполнен успешно.',
      })
      onAuthenticated(payload)
    } catch (error) {
      setMessage({
        tone: 'error',
        text: extractAuthErrorMessage(
          error,
          mode === 'register' ? 'Не удалось создать аккаунт.' : 'Не удалось войти.',
        ),
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div style={shellStyle}>
      <div style={{ maxWidth: '460px', margin: '0 auto' }}>
        <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--text)' }}>HelmGen</div>
        <div style={{ marginTop: '0.4rem', color: 'var(--text-muted)' }}>
          Войдите, чтобы генерировать, проверять и развёртывать Helm-чарты.
        </div>
      </div>

      <div style={cardStyle}>
        <div
          style={{
            display: 'inline-flex',
            gap: '0.25rem',
            padding: '0.25rem',
            borderRadius: '999px',
            border: '1px solid var(--border)',
            background: 'var(--panel-contrast)',
            marginBottom: '1rem',
          }}
        >
          {(['login', 'register'] as const).map(item => (
            <button
              key={item}
              type="button"
              onClick={() => {
                setMode(item)
                setMessage(null)
              }}
              style={{
                border: 'none',
                borderRadius: '999px',
                padding: '0.55rem 0.9rem',
                fontWeight: 700,
                cursor: 'pointer',
                background: mode === item ? 'var(--workspace-bg)' : 'transparent',
                color: mode === item ? 'var(--workspace-text)' : 'var(--text-soft)',
              }}
            >
              {item === 'login' ? 'Вход' : 'Регистрация'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.9rem' }}>
          {mode === 'register' && (
            <label style={{ display: 'grid', gap: '0.4rem' }}>
              <span style={{ color: 'var(--text-soft)', fontSize: '0.82rem', fontWeight: 700 }}>
                Имя
              </span>
              <input
                value={fullName}
                onChange={event => setFullName(event.target.value)}
                placeholder="Александр Жданов"
                style={inputStyle}
              />
            </label>
          )}

          <label style={{ display: 'grid', gap: '0.4rem' }}>
            <span style={{ color: 'var(--text-soft)', fontSize: '0.82rem', fontWeight: 700 }}>
              Email
            </span>
            <input
              type="email"
              value={email}
              onChange={event => setEmail(event.target.value)}
              placeholder="user@example.com"
              style={inputStyle}
              required
            />
          </label>

          <label style={{ display: 'grid', gap: '0.4rem' }}>
            <span style={{ color: 'var(--text-soft)', fontSize: '0.82rem', fontWeight: 700 }}>
              Пароль
            </span>
            <input
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              placeholder="Минимум 8 символов"
              style={inputStyle}
              minLength={8}
              required
            />
          </label>

          {message && (
            <div
              style={{
                borderRadius: '0.9rem',
                padding: '0.85rem 0.95rem',
                background:
                  message.tone === 'success'
                    ? 'rgba(34, 197, 94, 0.14)'
                    : 'rgba(239, 68, 68, 0.14)',
                border:
                  message.tone === 'success'
                    ? '1px solid rgba(34, 197, 94, 0.28)'
                    : '1px solid rgba(239, 68, 68, 0.28)',
                color: message.tone === 'success' ? '#16a34a' : '#dc2626',
              }}
            >
              {message.text}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              marginTop: '0.2rem',
              border: 'none',
              borderRadius: '0.9rem',
              padding: '0.95rem 1rem',
              fontWeight: 800,
              fontSize: '1rem',
              cursor: isSubmitting ? 'progress' : 'pointer',
              background: 'var(--accent-strong)',
              color: 'white',
              opacity: isSubmitting ? 0.7 : 1,
            }}
          >
            {isSubmitting
              ? mode === 'register'
                ? 'Создаём аккаунт...'
                : 'Входим...'
              : mode === 'register'
                ? 'Создать аккаунт'
                : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  )
}
