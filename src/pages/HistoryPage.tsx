import { useState } from 'react'
import Layout from '@/components/Layout'
import ChampionsTab from '@/components/ChampionsTab'
import RecordsTab from '@/components/RecordsTab'
import { PillTabs } from '@/components/ui/PillTabs'

/** Combined History page: Champions (Hall of Champions) + Records (all-time stats). */
export default function HistoryPage({ initialTab = 'champions' }: { initialTab?: 'champions' | 'records' }) {
  const [tab, setTab] = useState<'champions' | 'records'>(initialTab)

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-[#4B3621] mb-4">History</h1>
        <div className="mb-6">
          <PillTabs
            tabs={[{ key: 'champions', label: 'Champions' }, { key: 'records', label: 'Records' }]}
            value={tab}
            onChange={(k) => setTab(k as 'champions' | 'records')}
          />
        </div>
        {tab === 'champions' ? <ChampionsTab /> : <RecordsTab />}
      </div>
    </Layout>
  )
}
