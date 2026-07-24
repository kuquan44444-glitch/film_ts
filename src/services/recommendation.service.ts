import type { UnifiedMovie } from 'src/domain/movie.types'

export type RecommendationInput = {
  currentMovieId: string
  candidates: UnifiedMovie[]
  seenMovieIds?: string[]
}

export const buildRecommendations = async ({
  currentMovieId,
  candidates,
  seenMovieIds = []
}: RecommendationInput): Promise<UnifiedMovie[]> =>
  candidates.filter((item) => item.id !== currentMovieId && !seenMovieIds.includes(item.id))
