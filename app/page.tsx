'use client'
import { useState, useEffect, useRef } from 'react'

type Message = {
  role: 'user' | 'assistant'
  content: string
  model: 'lumen' | 'claude'
  localModel?: string
  timestamp: Date
}

type Project = {
  id: string
  name: string
  folder: string
  icon: string
}

type ContextFile = {
  label: string
  chars: number
  loaded: boolean
}

type Session = {
  filename: string
  title: string
  project: string
  model: string
  messageCount: number
  preview: string
  content: string
}

const PROJECTS: Project[] = [
  { id: 'global', name: 'Home', folder: '', icon: '🏠' },
  { id: 'candela-platform', name: 'Candela Platform', folder: 'candela-platform', icon: '💡' },
  { id: 'caia-outreach', name: 'CAIA Outreach', folder: 'caia-outreach', icon: '📧' },
  { id: 'resonance-commons', name: 'Resonance Commons', folder: 'resonance-commons', icon: '🌊' },
  { id: 'lumen-interface', name: 'Lumen Interface', folder: 'lumen-interface', icon: '🔦' },
  { id: 'candela-anima', name: 'Candela Anima', folder: 'candela-anima-project', icon: '🧠' },
  { id: 'outreach', name: 'Outreach', folder: 'outreach', icon: '🎯' },
]

const QUICK_ACTIONS = [
  { label: '🌅 Morning Brief', prompt: 'Generate my morning brief. What are my top priorities today based on current context? Be specific and actionable.' },
  { label: '📧 Outreach Draft', prompt: 'Draft a cold outreach email to a Colorado nonprofit about CAIA compliance before the June 30 deadline. Use my voice — direct, mission-driven, not a vendor.' },
  { label: '📡 Signal Brief', prompt: 'What should I post about today? Give me three content angles — one for LinkedIn (thought leadership), one for TikTok (hook-driven), one for Bluesky (concise insight). Based on my mission and content lanes.' },
  { label: '🔄 Status Sync', prompt: 'Summarize current status of all active projects in 2-3 bullets each. Ready to paste into Notion.' },
]

function parseSessionMessages(content: string) {
  const lines = content.split('\n')
  const messages: { role: 'user' | 'assistant'; content: string }[] = []
  let currentRole: 'user' | 'assistant' | null = null
  let currentContent: string[] = []

  for (const line of lines) {
    if (line.startsWith('**You:**')) {
      if (currentRole && currentContent.length > 0) {
        messages.push({ role: currentRole, content: currentContent.join('\n').trim() })
      }
      currentRole = 'user'
      currentContent = [line.replace('**You:**', '').trim()]
    } else if (line.startsWith('**Lumen:**')) {
      if (currentRole && currentContent.length > 0) {
        messages.push({ role: currentRole, content: currentContent.join('\n').trim() })
      }
      currentRole = 'assistant'
      currentContent = [line.replace('**Lumen:**', '').trim()]
    } else if (currentRole && line && !line.startsWith('#') &&
               !line.startsWith('Project:') && !line.startsWith('Model:') &&
               !line.startsWith('Messages:') && line !== '---') {
      currentContent.push(line)
    }
  }
  if (currentRole && currentContent.length > 0) {
    messages.push({ role: currentRole, content: currentContent.join('\n').trim() })
  }
  return messages
}

