import { NextRequest, NextResponse } from 'next/server'
import { loadContext, getRelevantContext } from '@/lib/context'
import { saveConversation } from '@/lib/storage'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

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

    const context = await getRelevantContext(message, project)

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

    return NextResponse.json({ response, model, contextLoaded: true })

  } catch (error) {
    console.error('Chat error:', error)
    return NextResponse.json(
      { error: 'Failed to process message' },
      { status: 500 }
    )
  }
}
