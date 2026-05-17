'use client'

import { useState } from 'react'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { LeaderboardGrid } from '@/components/leaderboard-grid'
import { LeaderboardWidget } from '@/components/leaderboard-widget'
import { getLeaderboardData } from '@/lib/mock-data'
import { LeaderboardCategory } from '@/lib/types'

export default function HomePage() {
  const [category, setCategory] = useState<LeaderboardCategory>('overall')
  const leaderboardData = getLeaderboardData(category)
  const widgetData = getLeaderboardData('overall', 5)

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1">
        {/* Hero */}
        <section className="bg-primary text-primary-foreground py-16 md:py-24">
          <div className="max-w-7xl mx-auto px-4">
            <div className="max-w-3xl">
              <h1 className="font-[family-name:var(--font-bebas-neue)] text-5xl md:text-7xl tracking-wide mb-4">
                THE RANKINGS
              </h1>
              <p className="text-lg md:text-xl opacity-90 mb-6 text-balance">
                Track the top breakers in Greater Vancouver. Rankings updated after every battle and event in the Cypherspace community.
              </p>
              <div className="flex flex-wrap gap-4">
                <a 
                  href="#leaderboard" 
                  className="px-6 py-3 bg-primary-foreground text-primary font-bold text-sm uppercase tracking-wide hover:opacity-90 transition-opacity"
                >
                  View Rankings
                </a>
                <a 
                  href="/widget" 
                  className="px-6 py-3 border border-primary-foreground text-primary-foreground font-bold text-sm uppercase tracking-wide hover:bg-primary-foreground/10 transition-colors"
                >
                  Get Widget
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Stats Bar */}
        <section className="border-b border-border bg-secondary/50">
          <div className="max-w-7xl mx-auto px-4 py-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="text-center">
                <p className="font-mono text-3xl md:text-4xl font-bold">47</p>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Ranked Dancers</p>
              </div>
              <div className="text-center">
                <p className="font-mono text-3xl md:text-4xl font-bold">156</p>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Battles Tracked</p>
              </div>
              <div className="text-center">
                <p className="font-mono text-3xl md:text-4xl font-bold">12</p>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Events This Year</p>
              </div>
              <div className="text-center">
                <p className="font-mono text-3xl md:text-4xl font-bold">8</p>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Active Crews</p>
              </div>
            </div>
          </div>
        </section>

        {/* Main Leaderboard */}
        <section id="leaderboard" className="py-12 md:py-16">
          <div className="max-w-7xl mx-auto px-4">
            <LeaderboardGrid 
              data={leaderboardData} 
              onCategoryChange={setCategory}
              showCategoryTabs={true}
            />
          </div>
        </section>

        {/* Widget Preview Section */}
        <section className="py-12 md:py-16 bg-secondary/30 border-t border-border">
          <div className="max-w-7xl mx-auto px-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="font-[family-name:var(--font-bebas-neue)] text-4xl md:text-5xl tracking-wide mb-4">
                  EMBED ON YOUR SITE
                </h2>
                <p className="text-muted-foreground mb-6">
                  Add the Cypher Net leaderboard widget to your website. Perfect for event pages, 
                  crew sites, or anywhere you want to showcase the rankings.
                </p>
                <ul className="space-y-3 mb-8">
                  <li className="flex items-center gap-3">
                    <span className="w-6 h-6 bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">1</span>
                    <span className="text-sm">Customizable categories and display options</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="w-6 h-6 bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">2</span>
                    <span className="text-sm">Light and dark theme support</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="w-6 h-6 bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">3</span>
                    <span className="text-sm">Works with any website or Claude Code project</span>
                  </li>
                </ul>
                <a 
                  href="/widget" 
                  className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground font-bold text-sm uppercase tracking-wide hover:opacity-90 transition-opacity"
                >
                  Get Embed Code
                  <svg 
                    viewBox="0 0 24 24" 
                    className="w-4 h-4" 
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="2"
                  >
                    <path d="M5 12h14" />
                    <path d="m12 5 7 7-7 7" />
                  </svg>
                </a>
              </div>
              <div className="flex justify-center lg:justify-end">
                <LeaderboardWidget 
                  data={widgetData}
                  config={{ limit: 5, compact: true, showTrend: true }}
                />
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}
