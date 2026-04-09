import { NextRequest, NextResponse } from 'next/server'
import { getContextSummary } from '@/lib/context'

export async function GET(request: NextRequest) {
  const project = request.nextUrl.searchParams.get('project') || ''
  const files = await getContextSummary(project)
  return NextResponse.json({ files })
}
