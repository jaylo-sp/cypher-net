import { LeaderboardData, RankingEntry, LeaderboardCategory } from './types'

// Mock dancer data for demonstration
const mockDancers: RankingEntry[] = [
  {
    rank: 1,
    dancer: {
      id: '1',
      name: 'Victor "Victorious" Chen',
      alias: 'Victorious',
      crew: 'Soul City Breakers',
      city: 'Vancouver',
      country: 'Canada'
    },
    points: 2450,
    wins: 28,
    losses: 4,
    battles: 32,
    trend: 'stable',
    lastEvent: 'Hit The Breaks Vol. 2',
    lastEventDate: '2026-03-15'
  },
  {
    rank: 2,
    dancer: {
      id: '2',
      name: 'Maya "Flow" Rodriguez',
      alias: 'Flow',
      crew: 'East Van Rockers',
      city: 'Vancouver',
      country: 'Canada'
    },
    points: 2280,
    wins: 24,
    losses: 6,
    battles: 30,
    trend: 'up',
    trendValue: 2,
    lastEvent: 'Spring Cypher',
    lastEventDate: '2026-04-20'
  },
  {
    rank: 3,
    dancer: {
      id: '3',
      name: 'Derek "D-Style" Kim',
      alias: 'D-Style',
      crew: 'Burnaby Breakers',
      city: 'Burnaby',
      country: 'Canada'
    },
    points: 2150,
    wins: 22,
    losses: 8,
    battles: 30,
    trend: 'up',
    trendValue: 1,
    lastEvent: 'Hit The Breaks Vol. 2',
    lastEventDate: '2026-03-15'
  },
  {
    rank: 4,
    dancer: {
      id: '4',
      name: 'Jasmine "Jazz" Nguyen',
      alias: 'Jazz',
      crew: 'Soul City Breakers',
      city: 'Richmond',
      country: 'Canada'
    },
    points: 1980,
    wins: 20,
    losses: 7,
    battles: 27,
    trend: 'down',
    trendValue: 1,
    lastEvent: 'West Coast Clash',
    lastEventDate: '2026-02-28'
  },
  {
    rank: 5,
    dancer: {
      id: '5',
      name: 'Marcus "The Machine" Williams',
      alias: 'The Machine',
      crew: 'Surrey Movement',
      city: 'Surrey',
      country: 'Canada'
    },
    points: 1850,
    wins: 18,
    losses: 9,
    battles: 27,
    trend: 'up',
    trendValue: 3,
    lastEvent: 'Spring Cypher',
    lastEventDate: '2026-04-20'
  },
  {
    rank: 6,
    dancer: {
      id: '6',
      name: 'Sofia "Spin" Garcia',
      alias: 'Spin',
      crew: 'East Van Rockers',
      city: 'Vancouver',
      country: 'Canada'
    },
    points: 1720,
    wins: 16,
    losses: 10,
    battles: 26,
    trend: 'stable',
    lastEvent: 'Hit The Breaks Vol. 2',
    lastEventDate: '2026-03-15'
  },
  {
    rank: 7,
    dancer: {
      id: '7',
      name: 'Andre "Air" Thompson',
      alias: 'Air',
      crew: 'Burnaby Breakers',
      city: 'Burnaby',
      country: 'Canada'
    },
    points: 1650,
    wins: 15,
    losses: 11,
    battles: 26,
    trend: 'down',
    trendValue: 2,
    lastEvent: 'West Coast Clash',
    lastEventDate: '2026-02-28'
  },
  {
    rank: 8,
    dancer: {
      id: '8',
      name: 'Emily "Echo" Lee',
      alias: 'Echo',
      crew: 'New West Crew',
      city: 'New Westminster',
      country: 'Canada'
    },
    points: 1580,
    wins: 14,
    losses: 10,
    battles: 24,
    trend: 'up',
    trendValue: 1,
    lastEvent: 'Spring Cypher',
    lastEventDate: '2026-04-20'
  },
  {
    rank: 9,
    dancer: {
      id: '9',
      name: 'James "Jet" Park',
      alias: 'Jet',
      crew: 'Soul City Breakers',
      city: 'Vancouver',
      country: 'Canada'
    },
    points: 1490,
    wins: 13,
    losses: 11,
    battles: 24,
    trend: 'stable',
    lastEvent: 'Hit The Breaks Vol. 2',
    lastEventDate: '2026-03-15'
  },
  {
    rank: 10,
    dancer: {
      id: '10',
      name: 'Nina "Nova" Patel',
      alias: 'Nova',
      crew: 'Surrey Movement',
      city: 'Surrey',
      country: 'Canada'
    },
    points: 1420,
    wins: 12,
    losses: 10,
    battles: 22,
    trend: 'up',
    trendValue: 2,
    lastEvent: 'Spring Cypher',
    lastEventDate: '2026-04-20'
  }
]

export function getLeaderboardData(
  category: LeaderboardCategory = 'overall',
  limit?: number
): LeaderboardData {
  const titles: Record<LeaderboardCategory, string> = {
    overall: 'Overall Rankings',
    battles: 'Battle Champions',
    events: 'Event Leaders',
    community: 'Community Contributors',
    monthly: 'Monthly Movers'
  }

  let entries = [...mockDancers]
  
  // Sort differently based on category
  if (category === 'battles') {
    entries.sort((a, b) => b.wins - a.wins)
    entries = entries.map((e, i) => ({ ...e, rank: i + 1 }))
  } else if (category === 'monthly') {
    entries.sort((a, b) => (b.trendValue || 0) - (a.trendValue || 0))
    entries = entries.map((e, i) => ({ ...e, rank: i + 1 }))
  }

  if (limit) {
    entries = entries.slice(0, limit)
  }

  return {
    category,
    title: titles[category],
    entries,
    lastUpdated: new Date().toISOString()
  }
}

export { mockDancers }
