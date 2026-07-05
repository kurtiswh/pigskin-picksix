/** Shared pill-tab switcher — the single tab style used across the app
 *  (Leaderboard, History, Records, Profile). Brown active pill on a cream track. */
export interface PillTab {
  key: string
  label: string
}

export function PillTabs({
  tabs,
  value,
  onChange,
  className = '',
}: {
  tabs: PillTab[]
  value: string
  onChange: (key: string) => void
  className?: string
}) {
  return (
    <div className={`inline-flex gap-1 bg-[#F8F7F3] border border-[#e7e2da] p-1 rounded-lg ${className}`}>
      {tabs.map(t => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-colors ${
            value === t.key ? 'bg-[#4B3621] text-white' : 'text-charcoal-600 hover:bg-[#efece5]'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

export default PillTabs
