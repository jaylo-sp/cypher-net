// Cypher Net Types

export type LeaderboardCategory = 
  | 'overall' 
  | 'battles' 
  | 'events' 
  | 'community'
  | 'monthly'

export interface Dancer {
  id: string
  name: string
  alias?: string
  crew?: string
  avatar?: string
  city?: string
  country?: string
}

export interface RankingEntry {
  rank: number
  dancer: Dancer
  points: number
  wins: number
  losses: number
  battles: number
  trend: 'up' | 'down' | 'stable'
  trendValue?: number
  lastEvent?: string
  lastEventDate?: string
}

export interface LeaderboardData {
  category: LeaderboardCategory
  title: string
  entries: RankingEntry[]
  lastUpdated: string
}

export interface WidgetConfig {
  category?: LeaderboardCategory
  limit?: number
  showTrend?: boolean
  showStats?: boolean
  theme?: 'light' | 'dark' | 'auto'
  compact?: boolean
}
