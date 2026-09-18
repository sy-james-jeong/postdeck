'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { unpublishAction } from '../app/write/actions.js'

export function UnpublishButton({ projectId, postId }: { projectId: string; postId: string }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const router = useRouter()

  const onClick = () => {
    setError('')
    start(async () => {
      const r = await unpublishAction({ projectId, postId })
      if (r.ok) {
        setDone(true)
        router.refresh()
      } else {
        setError(r.error)
      }
    })
  }

  if (done) return <span className="ok">초안으로 됨 ✓</span>
  return (
    <>
      <button className="btn-sm-ghost" onClick={onClick} disabled={pending}>{pending ? '…' : '초안으로'}</button>
      {error && <span className="err"> {error}</span>}
    </>
  )
}
