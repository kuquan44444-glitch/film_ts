import type { AggregatedHomeResult } from 'src/domain/aggregation.types'
import type { UnifiedMovie } from 'src/domain/movie.types'

export type HomeAggregationInput = {
  sections: Array<{
    key: string
    title: string
    items: UnifiedMovie[]
  }>
}

export const aggregateHomeSections = async (input: HomeAggregationInput): Promise<AggregatedHomeResult> => ({
  sections: input.sections
})
