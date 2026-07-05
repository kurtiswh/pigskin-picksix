import { useState } from 'react'
import Layout from '@/components/Layout'
import ChampionsTab from '@/components/ChampionsTab'
import RecordsTab from '@/components/RecordsTab'

/** Combined History page: Champions (Hall of Champions) + Records (all-time stats). */
export default function HistoryPage({ initialTab = 'champions' }: { initialTab?: 'champions' | 'records' }) {
  const [tab, setTab] = useState<'champions' | 'records'>(initialTab)

  const tabBtn = (key: 'champions' | 'records', label: string) => (
    <button
      onClick={() => setTab(key)}
      className={`px-5 py-2 rounded-md text-sm font-semibold transition-colors ${
        tab === key ? 'bg-[#4B3621] text-white' : 'text-charcoal-600 hover:bg-[#efece5]'
      }`}
    >
      {label}
    </button>
  )

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-[#4B3621] mb-4">History</h1>
        <div className="inline-flex gap-1 bg-[#F8F7F3] p-1 rounded-lg mb-6">
          {tabBtn('champions', 'Champions')}
          {tabBtn('records', 'Records')}
        </div>
        {tab === 'champions' ? <ChampionsTab /> : <RecordsTab />}
      </div>
    </Layout>
  )
}
