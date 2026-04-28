import type { AuditEvent } from '@/types/audit'

function formatDate(value: string): string {
  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function actionLabel(action: string): string {
  switch (action) {
    case 'auth.register':
      return 'Регистрация'
    case 'auth.login':
      return 'Вход'
    case 'chart.create':
      return 'Создание chart'
    case 'chart.update':
      return 'Обновление chart'
    case 'chart.delete':
      return 'Удаление chart'
    case 'chart.generate':
      return 'Генерация'
    case 'chart.validate':
      return 'Проверка'
    case 'chart.template':
      return 'Рендер'
    case 'chart.dry_run':
      return 'Dry-run'
    case 'chart.deploy':
      return 'Развёртывание'
    case 'chart.release_status':
      return 'Статус release'
    case 'chart.monitoring':
      return 'Мониторинг'
    case 'chart.rollback':
      return 'Rollback'
    case 'chart.uninstall':
      return 'Удаление release'
    default:
      return action
  }
}

interface AuditListProps {
  title: string
  events: AuditEvent[]
  emptyText: string
}

export default function AuditList({ title, events, emptyText }: AuditListProps) {
  return (
    <div
      style={{
        background: 'var(--panel)',
        borderRadius: '1rem',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow)',
        padding: '1rem',
      }}
    >
      <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text)', marginBottom: '0.9rem' }}>
        {title}
      </div>

      {events.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{emptyText}</div>
      ) : (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {events.map(event => (
            <div
              key={event.id}
              style={{
                border: '1px solid var(--border)',
                borderRadius: '0.85rem',
                padding: '0.85rem',
                background: 'var(--panel-muted)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.8rem', alignItems: 'center' }}>
                <div style={{ fontWeight: 700, color: 'var(--text)' }}>{actionLabel(event.action)}</div>
                <span
                  style={{
                    padding: '0.2rem 0.55rem',
                    borderRadius: '999px',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    background:
                      event.status === 'success'
                        ? 'var(--success-soft)'
                        : event.status === 'error'
                          ? 'var(--danger-soft)'
                          : 'var(--panel-contrast)',
                    color:
                      event.status === 'success'
                        ? 'var(--success)'
                        : event.status === 'error'
                          ? 'var(--danger)'
                          : 'var(--text-soft)',
                  }}
                >
                  {event.status === 'success' ? 'Успех' : event.status === 'error' ? 'Ошибка' : event.status}
                </span>
              </div>

              <div style={{ marginTop: '0.45rem', color: 'var(--text-soft)', fontSize: '0.88rem' }}>
                {event.summary}
              </div>
              <div style={{ marginTop: '0.45rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                {formatDate(event.created_at)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
