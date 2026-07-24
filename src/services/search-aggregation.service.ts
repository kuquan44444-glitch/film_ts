import type { items } from 'src/types'
import { aggregateLegacyItems, scoreSearchCandidate } from './aggregation-shared'

export type SearchAggregationInput = {
  keyword: string
  items: items[]
}

export type AggregatedSearchResult = {
  keyword: string
  items: items[]
}

export const aggregateSearchResults = async (input: SearchAggregationInput): Promise<AggregatedSearchResult> => {
  const aggregateEntries = aggregateLegacyItems(
    input.items.map((item, position) => ({
      item,
      position,
      searchScore: scoreSearchCandidate(input.keyword, item, position)
    }))
  )

  const sortedItems = aggregateEntries
    .sort((left, right) => {
      if (left.searchScore !== right.searchScore) {
        return right.searchScore - left.searchScore
      }

      if (left.freshestTimestamp !== right.freshestTimestamp) {
        return right.freshestTimestamp - left.freshestTimestamp
      }

      return right.rankScore - left.rankScore
    })
    .map((entry) => entry.item)

  return {
    keyword: input.keyword,
    items: sortedItems
  }
}
