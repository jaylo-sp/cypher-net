import { getLeaderboardData } from '@/lib/mock-data'
import { LeaderboardCategory } from '@/lib/types'
import { LeaderboardWidget } from '@/components/leaderboard-widget'

interface EmbedPageProps {
  searchParams: Promise<{
    category?: string
    limit?: string
    theme?: string
  }>
}

export default async function EmbedPage({ searchParams }: EmbedPageProps) {
  const params = await searchParams
  const category = (params.category || 'overall') as LeaderboardCategory
  const limit = Math.min(Math.max(Number(params.limit) || 5, 3), 10)
  const theme = (params.theme || 'light') as 'light' | 'dark'

  const data = getLeaderboardData(category, limit)

  return (
    <div className={`min-h-screen p-4 ${theme === 'dark' ? 'dark bg-[#0a0a0a]' : 'bg-transparent'}`}>
      <LeaderboardWidget 
        data={data}
        config={{ limit, compact: true, showTrend: true, theme }}
      />
    </div>
  )
}

export const metadata = {
  title: 'Cypher Net Widget',
}
