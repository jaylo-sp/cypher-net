'use client'

import { RankingEntry } from '@/lib/types'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface LeaderboardCardProps {
  entry: RankingEntry
  showStats?: boolean
  showTrend?: boolean
  compact?: boolean
}

export function LeaderboardCard({ 
  entry, 
  showStats = true, 
  showTrend = true,
  compact = false 
}: LeaderboardCardProps) {
  const { rank, dancer, points, wins, losses, battles, trend, trendValue } = entry

  const getRankStyle = (rank: number) => {
    if (rank === 1) return 'bg-gold text-black'
    if (rank === 2) return 'bg-silver text-black'
    if (rank === 3) return 'bg-bronze text-white'
    return 'bg-secondary text-foreground'
  }

  const getTrendIcon = () => {
    if (trend === 'up') {
      return <TrendingUp className="w-4 h-4 text-green-500" />
    }
    if (trend === 'down') {
      return <TrendingDown className="w-4 h-4 text-red-500" />
    }
    return <Minus className="w-4 h-4 text-muted-foreground" />
  }

  const getInitials = (name: string) => {
    return name.split(' ')
      .filter(part => !part.startsWith('"') && !part.endsWith('"'))
      .map(part => part[0])
      .slice(0, 2)
      .join('')
      .toUpperCase()
  }

  if (compact) {
    return (
      <div className="flex items-center gap-3 py-2 border-b border-border last:border-0">
        <span className={`w-6 h-6 flex items-center justify-center text-xs font-bold ${getRankStyle(rank)}`}>
          {rank}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{dancer.alias || dancer.name}</p>
          {dancer.crew && (
            <p className="text-xs text-muted-foreground truncate">{dancer.crew}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {showTrend && getTrendIcon()}
          <span className="text-sm font-mono font-bold">{points.toLocaleString()}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="group relative border border-border bg-card hover:bg-secondary/50 transition-colors">
      {/* Rank Badge */}
      <div className="absolute -top-3 left-4">
        <span className={`px-3 py-1 text-sm font-bold ${getRankStyle(rank)}`}>
          #{rank}
        </span>
      </div>

      <div className="pt-6 pb-4 px-4">
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className="w-14 h-14 bg-primary text-primary-foreground flex items-center justify-center text-lg font-bold shrink-0">
            {getInitials(dancer.name)}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-bold text-lg truncate">
                {dancer.alias || dancer.name.split(' ')[0]}
              </h3>
              {showTrend && (
                <div className="flex items-center gap-1">
                  {getTrendIcon()}
                  {trendValue && (
                    <span className={`text-xs font-mono ${
                      trend === 'up' ? 'text-green-500' : 
                      trend === 'down' ? 'text-red-500' : 'text-muted-foreground'
                    }`}>
                      {trend === 'up' ? '+' : trend === 'down' ? '-' : ''}{trendValue}
                    </span>
                  )}
                </div>
              )}
            </div>
            
            {dancer.crew && (
              <p className="text-sm text-muted-foreground mb-2">{dancer.crew}</p>
            )}

            {/* Points */}
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-mono font-bold">{points.toLocaleString()}</span>
              <span className="text-xs text-muted-foreground uppercase tracking-wide">pts</span>
            </div>
          </div>
        </div>

        {/* Stats */}
        {showStats && (
          <div className="mt-4 pt-3 border-t border-border grid grid-cols-3 gap-2">
            <div className="text-center">
              <p className="text-xl font-mono font-bold text-green-600">{wins}</p>
              <p className="text-xs text-muted-foreground uppercase">Wins</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-mono font-bold text-red-500">{losses}</p>
              <p className="text-xs text-muted-foreground uppercase">Losses</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-mono font-bold">{battles}</p>
              <p className="text-xs text-muted-foreground uppercase">Battles</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
