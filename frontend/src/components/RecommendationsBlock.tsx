import type { ChartConfig } from '@/types/generator'

interface Props {
  config: ChartConfig
}

function getTips(c: ChartConfig): string[] {
  const tips: string[] = []

  if (c.workloadType === 'DaemonSet') {
    tips.push('DaemonSet разворачивается автоматически на каждой ноде — настройка числа реплик недоступна.')
  }
  if (c.workloadType === 'StatefulSet') {
    tips.push('StatefulSet создаёт стабильные сетевые идентификаторы и PVC для каждого пода. Добавьте volumeClaimTemplates в values.yaml.')
  }
  if (c.service.enabled && c.service.type === 'LoadBalancer') {
    tips.push('LoadBalancer создаёт внешний балансировщик. Требует поддержки облачного провайдера (AWS ELB, GCP LB, Azure LB).')
  }
  if (c.service.enabled && c.service.type === 'NodePort') {
    tips.push('NodePort открывает порт на всех нодах кластера (диапазон 30000–32767).')
  }
  if (c.ingress.enabled) {
    tips.push('Ingress требует установленного Ingress Controller в кластере (например, ingress-nginx или Traefik).')
  }
  if (c.resources.enabled) {
    tips.push('Resource limits помогают планировщику эффективно размещать поды и предотвращают resource starvation.')
  }
  if (tips.length === 0) {
    tips.push('Deployment — оптимальный выбор для stateless сервисов. Поддерживает RollingUpdate стратегию и автоматический rollback.')
  }

  return tips
}

export default function RecommendationsBlock({ config }: Props) {
  const tips = getTips(config)

  return (
    <div
      style={{
        background: '#eff6ff',
        border: '1px solid #bfdbfe',
        borderRadius: '0.75rem',
        padding: '1.25rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="#3b82f6">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
        </svg>
        <span style={{ fontWeight: 700, fontSize: '0.875rem', color: '#1d4ed8' }}>
          Рекомендации системы
        </span>
      </div>
      <ul style={{ margin: 0, paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {tips.map((tip, i) => (
          <li key={i} style={{ fontSize: '0.82rem', color: '#1e40af', lineHeight: 1.5 }}>
            {tip}
          </li>
        ))}
      </ul>
    </div>
  )
}