export default function LumenInterface() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [model, setModel] = useState<'lumen' | 'claude'>('lumen')
  const [loading, setLoading] = useState(false)
  const [project, setProject] = useState<Project>(PROJECTS[0])
  const [contextFiles, setContextFiles] = useState<ContextFile[]>([])
  const [showContext, setShowContext] = useState(false)
  const [localModel, setLocalModel] = useState('llama3.1')
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [sessionId, setSessionId] = useState('0000')
  const [viewingSession, setViewingSession] = useState<Session | null>(null)
  const [inputFocused, setInputFocused] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setSessionId(Date.now().toString())
  }, [])

  useEffect(() => {
    fetch('/api/models')
      .then(r => r.json())
      .then(data => {
        const names = data.models.map((m: { name: string }) => m.name)
        setAvailableModels(names)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch(`/api/context?project=${project.folder}`)
      .then(r => r.json())
      .then(data => setContextFiles(data.files || []))
      .catch(() => {})
  }, [project])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    setMessages([])
  }, [project])

  async function loadHistoryList() {
    setLoadingHistory(true)
    try {
      const res = await fetch('/api/history')
      const data = await res.json()
      setSessions(data.sessions || [])
    } catch {}
    finally { setLoadingHistory(false) }
  }

  useEffect(() => {
    if (showHistory) loadHistoryList()
  }, [showHistory])

  function startNewChat() {
    setMessages([])
    setSessionId(Date.now().toString())
    setShowHistory(false)
    setViewingSession(null)
  }

  function openSessionViewer(session: Session) {
    setViewingSession(session)
    setShowHistory(false)
  }

  function continueSession(session: Session) {
    const parsed = parseSessionMessages(session.content)
    const converted: Message[] = parsed.map(m => ({
      role: m.role,
      content: m.content,
      model: session.model?.includes('claude') ? 'claude' as const : 'lumen' as const,
      timestamp: new Date()
    }))
    setMessages(converted)
    setSessionId(Date.now().toString())
    setViewingSession(null)
  }

  async function sendMessage(overrideMessage?: string) {
    const msg = overrideMessage || input
    if (!msg.trim() || loading) return

    setMessages(prev => [...prev, {
      role: 'user', content: msg, model, localModel, timestamp: new Date()
    }])
    if (!overrideMessage) setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          model,
          localModel,
          sessionId,
          project: project.folder,
          history: messages.slice(-8)
        })
      })
      const data = await res.json()
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.response || 'No response',
        model: data.model,
        localModel,
        timestamp: new Date()
      }])
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Error connecting. Is Ollama running?',
        model,
        timestamp: new Date()
      }])
    } finally {
      setLoading(false)
    }
  }

  const totalChars = contextFiles.reduce((s, f) => s + f.chars, 0)
  const loadedCount = contextFiles.filter(f => f.loaded).length

  return (
    <div className="h-screen flex overflow-hidden"
      style={{
        background: '#0D1628',
        color: '#F8F7F4',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
      }}>

      {/* Sidebar */}
      <div className="w-56 flex flex-col flex-shrink-0 h-full"
        style={{
          background: '#121F3A',
          borderRight: '1px solid rgba(177,62,137,0.2)'
        }}>

        {/* Logo */}
        <div className="p-4 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(177,62,137,0.15)' }}>
          <div className="flex items-center gap-3">
            <img
              src="/lumen-logo.png"
              alt="Lumen"
              className="w-8 h-8 rounded-lg object-contain"
            />
            <div>
              <div className="font-semibold text-sm" style={{ color: '#F8F7F4' }}>Lumen</div>
              <div className="text-xs" style={{ color: 'rgba(230,67,172,0.7)' }}>
                Collective Plasticity
              </div>
            </div>
          </div>
        </div>

        {/* New Chat */}
        <div className="px-2 pb-2 pt-2 flex-shrink-0">
          <button
            onClick={startNewChat}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors"
            style={{
              background: 'rgba(255,255,255,0.05)',
              color: 'rgba(248,247,244,0.5)'
            }}
          >
            <span>✏️</span>
            <span>New Chat</span>
          </button>
        </div>

        {/* Projects list */}
        <div className="flex-1 p-2 overflow-y-auto min-h-0">
          <div className="text-xs px-2 py-2 uppercase tracking-wider"
            style={{ color: 'rgba(248,247,244,0.25)' }}>Projects</div>
          {PROJECTS.map(p => (
            <button
              key={p.id}
              onClick={() => setProject(p)}
              className="w-full text-left px-3 py-2 rounded-lg text-sm transition-all flex items-center gap-2 mb-0.5"
              style={{
                background: project.id === p.id
                  ? 'rgba(177,62,137,0.25)'
                  : 'transparent',
                color: project.id === p.id
                  ? '#F8F7F4'
                  : 'rgba(248,247,244,0.45)',
                borderLeft: project.id === p.id
                  ? '2px solid #E643AC'
                  : '2px solid transparent'
              }}
            >
              <span className="text-base">{p.icon}</span>
              <span className="truncate">{p.name}</span>
            </button>
          ))}
        </div>

        {/* Context summary */}
        <button
          onClick={() => setShowContext(!showContext)}
          className="flex-shrink-0 p-3 text-left transition-colors"
          style={{ borderTop: '1px solid rgba(177,62,137,0.15)' }}
        >
          <div className="text-xs" style={{ color: 'rgba(248,247,244,0.25)' }}>Context loaded</div>
          <div className="text-sm mt-0.5" style={{ color: 'rgba(248,247,244,0.5)' }}>
            {loadedCount} files · {Math.round(totalChars / 1000)}k chars
          </div>
        </button>
      </div>

      {/* History Panel */}
      {showHistory && (
        <div className="w-72 flex flex-col flex-shrink-0 h-full"
          style={{
            background: '#121F3A',
            borderRight: '1px solid rgba(177,62,137,0.2)'
          }}>
          <div className="flex-shrink-0 p-4 flex items-center justify-between"
            style={{ borderBottom: '1px solid rgba(177,62,137,0.2)' }}>
            <div className="text-sm font-medium" style={{ color: '#F8F7F4' }}>History</div>
            <button
              onClick={() => setShowHistory(false)}
              className="text-xs"
              style={{ color: 'rgba(248,247,244,0.3)' }}
            >
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0 p-2">
            {loadingHistory && (
              <div className="text-center py-8 text-xs"
                style={{ color: 'rgba(248,247,244,0.3)' }}>
                Loading...
              </div>
            )}

            {!loadingHistory && sessions.length === 0 && (
              <div className="text-center py-8 text-xs"
                style={{ color: 'rgba(248,247,244,0.2)' }}>
                No conversations yet
              </div>
            )}

            {sessions.map((session, i) => (
              <button
                key={i}
                onClick={() => openSessionViewer(session)}
                className="w-full text-left p-3 rounded-lg transition-colors mb-1"
                style={{ background: 'transparent' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(177,62,137,0.1)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <div className="text-xs mb-1" style={{ color: 'rgba(248,247,244,0.4)' }}>
                  {session.title}
                </div>
                <div className="text-xs truncate mb-1" style={{ color: 'rgba(248,247,244,0.6)' }}>
                  {session.preview}...
                </div>
                <div className="flex gap-2 text-xs" style={{ color: 'rgba(248,247,244,0.25)' }}>
                  <span>{session.project || 'global'}</span>
                  <span>·</span>
                  <span>{session.messageCount} messages</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">

        {/* Header */}
        <div className="flex-shrink-0 px-5 py-3 flex items-center justify-between"
          style={{ borderBottom: '1px solid rgba(177,62,137,0.2)' }}>
          <div>
            <div className="font-medium" style={{ color: '#F8F7F4' }}>{project.icon} {project.name}</div>
            <div className="text-xs" style={{ color: 'rgba(248,247,244,0.3)' }}>
              {project.id === 'global' ? 'All context loaded' : 'Project context active'}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowHistory(!showHistory)}
              style={{
                background: showHistory ? 'rgba(177,62,137,0.2)' : 'rgba(255,255,255,0.05)',
                border: showHistory ? '1px solid rgba(177,62,137,0.4)' : '1px solid transparent',
                color: showHistory ? '#F8F7F4' : 'rgba(248,247,244,0.4)',
                borderRadius: '8px',
                padding: '6px 12px',
                fontSize: '12px'
              }}
            >
              📋 History
            </button>
            {model === 'lumen' && availableModels.length > 0 && (
              <select
                value={localModel}
                onChange={e => setLocalModel(e.target.value)}
                style={{
                  background: 'rgba(177,62,137,0.08)',
                  border: '1px solid rgba(177,62,137,0.2)',
                  borderRadius: '8px',
                  padding: '6px 12px',
                  fontSize: '12px',
                  color: 'rgba(248,247,244,0.6)',
                  outline: 'none'
                }}
              >
                {availableModels.map(m => (
                  <option key={m} value={m} style={{ background: '#121F3A' }}>
                    {m}
                  </option>
                ))}
              </select>
            )}
            <div className="flex items-center gap-1 p-1" style={{ background: 'rgba(177,62,137,0.1)', borderRadius: '8px' }}>
              {(['lumen', 'claude'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setModel(m)}
                  className="px-3 py-1.5 rounded-md text-xs transition-all"
                  style={model === m ? {
                    background: 'rgba(230,67,172,0.25)',
                    color: '#F8F7F4',
                    border: '1px solid rgba(230,67,172,0.4)'
                  } : {
                    color: 'rgba(248,247,244,0.35)',
                    border: '1px solid transparent'
                  }}
                >
                  {m === 'lumen' ? '🕯️ Lumen' : '✦ Claude'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex-shrink-0 px-5 py-2 flex gap-2 flex-wrap"
          style={{ borderBottom: '1px solid rgba(177,62,137,0.08)' }}>
          {QUICK_ACTIONS.map(qa => (
            <button
              key={qa.label}
              onClick={() => sendMessage(qa.prompt)}
              disabled={loading}
              className="text-xs rounded-lg px-3 py-1.5 transition-colors disabled:opacity-30"
              style={{
                background: 'rgba(255,255,255,0.04)',
                color: 'rgba(248,247,244,0.45)',
                border: '1px solid rgba(177,62,137,0.1)'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'rgba(212,175,55,0.4)'
                e.currentTarget.style.color = 'rgba(248,247,244,0.7)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'rgba(177,62,137,0.1)'
                e.currentTarget.style.color = 'rgba(248,247,244,0.45)'
              }}
            >
              {qa.label}
            </button>
          ))}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto min-h-0 px-5 py-4">
          <div className="space-y-4">
            {messages.length === 0 && (
              <div className="text-center mt-20">
                <img src="/lumen-logo.png" alt="Lumen" className="w-16 h-16 mx-auto mb-4 opacity-60" />
                <p className="text-sm" style={{ color: 'rgba(248,247,244,0.4)' }}>
                  Lumen is ready.
                </p>
                <p className="text-xs mt-1" style={{ color: 'rgba(248,247,244,0.2)' }}>
                  {loadedCount} files · {Math.round(totalChars / 1000)}k chars in context
                </p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className="max-w-[80%] rounded-2xl px-4 py-3"
                  style={msg.role === 'user' ? {
                    background: 'rgba(177,62,137,0.2)',
                    border: '1px solid rgba(177,62,137,0.3)'
                  } : {
                    background: 'rgba(18,31,58,0.9)',
                    border: '1px solid rgba(230,67,172,0.2)'
                  }}>
                  {msg.role === 'assistant' && (
                    <div className="mb-1.5" style={{ color: 'rgba(230,67,172,0.6)', fontSize: '11px' }}>
                      {msg.model === 'lumen' ? `🕯️ ${msg.localModel || 'llama3.1'}` : '✦ Claude'}
                    </div>
                  )}
                  <div className="text-sm leading-relaxed whitespace-pre-wrap">
                    {msg.content}
                  </div>
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="rounded-2xl px-4 py-3"
                  style={{
                    background: 'rgba(18,31,58,0.9)',
                    border: '1px solid rgba(230,67,172,0.2)'
                  }}>
                  <div className="mb-2" style={{ color: 'rgba(230,67,172,0.6)', fontSize: '11px' }}>
                    {model === 'lumen' ? '🕯️ Lumen thinking...' : '✦ Claude thinking...'}
                  </div>
                  <div className="flex gap-1">
                    {[0, 1, 2].map(i => (
                      <div
                        key={i}
                        className="w-1.5 h-1.5 rounded-full animate-bounce"
                        style={{
                          background: 'rgba(230,67,172,0.5)',
                          animationDelay: `${i * 0.1}s`
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input */}
        <div className="flex-shrink-0 px-5 py-4"
          style={{ borderTop: '1px solid rgba(177,62,137,0.2)' }}>
          <div className="flex gap-3">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendMessage()
                }
              }}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              placeholder={`Ask ${model === 'lumen' ? 'Lumen' : 'Claude'}...`}
              className="flex-1"
              style={{
                background: 'rgba(177,62,137,0.08)',
                border: `1px solid ${inputFocused ? 'rgba(230,67,172,0.5)' : 'rgba(177,62,137,0.2)'}`,
                borderRadius: '12px',
                padding: '10px 16px',
                color: '#F8F7F4',
                outline: 'none',
                fontSize: '14px',
              }}
            />
            <button
              onClick={() => sendMessage()}
              disabled={loading || !input.trim()}
              className="flex-shrink-0 transition-colors disabled:opacity-30"
              style={{
                background: 'rgba(177,62,137,0.25)',
                border: '1px solid rgba(177,62,137,0.4)',
                borderRadius: '12px',
                padding: '10px 20px',
                color: '#F8F7F4',
                fontSize: '14px',
              }}
              onMouseEnter={e => { if (!loading && input.trim()) e.currentTarget.style.background = 'rgba(177,62,137,0.4)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(177,62,137,0.25)' }}
            >
              Send
            </button>
          </div>
          <div className="flex justify-between mt-2" style={{ fontSize: '11px', color: 'rgba(248,247,244,0.15)' }}>
            <span>soul · context · agent · memory</span>
            <span style={{ color: 'rgba(212,175,55,0.4)' }}>Session {sessionId.slice(-4)}</span>
          </div>
        </div>
      </div>

      {/* Session Viewer */}
      {viewingSession && (
        <div className="w-80 flex flex-col flex-shrink-0 h-full"
          style={{ borderLeft: '1px solid rgba(177,62,137,0.3)', background: 'rgba(18,31,58,0.95)' }}>
          <div className="flex-shrink-0 p-4"
            style={{ borderBottom: '1px solid rgba(177,62,137,0.2)' }}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium" style={{ color: '#F8F7F4' }}>Past Session</div>
                <div className="text-xs mt-0.5" style={{ color: 'rgba(248,247,244,0.4)' }}>
                  {viewingSession.title}
                </div>
              </div>
              <button onClick={() => setViewingSession(null)}
                className="text-xs px-2 py-1 rounded transition-colors"
                style={{ color: 'rgba(248,247,244,0.3)' }}>✕</button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-3">
            {parseSessionMessages(viewingSession.content).map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className="max-w-[90%] rounded-xl px-3 py-2 text-xs"
                  style={{
                    background: msg.role === 'user'
                      ? 'rgba(177,62,137,0.2)'
                      : 'rgba(255,255,255,0.04)',
                    border: msg.role === 'assistant'
                      ? '1px solid rgba(177,62,137,0.2)'
                      : 'none',
                    color: 'rgba(248,247,244,0.7)'
                  }}>
                  {msg.role === 'assistant' && (
                    <div className="mb-1" style={{ color: 'rgba(230,67,172,0.6)', fontSize: '10px' }}>
                      🕯️ Lumen
                    </div>
                  )}
                  <div className="leading-relaxed whitespace-pre-wrap">{msg.content}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex-shrink-0 p-4" style={{ borderTop: '1px solid rgba(177,62,137,0.2)' }}>
            <button onClick={() => continueSession(viewingSession)}
              className="w-full py-2 rounded-lg text-xs transition-colors"
              style={{
                background: 'rgba(177,62,137,0.2)',
                color: '#F8F7F4',
                border: '1px solid rgba(177,62,137,0.3)'
              }}>
              Continue this conversation →
            </button>
            <p className="text-center mt-2" style={{ fontSize: '10px', color: 'rgba(248,247,244,0.2)' }}>
              Loads messages into active chat
            </p>
          </div>
        </div>
      )}

      {/* Context Panel */}
      {showContext && (
        <div className="w-60 p-4 flex flex-col h-full flex-shrink-0"
          style={{
            background: '#121F3A',
            borderLeft: '1px solid rgba(177,62,137,0.2)'
          }}>
          <div className="flex-shrink-0 flex items-center justify-between mb-4">
            <div className="text-sm font-medium" style={{ color: '#F8F7F4' }}>Context</div>
            <button
              onClick={() => setShowContext(false)}
              className="text-xs px-2 py-1"
              style={{ color: 'rgba(248,247,244,0.3)' }}
            >
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 space-y-2">
            {contextFiles.map((file, i) => (
              <div key={i} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{
                      background: file.loaded ? '#4ade80' : 'rgba(230,67,172,0.4)'
                    }} />
                  <span className="text-xs truncate" style={{ color: 'rgba(248,247,244,0.5)' }}>{file.label}</span>
                </div>
                <span className="text-xs flex-shrink-0" style={{ color: 'rgba(248,247,244,0.25)' }}>
                  {file.loaded ? `${Math.round(file.chars / 1000)}k` : '—'}
                </span>
              </div>
            ))}
          </div>
          <div className="flex-shrink-0 mt-4 pt-4" style={{ borderTop: '1px solid rgba(177,62,137,0.15)' }}>
            <div className="text-xs" style={{ color: 'rgba(248,247,244,0.25)' }}>Total context</div>
            <div className="text-sm mt-0.5" style={{ color: '#F8F7F4' }}>{Math.round(totalChars / 1000)}k chars</div>
          </div>
        </div>
      )}
    </div>
  )
}
