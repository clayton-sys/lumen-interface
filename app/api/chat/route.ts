import { NextRequest, NextResponse } from 'next/server'
import { loadContext, getRelevantContext } from '@/lib/context'
import { saveConversation } from '@/lib/storage'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

// Lumen Memory API — long-running FastAPI service that owns the mem0 instance.
// Started by start_lumen.bat. See C:\Users\17192\memory_api.py.
const MEMORY_API_BASE = process.env.MEMORY_API_BASE || 'http://127.0.0.1:8765'
const MEMORY_USER_ID = 'clayton'

type Mem0Memory = { id: string; memory: string; score?: number }

async function getRelevantMemories(query: string): Promise<string> {
  try {
    const res = await fetch(`${MEMORY_API_BASE}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, user_id: MEMORY_USER_ID, limit: 5 }),
      cache: 'no-store',
    })
    if (!res.ok) return ''
    const data = await res.json()
    const memories: Mem0Memory[] = data?.memories ?? []
    if (memories.length === 0) return ''
    return memories.map(m => `- ${m.memory}`).join('\n')
  } catch {
    return ''
  }
}

async function extractAndStoreConversation(
  userMessage: string,
  assistantResponse: string
): Promise<void> {
  try {
    await fetch(`${MEMORY_API_BASE}/add_conversation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'user', content: userMessage },
          { role: 'assistant', content: assistantResponse },
        ],
        user_id: MEMORY_USER_ID,
      }),
      cache: 'no-store',
    })
  } catch {
    // Silent fail — memory extraction is best-effort, not on the critical path.
  }
}

async function callLumen(prompt: string, modelName: string = 'llama3.1'): Promise<string> {
  const response = await fetch('http://localhost:11434/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modelName,
      prompt,
      stream: false
    })
  })
  const data = await response.json()
  return data.response || 'No response from Lumen'
}

async function callClaude(prompt: string): Promise<string> {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }]
  })
  return message.content[0].type === 'text'
    ? message.content[0].text
    : ''
}

export async function POST(request: NextRequest) {
  try {
    const {
      message,
      model = 'lumen',
      localModel = 'llama3.1',
      sessionId,
      project = '',
      history = []
    } = await request.json()

    const [context, memories] = await Promise.all([
      getRelevantContext(message, project),
      getRelevantMemories(message),
    ])

    const historyText = history
      .slice(-8)
      .map((m: { role: string; content: string }) =>
        `${m.role === 'user' ? 'Clayton' : 'Lumen'}: ${m.content}`
      )
      .join('\n\n')

    const fullPrompt = `IDENTITY — READ FIRST, NEVER CONTRADICT:
You are Lumen.
You run on ${localModel} via Ollama at localhost:11434.
You are NOT "Signal Engine". NOT "CAIA Vision Model". NOT proprietary.
Signal Engine and CAIA are PRODUCT NAMES in Clayton's business — not you.
If asked what model you are say: "I am Lumen, running on ${localModel} locally."

YOUR ROLE:
You are Clayton Gonzales' local AI partner at Collective Plasticity.
You handle daily operations, memory, drafting, and organization.
Claude handles complex strategy. You handle execution.
Be direct, specific, and warm. Never invent facts.

PERSISTENT MEMORY (atomic facts from prior sessions, via mem0):
${memories || '(no relevant memories found)'}

CONTEXT FROM OBSIDIAN VAULT:
${context}

${historyText ? `CONVERSATION HISTORY:\n${historyText}\n\n` : ''}USER: ${message}

LUMEN:`

    let response: string

    if (model === 'lumen') {
      response = await callLumen(fullPrompt, localModel)
    } else {
      response = await callClaude(fullPrompt)
    }

    const allMessages = [
      ...history,
      { role: 'user', content: message, model, timestamp: new Date().toISOString() },
      { role: 'assistant', content: response, model, timestamp: new Date().toISOString() }
    ]
    await saveConversation(sessionId || Date.now().toString(), allMessages, project)

    // Fire-and-forget memory extraction. Do not block the response on this.
    void extractAndStoreConversation(message, response)

    return NextResponse.json({ response, model, contextLoaded: true })

  } catch (error) {
    console.error('Chat error:', error)
    return NextResponse.json(
      { error: 'Failed to process message' },
      { status: 500 }
    )
  }
}