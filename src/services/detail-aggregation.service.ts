import type { AggregatedDetailResult } from 'src/domain/aggregation.types'
import type { UnifiedMovieDetail } from 'src/domain/movie.types'

export type DetailAggregationInput = {
  detail: UnifiedMovieDetail
}

export const aggregateDetailResults = async (input: DetailAggregationInput): Promise<AggregatedDetailResult> => ({
  detail: input.detail
})
