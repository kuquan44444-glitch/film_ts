import type { AggregatedSearchResult } from 'src/domain/aggregation.types'
import type { UnifiedMovie } from 'src/domain/movie.types'

export type SearchAggregationInput = {
  keyword: string
  items: UnifiedMovie[]
}

export const aggregateSearchResults = async (input: SearchAggregationInput): Promise<AggregatedSearchResult> => ({
  keyword: input.keyword,
  items: input.items
})
