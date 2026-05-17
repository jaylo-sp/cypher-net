import { NextRequest, NextResponse } from 'next/server'
import { getLeaderboardData } from '@/lib/mock-data'
import { LeaderboardCategory } from '@/lib/types'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  
  const category = (searchParams.get('category') || 'overall') as LeaderboardCategory
  const limitParam = searchParams.get('limit')
  const limit = limitParam ? Math.min(Math.max(Number(limitParam), 1), 50) : undefined

  try {
    const data = getLeaderboardData(category, limit)
    
    return NextResponse.json(data, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    })
  } catch {
    return NextResponse.json(
      { error: 'Failed to fetch leaderboard data' },
      { status: 500 }
    )
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
