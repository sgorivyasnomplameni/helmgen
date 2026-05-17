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
      className={checked ? 'toggle-switch is-checked' : 'toggle-switch'}
      aria-pressed={checked}
    >
      <div className="toggle-switch__track">
        <div className="toggle-switch__thumb" />
      </div>
      <span className="toggle-switch__label">{label}</span>
    </button>
  )
}
