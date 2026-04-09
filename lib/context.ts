import fs from 'fs/promises'
import path from 'path'

const VAULT = 'C:/Users/17192/Desktop/Obsidian Vault/ChiefOfStaff-Vault'

const GLOBAL_FILES = [
  { path: 'candela-anima/soul.md', label: 'Identity' },
  { path: 'candela-anima/context.md', label: 'Current Context' },
  { path: 'candela-anima/agent.md', label: 'Agent Protocol' },
  { path: 'candela-anima/memory.md', label: 'Institutional Memory' },
  // Architecture files removed from global context
  // They load only when specific projects are selected
]

export async function loadContext(projectFolder?: string): Promise<string> {
  const today = new Date().toISOString().split('T')[0]

  const files = [
    ...GLOBAL_FILES,
    { path: `daily-notes/${today}.md`, label: 'Today' },
  ]

  if (projectFolder) {
    files.push(
      { path: `projects/${projectFolder}/context.md`, label: 'Project Context' },
      { path: `projects/${projectFolder}/notes.md`, label: 'Project Notes' },
    )
  }

  const loaded = await Promise.all(
    files.map(async ({ path: filePath, label }) => {
      try {
        const content = await fs.readFile(
          path.join(VAULT, filePath), 'utf8'
        )
        return `## ${label}\n${content}`
      } catch {
        return ''
      }
    })
  )

  return loaded.filter(Boolean).join('\n\n---\n\n')
}

export async function getRelevantContext(query: string, project?: string): Promise<string> {
  try {
    const response = await fetch(
      `http://localhost:3000/api/memory?q=${encodeURIComponent(query)}`,
      { method: 'GET' }
    )
    const data = await response.json()
    if (data.context) {
      return data.context
    }
  } catch {
    // Memory search unavailable, fall back to full context
  }
  return loadContext(project)
}

export async function getContextSummary(projectFolder?: string) {
  const files = [
    ...GLOBAL_FILES,
    ...(projectFolder ? [
      { path: `projects/${projectFolder}/context.md`, label: 'Project Context' },
    ] : [])
  ]

  return Promise.all(
    files.map(async ({ path: filePath, label }) => {
      try {
        const content = await fs.readFile(
          path.join(VAULT, filePath), 'utf8'
        )
        return { label, chars: content.length, loaded: true }
      } catch {
        return { label, chars: 0, loaded: false }
      }
    })
  )
}
