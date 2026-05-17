'use client'

import { LeaderboardCard } from './leaderboard-card'
import { LeaderboardData, LeaderboardCategory, WidgetConfig } from '@/lib/types'

interface LeaderboardWidgetProps {
  data: LeaderboardData
  config?: WidgetConfig
  onViewAll?: () => void
}

export function LeaderboardWidget({ 
  data, 
  config = {},
  onViewAll 
}: LeaderboardWidgetProps) {
  const { 
    limit = 5, 
    showTrend = true, 
    showStats = false, 
    compact = true 
  } = config

  const displayEntries = data.entries.slice(0, limit)

  return (
    <div className="w-full max-w-sm bg-card border border-border">
      {/* Header */}
      <div className="p-4 border-b border-border bg-primary text-primary-foreground">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider opacity-80">Cypher Net</p>
            <h3 className="font-[family-name:var(--font-bebas-neue)] text-xl tracking-wide">
              {data.title}
            </h3>
          </div>
          <div className="w-8 h-8 bg-primary-foreground/10 flex items-center justify-center">
            <svg 
              viewBox="0 0 24 24" 
              className="w-5 h-5" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2"
            >
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
        </div>
      </div>

      {/* Rankings List */}
      <div className="p-3">
        {displayEntries.map((entry) => (
          <LeaderboardCard
            key={entry.dancer.id}
            entry={entry}
            showStats={showStats}
            showTrend={showTrend}
            compact={compact}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-border bg-secondary/30">
        <a
          href="https://cypher-net.vercel.app"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          View Full Leaderboard
          <svg 
            viewBox="0 0 24 24" 
            className="w-4 h-4" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2"
          >
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </a>
      </div>
    </div>
  )
}

// Standalone widget for embedding (includes data fetching)
export function EmbeddableWidget({ 
  category = 'overall',
  limit = 5,
  theme = 'auto'
}: { 
  category?: LeaderboardCategory
  limit?: number
  theme?: 'light' | 'dark' | 'auto'
}) {
  // In a real implementation, this would fetch from an API
  const mockData: LeaderboardData = {
    category,
    title: category === 'overall' ? 'Top Breakers' : 
           category === 'battles' ? 'Battle Champions' :
           category === 'monthly' ? 'Monthly Movers' :
           category === 'events' ? 'Event Leaders' : 'Community Stars',
    entries: [],
    lastUpdated: new Date().toISOString()
  }

  return (
    <div className={theme === 'dark' ? 'dark' : theme === 'light' ? '' : ''}>
      <LeaderboardWidget data={mockData} config={{ limit, compact: true }} />
    </div>
  )
}
