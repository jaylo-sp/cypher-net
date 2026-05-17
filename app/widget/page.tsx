'use client'

import { useState } from 'react'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { LeaderboardWidget } from '@/components/leaderboard-widget'
import { getLeaderboardData } from '@/lib/mock-data'
import { LeaderboardCategory } from '@/lib/types'

const categories: { value: LeaderboardCategory; label: string }[] = [
  { value: 'overall', label: 'Overall Rankings' },
  { value: 'battles', label: 'Battle Champions' },
  { value: 'monthly', label: 'Monthly Movers' },
  { value: 'events', label: 'Event Leaders' },
  { value: 'community', label: 'Community Stars' },
]

export default function WidgetPage() {
  const [category, setCategory] = useState<LeaderboardCategory>('overall')
  const [limit, setLimit] = useState(5)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [copied, setCopied] = useState(false)

  const widgetData = getLeaderboardData(category, limit)

  // Generate embed code
  const iframeCode = `<iframe
  src="https://cypher-net.vercel.app/embed?category=${category}&limit=${limit}&theme=${theme}"
  width="380"
  height="${limit * 60 + 140}"
  frameborder="0"
  style="border: none; max-width: 100%;"
  title="Cypher Net Leaderboard"
></iframe>`

  // Generate script embed code (for more flexibility)
  const scriptCode = `<!-- Cypher Net Widget -->
<div id="cypher-net-widget" data-category="${category}" data-limit="${limit}" data-theme="${theme}"></div>
<script src="https://cypher-net.vercel.app/widget.js" async></script>`

  // React component code for Claude Code integration
  const reactCode = `// Install: npm install @cypher-net/widget
// Or copy this component directly

import { useEffect, useState } from 'react';

interface RankingEntry {
  rank: number;
  name: string;
  alias: string;
  crew: string;
  points: number;
  trend: 'up' | 'down' | 'stable';
}

export function CypherNetWidget({ 
  category = '${category}', 
  limit = ${limit}, 
  theme = '${theme}' 
}) {
  const [data, setData] = useState<RankingEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(\`https://cypher-net.vercel.app/api/leaderboard?category=\${category}&limit=\${limit}\`)
      .then(res => res.json())
      .then(data => {
        setData(data.entries);
        setLoading(false);
      });
  }, [category, limit]);

  if (loading) return <div>Loading...</div>;

  return (
    <div className={\`cypher-widget \${theme}\`}>
      <div className="widget-header">
        <span className="widget-brand">Cypher Net</span>
        <span className="widget-title">Top Breakers</span>
      </div>
      <div className="widget-list">
        {data.map((entry) => (
          <div key={entry.rank} className="widget-entry">
            <span className="rank">#{entry.rank}</span>
            <div className="info">
              <span className="name">{entry.alias}</span>
              <span className="crew">{entry.crew}</span>
            </div>
            <span className="points">{entry.points}</span>
          </div>
        ))}
      </div>
      <a href="https://cypher-net.vercel.app" className="widget-footer">
        View Full Leaderboard
      </a>
    </div>
  );
}`

  const copyToClipboard = (code: string) => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1">
        {/* Hero */}
        <section className="bg-primary text-primary-foreground py-12 md:py-16">
          <div className="max-w-7xl mx-auto px-4">
            <h1 className="font-[family-name:var(--font-bebas-neue)] text-4xl md:text-6xl tracking-wide mb-4">
              EMBED WIDGET
            </h1>
            <p className="text-lg opacity-90 max-w-2xl">
              Add Cypher Net rankings to your website or project. Works with any site, 
              including Cypherspace and Claude Code projects.
            </p>
          </div>
        </section>

        {/* Configurator */}
        <section className="py-12">
          <div className="max-w-7xl mx-auto px-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              {/* Options */}
              <div>
                <h2 className="font-bold text-xl mb-6">Configure Widget</h2>
                
                <div className="space-y-6">
                  {/* Category */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Category</label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value as LeaderboardCategory)}
                      className="w-full px-4 py-3 border border-border bg-background text-foreground"
                    >
                      {categories.map((cat) => (
                        <option key={cat.value} value={cat.value}>
                          {cat.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Limit */}
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Number of entries: {limit}
                    </label>
                    <input
                      type="range"
                      min="3"
                      max="10"
                      value={limit}
                      onChange={(e) => setLimit(Number(e.target.value))}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>3</span>
                      <span>10</span>
                    </div>
                  </div>

                  {/* Theme */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Theme</label>
                    <div className="flex gap-4">
                      <button
                        onClick={() => setTheme('light')}
                        className={`flex-1 px-4 py-3 border transition-colors ${
                          theme === 'light'
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border hover:bg-secondary'
                        }`}
                      >
                        Light
                      </button>
                      <button
                        onClick={() => setTheme('dark')}
                        className={`flex-1 px-4 py-3 border transition-colors ${
                          theme === 'dark'
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border hover:bg-secondary'
                        }`}
                      >
                        Dark
                      </button>
                    </div>
                  </div>
                </div>

                {/* Embed Codes */}
                <div className="mt-8 space-y-6">
                  {/* iframe */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium">iframe Embed</label>
                      <button
                        onClick={() => copyToClipboard(iframeCode)}
                        className="text-xs text-accent hover:underline"
                      >
                        {copied ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    <pre className="p-4 bg-secondary text-xs overflow-x-auto border border-border">
                      <code>{iframeCode}</code>
                    </pre>
                  </div>

                  {/* Script */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium">Script Embed</label>
                      <button
                        onClick={() => copyToClipboard(scriptCode)}
                        className="text-xs text-accent hover:underline"
                      >
                        {copied ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    <pre className="p-4 bg-secondary text-xs overflow-x-auto border border-border">
                      <code>{scriptCode}</code>
                    </pre>
                  </div>

                  {/* React/Claude Code */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium">React Component (Claude Code)</label>
                      <button
                        onClick={() => copyToClipboard(reactCode)}
                        className="text-xs text-accent hover:underline"
                      >
                        {copied ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    <pre className="p-4 bg-secondary text-xs overflow-x-auto border border-border max-h-64">
                      <code>{reactCode}</code>
                    </pre>
                  </div>
                </div>
              </div>

              {/* Preview */}
              <div>
                <h2 className="font-bold text-xl mb-6">Preview</h2>
                <div className={`p-8 border border-border ${theme === 'dark' ? 'bg-[#0a0a0a]' : 'bg-white'}`}>
                  <div className={theme === 'dark' ? 'dark' : ''}>
                    <LeaderboardWidget 
                      data={widgetData}
                      config={{ limit, compact: true, showTrend: true, theme }}
                    />
                  </div>
                </div>

                {/* Usage Notes */}
                <div className="mt-8 p-6 bg-secondary/50 border border-border">
                  <h3 className="font-bold mb-4">Usage Notes</h3>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <span className="text-accent mt-1">*</span>
                      <span>The iframe embed works on any website including Wix, Squarespace, and WordPress.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-accent mt-1">*</span>
                      <span>Use the React component for Next.js, Vite, or Claude Code projects.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-accent mt-1">*</span>
                      <span>The widget auto-updates when new rankings are available.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-accent mt-1">*</span>
                      <span>For Cypherspace integration, use the iframe on any page.</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}
