import type { items } from 'src/types'
import { createLegacyItemDedupeKeys } from './aggregation-shared'

export type HomeAggregationInput = {
  sections: Array<{
    key: string
    title: string
    items: items[]
    maxItems?: number
  }>
}

export type AggregatedHomeSection = {
  key: string
  title: string
  items: items[]
}

export type AggregatedHomeResult = {
  sections: AggregatedHomeSection[]
}

export const aggregateHomeSections = async (input: HomeAggregationInput): Promise<AggregatedHomeResult> => {
  const seenMovieKeys = new Set<string>()

  return {
    sections: input.sections.map((section) => {
      const maxItems = section.maxItems ?? section.items.length
      const nextItems = section.items.filter((item) => {
        const dedupeKeys = createLegacyItemDedupeKeys(item)
        const isSeen = dedupeKeys.some((key) => seenMovieKeys.has(key))

        if (isSeen) return false

        dedupeKeys.forEach((key) => seenMovieKeys.add(key))
        return true
      })

      return {
        key: section.key,
        title: section.title,
        items: nextItems.slice(0, maxItems)
      }
    })
  }
}
