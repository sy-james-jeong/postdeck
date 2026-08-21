import type { SourceCapabilities } from '@postdeck/core'

export function showsUnbuiltScheduledBadge(caps: SourceCapabilities, scheduledCount: number): boolean {
  return scheduledCount > 0 && caps.enforcesFutureDates === false
}

export function variantBadgeClass(present: boolean): 'present' | 'missing' {
  return present ? 'present' : 'missing'
}
