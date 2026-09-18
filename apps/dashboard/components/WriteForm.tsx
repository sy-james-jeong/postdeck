'use client'

import { useState, useTransition } from 'react'
import type { Draft } from '@postdeck/core'
import { generateAction, saveAction } from '../app/write/actions.js'
import { deAiSummary, type WritableProject } from '../lib/write-format.js'
import { MarkdownPreview } from './MarkdownPreview.js'

export function WriteForm({ projects }: { projects: WritableProject[] }) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '')
  const [topic, setTopic] = useState('')
  const [lang, setLang] = useState('')
  const [result, setResult] = useState<{ draft: Draft; summary: string } | null>(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const [view, setView] = useState<'preview' | 'raw'>('preview')
  const [pending, start] = useTransition()

  const langs = projects.find((p) => p.id === projectId)?.langs ?? []

  // Switching project resets the language (its options differ per project).
  const onProject = (id: string) => {
    setProjectId(id)
    setLang('')
  }

  const onGenerate = () => {
    setError(''); setSaved(''); setResult(null)
    start(async () => {
      const r = await generateAction({ projectId, topic, lang })
      if (r.ok) setResult({ draft: r.result.draft, summary: deAiSummary(r.result.report) })
      else setError(r.error)
    })
  }

  const onSave = () => {
    if (!result) return
    setError(''); setSaved('')
    start(async () => {
      const r = await saveAction({ projectId, draft: result.draft, lang })
      if (r.ok) setSaved(r.ref.path ?? r.ref.url ?? r.ref.id)
      else setError(r.error)
    })
  }

  return (
    <div>
      <div className="writeform">
        <label>Project{' '}
          <select value={projectId} onChange={(e) => onProject(e.target.value)}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        {langs.length > 0 && (
          <label>Language{' '}
            <select value={lang} onChange={(e) => setLang(e.target.value)}>
              <option value="">default ({langs[0]})</option>
              {langs.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>
        )}
        <label>Topic
          <textarea value={topic} onChange={(e) => setTopic(e.target.value)} rows={3} />
        </label>
        <button onClick={onGenerate} disabled={pending || !topic || !projectId}>
          {pending ? 'Working…' : 'Generate'}
        </button>
      </div>

      {error && <p className="err">⚠ {error}</p>}

      {result && (
        <div className="result">
          <h3>{result.draft.title}</h3>
          <p><em>{result.draft.excerpt}</em></p>
          <p className="dim">tags: {result.draft.tags.join(', ') || '—'}</p>
          <p className="dim">De-AI: {result.summary}</p>
          <div className="viewtoggle">
            <button className={view === 'preview' ? 'seg on' : 'seg'} onClick={() => setView('preview')}>Preview</button>
            <button className={view === 'raw' ? 'seg on' : 'seg'} onClick={() => setView('raw')}>Markdown</button>
          </div>
          {view === 'preview' ? <MarkdownPreview markdown={result.draft.body} /> : <pre>{result.draft.body}</pre>}
          <button onClick={onSave} disabled={pending}>Save as draft</button>
          {saved && <p className="ok">saved: {saved}</p>}
        </div>
      )}
    </div>
  )
}
