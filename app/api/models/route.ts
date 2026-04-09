import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const response = await fetch('http://localhost:11434/api/tags')
    const data = await response.json()
    return NextResponse.json({ models: data.models || [] })
  } catch {
    return NextResponse.json({ models: [] })
  }
}
