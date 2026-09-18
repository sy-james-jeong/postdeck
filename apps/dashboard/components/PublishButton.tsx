'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { publishAction } from '../app/write/actions.js'

export function PublishButton({ projectId, postId }: { projectId: string; postId: string }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const router = useRouter()

  const onClick = () => {
    setError('')
    start(async () => {
      const r = await publishAction({ projectId, postId })
      if (r.ok) {
        setDone(true)
        router.refresh()
      } else {
        setError(r.error)
      }
    })
  }

  if (done) return <span className="ok">발행됨 ✓</span>
  return (
    <>
      <button className="btn-sm" onClick={onClick} disabled={pending}>{pending ? '…' : '발행'}</button>
      {error && <span className="err"> {error}</span>}
    </>
  )
}
