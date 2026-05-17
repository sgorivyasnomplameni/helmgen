import type { WorkloadType } from '@/types/generator'

interface Props {
  type: WorkloadType
  selected: boolean
  onSelect: () => void
}

const ICONS: Record<WorkloadType, JSX.Element> = {
  Deployment: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="2" y="7" width="20" height="5" rx="1" />
      <rect x="2" y="14" width="20" height="5" rx="1" />
      <rect x="2" y="2" width="20" height="3" rx="1" />
    </svg>
  ),
  StatefulSet: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5v5c0 1.657 4.03 3 9 3s9-1.343 9-3V5" />
      <path d="M3 10v5c0 1.657 4.03 3 9 3s9-1.343 9-3v-5" />
      <path d="M3 15v4c0 1.657 4.03 3 9 3s9-1.343 9-3v-4" />
    </svg>
  ),
  DaemonSet: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
}

const DESCRIPTIONS: Record<WorkloadType, string> = {
  Deployment: 'Для приложений без состояния. Плавные обновления и откат.',
  StatefulSet: 'Для stateful-приложений. Стабильные идентификаторы.',
  DaemonSet: 'Запускается на каждой ноде кластера.',
}

export default function WorkloadCard({ type, selected, onSelect }: Props) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={selected ? 'workload-card is-selected' : 'workload-card'}
    >
      <div className="workload-card__icon">{ICONS[type]}</div>
      <span className="workload-card__title">
        {type}
      </span>
      <span className="workload-card__description">
        {DESCRIPTIONS[type]}
      </span>
    </button>
  )
}
