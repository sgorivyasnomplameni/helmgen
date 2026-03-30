interface Props {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}

export default function ToggleSwitch({ checked, onChange, label }: Props) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.625rem',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
      }}
    >
      <div
        style={{
          width: '44px',
          height: '24px',
          borderRadius: '12px',
          background: checked ? 'var(--accent)' : 'var(--border-strong)',
          position: 'relative',
          transition: 'background 0.2s',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '2px',
            left: checked ? '22px' : '2px',
            width: '20px',
            height: '20px',
            borderRadius: '50%',
            background: 'var(--panel-strong)',
            transition: 'left 0.2s',
            boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
          }}
        />
      </div>
      <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text)' }}>{label}</span>
    </button>
  )
}
