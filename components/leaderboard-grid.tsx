'use client'

import { useState } from 'react'
import { LeaderboardCard } from './leaderboard-card'
import { LeaderboardData, LeaderboardCategory } from '@/lib/types'

interface LeaderboardGridProps {
  data: LeaderboardData
  onCategoryChange?: (category: LeaderboardCategory) => void
  showCategoryTabs?: boolean
}

const categories: { value: LeaderboardCategory; label: string }[] = [
  { value: 'overall', label: 'Overall' },
  { value: 'battles', label: 'Battles' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'events', label: 'Events' },
  { value: 'community', label: 'Community' },
]

export function LeaderboardGrid({ 
  data, 
  onCategoryChange, 
  showCategoryTabs = true 
}: LeaderboardGridProps) {
  const [selectedCategory, setSelectedCategory] = useState<LeaderboardCategory>(data.category)

  const handleCategoryChange = (category: LeaderboardCategory) => {
    setSelectedCategory(category)
    onCategoryChange?.(category)
  }

  return (
    <div className="w-full">
      {/* Category Tabs */}
      {showCategoryTabs && (
        <div className="flex flex-wrap gap-2 mb-8 border-b border-border pb-4">
          {categories.map((cat) => (
            <button
              key={cat.value}
              onClick={() => handleCategoryChange(cat.value)}
              className={`px-4 py-2 text-sm font-bold uppercase tracking-wide transition-colors ${
                selectedCategory === cat.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      )}

      {/* Title */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-[family-name:var(--font-bebas-neue)] text-3xl md:text-4xl tracking-wide">
          {data.title}
        </h2>
        <p className="text-xs text-muted-foreground">
          Updated {new Date(data.lastUpdated).toLocaleDateString()}
        </p>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {data.entries.map((entry) => (
          <LeaderboardCard
            key={entry.dancer.id}
            entry={entry}
            showStats={true}
            showTrend={true}
          />
        ))}
      </div>
    </div>
  )
}
