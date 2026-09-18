'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { ProjectView } from '@postdeck/adapters'
import { VariantBadges } from './VariantBadges.js'
import { PublishButton } from './PublishButton.js'
import { UnpublishButton } from './UnpublishButton.js'
import { publishManyAction } from '../app/write/actions.js'

const fmt = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : '—')

export function PostTable({ project }: { project: ProjectView }) {
  const posts = project.posts
  const draftIds = posts.filter((p) => p.status === 'draft').map((p) => p.id)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const router = useRouter()

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const allChecked = draftIds.length > 0 && draftIds.every((id) => selected.has(id))
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(draftIds))

  const onBulk = () => {
    const ids = [...selected]
    setErr(''); setMsg('')
    start(async () => {
      const r = await publishManyAction({ projectId: project.id, postIds: ids })
      if (!r.ok) { setErr(r.error); return }
      const okN = r.results.filter((x) => x.ok).length
      const failN = r.results.length - okN
      setMsg(`${okN}개 발행됨${failN ? `, ${failN}개 실패` : ''}`)
      setSelected(new Set())
      router.refresh()
    })
  }

  return (
    <div>
      <h2>{project.name}</h2>
      {selected.size > 0 && (
        <div className="bulkbar">
          <span>{selected.size}개 선택됨</span>
          <button className="btn-sm" onClick={onBulk} disabled={pending}>{pending ? '…' : '선택 발행'}</button>
          <button className="btn-sm-ghost" onClick={() => setSelected(new Set())} disabled={pending}>해제</button>
          {err && <span className="err"> {err}</span>}
        </div>
      )}
      {msg && <p className="ok">{msg}</p>}
      <table>
        <thead>
          <tr>
            <th>{draftIds.length > 0 ? <input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="전체 초안 선택" /> : null}</th>
            <th>제목</th><th>상태</th><th>발행일</th><th>언어</th><th></th>
          </tr>
        </thead>
        <tbody>
          {posts.map((post) => (
            <tr key={post.id}>
              <td>{post.status === 'draft' ? <input type="checkbox" checked={selected.has(post.id)} onChange={() => toggle(post.id)} aria-label={`${post.title} 선택`} /> : null}</td>
              <td>{post.liveUrl ? <a href={post.liveUrl} target="_blank" rel="noreferrer">{post.title}</a> : post.title}</td>
              <td><span className={`dot ${post.status}`} />{post.status}</td>
              <td>{fmt(post.publishDate)}</td>
              <td><VariantBadges variants={post.variants} /></td>
              <td>
                {post.status === 'draft' ? <PublishButton projectId={project.id} postId={post.id} /> : null}
                {post.status === 'published' ? <UnpublishButton projectId={project.id} postId={post.id} /> : null}
              </td>
            </tr>
          ))}
          {posts.length === 0 && <tr><td colSpan={6} className="err">글 없음</td></tr>}
        </tbody>
      </table>
    </div>
  )
}
