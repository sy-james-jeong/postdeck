import { expect, test } from 'vitest'
import { showsUnbuiltScheduledBadge, variantBadgeClass } from './badges.js'

const caps = (enforcesFutureDates: boolean) => ({ canWrite: true, enforcesFutureDates, supportsTranslations: false })

test('unbuilt-scheduled badge shows only when the source does not enforce future dates AND there are scheduled posts', () => {
  expect(showsUnbuiltScheduledBadge(caps(false), 2)).toBe(true)
  expect(showsUnbuiltScheduledBadge(caps(false), 0)).toBe(false)
  expect(showsUnbuiltScheduledBadge(caps(true), 2)).toBe(false)
})
test('variantBadgeClass maps presence to a css class', () => {
  expect(variantBadgeClass(true)).toBe('present')
  expect(variantBadgeClass(false)).toBe('missing')
})
