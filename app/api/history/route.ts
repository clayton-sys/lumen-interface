import { NextResponse } from 'next/server'
import fs from 'fs/promises'
import path from 'path'

const ARCHIVE = 'C:/Users/17192/Desktop/Obsidian Vault/ChiefOfStaff-Vault/_archive/lumen-conversations'

export async function GET() {
  try {
    await fs.mkdir(ARCHIVE, { recursive: true })
    const files = await fs.readdir(ARCHIVE)

    const sessions = await Promise.all(
      files
        .filter(f => f.endsWith('.md'))
        .sort()
        .reverse()
        .slice(0, 50)
        .map(async filename => {
          const content = await fs.readFile(
            path.join(ARCHIVE, filename), 'utf8'
          )

          // Extract metadata from file
          const lines = content.split('\n')
          const titleLine = lines[0] || ''
          const projectLine = lines.find(l => l.startsWith('Project:')) || ''
          const modelLine = lines.find(l => l.startsWith('Model:')) || ''
          const messagesLine = lines.find(l => l.startsWith('Messages:')) || ''

          // Get first user message as preview
          const userLineIndex = lines.findIndex(l => l.startsWith('**You:**'))
          const preview = userLineIndex > -1
            ? lines[userLineIndex].replace('**You:**', '').trim().slice(0, 60)
            : 'No preview'

          return {
            filename,
            title: titleLine.replace('# Lumen Session — ', ''),
            project: projectLine.replace('Project:', '').trim(),
            model: modelLine.replace('Model:', '').trim(),
            messageCount: parseInt(messagesLine.replace('Messages:', '').trim()) || 0,
            preview,
            content
          }
        })
    )

    return NextResponse.json({ sessions })
  } catch {
    return NextResponse.json({ sessions: [] })
  }
}
