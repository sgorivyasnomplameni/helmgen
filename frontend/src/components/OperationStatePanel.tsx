import type { ReactNode } from 'react'

export type OperationState = 'idle' | 'running' | 'success' | 'error'

interface Props {
  state: OperationState
  title: string
  message: string
  meta?: ReactNode
}

export default function OperationStatePanel({ state, title, message, meta }: Props) {
  return (
    <div className={`operation-panel operation-panel--${state}`}>
      <span aria-hidden="true" className="operation-panel__rail" />
      <div className="operation-panel__head">
        <div className="operation-panel__title-wrap">
          <span aria-hidden="true" className="operation-panel__dot" />
          <div className="operation-panel__title">
            {title}
          </div>
        </div>
        <div className="operation-panel__state">
          {state === 'idle' ? 'Ожидание' : state === 'running' ? 'В работе' : state === 'success' ? 'Готово' : 'Ошибка'}
        </div>
      </div>
      <div className="operation-panel__message">
        {message}
      </div>
      {meta ? (
        <div className="operation-panel__meta">
          {meta}
        </div>
      ) : null}
    </div>
  )
}
