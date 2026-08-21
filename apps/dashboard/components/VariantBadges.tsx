import type { PostVariant } from '@postdeck/core'
import { variantBadgeClass } from '../lib/badges.js'

export function VariantBadges({ variants }: { variants?: PostVariant[] }) {
  if (!variants || variants.length === 0) return null
  return (
    <span>
      {variants.map((v) => (
        <span key={v.lang} className={`badge ${variantBadgeClass(v.present)}`} style={{ marginRight: 4 }}
          title={v.present ? `${v.lang}: ${v.status}` : `${v.lang}: 누락`}>
          {v.lang}{v.present ? '' : '·누락'}
        </span>
      ))}
    </span>
  )
}
