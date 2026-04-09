import { NextRequest, NextResponse } from 'next/server'
import { QdrantClient } from '@qdrant/js-client-rest'

const COLLECTION = 'lumen_memory'
const client = new QdrantClient({ host: 'localhost', port: 6333 })

async function embedText(text: string): Promise<number[]> {
  const response = await fetch('http://localhost:11434/api/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'nomic-embed-text',
      prompt: text
    })
  })
  const data = await response.json()
  return data.embedding
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q') || ''

  if (!query) {
    return NextResponse.json({ context: '', error: 'No query' })
  }

  try {
    const embedding = await embedText(query)

    const results = await client.search(COLLECTION, {
      vector: embedding,
      limit: 5,
      with_payload: true
    })

    if (!results || results.length === 0) {
      return NextResponse.json({
        context: '',
        message: 'No results found'
      })
    }

    const context = results
      .map(r => `[${r.payload?.source}]\n${r.payload?.text}`)
      .join('\n\n---\n\n')

    return NextResponse.json({
      context,
      chunks: results.length,
      scores: results.map(r => r.score)
    })

  } catch (error) {
    console.error('Memory search error:', error)
    return NextResponse.json({
      context: '',
      error: String(error)
    })
  }
}
