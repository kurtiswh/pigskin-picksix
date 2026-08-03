import { useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '@/components/Layout'
import ChampionsTab from '@/components/ChampionsTab'
import RecordsTab from '@/components/RecordsTab'
import { PillTabs } from '@/components/ui/PillTabs'
import { useAuth } from '@/hooks/useAuth'

/** Combined History page: Champions (Hall of Champions) + Records (all-time stats). */
export default function HistoryPage({ initialTab = 'champions' }: { initialTab?: 'champions' | 'records' }) {
  const [tab, setTab] = useState<'champions' | 'records'>(initialTab)
  const { user } = useAuth()

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-[#4B3621] mb-4">History</h1>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <PillTabs
            tabs={[{ key: 'champions', label: 'Champions' }, { key: 'records', label: 'Records' }]}
            value={tab}
            onChange={(k) => setTab(k as 'champions' | 'records')}
          />
          {user && (
            <Link
              to="/profile?tab=stats"
              className="text-sm font-semibold text-[#4B3621] underline decoration-[#C9A04E] underline-offset-4 hover:text-pigskin-700"
            >
              Your career stats →
            </Link>
          )}
        </div>
        {tab === 'champions' ? <ChampionsTab /> : <RecordsTab />}
      </div>
    </Layout>
  )
}
