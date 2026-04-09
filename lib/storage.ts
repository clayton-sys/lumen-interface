import fs from 'fs/promises'
import path from 'path'

const VAULT = 'C:/Users/17192/Desktop/Obsidian Vault/ChiefOfStaff-Vault'
const ARCHIVE = `${VAULT}/_archive/lumen-conversations`

type Message = {
  role: 'user' | 'assistant'
  content: string
  model: string
  timestamp: string
}

export async function saveConversation(
  sessionId: string,
  messages: Message[],
  project: string = 'global'
) {
  await fs.mkdir(ARCHIVE, { recursive: true })

  const today = new Date().toISOString().split('T')[0]
  const time = new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).replace(':', '')

  const conversation = messages
    .map(m => `**${m.role === 'user' ? 'You' : 'Lumen'}:** ${m.content}`)
    .join('\n\n')

  const content = `# Lumen Session — ${today} ${time}
Project: ${project}
Model: ${messages[messages.length - 1]?.model || 'llama3.1'}
Messages: ${messages.length}

---

${conversation}
`

  const filename = `${today}-${time}-${sessionId}.md`
  await fs.writeFile(path.join(ARCHIVE, filename), content, 'utf8')
}

export async function searchArchive(limit = 3): Promise<string> {
  try {
    const files = await fs.readdir(ARCHIVE)
    const recent = files
      .filter(f => f.endsWith('.md'))
      .sort()
      .reverse()
      .slice(0, limit)

    const contents = await Promise.all(
      recent.map(f =>
        fs.readFile(path.join(ARCHIVE, f), 'utf8').catch(() => '')
      )
    )
    return contents.filter(Boolean).join('\n\n---\n\n')
  } catch {
    return ''
  }
}
